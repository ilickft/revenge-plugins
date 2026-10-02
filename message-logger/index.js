(function () {
  "use strict";

  var findByStoreName = vendetta.metro.findByStoreName;
  var findByProps     = vendetta.metro.findByProps;
  var instead         = vendetta.patcher.instead;
  var before          = vendetta.patcher.before;
  var FluxDispatcher  = vendetta.metro.common.FluxDispatcher;

  var MessageStore = findByStoreName("MessageStore") || findByProps("getMessage", "getMessages");
  var patches      = [];

  // Memory cache of recent messages so we never lose self-deleted or fast-deleted messages
  var messageCache      = new Map();
  // Set of message IDs that have been deleted
  var deletedIds        = new Set();
  // Set of message IDs that have been edited
  var editedIds         = new Set();
  // Map of message ID -> clean original text content before any edits
  var firstOriginalText = new Map();

  function cloneMessage(msg) {
    if (!msg || !msg.id) return null;
    var author = msg.author;
    if (author && typeof author.toJS === "function") {
      try { author = author.toJS(); } catch (e) {}
    }
    var attachments = [];
    var rawAtts = msg.attachments;
    if (rawAtts && typeof rawAtts.toJS === "function") {
      try { rawAtts = rawAtts.toJS(); } catch (e) {}
    }
    if (Array.isArray(rawAtts)) {
      attachments = rawAtts.slice();
    } else if (rawAtts && typeof rawAtts.forEach === "function") {
      try {
        rawAtts.forEach(function (a) { attachments.push(a); });
      } catch (e) {}
    }
    return {
      id:            msg.id,
      channel_id:    msg.channel_id || msg.channelId,
      content:       typeof msg.content === "string" ? msg.content : "",
      author:        author,
      timestamp:     msg.timestamp,
      attachments:   attachments,
      embeds:        Array.isArray(msg.embeds) ? msg.embeds.slice() : [],
      mentions:      msg.mentions || [],
      mention_roles: msg.mention_roles || msg.mentionRoles || [],
      flags:         msg.flags || 0,
      type:          msg.type || 0,
      state:         "SENT",
      is_edited:     Boolean(msg.is_edited),
    };
  }

  function cacheMessage(msg) {
    if (!msg || !msg.id) return;
    if (messageCache.size > 5000) {
      var oldest = messageCache.keys().next().value;
      if (oldest) messageCache.delete(oldest);
    }
    messageCache.set(msg.id, cloneMessage(msg));
  }

  function findMessage(channelId, id) {
    if (!id) return null;

    // 1. Check local cache first (works even when user deletes their own message)
    if (messageCache.has(id)) {
      return messageCache.get(id);
    }

    // 2. Check MessageStore
    try {
      if (MessageStore) {
        var m = (channelId && MessageStore.getMessage(channelId, id)) || MessageStore.getMessage(id);
        if (m) {
          var cloned = cloneMessage(m.toJS ? m.toJS() : m);
          cacheMessage(cloned);
          return cloned;
        }
      }
    } catch (e) {}

    // 3. Check ChannelMessages
    try {
      var cm = findByProps("_channelMessages");
      if (cm && channelId) {
        var chan = cm.get ? cm.get(channelId) : (cm._channelMessages && cm._channelMessages[channelId]);
        var m2 = chan && (chan.get ? chan.get(id) : (chan._array && chan._array.find(function (x) { return x.id === id; })));
        if (m2) {
          var cloned2 = cloneMessage(m2.toJS ? m2.toJS() : m2);
          cacheMessage(cloned2);
          return cloned2;
        }
      }
    } catch (e) {}

    return null;
  }

  // Discord's subtext syntax (-# ) natively renders text dimmed with lower opacity / muted color
  function makeDimmed(text) {
    if (typeof text !== "string" || !text) return "";
    return text.split("\n").map(function (line) {
      if (line.startsWith("-# ")) return line;
      return "-# " + line;
    }).join("\n");
  }

  function unDim(text) {
    if (typeof text !== "string") return "";
    return text.split("\n").map(function (line) {
      return line.startsWith("-# ") ? line.substring(3) : line;
    }).join("\n");
  }

  function extractCleanOriginal(text) {
    if (typeof text !== "string") return "";
    var clean = unDim(text);
    var prefix = "*Original Message*\n";
    var splitMarker = "\n*Edited Message*\n";
    if (clean.startsWith(prefix) && clean.indexOf(splitMarker) !== -1) {
      return clean.substring(prefix.length, clean.indexOf(splitMarker));
    }
    return clean;
  }

  function extractCleanEdited(text) {
    if (typeof text !== "string") return text;
    var clean = unDim(text);
    var splitMarker = "\n*Edited Message*\n";
    var idx = clean.lastIndexOf(splitMarker);
    if (idx !== -1) {
      return clean.substring(idx + splitMarker.length);
    }
    return clean;
  }

  // ── Build ghost payload for deleted messages ─────────────────────────────
  // Makes text lower opacity / less bright via Discord's muted subtext (-# )
  // and keeps attachments with decreased opacity (0.4)
  function ghostPayload(msg, channelId) {
    var rawContent = msg.content || "";
    var contentToSend = "";

    var isEdited = editedIds.has(msg.id) || firstOriginalText.has(msg.id) || msg.is_edited;
    if (isEdited) {
      var baseOriginal = firstOriginalText.get(msg.id);
      if (baseOriginal) {
        var cleanEdited = extractCleanEdited(rawContent);
        if (cleanEdited && cleanEdited !== baseOriginal) {
          // Both original and edited headers/content dimmed for deleted edited message
          contentToSend =
            "-# *Original Message*\n" +
            makeDimmed(baseOriginal) +
            "\n-# *Edited Message*\n" +
            makeDimmed(cleanEdited);
        } else {
          contentToSend = makeDimmed(baseOriginal);
        }
      } else {
        contentToSend = makeDimmed(rawContent);
      }
    } else {
      // Normal unedited deleted message: stays as it was, but dimmed to lower opacity
      contentToSend = makeDimmed(rawContent);
    }

    var attachments = [];
    if (msg.attachments && Array.isArray(msg.attachments)) {
      attachments = msg.attachments.map(function (att) {
        var copy = Object.assign({}, att);
        copy.opacity = 0.4;
        return copy;
      });
    }

    var chId = msg.channel_id || channelId;

    return {
      type: "MESSAGE_UPDATE",
      channelId: chId,
      message: {
        id:              msg.id,
        channel_id:      chId,
        content:         contentToSend,
        author:          msg.author,
        timestamp:       msg.timestamp,
        editedTimestamp: null,
        embeds:          msg.embeds || [],
        attachments:     attachments,
        mentions:        msg.mentions || [],
        mention_roles:   msg.mention_roles || msg.mentionRoles || [],
        mention_everyone: false,
        pinned:          false,
        tts:             false,
        type:            msg.type || 0,
        flags:           msg.flags || 0,
        state:           "SENT",
        optimistic:      false,
        was_deleted:     true,
      },
      optimistic:        false,
      sendMessageOptions: {},
      isPushNotification: false,
      otherPluginBypass: true,
    };
  }

  // ── Snapshot own messages before deleteMessage runs ───────────────────────
  try {
    var MessageActions = findByProps("deleteMessage", "startEditMessage") || findByProps("deleteMessage");
    if (MessageActions && typeof MessageActions.deleteMessage === "function") {
      patches.push(
        before("deleteMessage", MessageActions, function (args) {
          try {
            var chId = args && args[0];
            var mId = args && args[1];
            if (mId) {
              var m = findMessage(chId, mId);
              if (m) cacheMessage(m);
            }
          } catch (e) {}
        })
      );
    }
  } catch (e) {}

  // ── Dispatch interceptor ──────────────────────────────────────────────────
  patches.push(
    instead("dispatch", FluxDispatcher, function (args, orig) {
      try {
        var payload = args && args[0];
        if (!payload) return orig.apply(this, args);

        var type = payload.type;

        // ── Cache messages on arrival ──────────────────────────────────────────
        if (type === "MESSAGE_CREATE" || type === "LOCAL_MESSAGE_CREATE") {
          if (payload.message) cacheMessage(payload.message);
        }

        if (type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(payload.messages)) {
          for (var k = 0; k < payload.messages.length; k++) {
            cacheMessage(payload.messages[k]);
          }
        }

        // ── Handle message edits (MESSAGE_UPDATE) ──────────────────────────────
        // Original message is dimmed / lower opacity (-# ), while the edited message stays bright
        if (type === "MESSAGE_UPDATE") {
          if (payload.otherPluginBypass) return orig.apply(this, args);

          var updateMsg = payload.message || payload;
          var updateId = updateMsg.id || payload.id;
          var updateChanId = updateMsg.channel_id || payload.channelId || payload.channel_id;

          if (updateId && typeof updateMsg.content === "string") {
            var original = findMessage(updateChanId, updateId);

            if (original && original.content) {
              var baseOriginal = firstOriginalText.get(updateId);
              if (!baseOriginal) {
                baseOriginal = extractCleanOriginal(original.content);
                firstOriginalText.set(updateId, baseOriginal);
              }

              var newEdited = extractCleanEdited(updateMsg.content);

              if (baseOriginal && newEdited && baseOriginal !== newEdited) {
                editedIds.add(updateId);

                // Original message dimmed with lower opacity, new edited message stays bright
                var combined =
                  "-# *Original Message*\n" +
                  makeDimmed(baseOriginal) +
                  "\n*Edited Message*\n" +
                  newEdited;

                updateMsg.content = combined;

                if (messageCache.has(updateId)) {
                  var c = messageCache.get(updateId);
                  c.content = combined;
                  c.is_edited = true;
                }
              }
            } else if (original && !original.content) {
              if (messageCache.has(updateId)) {
                messageCache.get(updateId).content = updateMsg.content;
              }
            }
          }

          return orig.apply(this, args);
        }

        // ── Handle single delete (MESSAGE_DELETE) ──────────────────────────────
        if (type === "MESSAGE_DELETE") {
          var id        = payload.id || payload.messageId || (payload.message && payload.message.id);
          var channelId = payload.channelId || payload.channel_id || (payload.message && payload.message.channel_id);

          if (!id) return orig.apply(this, args);

          if (deletedIds.has(id)) {
            // Already ghosted! Suppress duplicate/gateway confirmation so the message stays in chat.
            return;
          }

          var msg = findMessage(channelId, id);
          if (msg) {
            deletedIds.add(id);
            if (deletedIds.size > 2000) {
              var oldestId = deletedIds.values().next().value;
              if (oldestId) deletedIds.delete(oldestId);
            }
            try {
              return orig.call(this, ghostPayload(msg, channelId));
            } catch (err) {
              return orig.apply(this, args);
            }
          }

          return orig.apply(this, args);
        }

        // ── Handle bulk delete (MESSAGE_DELETE_BULK) ───────────────────────────
        if (type === "MESSAGE_DELETE_BULK") {
          var ids       = payload.ids || [];
          var chId      = payload.channelId || payload.channel_id;
          var toRestore = [];

          for (var b = 0; b < ids.length; b++) {
            var bId = ids[b];
            if (!deletedIds.has(bId)) {
              var bMsg = findMessage(chId, bId);
              if (bMsg) {
                deletedIds.add(bId);
                toRestore.push(bMsg);
              }
            }
          }

          // Run bulk delete first
          orig.apply(this, args);

          // Re-inject each message as ghost
          for (var j = 0; j < toRestore.length; j++) {
            try {
              orig.call(this, ghostPayload(toRestore[j], chId));
            } catch (err2) {}
          }
          return;
        }

        return orig.apply(this, args);
      } catch (globalErr) {
        return orig.apply(this, args);
      }
    })
  );

  return {
    onLoad: function () {},
    onUnload: function () {
      deletedIds.clear();
      editedIds.clear();
      messageCache.clear();
      firstOriginalText.clear();
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];
    },
  };
})();
