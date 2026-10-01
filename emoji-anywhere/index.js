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
  // external server icons in the emoji picker sidebar. Patching it to true
  // tells Discord you have external emoji permissions everywhere.

  safePatch("canUseEmojisEverywhere",       true);
  safePatch("canUseAnimatedEmojis",         true);
  safePatch("canUseCustomEmojisEverywhere", true);
  safePatch("canUseExternalEmojis",         true);
  safePatch("isEmojiDisabled",              false);
  safePatch("getEmojiUnavailableReason",    null);

  // ── 2. Convert emoji syntax → raw CDN URL before sending ───────────────────
  // Discord's image embedder requires a raw https:// URL to generate an embed.
  // Masked links [text](url) are blocked for normal user accounts and disable embeds.
  // When a message contains only the raw CDN URL, Discord mobile collapses the link
  // text and displays ONLY the small emoji image in chat.

  var Messages = findByProps("sendMessage", "editMessage");

  // Matches <:name:id> (static) and <a:name:id> (animated)
  var EMOJI_RE = /<(a?):([a-zA-Z0-9_]+):(\d{17,20})>/g;
  // Split on code fences / inline code so we never touch code blocks
  var CODE_RE  = /(```[\s\S]*?```|`[^`\n]*`)/;

  function emojiToUrl(_, animated, _name, id) {
    var ext = animated === "a" ? "gif" : "png";
    return "https://cdn.discordapp.com/emojis/" + id + "." + ext + "?size=48&quality=lossless";
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
