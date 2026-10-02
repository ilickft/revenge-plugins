(function () {
  "use strict";

  var findByStoreName = vendetta.metro.findByStoreName;
  var findByProps     = vendetta.metro.findByProps;
  var before          = vendetta.patcher.before;
  var FluxDispatcher  = vendetta.metro.common.FluxDispatcher;

  var MessageStore    = findByStoreName("MessageStore") || findByProps("getMessage", "getMessages");
  var ChannelStore    = findByStoreName("ChannelStore") || findByProps("getChannel", "getDMFromUserId");
  var ChannelMessages = findByProps("_channelMessages");
  var MessageActions  = findByProps("startEditMessage");

  var patches = [];

  // Map of message ID -> clean original text content before any edits
  var firstOriginalText = new Map();
  // Set of message IDs that have been edited
  var editedIds = new Set();
  // Map of message ID -> { payload: args, stage: 1 | 2 }
  var deletedMessages = new Map();
  // Local cache of recently seen messages
  var messageCache = new Map();

  function cacheMessage(msg) {
    if (!msg || !msg.id) return;
    if (messageCache.size > 5000) {
      var oldest = messageCache.keys().next().value;
      if (oldest) messageCache.delete(oldest);
    }
    messageCache.set(msg.id, msg);
  }

  function getOriginalMessage(channelId, messageId) {
    if (!messageId) return null;

    // 1. Check MessageStore
    try {
      if (MessageStore && typeof MessageStore.getMessage === "function") {
        var m = (channelId && MessageStore.getMessage(channelId, messageId)) || MessageStore.getMessage(messageId);
        if (m && m.id) return m;
      }
    } catch (e) {}

    // 2. Check ChannelMessages
    try {
      if (ChannelMessages && channelId) {
        var chan = ChannelMessages.get ? ChannelMessages.get(channelId) : (ChannelMessages._channelMessages && ChannelMessages._channelMessages[channelId]);
        var m2 = chan && (chan.get ? chan.get(messageId) : (chan._array && chan._array.find(function (x) { return x.id === messageId; })));
        if (m2 && m2.id) return m2;
      }
    } catch (e) {}

    // 3. Check local messageCache
    if (messageCache.has(messageId)) {
      return messageCache.get(messageId);
    }

    return null;
  }

  // Discord subtext markdown syntax (-# ) natively renders text dimmed with lower opacity / muted color
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

  // When editing an edited message, strip the [Original Message] headers so the user only edits their latest text
  try {
    if (MessageActions && typeof MessageActions.startEditMessage === "function") {
      patches.push(
        before("startEditMessage", MessageActions, function (args) {
          try {
            var msgText = args && args[2];
            if (typeof msgText === "string") {
              args[2] = extractCleanEdited(msgText);
            }
          } catch (e) {}
          return args;
        })
      );
    }
  } catch (e) {}

  // ── Core Flux Dispatch patch ──────────────────────────────────────────────
  // Uses a pure before hook on FluxDispatcher to safely transform actions in-place
  // without dropping dispatches, throwing unhandled exceptions, or crashing React Native/WebRTC.
  patches.push(
    before("dispatch", FluxDispatcher, function (args) {
      try {
        var event = args && args[0];
        if (!event || !event.type) return args;

        var type = event.type;

        // ── Cache messages on arrival ────────────────────────────────────────
        if (type === "MESSAGE_CREATE" || type === "LOCAL_MESSAGE_CREATE") {
          if (event.message) cacheMessage(event.message);
        }

        if (type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(event.messages)) {
          for (var k = 0; k < event.messages.length; k++) {
            cacheMessage(event.messages[k]);
          }
        }

        // ── Handle message edits (MESSAGE_UPDATE) ────────────────────────────
        if (type === "MESSAGE_UPDATE") {
          if (event.otherPluginBypass) return args;

          var updateMsg = event.message || event;
          var updateId = updateMsg.id || event.id;
          var updateChanId = updateMsg.channel_id || event.channelId || event.channel_id;

          if (!updateId || typeof updateMsg.content !== "string") return args;

          var original = getOriginalMessage(updateChanId, updateId);
          if (!original) return args;

          var origContent = typeof original.content === "string" ? original.content : "";
          if (!origContent || updateMsg.content === origContent) return args;

          // Check if this update is just an embed expanding (not a real text edit)
          var embeds = updateMsg.embeds || event.embeds;
          if (Array.isArray(embeds)) {
            var isEmbedOnly = embeds.some(function (emb) {
              return emb && (emb.url === origContent || (origContent && origContent.indexOf(emb.url) !== -1));
            });
            if (isEmbedOnly) return args;
          }

          var baseOriginal = firstOriginalText.get(updateId);
          if (!baseOriginal) {
            baseOriginal = extractCleanOriginal(origContent);
            firstOriginalText.set(updateId, baseOriginal);
          }

          var newEdited = extractCleanEdited(updateMsg.content);

          if (baseOriginal && newEdited && baseOriginal !== newEdited) {
            editedIds.add(updateId);

            var combined =
              "-# *Original Message*\n" +
              makeDimmed(baseOriginal) +
              "\n*Edited Message*\n" +
              newEdited;

            var guildId = (ChannelStore && ChannelStore.getChannel && ChannelStore.getChannel(updateChanId) && ChannelStore.getChannel(updateChanId).guild_id) || original.guild_id || updateMsg.guild_id;

            args[0] = {
              type: "MESSAGE_UPDATE",
              channelId: updateChanId,
              message: Object.assign({}, original, updateMsg, {
                content: combined,
                guild_id: guildId,
                edited_timestamp: "invalid_timestamp",
              }),
              otherPluginBypass: true,
            };

            if (messageCache.has(updateId)) {
              var c = messageCache.get(updateId);
              if (c) c.content = combined;
            }
          }

          return args;
        }

        // ── Handle single delete (MESSAGE_DELETE) ────────────────────────────
        if (type === "MESSAGE_DELETE") {
          if (event.otherPluginBypass) return args;

          var id = event.id || event.messageId || (event.message && event.message.id);
          var channelId = event.channelId || event.channel_id || (event.message && event.message.channel_id);

          if (!id) return args;

          // Stage 2: Gateway confirmation of a delete we already ghosted locally
          if (deletedMessages.has(id)) {
            var entry = deletedMessages.get(id);
            if (entry && entry.stage === 1) {
              entry.stage = 2;
              args[0] = entry.payload;
              return args;
            }
            if (entry && entry.stage === 2) {
              // Both local and gateway phases complete; return safe update payload
              args[0] = entry.payload;
              return args;
            }
            return args;
          }

          var originalMessage = getOriginalMessage(channelId, id);
          if (!originalMessage) return args;

          var rawContent = typeof originalMessage.content === "string" ? originalMessage.content : "";
          var contentToSend = "";

          var isEdited = editedIds.has(id) || firstOriginalText.has(id) || originalMessage.is_edited;
          if (isEdited) {
            var baseOrig = firstOriginalText.get(id);
            if (baseOrig) {
              var cleanEd = extractCleanEdited(rawContent);
              if (cleanEd && cleanEd !== baseOrig) {
                contentToSend =
                  "-# *Original Message*\n" +
                  makeDimmed(baseOrig) +
                  "\n-# *Edited Message*\n" +
                  makeDimmed(cleanEd);
              } else {
                contentToSend = makeDimmed(baseOrig);
              }
            } else {
              contentToSend = makeDimmed(rawContent);
            }
          } else {
            contentToSend = makeDimmed(rawContent);
          }

          var attachments = [];
          if (Array.isArray(originalMessage.attachments)) {
            attachments = originalMessage.attachments.map(function (att) {
              var copy = Object.assign({}, att);
              copy.opacity = 0.4;
              return copy;
            });
          }

          var chId = originalMessage.channel_id || channelId;
          var gId = (ChannelStore && ChannelStore.getChannel && ChannelStore.getChannel(chId) && ChannelStore.getChannel(chId).guild_id) || originalMessage.guild_id;

          var ghostMsg = Object.assign({}, originalMessage, {
            content: contentToSend,
            channel_id: chId,
            guild_id: gId,
            type: originalMessage.type || 0,
            flags: originalMessage.flags || 0,
            state: "SENT",
            was_deleted: true,
          });

          if (attachments.length > 0) {
            ghostMsg.attachments = attachments;
          }

          var ghostAction = {
            type: "MESSAGE_UPDATE",
            channelId: chId,
            message: ghostMsg,
            optimistic: false,
            sendMessageOptions: {},
            isPushNotification: false,
            otherPluginBypass: true,
          };

          deletedMessages.set(id, {
            payload: ghostAction,
            stage: 1,
          });

          if (deletedMessages.size > 2000) {
            var oldestKey = deletedMessages.keys().next().value;
            if (oldestKey) deletedMessages.delete(oldestKey);
          }

          args[0] = ghostAction;
          return args;
        }

        // ── Handle bulk delete (MESSAGE_DELETE_BULK) ─────────────────────────
        if (type === "MESSAGE_DELETE_BULK") {
          var ids = event.ids || [];
          var bChannelId = event.channelId || event.channel_id;

          if (Array.isArray(ids) && ids.length > 0) {
            // Transform bulk delete by pre-ghosting each message in deletedMessages
            for (var b = 0; b < ids.length; b++) {
              var bId = ids[b];
              var bMsg = getOriginalMessage(bChannelId, bId);
              if (bMsg && !deletedMessages.has(bId)) {
                var bRawContent = typeof bMsg.content === "string" ? bMsg.content : "";
                var bGhost = Object.assign({}, bMsg, {
                  content: makeDimmed(bRawContent),
                  channel_id: bMsg.channel_id || bChannelId,
                  state: "SENT",
                  was_deleted: true,
                });
                deletedMessages.set(bId, {
                  payload: {
                    type: "MESSAGE_UPDATE",
                    channelId: bChannelId,
                    message: bGhost,
                    optimistic: false,
                    otherPluginBypass: true,
                  },
                  stage: 2,
                });
              }
            }
          }
          return args;
        }

        return args;
      } catch (err) {
        return args;
      }
    })
  );

  return {
    onLoad: function () {},
    onUnload: function () {
      firstOriginalText.clear();
      editedIds.clear();
      deletedMessages.clear();
      messageCache.clear();
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];
    },
  };
})();
