(function () {
  const { findByProps } = vendetta.metro;
  const { before, instead } = vendetta.patcher;

  var patches = [];

  // ── 1. Unlock the emoji picker ─────────────────────────────────────────────
  // Discord gates cross-server emojis behind a Nitro check — these two
  // functions are what makes them greyed-out / unclickable in the picker.
  // Patching them to always return "available" makes every emoji clickable.

  var EmojiDisabled = findByProps("isEmojiDisabled");
  if (EmojiDisabled) {
    patches.push(
      instead("isEmojiDisabled", EmojiDisabled, function () {
        return false; // false = not disabled = clickable
      })
    );
  }

  var EmojiUnavailable = findByProps("getEmojiUnavailableReason");
  if (EmojiUnavailable) {
    patches.push(
      instead("getEmojiUnavailableReason", EmojiUnavailable, function () {
        return null; // null = no reason = available
      })
    );
  }

  // ── 2. Convert emoji syntax → CDN URL before the message is sent ──────────
  // Once the picker lets the user click an emoji, Discord inserts <:name:id>
  // into the message. Our sendMessage hook intercepts that and swaps it for
  // the emoji's CDN image URL so it sends as a small inline GIF/PNG.

  var Messages = findByProps("sendMessage", "editMessage");

  // Matches <:name:id> (static) and <a:name:id> (animated)
  var EMOJI_RE = /<(a?):([a-zA-Z0-9_]+):(\d{17,20})>/g;
  // Split on code fences/inline code so we never touch code blocks
  var CODE_RE  = /(```[\s\S]*?```|`[^`\n]*`)/;

  function emojiToUrl(_, animated, _name, id) {
    var ext = animated === "a" ? "gif" : "png";
    return "https://cdn.discordapp.com/emojis/" + id + "." + ext
      + "?size=48&quality=lossless";
  }

  function replaceEmojis(text) {
    return text.split(CODE_RE).map(function (part, i) {
      return i % 2 === 1 ? part : part.replace(EMOJI_RE, emojiToUrl);
    }).join("");
  }

  function handle(msg) {
    if (msg && typeof msg.content === "string" && msg.content)
      msg.content = replaceEmojis(msg.content);
  }

  // sendMessage(channelId, message, ...) — message is args[1]
  // editMessage(channelId, messageId, message, ...) — message is args[2]
  patches.push(before("sendMessage", Messages, function (args) { handle(args[1]); }));
  patches.push(before("editMessage", Messages, function (args) { handle(args[2]); }));

  return {
    onLoad: function () {},
    onUnload: function () {
      for (var i = 0; i < patches.length; i++) patches[i]();
    },
  };
})();
