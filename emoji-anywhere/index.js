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
  var Forms                = (vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms) || findByProps("FormRow", "FormSection") || {};
  var FormRow              = Forms.FormRow || Forms.TableRow;
  var FormSection          = Forms.FormSection || Forms.TableSection;
  var FormSwitch           = Forms.FormSwitch || Forms.FormSwitchRow;
  var FormDivider          = Forms.FormDivider;

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

    if (!React || !RN || !RN.ScrollView) return null;

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

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1 },
        contentContainerStyle: { paddingBottom: 40 }
      },
      React.createElement(
        FormSection,
        { title: "EMOJI BEHAVIOR" },
        React.createElement(FormRow, {
          label: "Keep Server Emojis Normal",
          subLabel: "Emojis available in the current server stay normal instead of being embedded as links",
          trailing: React.createElement(FormSwitch, {
            value: storage.keepServerEmojisNormal !== false,
            onValueChange: function (val) {
              storage.keepServerEmojisNormal = val;
              forceUpdate();
            }
          })
        })
      ),

      React.createElement(
        FormSection,
        { title: "EXTERNAL EMOJI LINK TEXT" },
        React.createElement(
          RN.View,
          { style: { paddingHorizontal: 16, paddingVertical: 10 } },
          React.createElement(RN.TextInput, {
            style: {
              backgroundColor: "rgba(128, 128, 128, 0.15)",
              color: "inherit",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14
            },
            value: current,
            placeholder: "e.g. :), {{name}}, or custom text",
            placeholderTextColor: "#80848e",
            onChangeText: function (text) {
              storage.emojiName = text;
              forceUpdate();
            }
          }),
          React.createElement(
            RN.Text,
            { style: { color: "#80848e", fontSize: 12, marginTop: 8 } },
            "Preview: [" + (current || ":)") + "](https://cdn.discordapp.com/emojis/...)"
          )
        )
      ),

      React.createElement(
        FormSection,
        { title: "QUICK PRESETS" },
        presets.map(function (p) {
          var active = current === p.value;
          return React.createElement(FormRow, {
            key: p.label,
            label: p.label,
            subLabel: active ? "Currently selected" : "Tap to use this format",
            onPress: function () {
              storage.emojiName = p.value;
              forceUpdate();
            }
          });
        })
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
