(function () {
  "use strict";

  var findByStoreName = vendetta.metro.findByStoreName;
  var findByProps     = vendetta.metro.findByProps;
  var before          = vendetta.patcher.before;
  var FluxDispatcher  = vendetta.metro.common.FluxDispatcher;

  var MessageStore    = findByStoreName("MessageStore") || findByProps("getMessage", "getMessages");
  var ChannelStore    = findByStoreName("ChannelStore") || findByProps("getChannel", "getDMFromUserId");
  var UserStore       = findByStoreName("UserStore") || findByProps("getCurrentUser");
  var AvatarUtils     = findByProps("getDefaultAvatarURL") || findByProps("getUserAvatarURL");
  var ChannelMessages = findByProps("_channelMessages");
  var MessageActions  = findByProps("startEditMessage");

  var patches = [];

  var firstOriginalText = new Map();

  var editedIds = new Set();

  var deletedMessages = new Map();

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

    try {
      if (MessageStore && typeof MessageStore.getMessage === "function") {
        var m = (channelId && MessageStore.getMessage(channelId, messageId)) || MessageStore.getMessage(messageId);
        if (m && m.id) return m;
      }
    } catch (e) {}

    try {
      if (ChannelMessages && channelId) {
        var chan = ChannelMessages.get ? ChannelMessages.get(channelId) : (ChannelMessages._channelMessages && ChannelMessages._channelMessages[channelId]);
        var m2 = chan && (chan.get ? chan.get(messageId) : (chan._array && chan._array.find(function (x) { return x.id === messageId; })));
        if (m2 && m2.id) return m2;
      }
    } catch (e) {}

    if (messageCache.has(messageId)) {
      return messageCache.get(messageId);
    }

    return null;
  }

  function getSanitizedAuthor(authorA, authorB) {
    var raw = authorA || authorB;
    var currentUser = null;
    try {
      if (UserStore && typeof UserStore.getCurrentUser === "function") {
        currentUser = UserStore.getCurrentUser();
      }
    } catch (e) {}

    var id = (raw && raw.id) || (currentUser && currentUser.id) || "0";
    var username = (raw && raw.username) || (currentUser && currentUser.username) || "Discord User";
    var discriminator = (raw && raw.discriminator) || (currentUser && currentUser.discriminator) || "0";
    var avatar = (raw && raw.avatar !== undefined) ? raw.avatar : (currentUser ? currentUser.avatar : null);

    if (!discriminator || discriminator === "???" || isNaN(Number(discriminator))) {
      discriminator = "0";
    }
    if (!id || id === "???") {
      id = (currentUser && currentUser.id) || "0";
    }

    var authorObj = {
      id: String(id),
      username: String(username),
      discriminator: String(discriminator),
      avatar: avatar,
    };

    if (raw) {
      if (raw.globalName !== undefined) authorObj.globalName = raw.globalName;
      if (raw.global_name !== undefined) authorObj.global_name = raw.global_name;
      if (raw.avatarDecoration !== undefined) authorObj.avatarDecoration = raw.avatarDecoration;
      if (raw.avatar_decoration_data !== undefined) authorObj.avatar_decoration_data = raw.avatar_decoration_data;
      if (typeof raw.bot === "boolean") authorObj.bot = raw.bot;
    } else if (currentUser) {
      if (currentUser.globalName !== undefined) authorObj.globalName = currentUser.globalName;
      if (currentUser.global_name !== undefined) authorObj.global_name = currentUser.global_name;
      if (currentUser.avatarDecoration !== undefined) authorObj.avatarDecoration = currentUser.avatarDecoration;
    }

    return authorObj;
  }

  try {
    if (AvatarUtils) {
      if (typeof AvatarUtils.getDefaultAvatarURL === "function") {
        patches.push(
          before("getDefaultAvatarURL", AvatarUtils, function (args) {
            try {
              var arg = args && args[0];
              if (!arg || arg === "???" || (typeof arg === "string" && isNaN(Number(arg)))) {
                args[0] = "0";
              } else if (typeof arg === "object") {
                if (!arg.discriminator || arg.discriminator === "???" || isNaN(Number(arg.discriminator))) {
                  arg.discriminator = "0";
                }
              }
            } catch (e) {}
            return args;
          })
        );
      }
      if (typeof AvatarUtils.getUserAvatarURL === "function") {
        patches.push(
          before("getUserAvatarURL", AvatarUtils, function (args) {
            try {
              var user = args && args[0];
              if (user && typeof user === "object") {
                if (!user.discriminator || user.discriminator === "???" || isNaN(Number(user.discriminator))) {
                  user.discriminator = "0";
                }
              }
            } catch (e) {}
            return args;
          })
        );
      }
      if (typeof AvatarUtils.getUserAvatarSource === "function") {
        patches.push(
          before("getUserAvatarSource", AvatarUtils, function (args) {
            try {
              var user = args && args[0];
              if (user && typeof user === "object") {
                if (!user.discriminator || user.discriminator === "???" || isNaN(Number(user.discriminator))) {
                  user.discriminator = "0";
                }
              }
            } catch (e) {}
            return args;
          })
        );
      }
    }
  } catch (e) {}

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

  patches.push(
    before("dispatch", FluxDispatcher, function (args) {
      try {
        var event = args && args[0];
        if (!event || !event.type) return args;

        var type = event.type;

        if (type === "MESSAGE_CREATE" || type === "LOCAL_MESSAGE_CREATE") {
          if (event.message) cacheMessage(event.message);
        }

        if (type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(event.messages)) {
          for (var k = 0; k < event.messages.length; k++) {
            cacheMessage(event.messages[k]);
          }
        }

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

            var guildId = (ChannelStore && ChannelStore.getChannel && ChannelStore.getChannel(updateChanId) && ChannelStore.getChannel(updateChanId).guild_id) || original.guild_id || updateMsg.guild_id || null;
            var authorObj = getSanitizedAuthor(updateMsg.author, original.author);

            args[0] = {
              type: "MESSAGE_UPDATE",
              channelId: updateChanId,
              message: {
                id: updateId,
                channel_id: updateChanId,
                guild_id: guildId,
                author: authorObj,
                type: (typeof updateMsg.type === "number" ? updateMsg.type : original.type) || 0,
                flags: (typeof updateMsg.flags === "number" ? updateMsg.flags : original.flags) || 0,
                content: combined,
                timestamp: updateMsg.timestamp || original.timestamp || new Date().toISOString(),
                edited_timestamp: updateMsg.edited_timestamp || new Date().toISOString(),
                state: "SENT",
              },
              otherPluginBypass: true,
            };

            if (messageCache.has(updateId)) {
              var c = messageCache.get(updateId);
              if (c) {
                try { c.content = combined; } catch (e5) {}
                try { c.author = authorObj; } catch (e6) {}
                try { c.edited_timestamp = updateMsg.edited_timestamp || new Date().toISOString(); } catch (e7) {}
              }
            }
          }

          return args;
        }

        if (type === "MESSAGE_DELETE") {
          if (event.otherPluginBypass) return args;

          var id = event.id || event.messageId || (event.message && event.message.id);
          var channelId = event.channelId || event.channel_id || (event.message && event.message.channel_id);

          if (!id) return args;

          if (deletedMessages.has(id)) {
            var entry = deletedMessages.get(id);
            if (entry && entry.stage === 1) {
              entry.stage = 2;
              args[0] = entry.payload;
              return args;
            }
            if (entry && entry.stage === 2) {

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

          var chId = originalMessage.channel_id || channelId;
          var gId = (ChannelStore && ChannelStore.getChannel && ChannelStore.getChannel(chId) && ChannelStore.getChannel(chId).guild_id) || originalMessage.guild_id || null;

          var hasAttachments = Boolean(
            originalMessage.attachments &&
            ((Array.isArray(originalMessage.attachments) && originalMessage.attachments.length > 0) ||
             (typeof originalMessage.attachments.size === "number" && originalMessage.attachments.size > 0))
          );
          var hasEmbeds = Boolean(
            originalMessage.embeds &&
            ((Array.isArray(originalMessage.embeds) && originalMessage.embeds.length > 0) ||
             (typeof originalMessage.embeds.size === "number" && originalMessage.embeds.size > 0))
          );
          var hasStickers = Boolean(
            (originalMessage.sticker_items && originalMessage.sticker_items.length > 0) ||
            (originalMessage.stickers && originalMessage.stickers.length > 0)
          );

          if (!contentToSend && (hasAttachments || hasEmbeds || hasStickers)) {
            contentToSend = "-# *(deleted)*";
          }

          var authorObj = getSanitizedAuthor(originalMessage.author);

          var ghostAction = {
            type: "MESSAGE_UPDATE",
            channelId: chId,
            message: {
              id: id,
              channel_id: chId,
              guild_id: gId,
              author: authorObj,
              type: originalMessage.type || 0,
              flags: originalMessage.flags || 0,
              content: contentToSend,
              timestamp: originalMessage.timestamp || new Date().toISOString(),
              state: "SENT",
            },
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

          if (messageCache.has(id)) {
            var cached = messageCache.get(id);
            if (cached) {
              try { cached.content = contentToSend; } catch (e5) {}
              try { cached.author = authorObj; } catch (e6) {}
              try { cached.was_deleted = true; } catch (e7) {}
            }
          }

          args[0] = ghostAction;
          return args;
        }

        if (type === "MESSAGE_DELETE_BULK") {
          var ids = event.ids || [];
          var bChannelId = event.channelId || event.channel_id;

          if (Array.isArray(ids) && ids.length > 0) {
            for (var b = 0; b < ids.length; b++) {
              var bId = ids[b];
              var bMsg = getOriginalMessage(bChannelId, bId);
              if (bMsg && !deletedMessages.has(bId)) {
                var bRawContent = typeof bMsg.content === "string" ? bMsg.content : "";
                var bContent = makeDimmed(bRawContent);
                var bHasAttachments = Boolean(
                  bMsg.attachments &&
                  ((Array.isArray(bMsg.attachments) && bMsg.attachments.length > 0) ||
                   (typeof bMsg.attachments.size === "number" && bMsg.attachments.size > 0))
                );

                if (!bContent && bHasAttachments) {
                  bContent = "-# *(deleted)*";
                }

                var bAuthorObj = getSanitizedAuthor(bMsg.author);
                var bGuildId = (ChannelStore && ChannelStore.getChannel && ChannelStore.getChannel(bChannelId) && ChannelStore.getChannel(bChannelId).guild_id) || bMsg.guild_id || null;

                deletedMessages.set(bId, {
                  payload: {
                    type: "MESSAGE_UPDATE",
                    channelId: bChannelId,
                    message: {
                      id: bId,
                      channel_id: bMsg.channel_id || bChannelId,
                      guild_id: bGuildId,
                      author: bAuthorObj,
                      type: bMsg.type || 0,
                      flags: bMsg.flags || 0,
                      content: bContent,
                      timestamp: bMsg.timestamp || new Date().toISOString(),
                      state: "SENT",
                    },
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
