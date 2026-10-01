(function () {
  var findByStoreName = vendetta.metro.findByStoreName;
  var instead         = vendetta.patcher.instead;
  var FluxDispatcher  = vendetta.metro.common.FluxDispatcher;

  var MessageStore = findByStoreName("MessageStore");
  var patches      = [];

  // IDs we already ghost'd — prevents re-processing our own UPDATE dispatches
  var ghosted = new Set();

  // ── Build the ghost update payload ──────────────────────────────────────────
  // We call this with the original message from MessageStore (still available
  // at the time MESSAGE_DELETE fires) and dispatch a MESSAGE_UPDATE instead,
  // so Discord's UI keeps the bubble in chat.
  function ghostPayload(msg, channelId) {
    var rawContent = msg.content || "";
    var label      = rawContent
      ? "\uD83D\uDDD1\uFE0F  " + rawContent          // 🗑️ + original text
      : "\uD83D\uDDD1\uFE0F  [attachment / embed]";  // image-only messages

    return {
      type: "MESSAGE_UPDATE",
      message: {
        id:              msg.id,
        channel_id:      msg.channel_id || channelId,
        content:         label,
        author:          msg.author,
        timestamp:       msg.timestamp,
        editedTimestamp: null,       // don't show "(edited)"
        embeds:          [],         // drop embeds
        attachments:     [],         // drop attachments (they 404 after delete)
        mentions:        msg.mentions        || [],
        mention_roles:   msg.mentionRoles    || [],
        mention_everyone: false,
        pinned:          false,
        tts:             false,
        type:            msg.type  || 0,
        flags:           msg.flags || 0,
      },
      log_edit:          false,
      otherPluginBypass: true,
    };
  }

  // ── Core patch: intercept ALL FluxDispatcher.dispatch calls ────────────────
  patches.push(
    instead("dispatch", FluxDispatcher, function (args, orig) {
      var payload = args[0];
      if (!payload) return orig.apply(this, args);

      // ── Single delete ───────────────────────────────────────────────────────
      if (payload.type === "MESSAGE_DELETE") {
        var id        = payload.id;
        var channelId = payload.channelId;

        if (!ghosted.has(id)) {
          var msg = MessageStore && MessageStore.getMessage(channelId, id);
          if (msg) {
            ghosted.add(id);
            // Replace the delete with a ghost update — message stays in chat
            return orig.call(this, ghostPayload(msg, channelId));
          }
        }
      }

      // ── Bulk delete (e.g. mod clears, purge bots) ──────────────────────────
      if (payload.type === "MESSAGE_DELETE_BULK") {
        var ids       = payload.ids    || [];
        var chId      = payload.channelId;
        var toRestore = [];

        // Snapshot messages BEFORE the bulk delete is processed
        for (var i = 0; i < ids.length; i++) {
          if (!ghosted.has(ids[i])) {
            var m = MessageStore && MessageStore.getMessage(chId, ids[i]);
            if (m) { ghosted.add(ids[i]); toRestore.push(m); }
          }
        }

        // Let the bulk delete run so Discord cleans up its store
        orig.apply(this, args);

        // Re-inject each deleted message as a ghost
        for (var j = 0; j < toRestore.length; j++) {
          orig.call(this, ghostPayload(toRestore[j], chId));
        }
        return;
      }

      return orig.apply(this, args);
    })
  );

  return {
    onLoad:   function () {},
    onUnload: function () {
      ghosted.clear();
      for (var i = 0; i < patches.length; i++) patches[i]();
    },
  };
})();
