(function () {
  "use strict";

  var findByProps     = vendetta.metro.findByProps;
  var findByStoreName = vendetta.metro.findByStoreName;
  var showToast       = vendetta.ui.toasts.showToast;
  var getAssetIDByName = vendetta.ui.assets.getAssetIDByName;

  var UserStore        = findByStoreName("UserStore");
  var MessageStore     = findByProps("getMessage", "getMessages");
  var PendingReplyStore = findByProps("getPendingReply");
  var TokenModule      = findByProps("getToken");

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

      var msg = pending.message || pending.reply || pending;
      if (msg && msg.author && msg.author.id) return msg.author.id;

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

    var idx = Math.abs(parseInt(user.id.slice(-2), 10)) % 5;
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

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
      var gifUrl = data.message;
      if (!gifUrl) throw new Error("No GIF URL in response");

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

  var unregisterCmd = null;

  function removePetpetCommand() {
    try {
      if (vendetta.commands && Array.isArray(vendetta.commands.commands)) {
        for (var i = vendetta.commands.commands.length - 1; i >= 0; i--) {
          var cmd = vendetta.commands.commands[i];
          if (cmd && (cmd.name === "petpet" || cmd.displayName === "petpet")) {
            vendetta.commands.commands.splice(i, 1);
          }
        }
      }
    } catch (e) {}
  }

  return {
    onLoad: function () {
      removePetpetCommand();

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
              type:               6,
              required:           false,
            },
          ],
          execute: function (args, ctx) {
            var channelId = ctx && ctx.channel && ctx.channel.id;
            if (!channelId) return null;

            var targetId =

              optionValue(args, "user") ||

              resolvePendingReplyAuthorId(channelId) ||

              (UserStore && UserStore.getCurrentUser() && UserStore.getCurrentUser().id);

            if (targetId) {
              petpet(channelId, targetId);
            } else {
              toast("Couldn't figure out who to pet!", true);
            }

            return null;
          },
        });
      }
    },
    onUnload: function () {
      if (typeof unregisterCmd === "function") {
        try { unregisterCmd(); } catch (e) {}
      }
      unregisterCmd = null;
      removePetpetCommand();
    },
  };
})();
