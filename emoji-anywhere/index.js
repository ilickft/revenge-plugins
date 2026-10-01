(function () {
  var metro = vendetta.metro;
  var patcher = vendetta.patcher;

  var findByProps = metro.findByProps;
  var findByStoreName = metro.findByStoreName;
  var before = patcher.before;
  var instead = patcher.instead;
  var after = patcher.after;

  var patches = [];

  // Helper to patch all instances of a function across modules
  function patchProp(prop, fn) {
    try {
      if (typeof metro.findByPropsAll === "function") {
        var all = metro.findByPropsAll(prop);
        if (Array.isArray(all) && all.length > 0) {
          for (var i = 0; i < all.length; i++) {
            if (all[i] && typeof all[i][prop] === "function") {
              patches.push(instead(prop, all[i], fn));
            }
          }
          return;
        }
      }
    } catch (e) {}

    var mod = findByProps(prop);
    if (mod && typeof mod[prop] === "function") {
      patches.push(instead(prop, mod, fn));
    }
  }

  // ── 1. Remove lock icon on server icons & emoji picker ─────────────────────
  // canUseEmojisEverywhere is the exact check Discord uses to display the lock
  // badge on external server icons in the emoji picker sidebar.
  // We patch all capability checks so Discord treats all server emojis as unlocked.

  patchProp("canUseEmojisEverywhere",        function () { return true; });
  patchProp("canUseAnimatedEmojis",          function () { return true; });
  patchProp("canUseExternalEmojis",          function () { return true; });
  patchProp("canUseCustomEmojisEverywhere",  function () { return true; });
  patchProp("canUseCustomEmojis",            function () { return true; });
  patchProp("canUsePremiumEmojis",           function () { return true; });

  patchProp("isEmojiDisabled",               function () { return false; });
  patchProp("isEmojiFilteredOrDisabled",     function () { return false; });
  patchProp("isEmojiPremiumLocked",          function () { return false; });
  patchProp("isGuildLocked",                 function () { return false; });
  patchProp("isGuildEmojiLocked",            function () { return false; });

  patchProp("getEmojiUnavailableReason",     function () { return null; });

  // ── 2. Patch EmojiStore to report all emojis as available ──────────────────
  var EmojiStore = findByStoreName("EmojiStore") || findByProps("getCustomEmojiById");
  if (EmojiStore) {
    function cloneAvailable(obj) {
      if (!obj || typeof obj !== "object") return obj;
      if (obj.available !== false) return obj;
      try {
        var c = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
        c.available = true;
        return c;
      } catch (e) {
        return obj;
      }
    }

    function mapAvailability(ret) {
      if (ret == null) return ret;
      if (Array.isArray(ret)) return ret.map(cloneAvailable);
      if (typeof ret === "object") {
        if (Object.prototype.hasOwnProperty.call(ret, "available")) {
          return cloneAvailable(ret);
        }
        var out = Array.isArray(ret) ? ret.slice() : Object.assign({}, ret);
        var keys = ["emojis", "items"];
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          if (Array.isArray(ret[key])) {
            out[key] = ret[key].map(cloneAvailable);
          }
        }
        return out;
      }
      return ret;
    }

    var storeMethods = [
      "getCustomEmojiById",
      "getGuildEmoji",
      "getGuildEmojis",
      "getGuildEmojiForEmojiPicker",
      "getAllGuildEmoji"
    ];

    for (var m = 0; m < storeMethods.length; m++) {
      (function (method) {
        if (typeof EmojiStore[method] === "function") {
          patches.push(
            after(method, EmojiStore, function (args, ret) {
              return mapAvailability(ret);
            })
          );
        }
      })(storeMethods[m]);
    }
  }

  // ── 3. Masked invisible link formatting when sending emojis ────────────────
  // Converts <:name:id> or <a:name:id> into:
  // [\u200B](https://cdn.discordapp.com/emojis/ID.ext?size=48)
  //
  // Discord's markdown engine parses [\u200B](url) as a link whose display
  // text is a zero-width space (0 pixels wide = completely invisible), while
  // Discord embeds the emoji image inline right below/next to the message!

  var Messages = findByProps("sendMessage", "editMessage");
  var SelectedGuildStore = findByStoreName("SelectedGuildStore");

  var EMOJI_RE = /<(a?):([a-zA-Z0-9_]+):(\d{17,20})>/g;
  var CODE_RE  = /(```[\s\S]*?```|`[^`\n]*`)/;

  function emojiToInvisibleLink(match, animated, _name, id) {
    try {
      var curGuild = SelectedGuildStore && SelectedGuildStore.getGuildId && SelectedGuildStore.getGuildId();
      var emojiObj = EmojiStore && EmojiStore.getCustomEmojiById && EmojiStore.getCustomEmojiById(id);
      // Native static emoji from current guild can stay native
      if (emojiObj && emojiObj.guildId === curGuild && !animated) {
        return match;
      }
    } catch (e) {}

    var ext = animated === "a" ? "gif" : "png";
    var url = "https://cdn.discordapp.com/emojis/" + id + "." + ext + "?size=48";
    // Invisible zero-width space masked link
    return "[\u200B](" + url + ")";
  }

  function replaceEmojis(text) {
    return text.split(CODE_RE).map(function (part, i) {
      return i % 2 === 1 ? part : part.replace(EMOJI_RE, emojiToInvisibleLink);
    }).join("");
  }

  function handle(msg) {
    if (msg && typeof msg.content === "string" && msg.content) {
      msg.content = replaceEmojis(msg.content);
      // Prevent Discord client-side Nitro upsell or rejection
      if (msg.invalidEmojis) msg.invalidEmojis = [];
      if (msg.validNonShortcutEmojis) msg.validNonShortcutEmojis = [];
    }
  }

  // Hook sendMessage and editMessage
  if (Messages) {
    patches.push(before("sendMessage", Messages, function (args) { handle(args[1]); }));
    patches.push(before("editMessage", Messages, function (args) { handle(args[2]); }));
  }

  // Also hook uploadLocalFiles if sending with media
  var UploadModule = findByProps("uploadLocalFiles");
  if (UploadModule) {
    patches.push(
      before("uploadLocalFiles", UploadModule, function (args) {
        if (args && args[0] && args[0].parsedMessage) {
          handle(args[0].parsedMessage);
        }
      })
    );
  }

  return {
    onLoad: function () {},
    onUnload: function () {
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];
    },
  };
})();
