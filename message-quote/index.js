(function () {
  "use strict";

  var findByProps          = vendetta.metro.findByProps;
  var findByStoreName      = vendetta.metro.findByStoreName;
  var before               = vendetta.patcher.before;
  var after                = vendetta.patcher.after;
  var React                = vendetta.metro.common.React;
  var RN                   = vendetta.metro.common.ReactNative;
  var storage              = vendetta.plugin.storage;

  // ── Metro Stores & Modules ───────────────────────────────────────────────
  var MessageStore         = findByProps("getMessage", "getMessages");
  var UserStore            = findByStoreName("UserStore");
  var SelectedChannelStore = findByStoreName("SelectedChannelStore") || findByProps("getChannelId");
  var SelectedGuildStore   = findByStoreName("SelectedGuildStore") || findByProps("getGuildId");
  var GuildMemberStore     = findByStoreName("GuildMemberStore") || findByProps("getMember");
  var ChannelStore         = findByStoreName("ChannelStore") || findByProps("getChannel");
  var PendingReplyStore    = findByProps("getPendingReply");
  var TokenModule          = findByProps("getToken");
  var ActionSheet          = findByProps("openLazy", "hideActionSheet");
  var Messages             = findByProps("sendMessage", "editMessage");

  // UI components & helpers
  var Forms                = (vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms) || findByProps("FormRow", "FormIcon");
  var FormRow              = Forms && (Forms.FormRow || Forms.TableRow);
  var FormIcon             = Forms && (Forms.FormIcon || Forms.TableIcon);
  var FormSwitch           = Forms && (Forms.FormSwitch || Forms.FormSwitchRow);
  var getAssetIDByName     = (vendetta.ui && vendetta.ui.assets && vendetta.ui.assets.getAssetIDByName) || (findByProps("getAssetIDByName") && findByProps("getAssetIDByName").getAssetIDByName);
  var showToast            = (vendetta.ui && vendetta.ui.toasts && vendetta.ui.toasts.showToast) || (findByProps("showToast") && findByProps("showToast").showToast);

  // ── Defaults & Storage ───────────────────────────────────────────────────
  if (storage.enableContextMenu === undefined) {
    storage.enableContextMenu = true;
  }
  if (storage.linkReply === undefined) {
    storage.linkReply = true;
  }
  if (storage.defaultColor === undefined) {
    storage.defaultColor = "";
  }

  var patches            = [];
  var unregisterCommands = [];

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toast(msg, isError) {
    try {
      if (showToast) {
        var icon = getAssetIDByName ? (getAssetIDByName(isError ? "ic_close_16px" : "ImageIcon") || getAssetIDByName(isError ? "CloseIcon" : "CheckmarkSmallIcon") || getAssetIDByName("ChatIcon")) : null;
        showToast(msg, icon);
      }
    } catch (e) {}
  }

  function optionValue(args, name) {
    if (!Array.isArray(args)) return undefined;
    var found = args.find(function (a) { return a && a.name === name; });
    return found && found.value !== undefined && found.value !== null ? found.value : undefined;
  }

  function getAuthToken() {
    try {
      if (TokenModule && typeof TokenModule.getToken === "function") {
        var t = TokenModule.getToken();
        if (t) return t;
      }
    } catch (e) {}
    try {
      var auth = findByProps("getToken", "getFingerprint");
      if (auth && typeof auth.getToken === "function") {
        var t2 = auth.getToken();
        if (t2) return t2;
      }
    } catch (e) {}
    try {
      var authStore = findByStoreName("AuthenticationStore");
      if (authStore && typeof authStore.getToken === "function") {
        var t3 = authStore.getToken();
        if (t3) return t3;
      }
    } catch (e) {}
    return null;
  }

  function getActiveChannelId() {
    try {
      if (SelectedChannelStore) {
        if (typeof SelectedChannelStore.getChannelId === "function") {
          var id = SelectedChannelStore.getChannelId();
          if (id) return id;
        }
        if (typeof SelectedChannelStore.getCurrentlySelectedChannelId === "function") {
          var id2 = SelectedChannelStore.getCurrentlySelectedChannelId();
          if (id2) return id2;
        }
      }
    } catch (e) {}
    return null;
  }

  function getActiveGuildId(channelId) {
    try {
      if (channelId && ChannelStore && typeof ChannelStore.getChannel === "function") {
        var chan = ChannelStore.getChannel(channelId);
        if (chan && chan.guild_id) return chan.guild_id;
      }
    } catch (e) {}
    try {
      if (SelectedGuildStore && typeof SelectedGuildStore.getGuildId === "function") {
        return SelectedGuildStore.getGuildId();
      }
    } catch (e) {}
    return null;
  }

  function getAvatarUrl(user, guildId, member) {
    if (guildId && member && member.avatar && user && user.id) {
      return "https://cdn.discordapp.com/guilds/" + guildId + "/users/" + user.id + "/avatars/" + member.avatar + ".png?size=256";
    }
    if (user && user.avatar && user.id) {
      return "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".png?size=256";
    }
    var idx = 0;
    try {
      if (user && user.discriminator && user.discriminator !== "0") {
        idx = parseInt(user.discriminator, 10) % 5;
      } else if (user && user.id) {
        if (typeof BigInt !== "undefined") {
          idx = Number((BigInt(user.id) >> 22n) % 6n);
        } else {
          idx = Math.abs(parseInt(user.id.slice(-4), 10)) % 6;
        }
      }
    } catch (e) {
      idx = 0;
    }
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

  function getUserDisplayName(user, guildId) {
    if (!user) return "User";
    try {
      if (guildId && GuildMemberStore && typeof GuildMemberStore.getMember === "function" && user.id) {
        var member = GuildMemberStore.getMember(guildId, user.id);
        if (member && member.nick) return member.nick;
      }
    } catch (e) {}
    return user.globalName || user.global_name || user.username || "User";
  }

  function getUserColor(user, guildId, overrideColor) {
    if (overrideColor && typeof overrideColor === "string" && overrideColor.trim()) {
      var c = overrideColor.trim();
      if (!c.startsWith("#") && /^[0-9a-fA-F]{6}$/.test(c)) c = "#" + c;
      return c;
    }
    try {
      if (guildId && GuildMemberStore && typeof GuildMemberStore.getMember === "function" && user && user.id) {
        var member = GuildMemberStore.getMember(guildId, user.id);
        if (member && member.colorString && member.colorString !== "#000000") {
          return member.colorString;
        }
      }
    } catch (e) {}
    if (storage.defaultColor && typeof storage.defaultColor === "string" && storage.defaultColor.trim()) {
      var dc = storage.defaultColor.trim();
      if (!dc.startsWith("#") && /^[0-9a-fA-F]{6}$/.test(dc)) dc = "#" + dc;
      return dc;
    }
    return null;
  }

  function resolvePendingReplyMessage(channelId) {
    try {
      var pending = (PendingReplyStore && PendingReplyStore.getPendingReply(channelId)) ||
                   (PendingReplyStore && PendingReplyStore.getPendingReply());
      if (!pending) return null;

      var msg = pending.message || pending.reply;
      if (msg && msg.id && (msg.content !== undefined || msg.author)) {
        if (MessageStore && msg.id && channelId) {
          var full = MessageStore.getMessage(channelId, msg.id);
          if (full) return full;
        }
        return msg;
      }

      var msgId = pending.messageId || pending.message_id || (pending.message && pending.message.id) || pending.id;
      var chanId = pending.channelId || pending.channel_id || channelId;
      if (msgId && chanId && MessageStore) {
        var m = MessageStore.getMessage(chanId, msgId);
        if (m) return m;
      }
      if (msg) return msg;
    } catch (e) {}
    return null;
  }

  function resolveMessageContent(msg, customText) {
    if (customText && typeof customText === "string" && customText.trim()) {
      return customText.trim();
    }
    if (!msg) return "...";
    var text = (msg.content && msg.content.trim()) || "";
    if (text) {
      if (text.length > 1200) text = text.slice(0, 1197) + "...";
      return text;
    }
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      if (msg.attachments.length === 1) {
        return "[Attachment: " + (msg.attachments[0].filename || "file") + "]";
      }
      return "[" + msg.attachments.length + " Attachments]";
    }
    if (Array.isArray(msg.embeds) && msg.embeds.length > 0) {
      var em = msg.embeds[0];
      return (em && (em.description || em.title)) || "[Embed]";
    }
    return "...";
  }

  function findInReactTree(tree, filter) {
    if (!tree) return null;
    if (filter(tree)) return tree;
    if (Array.isArray(tree)) {
      for (var i = 0; i < tree.length; i++) {
        var res = findInReactTree(tree[i], filter);
        if (res) return res;
      }
    } else if (typeof tree === "object") {
      var props = tree.props;
      if (props) {
        var res2 = findInReactTree(props.children, filter);
        if (res2) return res2;
      }
    }
    return null;
  }

  function resolveMessageFromProps(sheetProps) {
    if (!sheetProps) return null;
    if (sheetProps.message && (sheetProps.message.id || sheetProps.message.content !== undefined || sheetProps.message.attachments)) {
      return sheetProps.message;
    }
    if (sheetProps.targetMessage) return sheetProps.targetMessage;
    if (sheetProps.item) {
      if (sheetProps.item.message) return sheetProps.item.message;
      if (sheetProps.item.id && (sheetProps.item.content !== undefined || sheetProps.item.attachments)) return sheetProps.item;
    }
    var chanId = sheetProps.channelId || (sheetProps.channel && sheetProps.channel.id) ||
                 (sheetProps.attachment && (sheetProps.attachment.channel_id || sheetProps.attachment.channelId)) ||
                 getActiveChannelId();
    var msgId = sheetProps.messageId || sheetProps.message_id ||
                (sheetProps.attachment && (sheetProps.attachment.message_id || sheetProps.attachment.messageId));
    if (msgId && chanId && MessageStore) {
      var stored = null;
      try {
        stored = (MessageStore.getMessage.length >= 2 ? MessageStore.getMessage(chanId, msgId) : MessageStore.getMessage(msgId)) ||
                 MessageStore.getMessage(chanId, msgId) || MessageStore.getMessage(msgId);
      } catch (e) {}
      if (!stored && chanId) {
        try {
          var cm = findByProps("_channelMessages");
          if (cm) {
            var chan = cm.get ? cm.get(chanId) : (cm._channelMessages && cm._channelMessages[chanId]);
            stored = chan && (chan.get ? chan.get(msgId) : (chan._array && chan._array.find(function (x) { return x.id === msgId; })));
          }
        } catch (e) {}
      }
      if (stored) return stored;
    }
    if (sheetProps.attachment) {
      return {
        id: sheetProps.attachment.id || String(Date.now()),
        channel_id: chanId,
        content: "",
        attachments: [sheetProps.attachment],
        author: sheetProps.attachment.author || {}
      };
    }
    return null;
  }

  // ── PNG Quote Generation ──────────────────────────────────────────────────

  function generateQuotePng(data) {
    var base = "https://api.popcat.xyz/v2/discord-message";
    var params = [];
    params.push("username=" + encodeURIComponent(data.username || "User"));
    params.push("content=" + encodeURIComponent(data.content || "..."));
    params.push("avatar=" + encodeURIComponent(data.avatar || "https://cdn.discordapp.com/embed/avatars/0.png"));
    if (data.color) {
      params.push("color=" + encodeURIComponent(data.color));
    }
    if (data.timestamp) {
      var iso = "";
      try {
        iso = new Date(data.timestamp).toISOString();
      } catch (e) {
        iso = new Date().toISOString();
      }
      params.push("timestamp=" + encodeURIComponent(iso));
    }
    var url = base + "?" + params.join("&");

    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("Popcat API returned HTTP " + res.status);
      return res.blob().then(function (blob) {
        return { blob: blob, directUrl: url };
      });
    }).catch(function (err) {
      console.warn("[MessageQuote] Popcat failed, trying Typefully fallback:", err);
      var fallbackUrl = "https://typefully-ai.typefully.workers.dev/v1/discord-quote?text=" +
        encodeURIComponent(data.content || "...") +
        "&name=" + encodeURIComponent(data.username || "User") +
        "&avatar=" + encodeURIComponent(data.avatar || "https://cdn.discordapp.com/embed/avatars/0.png") +
        "&color=true&shape=circle";
      return fetch(fallbackUrl).then(function (fbRes) {
        if (!fbRes.ok) throw new Error("Fallback quote API returned HTTP " + fbRes.status);
        return fbRes.blob().then(function (blob) {
          return { blob: blob, directUrl: fallbackUrl };
        });
      });
    });
  }

  // ── Discord Attachment Upload & Message Sending ───────────────────────────

  function uploadBlobToDiscord(channelId, blob, filename, token) {
    var idStr = "0";
    var fileName = filename || "quote.png";
    var fileSize = (blob && blob.size) || 32768;
    var mimeType = "image/png";

    return fetch("https://discord.com/api/v9/channels/" + channelId + "/attachments", {
      method: "POST",
      headers: {
        "Authorization": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: [
          {
            id: idStr,
            filename: fileName,
            file_size: fileSize
          }
        ]
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (errData) {
          var msg = (errData && errData.message) || ("HTTP " + res.status + " requesting upload URL");
          throw new Error(msg);
        });
      }
      return res.json();
    }).then(function (data) {
      var uploadItem = data && data.attachments && data.attachments[0];
      if (!uploadItem || !uploadItem.upload_url || !uploadItem.upload_filename) {
        throw new Error("Discord did not return upload_url");
      }

      return fetch(uploadItem.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType
        },
        body: blob
      }).then(function (putRes) {
        if (!putRes.ok) {
          throw new Error("HTTP " + putRes.status + " uploading binary to storage");
        }
        return {
          id: idStr,
          filename: fileName,
          uploaded_filename: uploadItem.upload_filename
        };
      });
    });
  }

  function sendQuoteMessage(channelId, uploaded, replyMessageId, token) {
    var payload = {
      content: "",
      attachments: [
        {
          id: "0",
          filename: uploaded.filename,
          uploaded_filename: uploaded.uploaded_filename
        }
      ]
    };

    if (replyMessageId && storage.linkReply !== false) {
      payload.message_reference = {
        channel_id: channelId,
        message_id: replyMessageId
      };
    }

    function doSend(p) {
      return fetch("https://discord.com/api/v9/channels/" + channelId + "/messages", {
        method: "POST",
        headers: {
          "Authorization": token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(p)
      }).then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            var errMsg = (data && (data.message || (data.content && data.content[0]))) || ("Discord HTTP " + res.status);
            throw new Error(errMsg);
          });
        }
        return res.json().catch(function () { return {}; });
      });
    }

    return doSend(payload).catch(function (err) {
      if (payload.message_reference) {
        delete payload.message_reference;
        return doSend(payload);
      }
      throw err;
    });
  }

  function quoteMessage(channelId, msg, options) {
    options = options || {};
    var token = getAuthToken();
    var guildId = getActiveGuildId(channelId);

    var author = (msg && msg.author) || (options.user) || (UserStore && UserStore.getCurrentUser()) || {};
    var userId = options.userId || author.id;
    var user = (UserStore && UserStore.getUser(userId)) || author;
    var member = guildId && GuildMemberStore && GuildMemberStore.getMember(guildId, userId);

    var username = getUserDisplayName(user || author, guildId);
    var avatar = getAvatarUrl(user || author, guildId, member);
    var color = getUserColor(user || author, guildId, options.color);
    var content = resolveMessageContent(msg, options.text);
    var timestamp = (msg && msg.timestamp) || new Date().toISOString();
    var replyId = (msg && msg.id) || null;

    toast("Generating quote PNG...");

    return generateQuotePng({
      username: username,
      content: content,
      avatar: avatar,
      color: color,
      timestamp: timestamp
    }).then(function (genResult) {
      if (token) {
        return uploadBlobToDiscord(channelId, genResult.blob, "quote.png", token).then(function (uploaded) {
          return sendQuoteMessage(channelId, uploaded, replyId, token);
        });
      }

      // Fallback if no auth token: send direct URL embed via sendMessage
      if (Messages && typeof Messages.sendMessage === "function") {
        return Messages.sendMessage(channelId, { content: genResult.directUrl });
      }
      throw new Error("No auth token available to send attachment");
    }).then(function () {
      toast("Quote sent!");
    }).catch(function (err) {
      console.error("[MessageQuote]", err);
      toast("Quote failed: " + err.message, true);
    });
  }

  // ── Long-press ActionSheet patch: "Quote as PNG" button ───────────────────

  function patchActionSheet() {
    if (!ActionSheet || typeof ActionSheet.openLazy !== "function") return;

    patches.push(
      before("openLazy", ActionSheet, function (args) {
        if (storage.enableContextMenu === false) return;
        var componentPromise = args[0];
        var key = args[1];
        var sheetProps = args[2];

        if (!componentPromise || typeof componentPromise.then !== "function") return;

        var isRelevantKey = !key || typeof key !== "string" ||
          key.indexOf("Message") !== -1 ||
          key.indexOf("Attachment") !== -1 ||
          key.indexOf("Media") !== -1 ||
          key.indexOf("Action") !== -1;

        if (!isRelevantKey) return;

        var targetMsg = resolveMessageFromProps(sheetProps);
        if (!targetMsg) return;

        componentPromise.then(function (module) {
          if (!module) return;
          var unpatchSheet = after("default", module, function (sheetArgs, sheetResult) {
            if (React && React.useEffect) {
              React.useEffect(function () {
                return function () { unpatchSheet(); };
              }, []);
            }

            var buttonRows = findInReactTree(sheetResult, function (node) {
              return (
                Array.isArray(node) && node.length > 0 &&
                node.some(function (item) {
                  return item && item.props && (item.props.label !== undefined || item.props.title !== undefined);
                })
              );
            });

            if (!buttonRows) return;

            for (var i = 0; i < buttonRows.length; i++) {
              var p = buttonRows[i] && buttonRows[i].props;
              if (p && (p.label === "Quote as PNG" || p.title === "Quote as PNG")) {
                return;
              }
            }

            var RowComponent = FormRow || (findByProps("ActionSheetRow") && findByProps("ActionSheetRow").ActionSheetRow);
            if (!RowComponent) return;

            var quoteIcon = getAssetIDByName ? (getAssetIDByName("ic_message_quote") || getAssetIDByName("ChatIcon") || getAssetIDByName("ImageIcon") || getAssetIDByName("ic_message_copy")) : null;

            var chanId = (sheetProps && sheetProps.channel && sheetProps.channel.id) ||
                         (targetMsg && (targetMsg.channel_id || targetMsg.channelId)) ||
                         getActiveChannelId();

            var elementProps = {
              key: "quote-message-png-item-" + (targetMsg.id || "msg"),
              label: "Quote as PNG",
              title: "Quote as PNG",
              onPress: function () {
                if (ActionSheet.hideActionSheet) ActionSheet.hideActionSheet();
                if (chanId && targetMsg) {
                  quoteMessage(chanId, targetMsg);
                }
              }
            };

            if (FormIcon && quoteIcon) {
              elementProps.leading = React.createElement(FormIcon, { source: quoteIcon });
            }

            buttonRows.push(React.createElement(RowComponent, elementProps));
          });
        });
      })
    );
  }

  // ── Slash Command Registration ────────────────────────────────────────────

  function removeQuoteCommand() {
    try {
      if (vendetta.commands && Array.isArray(vendetta.commands.commands)) {
        for (var i = vendetta.commands.commands.length - 1; i >= 0; i--) {
          var cmd = vendetta.commands.commands[i];
          if (cmd && (cmd.name === "quote" || cmd.displayName === "quote")) {
            vendetta.commands.commands.splice(i, 1);
          }
        }
      }
    } catch (e) {}
  }

  function registerSlashCommands() {
    removeQuoteCommand();

    if (vendetta.commands && typeof vendetta.commands.registerCommand === "function") {
      unregisterCommands.push(
        vendetta.commands.registerCommand({
          name: "quote",
          displayName: "quote",
          description: "Turn a replied message or custom text into a Discord-style PNG quote and send it",
          displayDescription: "Turn a message into a Discord-style PNG quote",
          applicationId: "-1",
          type: 1,
          inputType: 1,
          options: [
            {
              name: "text",
              displayName: "text",
              description: "Custom text to quote (overrides replied message, or quotes yourself)",
              displayDescription: "Custom text to quote",
              type: 3, // STRING
              required: false,
            },
            {
              name: "user",
              displayName: "user",
              description: "User to attribute the quote to (defaults to replied user or yourself)",
              displayDescription: "User to quote",
              type: 6, // USER
              required: false,
            },
            {
              name: "color",
              displayName: "color",
              description: "Username hex color (e.g. #5865f2)",
              displayDescription: "Username color",
              type: 3, // STRING
              required: false,
            },
          ],
          execute: function (args, ctx) {
            var channelId = (ctx && ctx.channel && ctx.channel.id) || getActiveChannelId();
            if (!channelId) {
              toast("Open a channel first!", true);
              return null;
            }

            var customText = optionValue(args, "text");
            var customUserId = optionValue(args, "user");
            var customColor = optionValue(args, "color");

            var pendingMsg = resolvePendingReplyMessage(channelId);

            if (!pendingMsg && !customText && !customUserId) {
              toast("Reply to a message first or provide text! Example: Reply to a message and type /quote", true);
              return null;
            }

            var targetUser = customUserId ? (UserStore && UserStore.getUser(customUserId)) : null;

            quoteMessage(channelId, pendingMsg, {
              text: customText,
              user: targetUser,
              userId: customUserId,
              color: customColor,
            });

            return null;
          }
        })
      );
    }
  }

  // ── Settings UI ───────────────────────────────────────────────────────────

  function Settings() {
    var forceUpdate = React.useReducer(function (x) { return x + 1; }, 0)[1];
    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;
    var previewState = React.useState(null);
    var previewUrl = previewState[0];
    var setPreviewUrl = previewState[1];
    var testingState = React.useState(false);
    var testing = testingState[0];
    var setTesting = testingState[1];

    function handleTest() {
      setTesting(true);
      var currentUser = UserStore && UserStore.getCurrentUser();
      var name = (currentUser && (currentUser.globalName || currentUser.username)) || "User";
      var av = getAvatarUrl(currentUser);
      var color = (storage.defaultColor && storage.defaultColor.trim()) || "#5865f2";

      generateQuotePng({
        username: name,
        content: "This is a live test of the Message Quote PNG generator!",
        avatar: av,
        color: color,
        timestamp: new Date().toISOString()
      }).then(function (res) {
        setTesting(false);
        setPreviewUrl(res.directUrl);
        toast("Test quote generated!");
      }).catch(function (err) {
        setTesting(false);
        toast("Test failed: " + err.message, true);
      });
    }

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1, backgroundColor: "#313338" },
        contentContainerStyle: { padding: 16, paddingBottom: 50 },
      },
      React.createElement(
        RN.Text,
        { style: { color: "#f2f3f5", fontSize: 20, fontWeight: "700", marginBottom: 8 } },
        "Message Quote Settings"
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#949ba4", fontSize: 13, marginBottom: 20, lineHeight: 18 } },
        "Create authentic Discord-style PNG quote cards with avatar, display name, local timestamp, and text directly in chat."
      ),

      // 1. Context menu toggle
      React.createElement(
        RN.View,
        { style: { backgroundColor: "#2b2d31", borderRadius: 12, padding: 14, marginBottom: 16 } },
        React.createElement(
          RN.View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } },
          React.createElement(
            RN.View,
            { style: { flex: 1, marginRight: 12 } },
            React.createElement(RN.Text, { style: { color: "#f2f3f5", fontSize: 15, fontWeight: "600" } }, "Message Context Menu"),
            React.createElement(RN.Text, { style: { color: "#949ba4", fontSize: 12, marginTop: 4 } }, "Add 'Quote as PNG' button when long-pressing any message")
          ),
          React.createElement(RN.Switch, {
            value: storage.enableContextMenu !== false,
            onValueChange: function (val) {
              storage.enableContextMenu = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        )
      ),

      // 2. Link reply toggle
      React.createElement(
        RN.View,
        { style: { backgroundColor: "#2b2d31", borderRadius: 12, padding: 14, marginBottom: 16 } },
        React.createElement(
          RN.View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } },
          React.createElement(
            RN.View,
            { style: { flex: 1, marginRight: 12 } },
            React.createElement(RN.Text, { style: { color: "#f2f3f5", fontSize: 15, fontWeight: "600" } }, "Link as Reply"),
            React.createElement(RN.Text, { style: { color: "#949ba4", fontSize: 12, marginTop: 4 } }, "Send the generated quote PNG as a Discord reply to the quoted message")
          ),
          React.createElement(RN.Switch, {
            value: storage.linkReply !== false,
            onValueChange: function (val) {
              storage.linkReply = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        )
      ),

      // 3. Default color override
      React.createElement(
        RN.View,
        { style: { backgroundColor: "#2b2d31", borderRadius: 12, padding: 14, marginBottom: 16 } },
        React.createElement(RN.Text, { style: { color: "#f2f3f5", fontSize: 15, fontWeight: "600", marginBottom: 4 } }, "Default Username Color (Optional)"),
        React.createElement(RN.Text, { style: { color: "#949ba4", fontSize: 12, marginBottom: 10 } }, "Hex color for username if user has no server role color (leave blank for default)"),
        React.createElement(RN.TextInput, {
          style: {
            backgroundColor: "#1e1f22",
            color: "#f2f3f5",
            borderRadius: 8,
            padding: 10,
            fontSize: 14,
            borderWidth: 1,
            borderColor: "#3f4147"
          },
          placeholder: "#5865f2 (empty = auto / white)",
          placeholderTextColor: "#6d6f78",
          value: storage.defaultColor || "",
          onChangeText: function (val) {
            storage.defaultColor = val;
            forceUpdate();
          }
        })
      ),

      // 4. Test button & preview
      React.createElement(
        RN.View,
        { style: { backgroundColor: "#2b2d31", borderRadius: 12, padding: 14, marginBottom: 16 } },
        React.createElement(RN.Text, { style: { color: "#f2f3f5", fontSize: 15, fontWeight: "600", marginBottom: 4 } }, "Test Generator"),
        React.createElement(RN.Text, { style: { color: "#949ba4", fontSize: 12, marginBottom: 12 } }, "Generate a live test card using your current profile to verify the generator."),
        React.createElement(
          Btn,
          {
            onPress: handleTest,
            disabled: testing,
            style: { backgroundColor: "#5865f2", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: "center" }
          },
          React.createElement(RN.Text, { style: { color: "#ffffff", fontSize: 14, fontWeight: "600" } }, testing ? "Generating..." : "Generate Test Quote")
        ),
        previewUrl && React.createElement(
          RN.View,
          { style: { marginTop: 14, alignItems: "center" } },
          React.createElement(RN.Image, {
            source: { uri: previewUrl },
            style: { width: "100%", height: 100, borderRadius: 8 },
            resizeMode: "contain"
          })
        )
      ),

      // 5. How to use guide
      React.createElement(
        RN.View,
        { style: { backgroundColor: "#2b2d31", borderRadius: 12, padding: 14 } },
        React.createElement(RN.Text, { style: { color: "#f2f3f5", fontSize: 15, fontWeight: "600", marginBottom: 8 } }, "How to Use"),
        React.createElement(RN.Text, { style: { color: "#dbdee1", fontSize: 13, lineHeight: 20 } },
          "• \uD83D\uDCAC Reply to any message and type ",
          React.createElement(RN.Text, { style: { color: "#5865f2", fontWeight: "700" } }, "/quote"),
          "\n• \uD83D\uDCDD Type ",
          React.createElement(RN.Text, { style: { color: "#5865f2", fontWeight: "700" } }, "/quote text:your message"),
          " to quote any custom text\n• \uD83D\uDC64 Add ",
          React.createElement(RN.Text, { style: { color: "#5865f2", fontWeight: "700" } }, "user:@someone"),
          " to attribute the quote to a specific person\n• \uD83C\uDFA8 Add ",
          React.createElement(RN.Text, { style: { color: "#5865f2", fontWeight: "700" } }, "color:#hex"),
          " for custom username coloring\n• \uD83D\uDCF1 Or long-press any message and tap ",
          React.createElement(RN.Text, { style: { color: "#f2f3f5", fontWeight: "700" } }, "'Quote as PNG'")
        )
      )
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  return {
    onLoad: function () {
      patchActionSheet();
      registerSlashCommands();
    },
    onUnload: function () {
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];

      for (var j = 0; j < unregisterCommands.length; j++) {
        try { unregisterCommands[j](); } catch (e) {}
      }
      unregisterCommands = [];
      removeQuoteCommand();
    },
    settings: Settings,
  };
})();
