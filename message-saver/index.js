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

  function saveMessageObject(msg, customName) {
    if (!msg) return null;

    var id = msg.id || String(Date.now());
    var content = typeof msg.content === "string" ? msg.content : "";

    var attachments = [];
    if (Array.isArray(msg.attachments)) {
      for (var i = 0; i < msg.attachments.length; i++) {
        var att = msg.attachments[i];
        if (att) {
          var url = att.url || att.proxy_url;
          if (url) {
            attachments.push({
              url: url,
              filename: att.filename || "attachment",
              content_type: att.content_type || "",
              size: att.size || 0
            });
          }
        }
      }
    }

    var author = msg.author || {};
    var authorName = author.username || "Unknown";
    if (author.discriminator && author.discriminator !== "0") {
      authorName += "#" + author.discriminator;
    }

    var defaultName = content
      ? content.slice(0, 30).replace(/[\n\r]+/g, " ")
      : (attachments[0] ? attachments[0].filename : "Message " + id.slice(-4));

    var name = (customName && customName.trim()) ? customName.trim() : defaultName;

    var item = {
      id: id,
      name: name,
      content: content,
      attachments: attachments,
      authorName: authorName,
      authorId: author.id || "",
      savedAt: Date.now(),
    };

    if (!Array.isArray(storage.saved)) storage.saved = [];

    var existingIndex = storage.saved.findIndex(function (x) {
      return x.id === id || (customName && x.name.toLowerCase() === customName.toLowerCase());
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
        if (url) parts.push(url);
      }
    }
    return parts.join("\n");
  }

  function sendMessageToChannel(channelId, content) {
    if (!channelId || !content) return Promise.reject(new Error("Missing channel or content"));

    // Method 1: Discord internal Messages.sendMessage
    try {
      var Messages = findByProps("sendMessage", "editMessage");
      if (Messages && typeof Messages.sendMessage === "function") {
        Messages.sendMessage(channelId, { content: content });
        return Promise.resolve();
      }
    } catch (e) {}

    // Method 2: Discord REST API
    try {
      var token = TokenModule && TokenModule.getToken && TokenModule.getToken();
      if (token) {
        return fetch("https://discord.com/api/v9/channels/" + channelId + "/messages", {
          method: "POST",
          headers: {
            "Authorization": token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ content: content })
        }).then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
        });
      }
    } catch (e) {}

    return Promise.reject(new Error("Unable to send message"));
  }

  function getActiveChannelId() {
    try {
      if (SelectedChannelStore && typeof SelectedChannelStore.getChannelId === "function") {
        var id = SelectedChannelStore.getChannelId();
        if (id) return id;
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
      if (msg && (msg.content || (msg.attachments && msg.attachments.length))) return msg;

      var msgId = pending.messageId || pending.message_id || (msg && msg.id);
      var chanId = pending.channelId || pending.channel_id || channelId;
      if (msgId && chanId && MessageStore) {
        var m = MessageStore.getMessage(chanId, msgId);
        if (m) return m.toJS ? m.toJS() : m;
      }
    } catch (e) {}
    return null;
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
                  var saved = saveMessageObject(targetMsg);
                  toast("Saved: " + (saved ? saved.name : "message"));
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
          var chanId = (ctx && (ctx.channel && ctx.channel.id)) || getActiveChannelId();
          var customName = args && args[0] && args[0].value;

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

          var saved = saveMessageObject(target, customName);
          toast("Saved: " + (saved ? saved.name : "message"));
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
          var chanId = (ctx && (ctx.channel && ctx.channel.id)) || getActiveChannelId();
          if (!chanId) {
            toast("Could not detect active channel", true);
            return;
          }

          var query = args && args[0] && args[0].value && String(args[0].value).toLowerCase().trim();
          var list = storage.saved || [];
          if (!list.length) {
            toast("No saved messages found! Long press any message to save one.", true);
            return;
          }

          var targetItem = null;
          if (query) {
            targetItem = list.find(function (x) {
              return x.name.toLowerCase() === query || x.name.toLowerCase().indexOf(query) !== -1;
            });
          }
          if (!targetItem) {
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
            var attBadge = attCount ? " [" + attCount + " attachment" + (attCount > 1 ? "s" : "") + "]" : "";
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
              attCount > 0 && React.createElement(
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
