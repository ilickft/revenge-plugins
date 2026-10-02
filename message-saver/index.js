(function () {
  "use strict";

  var findByProps          = vendetta.metro.findByProps;
  var findByStoreName      = vendetta.metro.findByStoreName;
  var before               = vendetta.patcher.before;
  var after                = vendetta.patcher.after;
  var React                = vendetta.metro.common.React;
  var RN                   = vendetta.metro.common.ReactNative;
  var storage              = vendetta.plugin.storage;

  var MessageStore         = findByProps("getMessage", "getMessages");
  var SelectedChannelStore = findByStoreName("SelectedChannelStore") || findByProps("getChannelId");
  var PendingReplyStore    = findByProps("getPendingReply");
  var TokenModule          = findByProps("getToken");
  var ActionSheet          = findByProps("openLazy", "hideActionSheet");
  var Forms                = (vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms) || findByProps("FormRow", "FormIcon");
  var FormRow              = Forms && (Forms.FormRow || Forms.TableRow);
  var FormIcon             = Forms && (Forms.FormIcon || Forms.TableIcon);
  var getAssetIDByName     = (vendetta.ui && vendetta.ui.assets && vendetta.ui.assets.getAssetIDByName) || (findByProps("getAssetIDByName") && findByProps("getAssetIDByName").getAssetIDByName);
  var showToast            = (vendetta.ui && vendetta.ui.toasts && vendetta.ui.toasts.showToast) || (findByProps("showToast") && findByProps("showToast").showToast);

  var patches              = [];
  var unregisterCommands   = [];

  if (!Array.isArray(storage.saved)) {
    storage.saved = [];
  }

  function toast(msg, isError) {
    try {
      if (showToast) {
        var icon = getAssetIDByName ? (getAssetIDByName(isError ? "ic_close_16px" : "CheckmarkSmallIcon") || getAssetIDByName("ic_bookmark")) : null;
        showToast(msg, icon);
      }
    } catch (e) {}
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
      var rawStore = findByStoreName("AuthenticationStore");
      if (rawStore && typeof rawStore.getToken === "function") {
        var t3 = rawStore.getToken();
        if (t3) return t3;
      }
    } catch (e) {}
    return null;
  }

  function findInReactTree(tree, filter) {
    if (vendetta.utils && typeof vendetta.utils.findInReactTree === "function") {
      try {
        var found = vendetta.utils.findInReactTree(tree, filter);
        if (found) return found;
      } catch (e) {}
    }
    return (function search(node) {
      if (!node || typeof node !== "object") return null;
      try {
        if (filter(node)) return node;
      } catch (e) {}
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) {
          var res = search(node[i]);
          if (res) return res;
        }
      } else {
        var keys = Object.keys(node);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          if (key === "children" || key === "props" || key === "child" || key === "sibling") {
            var res2 = search(node[key]);
            if (res2) return res2;
          }
        }
      }
      return null;
    })(tree);
  }

  function extractAttachments(rawMsg) {
    var attachments = [];
    if (!rawMsg) return attachments;

    var rawAtts = rawMsg.attachments;
    if (rawAtts && typeof rawAtts.toJS === "function") {
      try { rawAtts = rawAtts.toJS(); } catch (e) {}
    }

    var list = [];
    if (Array.isArray(rawAtts)) {
      list = rawAtts;
    } else if (rawAtts && typeof rawAtts.forEach === "function") {
      rawAtts.forEach(function (item) { list.push(item); });
    } else if (rawAtts && typeof rawAtts.toArray === "function") {
      try { list = rawAtts.toArray(); } catch (e) {}
    } else if (rawAtts && typeof rawAtts === "object") {
      var keys = Object.keys(rawAtts);
      for (var k = 0; k < keys.length; k++) {
        var val = rawAtts[keys[k]];
        if (val && (typeof val === "object" || typeof val === "string")) {
          list.push(val);
        }
      }
    }

    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a && typeof a.toJS === "function") {
        try { a = a.toJS(); } catch (e) {}
      }
      if (typeof a === "string" && (a.startsWith("http://") || a.startsWith("https://"))) {
        attachments.push({
          url: a,
          filename: a.split("/").pop().split("?")[0] || "attachment",
          content_type: "",
          size: 0,
          duration_secs: null,
          waveform: null,
          flags: 0,
        });
      } else if (a && typeof a === "object") {
        var url = a.url || a.proxy_url || a.proxyUrl || a.uri || a.src || (a.source && a.source.uri);
        if (url) {
          attachments.push({
            url: url,
            filename: a.filename || a.name || (url.split("/").pop().split("?")[0]) || "attachment",
            content_type: a.content_type || a.contentType || a.mime_type || "",
            size: a.size || 0,
            duration_secs: a.duration_secs || a.durationSecs || null,
            waveform: a.waveform || null,
            flags: a.flags || 0,
          });
        }
      }
    }

    // Capture stickers if present
    var rawStickers = rawMsg.sticker_items || rawMsg.stickers;
    if (rawStickers && typeof rawStickers.toJS === "function") {
      try { rawStickers = rawStickers.toJS(); } catch (e) {}
    }
    if (Array.isArray(rawStickers) && rawStickers.length > 0) {
      for (var s = 0; s < rawStickers.length; s++) {
        var st = rawStickers[s];
        if (st && st.id) {
          var ext = (st.format_type === 4) ? "gif" : "png";
          attachments.push({
            url: "https://media.discordapp.net/stickers/" + st.id + "." + ext + "?size=160",
            filename: (st.name || "sticker") + "." + ext,
            content_type: "image/" + ext,
            size: 0,
            duration_secs: null,
            waveform: null,
            flags: 0,
          });
        }
      }
    }

    return attachments;
  }

  function saveMessageObject(rawMsg, customName, fallbackChannelId) {
    if (!rawMsg) return null;

    var msg = (rawMsg && typeof rawMsg.toJS === "function") ? rawMsg.toJS() : rawMsg;
    var id = msg.id || String(Date.now());
    var chanId = msg.channel_id || msg.channelId || fallbackChannelId || getActiveChannelId();

    var attachments = extractAttachments(msg);

    // If attachments is empty, try looking up in MessageStore or _channelMessages
    if (attachments.length === 0 && id) {
      try {
        var stored = null;
        if (MessageStore && chanId && typeof MessageStore.getMessage === "function") {
          stored = MessageStore.getMessage(chanId, id);
        }
        if (!stored && MessageStore && typeof MessageStore.getMessage === "function") {
          stored = MessageStore.getMessage(id);
        }
        if (!stored && chanId) {
          var cm = findByProps("_channelMessages");
          if (cm) {
            var chan = cm.get ? cm.get(chanId) : (cm._channelMessages && cm._channelMessages[chanId]);
            stored = chan && (chan.get ? chan.get(id) : (chan._array && chan._array.find(function (x) { return x.id === id; })));
          }
        }
        if (stored) {
          var storedMsg = (typeof stored.toJS === "function") ? stored.toJS() : stored;
          var storedAtts = extractAttachments(storedMsg);
          if (storedAtts.length > 0) {
            attachments = storedAtts;
          }
          if (!msg.content && storedMsg.content) msg.content = storedMsg.content;
          if (!msg.author && storedMsg.author) msg.author = storedMsg.author;
          if (!msg.flags && storedMsg.flags) msg.flags = storedMsg.flags;
        }
      } catch (e) {}
    }

    var content = typeof msg.content === "string" ? msg.content : "";
    var isVoice = Boolean(
      (msg.flags && (msg.flags & 8192)) ||
      (attachments[0] && (
        attachments[0].duration_secs ||
        attachments[0].waveform ||
        (attachments[0].content_type && attachments[0].content_type.indexOf("audio") === 0) ||
        (attachments[0].filename && (
          attachments[0].filename.indexOf("voice-message") !== -1 ||
          attachments[0].filename.endsWith(".ogg") ||
          attachments[0].filename.endsWith(".opus")
        ))
      ))
    );

    var author = msg.author || {};
    var authorName = author.global_name || author.username || "Unknown";
    if (author.discriminator && author.discriminator !== "0") {
      authorName += "#" + author.discriminator;
    }

    var defaultName;
    if (isVoice) {
      var dur = attachments[0] && attachments[0].duration_secs;
      defaultName = dur ? "Voice Message (" + Math.round(dur) + "s)" : "Voice Message";
    } else if (content) {
      defaultName = content.slice(0, 30).replace(/[\n\r]+/g, " ");
    } else if (attachments[0] && attachments[0].filename) {
      defaultName = attachments[0].filename;
    } else {
      defaultName = "Message " + id.slice(-4);
    }

    var name = (customName && customName.trim()) ? customName.trim() : defaultName;

    var item = {
      id: id,
      name: name,
      content: content,
      attachments: attachments,
      authorName: authorName,
      authorId: author.id || "",
      isVoice: isVoice,
      savedAt: Date.now(),
    };

    if (!Array.isArray(storage.saved)) storage.saved = [];

    // If customName was provided, match and update by that exact name.
    // If no customName was provided, match by message id only for default-named saves.
    var trimmedName = (customName && customName.trim().toLowerCase()) || null;
    var existingIndex = storage.saved.findIndex(function (x) {
      if (trimmedName) {
        return x.name && x.name.toLowerCase() === trimmedName;
      }
      return x.id === id && (!x.name || x.name === defaultName);
    });

    if (existingIndex !== -1) {
      storage.saved[existingIndex] = item;
    } else {
      storage.saved.unshift(item);
    }

    return item;
  }

  function formatMessageToSend(item) {
    if (!item) return "";
    var parts = [];
    if (item.content && item.content.trim()) {
      parts.push(item.content.trim());
    }
    if (Array.isArray(item.attachments)) {
      for (var i = 0; i < item.attachments.length; i++) {
        var att = item.attachments[i];
        var url = typeof att === "string" ? att : (att && att.url);
        if (url && parts.indexOf(url) === -1) {
          parts.push(url);
        }
      }
    }
    return parts.join("\n");
  }

  function sendMessageToChannel(channelId, content) {
    if (!channelId || !content) return Promise.reject(new Error("Missing channel or content"));

    var token = getAuthToken();
    if (token) {
      return fetch("https://discord.com/api/v9/channels/" + channelId + "/messages", {
        method: "POST",
        headers: {
          "Authorization": token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: content })
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

    // Fallback: Discord internal Messages.sendMessage
    try {
      var Messages = findByProps("sendMessage", "editMessage");
      if (Messages && typeof Messages.sendMessage === "function") {
        var res2 = Messages.sendMessage(channelId, { content: content });
        if (res2 && typeof res2.then === "function") return res2;
        return Promise.resolve();
      }
    } catch (e) {
      return Promise.reject(e);
    }

    return Promise.reject(new Error("No auth token or message sender available"));
  }

  function getActiveChannelId() {
    try {
      if (SelectedChannelStore && typeof SelectedChannelStore.getChannelId === "function") {
        var id = SelectedChannelStore.getChannelId();
        if (id) return id;
      }
    } catch (e) {}
    try {
      if (SelectedChannelStore && typeof SelectedChannelStore.getCurrentlySelectedChannelId === "function") {
        var id2 = SelectedChannelStore.getCurrentlySelectedChannelId();
        if (id2) return id2;
      }
    } catch (e) {}
    return null;
  }

  function resolvePendingReplyMessage(channelId) {
    try {
      var pending = (PendingReplyStore && PendingReplyStore.getPendingReply(channelId)) ||
                    (PendingReplyStore && PendingReplyStore.getPendingReply());
      if (!pending) return null;

      var msg = pending.message || pending.reply || pending;
      var msgId = pending.messageId || pending.message_id || (msg && msg.id);
      var chanId = pending.channelId || pending.channel_id || channelId;

      if (msgId && chanId && MessageStore) {
        var m = (MessageStore.getMessage.length >= 2 ? MessageStore.getMessage(chanId, msgId) : MessageStore.getMessage(msgId)) || MessageStore.getMessage(chanId, msgId) || MessageStore.getMessage(msgId);
        if (m) return m.toJS ? m.toJS() : m;
      }

      if (msg) return msg.toJS ? msg.toJS() : msg;
    } catch (e) {}
    return null;
  }

  function getCommandOption(args, name) {
    if (!args) return undefined;
    if (Array.isArray(args)) {
      if (name) {
        for (var i = 0; i < args.length; i++) {
          var a = args[i];
          if (a && typeof a === "object" && a.name === name) {
            return (a.value !== undefined && a.value !== null) ? String(a.value).trim() : undefined;
          }
        }
      }
      if (args[0] !== undefined && args[0] !== null) {
        if (typeof args[0] === "object") {
          if (args[0].value !== undefined && args[0].value !== null) {
            return String(args[0].value).trim();
          }
        } else {
          return String(args[0]).trim();
        }
      }
    } else if (typeof args === "object") {
      if (name && args[name] !== undefined && args[name] !== null) {
        var v = args[name];
        return (typeof v === "object" && v && v.value !== undefined) ? String(v.value).trim() : String(v).trim();
      }
      if (args.value !== undefined && args.value !== null) {
        return String(args.value).trim();
      }
    } else if (typeof args === "string" && args.trim()) {
      return args.trim();
    }
    return undefined;
  }

  // ── Long-press ActionSheet patch: "Save Message" button ───────────────────
  try {
    if (ActionSheet && typeof ActionSheet.openLazy === "function") {
      patches.push(
        before("openLazy", ActionSheet, function (args) {
          var componentPromise = args[0];
          var key = args[1];
          var sheetProps = args[2];
          var targetMsg = sheetProps && (sheetProps.message || (sheetProps.channel && sheetProps.message));

          if (key !== "MessageLongPressActionSheet" || !targetMsg) return;

          componentPromise.then(function (module) {
            var unpatchSheet = after("default", module, function (sheetArgs, sheetResult) {
              if (React && React.useEffect) {
                React.useEffect(function () {
                  return function () { unpatchSheet(); };
                }, []);
              }

              var buttonRows = findInReactTree(sheetResult, function (node) {
                return (
                  (node && node[0] && node[0].type && (node[0].type.name === "ButtonRow" || node[0].type.displayName === "ButtonRow")) ||
                  (Array.isArray(node) && node.length > 0 && node[0] && node[0].props && node[0].props.label !== undefined) ||
                  (Array.isArray(node) && node.length > 1 && node.some(function (item) { return item && item.props && item.props.label !== undefined; }))
                );
              });

              if (!buttonRows) return;

              for (var i = 0; i < buttonRows.length; i++) {
                if (buttonRows[i] && buttonRows[i].props && buttonRows[i].props.label === "Save Message") {
                  return;
                }
              }

              var RowComponent = FormRow || (findByProps("ActionSheetRow") && findByProps("ActionSheetRow").ActionSheetRow);
              if (!RowComponent) return;

              var saveIcon = getAssetIDByName ? (getAssetIDByName("ic_bookmark") || getAssetIDByName("BookmarkIcon") || getAssetIDByName("ic_download") || getAssetIDByName("ic_message_copy")) : null;

              var elementProps = {
                key: "save-message-item-" + targetMsg.id,
                label: "Save Message",
                onPress: function () {
                  if (ActionSheet.hideActionSheet) ActionSheet.hideActionSheet();
                  var chanId = (sheetProps && sheetProps.channel && sheetProps.channel.id) || (targetMsg && (targetMsg.channel_id || targetMsg.channelId)) || getActiveChannelId();
                  var saved = saveMessageObject(targetMsg, null, chanId);
                  if (saved) {
                    toast("Saved: " + saved.name);
                  } else {
                    toast("Failed to save message", true);
                  }
                },
              };

              if (FormIcon && saveIcon) {
                elementProps.leading = React.createElement(FormIcon, {
                  style: { opacity: 1 },
                  source: saveIcon,
                });
              }

              buttonRows.push(React.createElement(RowComponent, elementProps));
            });
          });
        })
      );
    }
  } catch (e) {}

  // ── Slash Commands ────────────────────────────────────────────────────────
  function registerSlashCommands() {
    if (!vendetta.commands || typeof vendetta.commands.registerCommand !== "function") return;

    function cleanCommands(names) {
      if (vendetta.commands && Array.isArray(vendetta.commands.commands)) {
        for (var i = vendetta.commands.commands.length - 1; i >= 0; i--) {
          var cmd = vendetta.commands.commands[i];
          if (cmd && names.indexOf(cmd.name) !== -1) {
            vendetta.commands.commands.splice(i, 1);
          }
        }
      }
    }

    cleanCommands(["save", "resend", "saved-list"]);

    // 1. /save [name]
    unregisterCommands.push(
      vendetta.commands.registerCommand({
        name: "save",
        displayName: "save",
        description: "Save a replied message (or specify a name) to resend later",
        displayDescription: "Save a replied message to resend later",
        applicationId: "-1",
        type: 1,
        inputType: 1,
        options: [
          {
            name: "name",
            displayName: "name",
            description: "Custom name or tag for this saved message",
            displayDescription: "Custom name or tag for this saved message",
            type: 3,
            required: false,
          }
        ],
        execute: function (args, ctx) {
          var chanId = (ctx && ctx.channel && ctx.channel.id) || getActiveChannelId();
          var customName = getCommandOption(args, "name");

          var target = resolvePendingReplyMessage(chanId);
          if (!target && MessageStore && chanId) {
            var msgs = MessageStore.getMessages(chanId);
            var arr = msgs && (msgs._array || msgs);
            if (Array.isArray(arr) && arr.length > 0) {
              target = arr[arr.length - 1];
            }
          }

          if (!target) {
            toast("No message to save. Reply to a message and run /save!", true);
            return;
          }

          var saved = saveMessageObject(target, customName, chanId);
          if (saved) {
            toast("Saved: " + saved.name);
          } else {
            toast("Failed to save message", true);
          }
        }
      })
    );

    // 2. /resend [name]
    unregisterCommands.push(
      vendetta.commands.registerCommand({
        name: "resend",
        displayName: "resend",
        description: "Resend a saved message (with text & attachments) as it was",
        displayDescription: "Resend a saved message as it was",
        applicationId: "-1",
        type: 1,
        inputType: 1,
        options: [
          {
            name: "name",
            displayName: "name",
            description: "Name of the saved message to send (defaults to newest)",
            displayDescription: "Name of the saved message to send",
            type: 3,
            required: false,
          }
        ],
        execute: function (args, ctx) {
          var chanId = (ctx && ctx.channel && ctx.channel.id) || getActiveChannelId();
          if (!chanId) {
            toast("Could not detect active channel", true);
            return;
          }

          var list = storage.saved || [];
          if (!list.length) {
            toast("No saved messages found! Long press any message to save one.", true);
            return;
          }

          var query = getCommandOption(args, "name");
          var targetItem = null;

          if (query && query.trim()) {
            var q = query.trim().toLowerCase();
            // 1. Exact match
            targetItem = list.find(function (x) {
              return x && x.name && x.name.toLowerCase() === q;
            });
            // 2. Starts-with match
            if (!targetItem) {
              targetItem = list.find(function (x) {
                return x && x.name && x.name.toLowerCase().startsWith(q);
              });
            }
            // 3. Substring match
            if (!targetItem) {
              targetItem = list.find(function (x) {
                return x && x.name && x.name.toLowerCase().indexOf(q) !== -1;
              });
            }

            if (!targetItem) {
              toast('No saved message found matching "' + query.trim() + '"', true);
              return;
            }
          } else {
            // Default to newest message
            targetItem = list[0];
          }

          var textToSend = formatMessageToSend(targetItem);
          if (!textToSend) {
            toast("Saved message has no content or attachments", true);
            return;
          }

          sendMessageToChannel(chanId, textToSend).then(function () {
            toast("Resent \"" + targetItem.name + "\"");
          }).catch(function (err) {
            toast("Failed to send: " + err.message, true);
          });
        }
      })
    );

    // 3. /saved-list
    unregisterCommands.push(
      vendetta.commands.registerCommand({
        name: "saved-list",
        displayName: "saved-list",
        description: "List all your saved messages and their attachments",
        displayDescription: "List all your saved messages",
        applicationId: "-1",
        type: 1,
        inputType: 1,
        options: [],
        execute: function () {
          var list = storage.saved || [];
          if (!list.length) {
            toast("No saved messages yet! Long press any message to save.", false);
            return;
          }

          var lines = ["**Saved Messages (" + list.length + "):**"];
          for (var i = 0; i < Math.min(list.length, 10); i++) {
            var item = list[i];
            var attCount = (item.attachments && item.attachments.length) || 0;
            var attBadge = item.isVoice ? " [🎤 Voice]" : (attCount ? " [" + attCount + " attachment" + (attCount > 1 ? "s" : "") + "]" : "");
            lines.push((i + 1) + ". **" + item.name + "**" + attBadge + " *(by " + item.authorName + ")*");
          }
          if (list.length > 10) {
            lines.push("*...and " + (list.length - 10) + " more (view in Settings)*");
          }

          toast(lines.slice(0, 4).join("\n"));
        }
      })
    );
  }

  // ── Settings UI ───────────────────────────────────────────────────────────
  function Settings() {
    var forceUpdate = React.useReducer(function (x) { return x + 1; }, 0)[1];
    var list = storage.saved || [];
    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;

    function handleDelete(idx) {
      storage.saved.splice(idx, 1);
      forceUpdate();
      toast("Message deleted");
    }

    function handleSend(item) {
      var chanId = getActiveChannelId();
      if (!chanId) {
        toast("Open a channel first, or use /resend", true);
        return;
      }
      var textToSend = formatMessageToSend(item);
      sendMessageToChannel(chanId, textToSend).then(function () {
        toast("Sent to current channel!");
      }).catch(function (err) {
        toast("Send failed: " + err.message, true);
      });
    }

    function handleCopy(item) {
      try {
        var clip = vendetta.metro.common.clipboard;
        if (clip && typeof clip.setString === "function") {
          clip.setString(formatMessageToSend(item));
          toast("Copied to clipboard!");
        }
      } catch (e) {}
    }

    function handleClearAll() {
      storage.saved = [];
      forceUpdate();
      toast("All saved messages cleared");
    }

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1, backgroundColor: "#313338" },
        contentContainerStyle: { padding: 16, paddingBottom: 50 },
      },
      React.createElement(
        RN.View,
        { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
        React.createElement(
          RN.Text,
          { style: { color: "#f2f3f5", fontSize: 20, fontWeight: "700" } },
          "Saved Messages (" + list.length + ")"
        ),
        list.length > 0 && React.createElement(
          Btn,
          {
            onPress: handleClearAll,
            style: { backgroundColor: "#da373c22", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 }
          },
          React.createElement(RN.Text, { style: { color: "#da373c", fontSize: 13, fontWeight: "600" } }, "Clear All")
        )
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#949ba4", fontSize: 13, marginBottom: 16, lineHeight: 18 } },
        "Messages you save (by long-pressing any message and selecting 'Save Message' or using /save) are stored here. You can resend them back to any channel as they were."
      ),
      list.length === 0
        ? React.createElement(
            RN.View,
            { style: { backgroundColor: "#2b2d31", borderRadius: 12, padding: 24, alignItems: "center" } },
            React.createElement(RN.Text, { style: { color: "#949ba4", fontSize: 15, textAlign: "center" } }, "No saved messages yet.\n\nLong-press any message in chat and tap 'Save Message' or use /save!"),
          )
        : list.map(function (item, idx) {
            var attCount = (item.attachments && item.attachments.length) || 0;
            return React.createElement(
              RN.View,
              {
                key: item.id + "_" + idx,
                style: { backgroundColor: "#2b2d31", borderRadius: 12, padding: 14, marginBottom: 12 }
              },
              React.createElement(
                RN.View,
                { style: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 } },
                React.createElement(
                  RN.Text,
                  { style: { color: "#f2f3f5", fontSize: 16, fontWeight: "600", flex: 1 } },
                  item.name
                ),
                React.createElement(
                  RN.Text,
                  { style: { color: "#949ba4", fontSize: 12 } },
                  new Date(item.savedAt).toLocaleDateString()
                )
              ),
              React.createElement(
                RN.Text,
                { style: { color: "#5865f2", fontSize: 12, marginBottom: 8 } },
                "By " + item.authorName
              ),
              item.content ? React.createElement(
                RN.Text,
                { style: { color: "#dbdee1", fontSize: 14, marginBottom: 8, lineHeight: 19 } },
                item.content
              ) : null,
              item.isVoice && React.createElement(
                RN.View,
                { style: { backgroundColor: "#1e1f22", borderRadius: 8, padding: 8, marginBottom: 10 } },
                React.createElement(
                  RN.Text,
                  { style: { color: "#23a55a", fontSize: 12, fontWeight: "600" } },
                  "\uD83C\uDFA4 Voice Message (" + (item.attachments[0] && item.attachments[0].duration_secs ? Math.round(item.attachments[0].duration_secs) + "s" : "audio") + ")"
                )
              ),
              !item.isVoice && attCount > 0 && React.createElement(
                RN.View,
                { style: { backgroundColor: "#1e1f22", borderRadius: 8, padding: 8, marginBottom: 10 } },
                React.createElement(
                  RN.Text,
                  { style: { color: "#b5bac1", fontSize: 12 } },
                  "\uD83D\uDCCE " + attCount + " attachment" + (attCount > 1 ? "s" : "") + " saved"
                )
              ),
              React.createElement(
                RN.View,
                { style: { flexDirection: "row", gap: 8 } },
                React.createElement(
                  Btn,
                  {
                    onPress: function () { handleSend(item); },
                    style: { backgroundColor: "#5865f2", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 }
                  },
                  React.createElement(RN.Text, { style: { color: "#ffffff", fontSize: 13, fontWeight: "600" } }, "Send")
                ),
                React.createElement(
                  Btn,
                  {
                    onPress: function () { handleCopy(item); },
                    style: { backgroundColor: "#383a40", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 }
                  },
                  React.createElement(RN.Text, { style: { color: "#dbdee1", fontSize: 13, fontWeight: "600" } }, "Copy")
                ),
                React.createElement(
                  Btn,
                  {
                    onPress: function () { handleDelete(idx); },
                    style: { backgroundColor: "#da373c22", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, marginLeft: "auto" }
                  },
                  React.createElement(RN.Text, { style: { color: "#da373c", fontSize: 13, fontWeight: "600" } }, "Delete")
                )
              )
            );
          })
    );
  }

  return {
    onLoad: function () {
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
    },
    settings: Settings,
  };
})();
