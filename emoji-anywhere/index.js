(function () {
  "use strict";

  var findByProps = vendetta.metro.findByProps;
  var instead     = vendetta.patcher.instead;
  var before      = vendetta.patcher.before;
  var storage     = vendetta.plugin.storage;

  var patches = [];

  if (storage.emojiName === undefined) {
    storage.emojiName = ":)";
  }

  function safePatch(fnName, retVal) {
    try {
      var mod = findByProps(fnName);
      if (mod && typeof mod[fnName] === "function") {
        patches.push(
          instead(fnName, mod, function () {
            return retVal;
          })
        );
      }
    } catch (e) {}
  }

  function getEmojiLabel(originalName) {
    var custom = storage.emojiName;
    if (custom === undefined || custom === null || custom === "") {
      return ":)";
    }
    return custom.replace(/\{\{name\}\}/gi, originalName).replace(/\{name\}/gi, originalName);
  }

  // Matches <:name:id> (static) and <a:name:id> (animated)
  var EMOJI_RE = /<(a?):([a-zA-Z0-9_]+):(\d{17,20})>/g;
  // Split on code fences / inline code so we never touch code blocks
  var CODE_RE  = /(```[\s\S]*?```|`[^`\n]*`)/;

  function emojiToUrl(_, animated, name, id) {
    var ext = animated === "a" ? "gif" : "png";
    var url = "https://cdn.discordapp.com/emojis/" + id + "." + ext + "?size=48&quality=lossless";
    var label = getEmojiLabel(name);
    return "[" + label + "](" + url + ")";
  }

  function replaceEmojis(text) {
    return text.split(CODE_RE).map(function (part, i) {
      return i % 2 === 1 ? part : part.replace(EMOJI_RE, emojiToUrl);
    }).join("");
  }

  function handle(msg) {
    if (msg && typeof msg.content === "string" && msg.content) {
      msg.content = replaceEmojis(msg.content);
    }
  }

  function Settings() {
    var React = vendetta.metro.common.React;
    var RN    = vendetta.metro.common.ReactNative;

    if (!React || !RN || !RN.View || !RN.Text) return null;

    var forceUpdate = React.useReducer(function (x) { return x + 1; }, 0)[1];
    var current = storage.emojiName !== undefined ? storage.emojiName : ":)";

    var presets = [
      { label: ":) (Smiley)", value: ":)" },
      { label: "{{name}} (Emoji name)", value: "{{name}}" },
      { label: "\u3164 (Invisible U+3164)", value: "\u3164" },
      { label: "\u200B (Invisible U+200B)", value: "\u200B" },
      { label: "* (Star)", value: "*" },
      { label: ". (Dot)", value: "." }
    ];

    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1, backgroundColor: "#313338" },
        contentContainerStyle: { padding: 16, paddingBottom: 40 }
      },
      React.createElement(
        RN.Text,
        { style: { color: "#f2f3f5", fontSize: 20, fontWeight: "700", marginBottom: 6 } },
        "Emoji Anywhere Settings"
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#949ba4", fontSize: 13, marginBottom: 18, lineHeight: 18 } },
        "Configure what string appears inside the link brackets when sending external emojis: [string](emoji_url)"
      ),

      // Input card
      React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#2b2d31",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16
          }
        },
        React.createElement(
          RN.Text,
          { style: { color: "#f2f3f5", fontSize: 15, fontWeight: "600", marginBottom: 4 } },
          "Emoji Link Text"
        ),
        React.createElement(
          RN.Text,
          { style: { color: "#949ba4", fontSize: 13, marginBottom: 10 } },
          "Type any string, or use {{name}} for the emoji's real name."
        ),
        React.createElement(RN.TextInput, {
          style: {
            backgroundColor: "#1e1f22",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: "#f2f3f5",
            fontSize: 15,
            borderWidth: 1,
            borderColor: "#3f4147"
          },
          value: current,
          placeholder: "e.g. :), {{name}}, or custom text",
          placeholderTextColor: "#80848e",
          onChangeText: function (text) {
            storage.emojiName = text;
            forceUpdate();
          }
        }),

        // Preview box
        React.createElement(
          RN.View,
          {
            style: {
              marginTop: 14,
              padding: 10,
              borderRadius: 8,
              backgroundColor: "#1e1f22"
            }
          },
          React.createElement(
            RN.Text,
            { style: { color: "#80848e", fontSize: 12, marginBottom: 4 } },
            "Output Message Format:"
          ),
          React.createElement(
            RN.Text,
            { style: { color: "#5865f2", fontSize: 14, fontFamily: "monospace" } },
            "[" + (current || ":)") + "](https://cdn.discordapp.com/emojis/...)"
          )
        )
      ),

      // Presets card
      React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#2b2d31",
            borderRadius: 12,
            padding: 16
          }
        },
        React.createElement(
          RN.Text,
          { style: { color: "#f2f3f5", fontSize: 15, fontWeight: "600", marginBottom: 10 } },
          "Quick Presets"
        ),
        React.createElement(
          RN.View,
          { style: { flexDirection: "row", flexWrap: "wrap" } },
          presets.map(function (p) {
            var active = current === p.value;
            return React.createElement(
              Btn,
              {
                key: p.label,
                onPress: function () {
                  storage.emojiName = p.value;
                  forceUpdate();
                },
                style: {
                  backgroundColor: active ? "#5865f2" : "#383a40",
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  marginRight: 8,
                  marginBottom: 8
                }
              },
              React.createElement(
                RN.Text,
                { style: { color: active ? "#ffffff" : "#dbdee1", fontSize: 13, fontWeight: "500" } },
                p.label
              )
            );
          })
        )
      )
    );
  }

  return {
    onLoad: function () {
      // ── 1. Unlock emoji picker & remove server lock icons ──────────────────
      safePatch("canUseEmojisEverywhere",       true);
      safePatch("canUseAnimatedEmojis",         true);
      safePatch("canUseCustomEmojisEverywhere", true);
      safePatch("canUseExternalEmojis",         true);
      safePatch("isEmojiDisabled",              false);
      safePatch("getEmojiUnavailableReason",    null);

      // ── 2. Hook sendMessage and editMessage ────────────────────────────────
      var Messages = findByProps("sendMessage", "editMessage");
      if (Messages) {
        patches.push(before("sendMessage", Messages, function (args) { handle(args[1]); }));
        patches.push(before("editMessage", Messages, function (args) { handle(args[2]); }));
      }
    },
    onUnload: function () {
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];
    },
    settings: Settings
  };
})();
