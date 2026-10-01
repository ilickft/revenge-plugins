(function () {
  "use strict";

  var findByProps     = vendetta.metro.findByProps;
  var findByStoreName = vendetta.metro.findByStoreName;
  var showToast       = vendetta.ui.toasts.showToast;
  var getAssetIDByName = vendetta.ui.assets.getAssetIDByName;

  // ── Stores ────────────────────────────────────────────────────────────────
  var UserStore        = findByStoreName("UserStore");
  var MessageStore     = findByProps("getMessage", "getMessages");
  var PendingReplyStore = findByProps("getPendingReply");
  var TokenModule      = findByProps("getToken");

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toast(msg, isError) {
    try {
      var icon = getAssetIDByName(isError ? "ic_close_16px" : "ImageIcon") ||
                 getAssetIDByName(isError ? "CloseIcon"     : "StickerIcon");
      showToast(msg, icon);
    } catch (e) {}
  }

  function optionValue(args, name) {
    if (!Array.isArray(args)) return undefined;
    var found = args.find(function (a) { return a && a.name === name; });
    return found && found.value !== undefined && found.value !== null ? found.value : undefined;
  }

  function resolvePendingReplyAuthorId(channelId) {
    try {
      var pending = (PendingReplyStore && PendingReplyStore.getPendingReply(channelId)) ||
                   (PendingReplyStore && PendingReplyStore.getPendingReply());
      if (!pending) return null;

      // Normalise across different Revenge versions
      var msg = pending.message || pending.reply || pending;
      if (msg && msg.author && msg.author.id) return msg.author.id;

      // Fall back to looking up via messageId
      var msgId  = pending.messageId  || pending.message_id  || (msg && msg.id);
      var chanId = pending.channelId  || pending.channel_id  || channelId;
      if (msgId && chanId && MessageStore) {
        var m = MessageStore.getMessage(chanId, msgId);
        if (m && m.author && m.author.id) return m.author.id;
      }
    } catch (e) {}
    return null;
  }

  function avatarUrl(user) {
    if (!user) return null;
    if (user.avatar) {
      var ext = user.avatar.startsWith("a_") ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + "." + ext + "?size=128";
    }
    // Default avatar (safe approximation for both legacy discriminator & new system)
    var idx = Math.abs(parseInt(user.id.slice(-2), 10)) % 5;
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

  // ── Pet-pet GIF generation ────────────────────────────────────────────────
  //
  // Uses nekobot.xyz — returns JSON with a direct .gif URL.
  // API: GET https://nekobot.xyz/api/imagegen?type=petpet&image=<avatar_url>
  // The returned URL is a .gif file hosted on Cloudflare — Discord will
  // auto-embed it as an animated image in chat.

  async function petpet(channelId, targetUserId) {
    var user = UserStore && UserStore.getUser(targetUserId);
    var av   = avatarUrl(user);
    if (!av) {
      toast("Couldn't get that user's avatar!", true);
      return;
    }

    toast("\uD83D\uDC3E Generating pet-pet...");

    try {
      var apiRes = await fetch(
        "https://nekobot.xyz/api/imagegen?type=petpet&image=" + encodeURIComponent(av)
      );
      if (!apiRes.ok) throw new Error("API " + apiRes.status);

      var data   = await apiRes.json();
      var gifUrl = data.message; // direct .gif link on nekobot CDN
      if (!gifUrl) throw new Error("No GIF URL in response");

      // Send the .gif URL — Discord auto-embeds it as an animated image.
      var token = TokenModule && TokenModule.getToken && TokenModule.getToken();
      if (!token) throw new Error("No auth token");

      var sendRes = await fetch(
        "https://discord.com/api/v9/channels/" + channelId + "/messages",
        {
          method:  "POST",
          headers: {
            "Authorization": token,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({ content: gifUrl }),
        }
      );
      if (!sendRes.ok) throw new Error("Discord " + sendRes.status);

    } catch (e) {
      console.error("[petpet]", e);
      toast("Pet-pet failed: " + e.message, true);
    }
  }

  // ── Command registration ──────────────────────────────────────────────────

  var unregisterCmd = null;

  if (vendetta.commands && typeof vendetta.commands.registerCommand === "function") {
    unregisterCmd = vendetta.commands.registerCommand({
      name:                "petpet",
      displayName:         "petpet",
      displayDescription:  "Generate a pet-pet GIF of any user \uD83D\uDC3E",
      description:         "Generate a pet-pet GIF of any user \uD83D\uDC3E",
      applicationId:       "-1",
      type:                1,
      inputType:           1,
      options: [
        {
          name:               "user",
          displayName:        "user",
          description:        "User to pet (defaults to replied user or yourself)",
          displayDescription: "User to pet (defaults to replied user or yourself)",
          type:               6,       // ApplicationCommandOptionType.USER
          required:           false,
        },
      ],
      execute: function (args, ctx) {
        var channelId = ctx && ctx.channel && ctx.channel.id;
        if (!channelId) return null;

        var targetId =
          // 1. Explicit user option
          optionValue(args, "user") ||
          // 2. Whoever the user is currently replying to
          resolvePendingReplyAuthorId(channelId) ||
          // 3. Pet yourself
          (UserStore && UserStore.getCurrentUser() && UserStore.getCurrentUser().id);

        if (targetId) {
          petpet(channelId, targetId); // fire-and-forget (async)
        } else {
          toast("Couldn't figure out who to pet!", true);
        }

        return null; // don't send an extra text message
      },
    });
  }

  return {
    onLoad:   function () {},
    onUnload: function () {
      if (typeof unregisterCmd === "function") {
        try { unregisterCmd(); } catch (e) {}
      }
      unregisterCmd = null;
    },
  };
})();
