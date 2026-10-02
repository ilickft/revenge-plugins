(function () {
  "use strict";

  var findByProps      = vendetta.metro.findByProps;
  var before           = vendetta.patcher.before;
  var after            = vendetta.patcher.after;
  var storage          = vendetta.plugin.storage;
  var showToast        = vendetta.ui.toasts.showToast;
  var getAssetIDByName = (vendetta.ui.assets && vendetta.ui.assets.getAssetIDByName) || (findByProps("getAssetIDByName") && findByProps("getAssetIDByName").getAssetIDByName);

  // ── Metro Modules ─────────────────────────────────────────────────────────
  var ActionSheet      = findByProps("openLazy", "hideActionSheet");

  var patches = [];

  // ── Default Storage Initialization ────────────────────────────────────────
  if (storage.enabled === undefined) storage.enabled = true;
  if (storage.hideReactions === undefined) storage.hideReactions = false;
  if (storage.hideReply === undefined) storage.hideReply = false;
  if (storage.hideEdit === undefined) storage.hideEdit = false;
  if (storage.hideCopyText === undefined) storage.hideCopyText = false;
  if (storage.hideCopyLink === undefined) storage.hideCopyLink = false;
  if (storage.hidePin === undefined) storage.hidePin = false;
  if (storage.hideForward === undefined) storage.hideForward = false;
  if (storage.hideMarkUnread === undefined) storage.hideMarkUnread = false;
  if (storage.hideThread === undefined) storage.hideThread = false;
  if (storage.hideApps === undefined) storage.hideApps = false;
  if (storage.hideTTS === undefined) storage.hideTTS = false;
  if (storage.hideDelete === undefined) storage.hideDelete = false;
  if (storage.hideReport === undefined) storage.hideReport = false;
  if (storage.hideAddReaction === undefined) storage.hideAddReaction = false;
  if (!Array.isArray(storage.customKeywords)) storage.customKeywords = [];
  if (!Array.isArray(storage.discoveredItems)) storage.discoveredItems = [];
  if (!storage.hiddenItems) storage.hiddenItems = {};

  // ── Helper: Toast Notification ───────────────────────────────────────────
  function toast(msg, iconName) {
    try {
      if (showToast) {
        var icon = (getAssetIDByName && iconName) ? getAssetIDByName(iconName) : null;
        showToast(msg, icon);
      }
    } catch (e) {}
  }

  // ── Helper: Record Discovered Item ────────────────────────────────────────
  function recordDiscovered(label) {
    if (!label || typeof label !== "string") return;
    var trimmed = label.trim();
    if (!trimmed || trimmed.length > 60) return;
    if (!Array.isArray(storage.discoveredItems)) storage.discoveredItems = [];
    if (storage.discoveredItems.indexOf(trimmed) === -1) {
      storage.discoveredItems.push(trimmed);
      if (storage.discoveredItems.length > 80) {
        storage.discoveredItems.shift();
      }
    }
  }

  // ── Helper: Extract Item Metadata ─────────────────────────────────────────
  function getItemInfo(item) {
    if (!item || typeof item !== "object") return null;
    var props = item.props || {};

    var labels = [];
    var keys = [];

    if (item.key && typeof item.key === "string") {
      keys.push(item.key);
    }
    if (props.id && typeof props.id === "string") {
      keys.push(props.id);
    }
    if (props.action && typeof props.action === "string") {
      keys.push(props.action);
    }

    if (props.label && typeof props.label === "string") {
      labels.push(props.label);
    }
    if (props.title && typeof props.title === "string") {
      labels.push(props.title);
    }

    function extractText(node) {
      if (!node) return;
      if (typeof node === "string" || typeof node === "number") {
        var s = String(node).trim();
        if (s && labels.indexOf(s) === -1) labels.push(s);
        return;
      }
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) extractText(node[i]);
      } else if (typeof node === "object" && node.props) {
        extractText(node.props.children);
      }
    }

    extractText(props.children);

    var allKeyText = keys.join(" ").toLowerCase();
    var typeName = (item.type && (item.type.name || item.type.displayName)) || "";
    var isReactions = (
      allKeyText.indexOf("reaction") !== -1 ||
      allKeyText.indexOf("emoji") !== -1 ||
      typeName.toLowerCase().indexOf("reaction") !== -1 ||
      props.reactions !== undefined ||
      Boolean(props.isQuickReactions)
    );

    return {
      labels: labels,
      keys: keys,
      primaryLabel: labels[0] || keys[0] || (isReactions ? "Quick Reactions" : typeName) || "Unknown Item",
      isReactions: isReactions
    };
  }

  // ── Helper: Determine If Item Should Be Hidden ────────────────────────────
  function shouldHide(item) {
    if (!item || typeof item !== "object") return false;
    if (storage.enabled === false) return false;

    var info = getItemInfo(item);
    if (!info) return false;

    // 1. Quick Reactions Bar
    if (storage.hideReactions && info.isReactions) {
      return true;
    }

    var allTexts = [];
    for (var l = 0; l < info.labels.length; l++) allTexts.push(info.labels[l].toLowerCase());
    for (var k = 0; k < info.keys.length; k++) allTexts.push(info.keys[k].toLowerCase());

    function matchesAny(patterns) {
      for (var i = 0; i < allTexts.length; i++) {
        var t = allTexts[i];
        for (var p = 0; p < patterns.length; p++) {
          var pat = patterns[p].toLowerCase();
          if (t === pat || t.indexOf(pat) !== -1) return true;
        }
      }
      return false;
    }

    // 2. Preset Rules
    if (storage.hideReply && matchesAny(["reply", "ответить"])) return true;
    if (storage.hideEdit && matchesAny(["edit", "edit message", "edit-message", "редактировать"])) return true;
    if (storage.hideCopyText && matchesAny(["copy text", "copy-text", "скопировать текст"])) return true;
    if (storage.hideCopyLink && matchesAny(["copy link", "copy message link", "copy-link", "скопировать ссылку"])) return true;
    if (storage.hidePin && matchesAny(["pin", "pin message", "unpin", "pin-message", "закрепить"])) return true;
    if (storage.hideForward && matchesAny(["forward", "forward message", "forward-message", "переслать"])) return true;
    if (storage.hideMarkUnread && matchesAny(["mark unread", "mark-unread", "пометить как непрочитанное"])) return true;
    if (storage.hideThread && matchesAny(["thread", "create thread", "create-thread", "создать ветку"])) return true;
    if (storage.hideApps && matchesAny(["apps", "application commands", "приложения"])) return true;
    if (storage.hideTTS && matchesAny(["speak", "speak message", "speak-message", "tts", "озвучить"])) return true;
    if (storage.hideDelete && matchesAny(["delete", "delete message", "delete-message", "удалить"])) return true;
    if (storage.hideReport && matchesAny(["report", "report message", "report-message", "пожаловаться"])) return true;
    if (storage.hideAddReaction && matchesAny(["add reaction", "add-reaction", "добавить реакцию"])) return true;

    // 3. User-Toggled Discovered / Custom Items
    if (storage.hiddenItems) {
      for (var target in storage.hiddenItems) {
        if (storage.hiddenItems[target]) {
          if (matchesAny([target])) return true;
        }
      }
    }

    // 4. Custom User Keywords
    if (Array.isArray(storage.customKeywords)) {
      for (var ck = 0; ck < storage.customKeywords.length; ck++) {
        var kw = (storage.customKeywords[ck] || "").toLowerCase().trim();
        if (kw && matchesAny([kw])) return true;
      }
    }

    return false;
  }

  // ── Recursive React Tree Cleaner ──────────────────────────────────────────
  function cleanTree(node) {
    if (!node) return node;

    if (Array.isArray(node)) {
      var newArr = [];
      var changed = false;
      for (var i = 0; i < node.length; i++) {
        var child = node[i];
        if (child && shouldHide(child)) {
          changed = true;
        } else if (child) {
          var cleanedChild = cleanTree(child);
          if (cleanedChild !== child) changed = true;
          if (cleanedChild) newArr.push(cleanedChild);
        }
      }
      return changed ? newArr : node;
    }

    if (typeof node === "object") {
      if (shouldHide(node)) {
        return null;
      }

      var info = getItemInfo(node);
      if (info && info.primaryLabel && info.primaryLabel !== "Unknown Item" && !info.isReactions) {
        recordDiscovered(info.primaryLabel);
      }

      if (node.props && node.props.children) {
        var cleanedChildren = cleanTree(node.props.children);
        if (cleanedChildren !== node.props.children) {
          try {
            if (!Object.isFrozen(node.props)) {
              node.props.children = cleanedChildren;
              return node;
            }
          } catch (e) {}
          try {
            var React = vendetta.metro.common.React;
            if (React && React.cloneElement) {
              return React.cloneElement(node, {}, cleanedChildren);
            }
          } catch (e2) {}
        }
      }
    }

    return node;
  }

  // ── Hooking ActionSheet.openLazy ──────────────────────────────────────────
  function setupActionSheetPatch() {
    if (!ActionSheet || typeof ActionSheet.openLazy !== "function") return;

    patches.push(
      before("openLazy", ActionSheet, function (args) {
        if (storage.enabled === false) return;
        var componentPromise = args[0];
        var key = args[1];

        if (!componentPromise || typeof componentPromise.then !== "function") return;

        var isRelevantKey = !key || typeof key !== "string" ||
          key.indexOf("Message") !== -1 ||
          key.indexOf("Attachment") !== -1 ||
          key.indexOf("Media") !== -1 ||
          key.indexOf("Action") !== -1;

        if (!isRelevantKey) return;

        componentPromise.then(function (module) {
          if (!module) return;

          var targetObj = (module.default && typeof module.default === "function") ? module : (typeof module === "function" ? { default: module } : null);
          if (!targetObj || targetObj.__clean_context_patched) return;

          targetObj.__clean_context_patched = true;
          var unpatch = after("default", targetObj, function (sheetArgs, sheetResult) {
            if (storage.enabled === false || !sheetResult) return sheetResult;
            return cleanTree(sheetResult);
          });

          patches.push(function () {
            targetObj.__clean_context_patched = false;
            unpatch();
          });
        });
      })
    );
  }

  // ── Settings UI ───────────────────────────────────────────────────────────
  function Settings() {
    var React = vendetta.metro.common.React;
    var RN    = vendetta.metro.common.ReactNative;

    if (!React || !RN || !RN.View || !RN.Text) return null;

    var useState = React.useState;
    var textInputState = useState("");
    var keywordInput = textInputState[0];
    var setKeywordInput = textInputState[1];

    var dummyState = useState(0);
    var forceUpdate = function () { dummyState[1](dummyState[0] + 1); };

    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;

    // Count hidden items
    var hiddenCount = 0;
    var presetKeys = [
      "hideReactions", "hideReply", "hideEdit", "hideCopyText", "hideCopyLink",
      "hidePin", "hideForward", "hideMarkUnread", "hideThread", "hideApps",
      "hideTTS", "hideDelete", "hideReport", "hideAddReaction"
    ];
    for (var pk = 0; pk < presetKeys.length; pk++) {
      if (storage[presetKeys[pk]]) hiddenCount++;
    }
    if (storage.hiddenItems) {
      for (var hi in storage.hiddenItems) {
        if (storage.hiddenItems[hi]) hiddenCount++;
      }
    }
    if (Array.isArray(storage.customKeywords)) {
      hiddenCount += storage.customKeywords.length;
    }

    var presets = [
      { key: "hideReactions",   title: "⚡ Quick Reactions Bar",       desc: "The top row of emoji reactions" },
      { key: "hideReply",       title: "💬 Reply",                     desc: "Reply to message" },
      { key: "hideEdit",        title: "✏️ Edit Message",              desc: "Edit message content" },
      { key: "hideCopyText",    title: "📋 Copy Text",                 desc: "Copy message raw text" },
      { key: "hideCopyLink",    title: "🔗 Copy Message Link",         desc: "Copy URL link to message" },
      { key: "hidePin",         title: "📌 Pin / Unpin Message",       desc: "Pin or unpin message" },
      { key: "hideForward",     title: "↗️ Forward Message",           desc: "Forward message to another chat" },
      { key: "hideMarkUnread",  title: "👁️ Mark Unread",              desc: "Mark channel unread from here" },
      { key: "hideThread",      title: "🧵 Create Thread",             desc: "Start a thread from message" },
      { key: "hideApps",        title: "🤖 Apps / Commands",           desc: "Application commands menu" },
      { key: "hideTTS",         title: "🔊 Speak Message (TTS)",       desc: "Read message aloud" },
      { key: "hideDelete",      title: "🗑️ Delete Message",            desc: "Delete message option" },
      { key: "hideReport",      title: "⚠️ Report Message",            desc: "Report message option" },
      { key: "hideAddReaction", title: "➕ Add Reaction Button",       desc: "The add reaction button" }
    ];

    function togglePreset(pKey) {
      storage[pKey] = !storage[pKey];
      forceUpdate();
    }

    function addKeyword() {
      var trimmed = keywordInput.trim();
      if (!trimmed) return;
      if (!Array.isArray(storage.customKeywords)) storage.customKeywords = [];
      if (storage.customKeywords.indexOf(trimmed) === -1) {
        storage.customKeywords.push(trimmed);
        toast("Added \"" + trimmed + "\"", "CheckmarkSmallIcon");
      }
      setKeywordInput("");
      forceUpdate();
    }

    function removeKeyword(idx) {
      if (Array.isArray(storage.customKeywords)) {
        storage.customKeywords.splice(idx, 1);
        forceUpdate();
      }
    }

    function toggleDiscovered(label) {
      if (!storage.hiddenItems) storage.hiddenItems = {};
      storage.hiddenItems[label] = !storage.hiddenItems[label];
      forceUpdate();
    }

    function resetAll() {
      for (var p = 0; p < presetKeys.length; p++) {
        storage[presetKeys[p]] = false;
      }
      storage.hiddenItems = {};
      storage.customKeywords = [];
      toast("Reset all context menu settings", "CheckmarkSmallIcon");
      forceUpdate();
    }

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1, backgroundColor: "#1e1f22" },
        contentContainerStyle: { padding: 16, paddingBottom: 60 }
      },

      // Header card
      React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#2b2d31",
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#383a40"
          }
        },
        React.createElement(
          RN.View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } },
          React.createElement(
            RN.View,
            { style: { flex: 1, marginRight: 12 } },
            React.createElement(
              RN.Text,
              { style: { color: "#f2f3f5", fontSize: 20, fontWeight: "700" } },
              "🛡️ Clean Context Menu"
            ),
            React.createElement(
              RN.Text,
              { style: { color: "#949ba4", fontSize: 13, marginTop: 4 } },
              "Hide unwanted items when long-pressing messages."
            )
          ),
          React.createElement(RN.Switch, {
            value: storage.enabled !== false,
            onValueChange: function (val) {
              storage.enabled = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        ),
        React.createElement(
          RN.View,
          {
            style: {
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: "#383a40",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center"
            }
          },
          React.createElement(
            RN.Text,
            { style: { color: "#dbdee1", fontSize: 13, fontWeight: "600" } },
            "Items Hidden: " + hiddenCount
          ),
          React.createElement(
            Btn,
            {
              onPress: resetAll,
              style: {
                backgroundColor: "#383a40",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 6
              }
            },
            React.createElement(
              RN.Text,
              { style: { color: "#f23f43", fontSize: 12, fontWeight: "600" } },
              "Reset All"
            )
          )
        )
      ),

      // Standard Preset Items Card
      React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#2b2d31",
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#383a40"
          }
        },
        React.createElement(
          RN.Text,
          { style: { color: "#f2f3f5", fontSize: 16, fontWeight: "700", marginBottom: 14 } },
          "Standard Message Actions"
        ),
        presets.map(function (p) {
          var isHidden = Boolean(storage[p.key]);
          return React.createElement(
            RN.View,
            {
              key: p.key,
              style: {
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#313338"
              }
            },
            React.createElement(
              RN.View,
              { style: { flex: 1, marginRight: 10 } },
              React.createElement(
                RN.Text,
                { style: { color: isHidden ? "#f23f43" : "#f2f3f5", fontSize: 15, fontWeight: "600" } },
                p.title
              ),
              React.createElement(
                RN.Text,
                { style: { color: "#949ba4", fontSize: 12, marginTop: 2 } },
                p.desc
              )
            ),
            React.createElement(RN.Switch, {
              value: isHidden,
              onValueChange: function () {
                togglePreset(p.key);
              },
              trackColor: { false: "#4e5058", true: "#f23f43" }
            })
          );
        })
      ),

      // Custom Keywords Card
      React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#2b2d31",
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#383a40"
          }
        },
        React.createElement(
          RN.Text,
          { style: { color: "#f2f3f5", fontSize: 16, fontWeight: "700", marginBottom: 6 } },
          "Custom Keywords / Phrases"
        ),
        React.createElement(
          RN.Text,
          { style: { color: "#949ba4", fontSize: 12, marginBottom: 12 } },
          "Type any text, button title, or plugin action to hide (e.g. \"Quote as PNG\", \"Petpet\")."
        ),
        React.createElement(
          RN.View,
          { style: { flexDirection: "row", marginBottom: 12 } },
          React.createElement(RN.TextInput, {
            value: keywordInput,
            onChangeText: setKeywordInput,
            placeholder: "Enter keyword to hide...",
            placeholderTextColor: "#80848e",
            style: {
              flex: 1,
              backgroundColor: "#1e1f22",
              color: "#f2f3f5",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: "#383a40",
              fontSize: 14,
              marginRight: 8
            }
          }),
          React.createElement(
            Btn,
            {
              onPress: addKeyword,
              style: {
                backgroundColor: "#5865f2",
                borderRadius: 8,
                paddingHorizontal: 16,
                justifyContent: "center",
                alignItems: "center"
              }
            },
            React.createElement(
              RN.Text,
              { style: { color: "#ffffff", fontWeight: "700", fontSize: 14 } },
              "Add"
            )
          )
        ),
        (Array.isArray(storage.customKeywords) && storage.customKeywords.length > 0)
          ? storage.customKeywords.map(function (kw, idx) {
              return React.createElement(
                RN.View,
                {
                  key: "kw-" + idx,
                  style: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: "#1e1f22",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    marginBottom: 6,
                    borderWidth: 1,
                    borderColor: "#383a40"
                  }
                },
                React.createElement(
                  RN.Text,
                  { style: { color: "#f23f43", fontSize: 14, fontWeight: "600" } },
                  "✕ " + kw
                ),
                React.createElement(
                  Btn,
                  {
                    onPress: function () { removeKeyword(idx); },
                    style: { padding: 4 }
                  },
                  React.createElement(
                    RN.Text,
                    { style: { color: "#949ba4", fontSize: 13, fontWeight: "bold" } },
                    "Remove"
                  )
                )
              );
            })
          : React.createElement(
              RN.Text,
              { style: { color: "#6d6f78", fontSize: 13, fontStyle: "italic" } },
              "No custom keywords added yet."
            )
      ),

      // Dynamically Discovered Items Card
      React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#2b2d31",
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: "#383a40"
          }
        },
        React.createElement(
          RN.View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
          React.createElement(
            RN.Text,
            { style: { color: "#f2f3f5", fontSize: 16, fontWeight: "700" } },
            "Discovered Menu Items"
          ),
          (Array.isArray(storage.discoveredItems) && storage.discoveredItems.length > 0) && React.createElement(
            Btn,
            {
              onPress: function () {
                storage.discoveredItems = [];
                forceUpdate();
              },
              style: { padding: 4 }
            },
            React.createElement(
              RN.Text,
              { style: { color: "#80848e", fontSize: 12 } },
              "Clear List"
            )
          )
        ),
        React.createElement(
          RN.Text,
          { style: { color: "#949ba4", fontSize: 12, marginBottom: 12 } },
          "Items automatically seen when long-pressing messages on your device:"
        ),
        (Array.isArray(storage.discoveredItems) && storage.discoveredItems.length > 0)
          ? storage.discoveredItems.map(function (label) {
              var isHidden = Boolean(storage.hiddenItems && storage.hiddenItems[label]);
              return React.createElement(
                RN.View,
                {
                  key: "disc-" + label,
                  style: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: "#313338"
                  }
                },
                React.createElement(
                  RN.Text,
                  { style: { color: isHidden ? "#f23f43" : "#f2f3f5", fontSize: 14, fontWeight: "500", flex: 1, marginRight: 8 } },
                  (isHidden ? "🚫 " : "👁️ ") + label
                ),
                React.createElement(RN.Switch, {
                  value: isHidden,
                  onValueChange: function () {
                    toggleDiscovered(label);
                  },
                  trackColor: { false: "#4e5058", true: "#f23f43" }
                })
              );
            })
          : React.createElement(
              RN.Text,
              { style: { color: "#6d6f78", fontSize: 13, fontStyle: "italic" } },
              "Long-press any message in chat to automatically populate this list!"
            )
      )
    );
  }

  return {
    onLoad: function () {
      setupActionSheetPatch();
    },
    onUnload: function () {
      for (var p = 0; p < patches.length; p++) {
        try { patches[p](); } catch (e) {}
      }
      patches = [];
    },
    settings: Settings
  };
})();
