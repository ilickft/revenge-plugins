(function () {
  var findByProps = vendetta.metro.findByProps;
  var instead     = vendetta.patcher.instead;
  var before      = vendetta.patcher.before;

  var patches = [];

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

  // ── 1. Unlock emoji picker & remove server lock icons ──────────────────────
  // canUseEmojisEverywhere is Discord's check that displays lock badges on
  // external server icons in the emoji picker sidebar.

  safePatch("canUseEmojisEverywhere",       true);
  safePatch("canUseAnimatedEmojis",         true);
  safePatch("canUseCustomEmojisEverywhere", true);
  safePatch("canUseExternalEmojis",         true);
  safePatch("isEmojiDisabled",              false);
  safePatch("getEmojiUnavailableReason",    null);

  // ── 2. Convert emoji syntax → [Name](CDN_URL) masked hyperlink ─────────────
  // Formats as [EmojiName](https://cdn.discordapp.com/emojis/ID.ext?size=48&quality=lossless)
  // Shows the clean emoji name as a clickable hyperlink while embedding the image.

  var Messages = findByProps("sendMessage", "editMessage");

  // Matches <:name:id> (static) and <a:name:id> (animated)
  var EMOJI_RE = /<(a?):([a-zA-Z0-9_]+):(\d{17,20})>/g;
  // Split on code fences / inline code so we never touch code blocks
  var CODE_RE  = /(```[\s\S]*?```|`[^`\n]*`)/;

  function emojiToUrl(_, animated, _name, id) {
    var ext = animated === "a" ? "gif" : "png";
    var url = "https://cdn.discordapp.com/emojis/" + id + "." + ext + "?size=48&quality=lossless";
    return "[:)](" + url + ")";
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

  // sendMessage(channelId, message, ...) — message is args[1]
  // editMessage(channelId, messageId, message, ...) — message is args[2]
  if (Messages) {
    patches.push(before("sendMessage", Messages, function (args) { handle(args[1]); }));
    patches.push(before("editMessage", Messages, function (args) { handle(args[2]); }));
  }

  return {
    onLoad:   function () {},
    onUnload: function () {
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];
    },
  };
})();
