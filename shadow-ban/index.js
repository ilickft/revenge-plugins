(function () {
  "use strict";

  const { findByProps, findByStoreName } = vendetta.metro;
  const { before, after } = vendetta.patcher;
  const { React, ReactNative: RN, FluxDispatcher } = vendetta.metro.common;
  const storage = vendetta.plugin.storage;

  const MessageStore         = findByStoreName("MessageStore") || findByProps("getMessage", "getMessages");
  const ChannelStore         = findByStoreName("ChannelStore") || findByProps("getChannel", "getDMFromUserId");
  const UserStore            = findByStoreName("UserStore");
  const GuildMemberStore     = findByStoreName("GuildMemberStore") || findByProps("getMember");
  const VoiceStateStore      = findByStoreName("VoiceStateStore") || findByProps("getVoiceStatesForChannel");
  const SelectedChannelStore = findByStoreName("SelectedChannelStore") || findByProps("getChannelId");
  const SelectedGuildStore   = findByStoreName("SelectedGuildStore") || findByProps("getGuildId");
  const PendingReplyStore    = findByProps("getPendingReply");
  const ChannelMessages      = findByProps("_channelMessages");
  const MediaEngine          = findByProps("setLocalMute", "setLocalVolume");
  const ActionSheet          = findByProps("openLazy", "hideActionSheet");
  const TokenModule          = findByProps("getToken");
  const MemberSearch         = findByProps("queryMembers") || findByProps("searchMembers");

  const Forms            = (vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms) || findByProps("FormRow", "FormSection") || {};
  const FormRow          = Forms && (Forms.FormRow || Forms.TableRow);
  const FormSection      = Forms && (Forms.FormSection || Forms.TableSection);
  const FormIcon         = Forms && (Forms.FormIcon || Forms.TableIcon);
  const FormSwitch       = Forms && (Forms.FormSwitch || Forms.FormSwitchRow);
  const FormDivider      = Forms && Forms.FormDivider;
  const getAssetIDByName = (vendetta.ui && vendetta.ui.assets && vendetta.ui.assets.getAssetIDByName) || (findByProps("getAssetIDByName") && findByProps("getAssetIDByName").getAssetIDByName);
  const showToast        = (vendetta.ui && vendetta.ui.toasts && vendetta.ui.toasts.showToast) || (findByProps("showToast") && findByProps("showToast").showToast);

  if (!Array.isArray(storage.bannedUsers)) {
    storage.bannedUsers = [];
  }
  if (storage.blockMessages === undefined) storage.blockMessages = true;
  if (storage.hideVoice === undefined) storage.hideVoice = true;
  if (storage.hideDMs === undefined) storage.hideDMs = true;
  if (storage.hideMemberList === undefined) storage.hideMemberList = true;
  if (storage.hideTyping === undefined) storage.hideTyping = true;
  if (storage.enableContextMenu === undefined) storage.enableContextMenu = true;

  const bannedIdSet = new Set();

  function syncBannedSet() {
    bannedIdSet.clear();
    if (Array.isArray(storage.bannedUsers)) {
      for (let i = 0; i < storage.bannedUsers.length; i++) {
        const u = storage.bannedUsers[i];
        if (u && u.id) {
          bannedIdSet.add(String(u.id));
        }
      }
    }
  }

  syncBannedSet();

  function isShadowBanned(userId) {
    if (!userId) return false;
    return bannedIdSet.has(String(userId));
  }

  let patches            = [];
  let unregisterCommands = [];

  function toast(msg, isError) {
    try {
      if (showToast) {
        const icon = getAssetIDByName
          ? (getAssetIDByName(isError ? "ic_close_16px" : "ic_person_off_24px") ||
             getAssetIDByName(isError ? "CloseIcon" : "CheckmarkSmallIcon") ||
             getAssetIDByName("ChatIcon"))
          : null;
        showToast(msg, icon);
      }
    } catch (e) {}
  }

  function optionValue(args, name) {
    if (!Array.isArray(args)) return undefined;
    const found = args.find((a) => a && a.name === name);
    return found && found.value !== undefined && found.value !== null ? found.value : undefined;
  }

  function extractUserId(val) {
    if (!val) return null;
    if (typeof val === "object" && val.id) return String(val.id);
    const str = String(val).trim().replace(/[<@!>]/g, "");
    const match = str.match(/\d{17,21}/);
    return match ? match[0] : (str.length >= 17 ? str : null);
  }

  function getAuthToken() {
    try {
      if (TokenModule && typeof TokenModule.getToken === "function") {
        const t = TokenModule.getToken();
        if (t) return t;
      }
    } catch (e) {}
    try {
      const auth = findByProps("getToken", "getFingerprint");
      if (auth && typeof auth.getToken === "function") {
        const t2 = auth.getToken();
        if (t2) return t2;
      }
    } catch (e) {}
    try {
      const authStore = findByStoreName("AuthenticationStore");
      if (authStore && typeof authStore.getToken === "function") {
        const t3 = authStore.getToken();
        if (t3) return t3;
      }
    } catch (e) {}
    return null;
  }

  function getActiveChannelId() {
    try {
      if (SelectedChannelStore) {
        if (typeof SelectedChannelStore.getChannelId === "function") {
          const id = SelectedChannelStore.getChannelId();
          if (id) return id;
        }
        if (typeof SelectedChannelStore.getCurrentlySelectedChannelId === "function") {
          const id2 = SelectedChannelStore.getCurrentlySelectedChannelId();
          if (id2) return id2;
        }
      }
    } catch (e) {}
    return null;
  }

  function getActiveGuildId(channelId) {
    try {
      if (channelId && ChannelStore && typeof ChannelStore.getChannel === "function") {
        const chan = ChannelStore.getChannel(channelId);
        if (chan && chan.guild_id) return chan.guild_id;
      }
    } catch (e) {}
    try {
      if (SelectedGuildStore && typeof SelectedGuildStore.getGuildId === "function") {
        return SelectedGuildStore.getGuildId();
      }
    } catch (e) {}
    return null;
  }

  function getAvatarUrl(user) {
    if (!user) return "https://cdn.discordapp.com/embed/avatars/0.png";
    if (user.avatar && user.id) {
      const isGif = typeof user.avatar === "string" && user.avatar.startsWith("a_");
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}${isGif ? ".gif" : ".png"}?size=128`;
    }
    let idx = 0;
    try {
      if (user.discriminator && user.discriminator !== "0") {
        idx = parseInt(user.discriminator, 10) % 5;
      } else if (user.id) {
        if (typeof BigInt !== "undefined") {
          idx = Number((BigInt(user.id) >> 22n) % 6n);
        } else {
          idx = Math.abs(parseInt(user.id.slice(-4), 10)) % 6;
        }
      }
    } catch (e) {
      idx = 0;
    }
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }

  function resolvePendingReplyMessage(channelId) {
    try {
      const pending = (PendingReplyStore && PendingReplyStore.getPendingReply(channelId)) ||
                      (PendingReplyStore && PendingReplyStore.getPendingReply());
      if (!pending) return null;

      const msg = pending.message || pending.reply;
      if (msg && msg.id && (msg.content !== undefined || msg.author)) {
        if (MessageStore && msg.id && channelId) {
          const full = MessageStore.getMessage(channelId, msg.id);
          if (full) return full;
        }
        return msg;
      }

      const msgId = pending.messageId || pending.message_id || (pending.message && pending.message.id) || pending.id;
      const chanId = pending.channelId || pending.channel_id || channelId;
      if (msgId && chanId && MessageStore) {
        const m = MessageStore.getMessage(chanId, msgId);
        if (m) return m;
      }
      if (msg) return msg;
    } catch (e) {}
    return null;
  }

  function isBannedDM(channel) {
    if (!channel || channel.type !== 1) return false;
    const rids = channel.recipient_ids || channel.recipientIds;
    if (Array.isArray(rids)) {
      for (let i = 0; i < rids.length; i++) {
        if (isShadowBanned(rids[i])) return true;
      }
    }
    const recips = channel.recipients;
    if (Array.isArray(recips)) {
      for (let j = 0; j < recips.length; j++) {
        const r = recips[j];
        const uid = (r && typeof r === "object") ? r.id : r;
        if (isShadowBanned(uid)) return true;
      }
    }
    return false;
  }

  function findInReactTree(tree, filter) {
    if (!tree) return null;
    if (filter(tree)) return tree;
    if (Array.isArray(tree)) {
      for (let i = 0; i < tree.length; i++) {
        const res = findInReactTree(tree[i], filter);
        if (res) return res;
      }
    } else if (typeof tree === "object") {
      const props = tree.props;
      if (props) {
        const res2 = findInReactTree(props.children, filter);
        if (res2) return res2;
      }
    }
    return null;
  }

  function tryFetchUser(targetId, onFetched) {
    try {
      const token = getAuthToken();
      if (!token) return;
      fetch(`https://discord.com/api/v9/users/${targetId}`, {
        headers: { Authorization: token },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.id && typeof onFetched === "function") {
            onFetched(data);
          }
        })
        .catch(() => {});
    } catch (e) {}
  }

  function muteUserAudio(userId) {
    try {
      if (MediaEngine) {
        if (typeof MediaEngine.setLocalMute === "function") MediaEngine.setLocalMute(userId, true);
        if (typeof MediaEngine.setLocalVolume === "function") MediaEngine.setLocalVolume(userId, 0);
      }
    } catch (e) {}
  }

  function unmuteUserAudio(userId) {
    try {
      if (MediaEngine) {
        if (typeof MediaEngine.setLocalMute === "function") MediaEngine.setLocalMute(userId, false);
        if (typeof MediaEngine.setLocalVolume === "function") MediaEngine.setLocalVolume(userId, 100);
      }
    } catch (e) {}
  }

  function purgeMessagesForUser(targetId) {
    try {
      if (!ChannelMessages || !ChannelMessages._channelMessages) return;
      const allChannels = ChannelMessages._channelMessages;
      const cids = Object.keys(allChannels);

      for (let c = 0; c < cids.length; c++) {
        const cid = cids[c];
        const chanObj = allChannels[cid];
        if (!chanObj) continue;

        const deletedIds = [];
        if (Array.isArray(chanObj._array)) {
          for (let i = chanObj._array.length - 1; i >= 0; i--) {
            const m = chanObj._array[i];
            if (m && m.author && String(m.author.id) === String(targetId)) {
              deletedIds.push(m.id);
              chanObj._array.splice(i, 1);
            }
          }
        }

        if (chanObj._map) {
          for (let d = 0; d < deletedIds.length; d++) {
            if (typeof chanObj._map.delete === "function") {
              chanObj._map.delete(deletedIds[d]);
            } else if (typeof chanObj._map === "object") {
              delete chanObj._map[deletedIds[d]];
            }
          }
        }

        if (deletedIds.length > 0) {
          try {
            FluxDispatcher.dispatch({
              type: "MESSAGE_DELETE_BULK",
              channelId: cid,
              ids: deletedIds,
              otherPluginBypass: true,
            });
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function evictUserFromVoice(targetId) {
    try {
      muteUserAudio(targetId);
      const activeGuildId = getActiveGuildId();
      FluxDispatcher.dispatch({
        type: "VOICE_STATE_UPDATES",
        voiceStates: [{
          userId: String(targetId),
          channelId: null,
          guildId: activeGuildId || null,
          oldChannelId: null,
          sessionId: "shadowban_evict",
        }],
      });
    } catch (e) {}
  }

  function evictUserFromDM(targetId) {
    try {
      const activeChanId = getActiveChannelId();
      if (activeChanId && ChannelStore) {
        const chan = ChannelStore.getChannel(activeChanId);
        if (chan && isBannedDM(chan)) {
          FluxDispatcher.dispatch({
            type: "CHANNEL_SELECT",
            channelId: null,
            guildId: null,
          });
        }
      }
    } catch (e) {}
  }

  function shadowBanUser(targetId, userObj) {
    if (!targetId) return false;
    const targetStr = String(targetId);

    const currentUserId = UserStore && UserStore.getCurrentUser() && UserStore.getCurrentUser().id;
    if (currentUserId && targetStr === String(currentUserId)) {
      toast("You cannot shadow ban yourself!", true);
      return false;
    }

    if (isShadowBanned(targetStr)) {
      toast("User is already shadow banned!", true);
      return false;
    }

    const u = userObj || (UserStore && UserStore.getUser(targetStr)) || null;
    const username = (u && (u.globalName || u.global_name || u.username)) || `User (${targetStr.slice(-4)})`;
    const avatar = getAvatarUrl(u || { id: targetStr });

    const entry = {
      id: targetStr,
      username: (u && u.username) || targetStr,
      globalName: (u && (u.globalName || u.global_name)) || null,
      avatar: avatar,
      bannedAt: Date.now(),
    };

    storage.bannedUsers.push(entry);
    syncBannedSet();

    if (storage.blockMessages !== false) purgeMessagesForUser(targetStr);
    if (storage.hideVoice !== false) evictUserFromVoice(targetStr);
    if (storage.hideDMs !== false) evictUserFromDM(targetStr);

    toast(`Shadow banned ${username}`);

    if (!u) {
      tryFetchUser(targetStr, (fetched) => {
        if (fetched && fetched.id) {
          entry.username = fetched.username || entry.username;
          entry.globalName = fetched.global_name || entry.globalName;
          entry.avatar = getAvatarUrl(fetched);
          syncBannedSet();
        }
      });
    }

    return true;
  }

  function unshadowBanUser(targetId) {
    if (!targetId) return false;
    const targetStr = String(targetId);

    if (!isShadowBanned(targetStr)) {
      toast("User is not shadow banned.", true);
      return false;
    }

    let removed = null;
    storage.bannedUsers = storage.bannedUsers.filter((u) => {
      if (u && String(u.id) === targetStr) {
        removed = u;
        return false;
      }
      return true;
    });
    syncBannedSet();

    unmuteUserAudio(targetStr);

    const name = removed ? (removed.globalName || removed.username) : targetStr;
    toast(`Un-shadowbanned ${name}`);
    return true;
  }

  function patchDispatcher() {
    patches.push(
      before("dispatch", FluxDispatcher, (args) => {
        try {
          const event = args && args[0];
          if (!event || !event.type) return args;

          const type = event.type;

          if (type === "MESSAGE_CREATE" || type === "LOCAL_MESSAGE_CREATE") {
            if (storage.blockMessages !== false) {
              const authorId = event.message && event.message.author && event.message.author.id;
              if (authorId && isShadowBanned(authorId)) {
                args[0] = { type: "__SBAN_BLOCKED__" };
                return args;
              }
            }
          }

          if (type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(event.messages)) {
            if (storage.blockMessages !== false) {
              event.messages = event.messages.filter((m) => {
                return !isShadowBanned(m && m.author && m.author.id);
              });
            }
          }

          if (type === "MESSAGE_UPDATE") {
            if (storage.blockMessages !== false) {
              const mAuthor = event.message && event.message.author && event.message.author.id;
              if (mAuthor && isShadowBanned(mAuthor)) {
                args[0] = { type: "__SBAN_BLOCKED__" };
                return args;
              }
            }
          }

          if (type === "MESSAGE_REACTION_ADD") {
            if (storage.blockMessages !== false && event.userId && isShadowBanned(event.userId)) {
              args[0] = { type: "__SBAN_BLOCKED__" };
              return args;
            }
          }
          if (type === "MESSAGE_REACTION_ADD_USERS" && Array.isArray(event.users)) {
            if (storage.blockMessages !== false) {
              event.users = event.users.filter((u) => !isShadowBanned(u && u.id));
            }
          }

          if (type === "TYPING_START") {
            if (storage.hideTyping !== false && event.userId && isShadowBanned(event.userId)) {
              args[0] = { type: "__SBAN_BLOCKED__" };
              return args;
            }
          }

          if (type === "VOICE_STATE_UPDATES" && Array.isArray(event.voiceStates)) {
            if (storage.hideVoice !== false) {
              for (let v = 0; v < event.voiceStates.length; v++) {
                const vs = event.voiceStates[v];
                if (vs && vs.userId && isShadowBanned(vs.userId)) {

                  vs.channelId = null;
                }
              }
            }
          }

          if (type === "AUDIO_SPEAKING" || type === "VOICE_SPEAKING" || type === "SPEAKING") {
            if (storage.hideVoice !== false) {
              const spkId = event.userId || event.speakerUserId;
              if (spkId && isShadowBanned(spkId)) {
                args[0] = { type: "__SBAN_BLOCKED__" };
                return args;
              }
            }
          }

          if (type === "GUILD_MEMBER_LIST_UPDATE" && Array.isArray(event.ops)) {
            if (storage.hideMemberList !== false) {
              for (let o = 0; o < event.ops.length; o++) {
                const op = event.ops[o];
                if (!op) continue;
                if (op.op === "SYNC" && Array.isArray(op.items)) {
                  op.items = op.items.filter((it) => {
                    const uid = it && it.member && it.member.user && it.member.user.id;
                    return !isShadowBanned(uid);
                  });
                } else if (op.op === "INSERT" || op.op === "UPDATE") {
                  const uid2 = op.item && op.item.member && op.item.member.user && op.item.member.user.id;
                  if (uid2 && isShadowBanned(uid2)) {
                    op.op = "INVALID";
                    op.item = undefined;
                  }
                }
              }
            }
          }

          if (type === "PRESENCE_UPDATE") {
            const pUid = (event.user && event.user.id) || event.userId;
            if (pUid && isShadowBanned(pUid)) {
              args[0] = { type: "__SBAN_BLOCKED__" };
              return args;
            }
          }

          if (type === "CHANNEL_CREATE" && event.channel && isBannedDM(event.channel)) {
            if (storage.hideDMs !== false) {
              args[0] = { type: "__SBAN_BLOCKED__" };
              return args;
            }
          }
          if (type === "CALL_CREATE" || type === "CALL_RING") {
            if (storage.hideDMs !== false && event.channelId && ChannelStore) {
              const callChan = ChannelStore.getChannel(event.channelId);
              if (callChan && isBannedDM(callChan)) {
                args[0] = { type: "__SBAN_BLOCKED__" };
                return args;
              }
            }
          }
          if (type === "CONNECTION_OPEN" && Array.isArray(event.private_channels)) {
            if (storage.hideDMs !== false) {
              event.private_channels = event.private_channels.filter((c) => !isBannedDM(c));
            }
          }

          if (type === "SEARCH_FINISH" && event.messages && Array.isArray(event.messages)) {
            if (storage.blockMessages !== false) {
              event.messages = event.messages.filter((row) => {
                if (Array.isArray(row)) {
                  return row.filter((m) => !isShadowBanned(m && m.author && m.author.id));
                }
                return !isShadowBanned(row && row.author && row.author.id);
              });
            }
          }
        } catch (err) {}
        return args;
      })
    );
  }

  function patchStores() {

    if (ChannelStore) {
      if (typeof ChannelStore.getPrivateChannels === "function") {
        patches.push(
          after("getPrivateChannels", ChannelStore, (args, res) => {
            if (storage.hideDMs === false || !res || typeof res !== "object") return res;
            const out = {};
            for (const cid in res) {
              if (!isBannedDM(res[cid])) {
                out[cid] = res[cid];
              }
            }
            return out;
          })
        );
      }

      if (typeof ChannelStore.getSortedPrivateChannels === "function") {
        patches.push(
          after("getSortedPrivateChannels", ChannelStore, (args, res) => {
            if (storage.hideDMs === false || !Array.isArray(res)) return res;
            return res.filter((c) => !isBannedDM(c));
          })
        );
      }

      if (typeof ChannelStore.getDMFromUserId === "function") {
        patches.push(
          after("getDMFromUserId", ChannelStore, (args, res) => {
            if (storage.hideDMs !== false && args && args[0] && isShadowBanned(args[0])) {
              return undefined;
            }
            return res;
          })
        );
      }

      if (typeof ChannelStore.getDMChannelFromUserId === "function") {
        patches.push(
          after("getDMChannelFromUserId", ChannelStore, (args, res) => {
            if (storage.hideDMs !== false && args && args[0] && isShadowBanned(args[0])) {
              return undefined;
            }
            return res;
          })
        );
      }
    }

    if (VoiceStateStore) {
      if (typeof VoiceStateStore.getVoiceStatesForChannel === "function") {
        patches.push(
          after("getVoiceStatesForChannel", VoiceStateStore, (args, res) => {
            if (storage.hideVoice === false || !res) return res;
            if (Array.isArray(res)) {
              return res.filter((vs) => !isShadowBanned(vs && vs.userId));
            }
            if (typeof res === "object") {
              const out = {};
              for (const uid in res) {
                if (!isShadowBanned(uid)) {
                  out[uid] = res[uid];
                }
              }
              return out;
            }
            return res;
          })
        );
      }

      if (typeof VoiceStateStore.getVoiceState === "function") {
        patches.push(
          after("getVoiceState", VoiceStateStore, (args, res) => {
            if (storage.hideVoice !== false && args && args[1] && isShadowBanned(args[1])) {
              return undefined;
            }
            return res;
          })
        );
      }

      if (typeof VoiceStateStore.getVoiceStates === "function") {
        patches.push(
          after("getVoiceStates", VoiceStateStore, (args, res) => {
            if (storage.hideVoice === false || !res || typeof res !== "object") return res;
            const out = {};
            for (const uid in res) {
              if (!isShadowBanned(uid)) {
                out[uid] = res[uid];
              }
            }
            return out;
          })
        );
      }
    }

    if (MemberSearch && typeof MemberSearch.queryMembers === "function") {
      patches.push(
        after("queryMembers", MemberSearch, (args, res) => {
          if (storage.hideMemberList === false || !Array.isArray(res)) return res;
          return res.filter((m) => {
            const uid = (m && m.user && m.user.id) || (m && m.id);
            return !isShadowBanned(uid);
          });
        })
      );
    }
  }

  function patchActionSheet() {
    if (!ActionSheet || typeof ActionSheet.openLazy !== "function") return;

    patches.push(
      before("openLazy", ActionSheet, (args) => {
        if (storage.enableContextMenu === false) return;

        const componentPromise = args && args[0];
        const sheetProps = args && args[1];

        if (!componentPromise || typeof componentPromise.then !== "function") return;

        let targetMsg = (sheetProps && (sheetProps.message || (sheetProps.target && sheetProps.target.message))) || null;
        if (!targetMsg && sheetProps) {
          for (const k in sheetProps) {
            const val = sheetProps[k];
            if (val && typeof val === "object" && val.author && val.id) {
              targetMsg = val;
              break;
            }
          }
        }

        const targetUser = (targetMsg && targetMsg.author) || (sheetProps && (sheetProps.user || (sheetProps.target && sheetProps.target.user)));
        if (!targetUser || !targetUser.id) return;

        const targetId = String(targetUser.id);
        const currentUserId = UserStore && UserStore.getCurrentUser() && UserStore.getCurrentUser().id;
        if (currentUserId && targetId === String(currentUserId)) return;

        componentPromise.then((module) => {
          if (!module) return;
          const unpatchSheet = after("default", module, (sheetArgs, sheetResult) => {
            if (React && React.useEffect) {
              React.useEffect(() => () => unpatchSheet(), []);
            }

            const buttonRows = findInReactTree(sheetResult, (node) => {
              return (
                Array.isArray(node) && node.length > 0 &&
                node.some((item) => item && item.props && (item.props.label !== undefined || item.props.title !== undefined))
              );
            });

            if (!buttonRows) return;

            for (let i = 0; i < buttonRows.length; i++) {
              const p = buttonRows[i] && buttonRows[i].props;
              if (p && (p.label === "Shadow Ban User" || p.label === "Un-shadowban User")) {
                return;
              }
            }

            const RowComponent = FormRow || (findByProps("ActionSheetRow") && findByProps("ActionSheetRow").ActionSheetRow);
            if (!RowComponent) return;

            const banned = isShadowBanned(targetId);
            const label = banned ? "Un-shadowban User" : "Shadow Ban User";

            const actionIcon = getAssetIDByName
              ? (banned
                  ? (getAssetIDByName("ic_person_add_24px") || getAssetIDByName("CheckmarkSmallIcon") || getAssetIDByName("TrashIcon"))
                  : (getAssetIDByName("ic_person_off_24px") || getAssetIDByName("ic_block") || getAssetIDByName("BlockIcon") || getAssetIDByName("TrashIcon")))
              : null;

            const elementProps = {
              key: `shadow-ban-toggle-${targetId}`,
              label: label,
              title: label,
              variant: banned ? "default" : "danger",
              onPress: () => {
                if (ActionSheet.hideActionSheet) ActionSheet.hideActionSheet();
                if (banned) {
                  unshadowBanUser(targetId);
                } else {
                  shadowBanUser(targetId, targetUser);
                }
              },
            };

            if (FormIcon && actionIcon) {
              elementProps.leading = React.createElement(FormIcon, { source: actionIcon });
            }

            buttonRows.push(React.createElement(RowComponent, elementProps));
          });
        });
      })
    );
  }

  function removeSlashCommands(names) {
    try {
      if (vendetta.commands && Array.isArray(vendetta.commands.commands)) {
        for (let i = vendetta.commands.commands.length - 1; i >= 0; i--) {
          const cmd = vendetta.commands.commands[i];
          if (cmd && names.indexOf(cmd.name) !== -1) {
            vendetta.commands.commands.splice(i, 1);
          }
        }
      }
    } catch (e) {}
  }

  function registerSlashCommands() {
    removeSlashCommands(["sban", "unsban"]);

    if (!vendetta.commands || typeof vendetta.commands.registerCommand !== "function") return;

    unregisterCommands.push(
      vendetta.commands.registerCommand({
        name: "sban",
        displayName: "sban",
        description: "Shadow ban a user (mention, ID, or reply). They disappear from DMs, chats, VC & everywhere.",
        displayDescription: "Shadow ban a user so they disappear everywhere",
        applicationId: "-1",
        type: 1,
        inputType: 1,
        options: [
          {
            name: "user",
            displayName: "user",
            description: "User to shadow ban",
            displayDescription: "User to shadow ban",
            type: 6,
            required: false,
          },
          {
            name: "id",
            displayName: "id",
            description: "User ID to shadow ban (optional, or reply to their message)",
            displayDescription: "User ID to shadow ban",
            type: 3,
            required: false,
          },
        ],
        execute: (args, ctx) => {
          const chanId = (ctx && ctx.channel && ctx.channel.id) || getActiveChannelId();

          let targetId = null;
          let userObj = null;

          const userVal = optionValue(args, "user");
          const idVal = optionValue(args, "id");

          if (userVal) {
            targetId = extractUserId(userVal);
            userObj = UserStore && UserStore.getUser(targetId);
          } else if (idVal) {
            targetId = extractUserId(idVal);
            userObj = UserStore && UserStore.getUser(targetId);
          } else {
            const replyMsg = resolvePendingReplyMessage(chanId);
            if (replyMsg && replyMsg.author && replyMsg.author.id) {
              targetId = String(replyMsg.author.id);
              userObj = replyMsg.author;
            }
          }

          if (!targetId) {
            toast("Reply to a message, select a user, or specify an ID (/sban user:@someone or reply and /sban)", true);
            return;
          }

          shadowBanUser(targetId, userObj);
        },
      })
    );

    unregisterCommands.push(
      vendetta.commands.registerCommand({
        name: "unsban",
        displayName: "unsban",
        description: "Un-shadowban a user by mention, user ID, or reply",
        displayDescription: "Un-shadowban a user",
        applicationId: "-1",
        type: 1,
        inputType: 1,
        options: [
          {
            name: "user",
            displayName: "user",
            description: "User to un-shadowban",
            displayDescription: "User to un-shadowban",
            type: 6,
            required: false,
          },
          {
            name: "id",
            displayName: "id",
            description: "User ID to un-shadowban (optional, or reply to their message)",
            displayDescription: "User ID to un-shadowban",
            type: 3,
            required: false,
          },
        ],
        execute: (args, ctx) => {
          const chanId = (ctx && ctx.channel && ctx.channel.id) || getActiveChannelId();

          let targetId = null;

          const userVal = optionValue(args, "user");
          const idVal = optionValue(args, "id");

          if (userVal) {
            targetId = extractUserId(userVal);
          } else if (idVal) {
            targetId = extractUserId(idVal);
          } else {
            const replyMsg = resolvePendingReplyMessage(chanId);
            if (replyMsg && replyMsg.author && replyMsg.author.id) {
              targetId = String(replyMsg.author.id);
            }
          }

          if (!targetId) {
            const count = (storage.bannedUsers && storage.bannedUsers.length) || 0;
            if (count === 0) {
              toast("No users are currently shadow banned.");
            } else {
              toast(`Specify a user/ID or reply to un-shadowban (${count} banned). Or use Plugin Settings!`, true);
            }
            return;
          }

          unshadowBanUser(targetId);
        },
      })
    );
  }

  function Settings() {
    const forceUpdate = React.useReducer((x) => x + 1, 0)[1];
    const [newUserId, setNewUserId] = React.useState("");
    const [searchQuery, setSearchQuery] = React.useState("");

    const Btn = RN.TouchableOpacity || RN.Pressable || RN.View;
    const bannedList = Array.isArray(storage.bannedUsers) ? storage.bannedUsers : [];

    function handleAddUser() {
      const clean = extractUserId(newUserId);
      if (!clean) {
        toast("Please enter a valid 17-21 digit Discord User ID!", true);
        return;
      }
      const ok = shadowBanUser(clean);
      if (ok) {
        setNewUserId("");
        forceUpdate();
      }
    }

    function handleUnban(id) {
      unshadowBanUser(id);
      forceUpdate();
    }

    function handleUnbanAll() {
      if (bannedList.length === 0) return;
      const count = bannedList.length;
      for (let i = 0; i < bannedList.length; i++) {
        if (bannedList[i] && bannedList[i].id) {
          unmuteUserAudio(bannedList[i].id);
        }
      }
      storage.bannedUsers = [];
      syncBannedSet();
      forceUpdate();
      toast(`Un-shadowbanned all ${count} users.`);
    }

    const filteredList = bannedList.filter((item) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      const uName = (item.username || "").toLowerCase();
      const gName = (item.globalName || "").toLowerCase();
      const uId = String(item.id || "");
      return uName.includes(q) || gName.includes(q) || uId.includes(q);
    });

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1 },
        contentContainerStyle: { paddingBottom: 40 },
      },

      React.createElement(
        FormSection,
        { title: `SHADOW BANNED USERS (${bannedList.length})` },
        React.createElement(
          RN.View,
          { style: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center" } },
          React.createElement(RN.TextInput, {
            style: {
              flex: 1,
              backgroundColor: "rgba(128, 128, 128, 0.15)",
              color: "inherit",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              marginRight: 8
            },
            placeholder: "User Snowflake ID...",
            placeholderTextColor: "#80848e",
            value: newUserId,
            onChangeText: setNewUserId,
            keyboardType: "numeric",
          }),
          React.createElement(
            Btn,
            {
              onPress: handleAddUser,
              style: {
                backgroundColor: "#da373c",
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                justifyContent: "center",
                alignItems: "center"
              }
            },
            React.createElement(
              RN.Text,
              { style: { color: "#ffffff", fontSize: 14, fontWeight: "700" } },
              "Ban"
            )
          )
        ),
        bannedList.length > 2 && React.createElement(
          RN.View,
          { style: { paddingHorizontal: 16, paddingBottom: 8 } },
          React.createElement(RN.TextInput, {
            style: {
              backgroundColor: "rgba(128, 128, 128, 0.15)",
              color: "inherit",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              fontSize: 13
            },
            placeholder: "Search banned users by name or ID...",
            placeholderTextColor: "#80848e",
            value: searchQuery,
            onChangeText: setSearchQuery,
          })
        ),
        bannedList.length > 0 && React.createElement(FormRow, {
          label: "Unban All Users",
          subLabel: "Remove all " + bannedList.length + " banned user(s)",
          onPress: handleUnbanAll
        }),
        bannedList.length === 0
          ? React.createElement(FormRow, {
              label: "No users are shadow banned",
              subLabel: "Use /sban user:@someone, reply /sban, or enter an ID above"
            })
          : filteredList.map((item) => {
              const id = item.id;
              const displayName = item.globalName || item.username || `User (${id.slice(-4)})`;
              const subText = item.username ? `@${item.username} • ${id}` : id;

              return React.createElement(FormRow, {
                key: `banned-row-${id}`,
                label: displayName,
                subLabel: subText,
                trailing: React.createElement(
                  Btn,
                  {
                    onPress: () => handleUnban(id),
                    style: {
                      backgroundColor: "rgba(218, 55, 60, 0.15)",
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 6,
                    },
                  },
                  React.createElement(
                    RN.Text,
                    { style: { color: "#da373c", fontSize: 12, fontWeight: "600" } },
                    "Unban"
                  )
                )
              });
            })
      ),

      React.createElement(
        FormSection,
        { title: "PROTECTION MODULES" },
        React.createElement(FormRow, {
          label: "Block Text Messages",
          subLabel: "Drops new messages, edits, and filters chat history",
          trailing: React.createElement(FormSwitch, {
            value: storage.blockMessages !== false,
            onValueChange: (val) => {
              storage.blockMessages = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        }),
        React.createElement(FormRow, {
          label: "Hide from Voice Channels (VC)",
          subLabel: "Hides avatar from VC list and mutes incoming audio",
          trailing: React.createElement(FormSwitch, {
            value: storage.hideVoice !== false,
            onValueChange: (val) => {
              storage.hideVoice = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        }),
        React.createElement(FormRow, {
          label: "Hide Direct Messages (DMs)",
          subLabel: "Hides 1-on-1 conversations and blocks incoming calls",
          trailing: React.createElement(FormSwitch, {
            value: storage.hideDMs !== false,
            onValueChange: (val) => {
              storage.hideDMs = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        }),
        React.createElement(FormRow, {
          label: "Hide Member List & Typing",
          subLabel: "Removes user from server sidebars, typing indicators & mentions",
          trailing: React.createElement(FormSwitch, {
            value: storage.hideMemberList !== false,
            onValueChange: (val) => {
              storage.hideMemberList = val;
              storage.hideTyping = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        }),
        React.createElement(FormRow, {
          label: "Message Context Menu",
          subLabel: "Add 'Shadow Ban User' option when long-pressing any message",
          trailing: React.createElement(FormSwitch, {
            value: storage.enableContextMenu !== false,
            onValueChange: (val) => {
              storage.enableContextMenu = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        })
      ),

      React.createElement(
        FormSection,
        { title: "COMMANDS & USAGE" },
        React.createElement(FormRow, {
          label: "/sban user:@someone",
          subLabel: "Shadow ban a user in your server"
        }),
        React.createElement(FormRow, {
          label: "/sban id:<snowflake>",
          subLabel: "Shadow ban by snowflake ID directly"
        }),
        React.createElement(FormRow, {
          label: "/unsban",
          subLabel: "Remove a shadow ban"
        }),
        React.createElement(FormRow, {
          label: "Context Menu",
          subLabel: "Long-press any message and tap 'Shadow Ban User'"
        })
      )
    );
  }

  return {
    onLoad: function () {
      syncBannedSet();
      patchDispatcher();
      patchStores();
      patchActionSheet();
      registerSlashCommands();
    },
    onUnload: function () {
      for (let i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];

      for (let j = 0; j < unregisterCommands.length; j++) {
        try { unregisterCommands[j](); } catch (e) {}
      }
      unregisterCommands = [];
      removeSlashCommands(["sban", "unsban"]);

      bannedIdSet.clear();
    },
    settings: Settings,
  };
})();
