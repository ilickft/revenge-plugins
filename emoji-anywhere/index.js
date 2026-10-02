(function () {
  "use strict";

  var findByProps     = vendetta.metro.findByProps;
  var findByStoreName = vendetta.metro.findByStoreName;
  var instead         = vendetta.patcher.instead;
  var before          = vendetta.patcher.before;
  var storage         = vendetta.plugin.storage;

  // ── Stores ────────────────────────────────────────────────────────────────
  var EmojiStore           = findByStoreName("EmojiStore") || findByProps("getCustomEmojiById");
  var SelectedGuildStore   = findByStoreName("SelectedGuildStore") || findByProps("getGuildId");
  var SelectedChannelStore = findByStoreName("SelectedChannelStore") || findByProps("getChannelId");
  var ChannelStore         = findByStoreName("ChannelStore") || findByProps("getChannel");
  var UserStore            = findByStoreName("UserStore");

  var patches = [];

  if (storage.emojiName === undefined) {
    storage.emojiName = ":)";
  }
  if (storage.keepServerEmojisNormal === undefined) {
    storage.keepServerEmojisNormal = true;
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

  function userHasNitro() {
    try {
      if (UserStore && typeof UserStore.getCurrentUser === "function") {
        var user = UserStore.getCurrentUser();
        if (user && user.premiumType !== undefined && user.premiumType !== null && user.premiumType > 0) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function getCurrentGuildId(channelId) {
    if (channelId && ChannelStore && typeof ChannelStore.getChannel === "function") {
      try {
        var chan = ChannelStore.getChannel(channelId);
        if (chan && chan.guild_id) return chan.guild_id;
      } catch (e) {}
    }
    if (SelectedGuildStore && typeof SelectedGuildStore.getGuildId === "function") {
      try {
        var gId = SelectedGuildStore.getGuildId();
        if (gId) return gId;
      } catch (e) {}
    }
    if (SelectedChannelStore) {
      try {
        var cId = typeof SelectedChannelStore.getChannelId === "function" ? SelectedChannelStore.getChannelId() : null;
        if (cId && ChannelStore && typeof ChannelStore.getChannel === "function") {
          var ch = ChannelStore.getChannel(cId);
          if (ch && ch.guild_id) return ch.guild_id;
        }
      } catch (e) {}
    }
    return null;
  }

  function getCustomEmoji(emojiId, guildId) {
    if (!EmojiStore) return null;
    try {
      if (typeof EmojiStore.getCustomEmojiById === "function") {
        var e1 = EmojiStore.getCustomEmojiById(emojiId);
        if (e1) return e1;
      }
    } catch (e) {}
    try {
      if (guildId && typeof EmojiStore.getGuildEmoji === "function") {
        var e2 = EmojiStore.getGuildEmoji(guildId, emojiId);
        if (e2) return e2;
      }
    } catch (e) {}
    try {
      if (typeof EmojiStore.getUsableCustomEmoji === "function") {
        var e3 = EmojiStore.getUsableCustomEmoji(emojiId);
        if (e3) return e3;
      }
    } catch (e) {}
    try {
      if (typeof EmojiStore.getCustomEmojis === "function") {
        var all = EmojiStore.getCustomEmojis();
        if (all && all[emojiId]) return all[emojiId];
      }
    } catch (e) {}
    try {
      if (EmojiStore.emojis && EmojiStore.emojis[emojiId]) {
        return EmojiStore.emojis[emojiId];
      }
    } catch (e) {}
    return null;
  }

  function isEmojiUsableWithoutNitro(emojiId, isAnimatedTag, guildId) {
    if (!storage.keepServerEmojisNormal) return false;
    if (!guildId) return false;

    var emoji = getCustomEmoji(emojiId, guildId);
    if (!emoji) return false;

    var emojiGuildId = emoji.guildId || emoji.guild_id;
    if (!emojiGuildId || String(emojiGuildId) !== String(guildId)) {
      return false;
    }

    var isAnimated = (isAnimatedTag === "a") || Boolean(emoji.animated);
    // In Discord, animated custom emojis always require Nitro, even in the same server.
    if (isAnimated && !userHasNitro()) {
      return false;
    }

    // If emoji is disabled in server (e.g. lost boost level)
    if (emoji.available === false || emoji.disabled === true) {
      return false;
    }

    return true;
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
  var CODE_RE  = new RegExp("(```[\\s\\S]*?```|`[^`\\n]*`)");

  function emojiToUrl(fullMatch, animated, name, id, guildId) {
    // If the emoji belongs to the current server and is available without Nitro,
    // leave it as a normal <:name:id> emoji!
    if (isEmojiUsableWithoutNitro(id, animated, guildId)) {
      return fullMatch;
    }

    var ext = animated === "a" ? "gif" : "png";
    var url = "https://cdn.discordapp.com/emojis/" + id + "." + ext + "?size=48&quality=lossless";
    var label = getEmojiLabel(name);
    return "[" + label + "](" + url + ")";
  }

  function replaceEmojis(text, guildId) {
    return text.split(CODE_RE).map(function (part, i) {
      return i % 2 === 1 ? part : part.replace(EMOJI_RE, function (match, animated, name, id) {
        return emojiToUrl(match, animated, name, id, guildId);
      });
    }).join("");
  }

  function handle(msg, channelId) {
    if (msg && typeof msg.content === "string" && msg.content) {
      var guildId = getCurrentGuildId(channelId);
      msg.content = replaceEmojis(msg.content, guildId);
      if (Array.isArray(msg.invalidEmojis)) {
        msg.invalidEmojis = [];
      }
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
        "Use emojis from any server without Nitro. Server emojis available in your current channel stay normal."
      ),

      // Keep server emojis normal toggle card
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
          RN.View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } },
          React.createElement(
            RN.View,
            { style: { flex: 1, marginRight: 12 } },
            React.createElement(
              RN.Text,
              { style: { color: "#f2f3f5", fontSize: 15, fontWeight: "600" } },
              "Keep Server Emojis Normal"
            ),
            React.createElement(
              RN.Text,
              { style: { color: "#949ba4", fontSize: 12, marginTop: 4, lineHeight: 16 } },
              "Emojis that belong to the current server and are available without Nitro will be sent as standard emojis, not embedded links."
            )
          ),
          React.createElement(RN.Switch, {
            value: storage.keepServerEmojisNormal !== false,
            onValueChange: function (val) {
              storage.keepServerEmojisNormal = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        )
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
          "External Emoji Link Text"
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
            "External Emoji Format:"
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

      // ── 2. Hook sendMessage, editMessage, and uploadLocalFiles ─────────────
      var Messages = findByProps("sendMessage", "editMessage");
      if (Messages) {
        patches.push(before("sendMessage", Messages, function (args) { handle(args[1], args[0]); }));
        patches.push(before("editMessage", Messages, function (args) { handle(args[2], args[0]); }));
      }

      var Upload = findByProps("uploadLocalFiles");
      if (Upload) {
        patches.push(before("uploadLocalFiles", Upload, function (args) {
          if (args[0] && args[0].parsedMessage) {
            var cId = args[0].channelId || (args[0].channel && args[0].channel.id);
            handle(args[0].parsedMessage, cId);
          }
        }));
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
