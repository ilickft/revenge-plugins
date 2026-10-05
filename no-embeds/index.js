(function () {
  const { findByProps } = vendetta.metro;
  const { before } = vendetta.patcher;

  const Messages = findByProps("sendMessage", "editMessage");

  const URL_RE = /https?:\/\/[^\s<>]*[^\s<>.,;:!?)\]'"]/g;

  const CODE_RE = /(```[\s\S]*?```|`[^`\n]*`)/;

  function wrapLinks(text) {
    return text
      .split(CODE_RE)
      .map((part, i) => {
        if (i % 2 === 1) return part;
        return part.replace(URL_RE, (url, offset, whole) => {
          if (whole[offset - 1] === "<") return url;
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
