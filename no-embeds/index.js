(function () {
  const { findByProps } = vendetta.metro;
  const { before } = vendetta.patcher;

  const Messages = findByProps("sendMessage", "editMessage");

  // http(s) link, minus trailing punctuation like . , ) ! ?
  const URL_RE = /https?:\/\/[^\s<>]*[^\s<>.,;:!?)\]'"]/g;
  // skip code blocks / inline code (links there never embed anyway)
  const CODE_RE = /(```[\s\S]*?```|`[^`\n]*`)/;

  function wrapLinks(text) {
    return text
      .split(CODE_RE)
      .map((part, i) => {
        if (i % 2 === 1) return part; // code segment, leave untouched
        return part.replace(URL_RE, (url, offset, whole) => {
          if (whole[offset - 1] === "<") return url; // already wrapped
          return `<${url}>`;
        });
      })
      .join("");
  }

  function handle(msg) {
    if (msg && typeof msg.content === "string" && msg.content) {
      msg.content = wrapLinks(msg.content);
    }
  }

  const patches = [
    before("sendMessage", Messages, (args) => handle(args[1])),
    before("editMessage", Messages, (args) => handle(args[2])),
  ];

  return {
    onLoad() {},
    onUnload() {
      for (const unpatch of patches) unpatch();
    },
  };
})();
