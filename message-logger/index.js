(function () {
  "use strict";

  var findByStoreName = vendetta.metro.findByStoreName;
  var findByProps     = vendetta.metro.findByProps;
  var findByName      = vendetta.metro.findByName;
  var instead         = vendetta.patcher.instead;
  var before          = vendetta.patcher.before;
  var after           = vendetta.patcher.after;
  var FluxDispatcher  = vendetta.metro.common.FluxDispatcher;
  var RN              = vendetta.metro.common.ReactNative;

  var MessageStore = findByStoreName("MessageStore") || findByProps("getMessage", "getMessages");
  var patches      = [];

  // Memory cache of recent messages so we never lose self-deleted or fast-deleted messages
  var messageCache      = new Map();
  // Set of message IDs that have been deleted
  var deletedIds        = new Set();
  // Map of message ID -> clean original text content before any edits
  var firstOriginalText = new Map();

  function cloneMessage(msg) {
    if (!msg || !msg.id) return null;
    return {
      id:            msg.id,
      channel_id:    msg.channel_id || msg.channelId,
      content:       typeof msg.content === "string" ? msg.content : "",
      author:        msg.author,
      timestamp:     msg.timestamp,
      attachments:   Array.isArray(msg.attachments) ? msg.attachments.slice() : [],
      embeds:        Array.isArray(msg.embeds) ? msg.embeds.slice() : [],
      mentions:      msg.mentions || [],
      mention_roles: msg.mention_roles || msg.mentionRoles || [],
      flags:         msg.flags || 0,
      type:          msg.type || 0,
      state:         "SENT",
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
          var cloned = cloneMessage(m);
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
          var cloned2 = cloneMessage(m2);
          cacheMessage(cloned2);
          return cloned2;
        }
      }
    } catch (e) {}

    return null;
  }

  function formatFadedOriginal(text) {
    if (typeof text !== "string" || !text) return "";
    var clean = text.split("\n").map(function (l) {
      return l.startsWith("-# ") ? l.substring(3) : l;
    }).join("\n");

    // Format with Discord's native subtext syntax (-# ), which decreases opacity and makes it muted/faded
    return clean.split("\n").map(function (l) {
      return "-# " + l;
    }).join("\n");
  }

  // ── Build ghost payload for deleted messages ─────────────────────────────
  // As requested:
  // "make the deleted message opacity decreased like attachment this way we don't hafta add anything"
  // Keep original content and attachments as-is, with decreased opacity (0.45)
  function ghostPayload(msg, channelId) {
    var rawContent = msg.content || "";

    var attachments = [];
    if (msg.attachments && Array.isArray(msg.attachments)) {
      attachments = msg.attachments.map(function (att) {
        var copy = Object.assign({}, att);
        copy.opacity = 0.45;
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
        content:         rawContent,
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
        type:            0,
        flags:           msg.flags || 0,
        state:           "SENT",
        optimistic:      false,
        was_deleted:     true,
        opacity:         0.45,
      },
      optimistic:        false,
      sendMessageOptions: {},
      isPushNotification: false,
      otherPluginBypass: true,
    };
  }

  function applyFadedStyle(row) {
    if (!row || row.type !== 1 || !row.message) return;
    var m = row.message;
    if (deletedIds.has(m.id) || m.was_deleted) {
      row.opacity = 0.45;
      m.opacity = 0.45;
      if (RN && RN.processColor) {
        m.textColor = RN.processColor("#80848e");
      }
      if (Array.isArray(m.attachments)) {
        for (var a = 0; a < m.attachments.length; a++) {
          m.attachments[a].opacity = 0.45;
        }
      }
    }
  }

  // ── Native chat row styling: fade deleted messages and attachments ────────
  try {
    var DCDChatManager = RN && RN.NativeModules && RN.NativeModules.DCDChatManager;
    if (DCDChatManager && typeof DCDChatManager.updateRows === "function") {
      patches.push(
        before("updateRows", DCDChatManager, function (args) {
          if (!args || typeof args[1] !== "string" || deletedIds.size === 0) return;
          try {
            var rows = JSON.parse(args[1]);
            var modified = false;

            for (var i = 0; i < rows.length; i++) {
              if (rows[i]?.type === 1 && rows[i]?.message && (deletedIds.has(rows[i].message.id) || rows[i].message.was_deleted)) {
                applyFadedStyle(rows[i]);
                modified = true;
              }
            }

            if (modified) {
              args[1] = JSON.stringify(rows);
            }
          } catch (e) {}
        })
      );
    }
  } catch (e) {}

  try {
    var RowManager = findByName("RowManager", false) || (findByProps("RowManager") && findByProps("RowManager").RowManager);
    if (RowManager && RowManager.prototype && typeof RowManager.prototype.generate === "function") {
      patches.push(
        after("generate", RowManager.prototype, function (args, rowObj) {
          var row = rowObj && (rowObj.row || rowObj);
          if (row) applyFadedStyle(row);
          return rowObj;
        })
      );
    }
  } catch (e) {}

  // ── Dispatch interceptor ──────────────────────────────────────────────────
  patches.push(
    instead("dispatch", FluxDispatcher, function (args, orig) {
      var payload = args[0];
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
      // Requirement: "original message losses opacity and new edited message stays brighth"
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
              baseOriginal = original.content.split("\n").map(function (l) {
                return l.startsWith("-# ") ? l.substring(3) : l;
              }).join("\n");
              firstOriginalText.set(updateId, baseOriginal);
            }

            var newEdited = updateMsg.content;
            if (baseOriginal && newEdited && baseOriginal !== newEdited) {
              // Original message loses opacity via Discord's muted subtext (-# ),
              // while the new edited message stays bright
              var combined = formatFadedOriginal(baseOriginal) + "\n" + newEdited;
              updateMsg.content = combined;

              if (messageCache.has(updateId)) {
                var c = messageCache.get(updateId);
                c.content = combined;
              }
            }
          } else if (original && !original.content) {
            // Original had no text (e.g. attachment only)
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

        if (id && !deletedIds.has(id)) {
          var msg = findMessage(channelId, id);
          if (msg) {
            deletedIds.add(id);
            return orig.call(this, ghostPayload(msg, channelId));
          }
        }
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
          orig.call(this, ghostPayload(toRestore[j], chId));
        }
        return;
      }

      return orig.apply(this, args);
    })
  );

  return {
    onLoad: function () {},
    onUnload: function () {
      deletedIds.clear();
      messageCache.clear();
      firstOriginalText.clear();
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];
    },
  };
})();
