(function () {
  "use strict";

  var findByProps          = vendetta.metro.findByProps;
  var findByStoreName      = vendetta.metro.findByStoreName;
  var before               = vendetta.patcher.before;
  var after                = vendetta.patcher.after;
  var React                = vendetta.metro.common.React;
  var RN                   = vendetta.metro.common.ReactNative;
  var storage              = vendetta.plugin.storage;

  var MessageStore         = findByProps("getMessage", "getMessages");
  var SelectedChannelStore = findByStoreName("SelectedChannelStore") || findByProps("getChannelId");
  var PendingReplyStore    = findByProps("getPendingReply");
  var TokenModule          = findByProps("getToken");
  var ActionSheet          = findByProps("openLazy", "hideActionSheet");
  var Forms                = (vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms) || findByProps("FormRow", "FormSection") || {};
  var FormRow              = Forms && (Forms.FormRow || Forms.TableRow);
  var FormSection          = Forms && (Forms.FormSection || Forms.TableSection);
  var FormIcon             = Forms && (Forms.FormIcon || Forms.TableIcon);
  var FormSwitch           = Forms && (Forms.FormSwitch || Forms.FormSwitchRow);
  var FormDivider          = Forms && Forms.FormDivider;
  var getAssetIDByName     = (vendetta.ui && vendetta.ui.assets && vendetta.ui.assets.getAssetIDByName) || (findByProps("getAssetIDByName") && findByProps("getAssetIDByName").getAssetIDByName);
  var showToast            = (vendetta.ui && vendetta.ui.toasts && vendetta.ui.toasts.showToast) || (findByProps("showToast") && findByProps("showToast").showToast);

  var patches              = [];
  var unregisterCommands   = [];

  if (!Array.isArray(storage.saved)) {
    storage.saved = [];
  }

  function toast(msg, isError) {
    try {
      if (showToast) {
        var icon = getAssetIDByName ? (getAssetIDByName(isError ? "ic_close_16px" : "CheckmarkSmallIcon") || getAssetIDByName("ic_bookmark")) : null;
        showToast(msg, icon);
      }
    } catch (e) {}
  }

  function getAuthToken() {
    try {
      if (TokenModule && typeof TokenModule.getToken === "function") {
        var t = TokenModule.getToken();
        if (t) return t;
      }
    } catch (e) {}
    try {
      var auth = findByProps("getToken", "getFingerprint");
      if (auth && typeof auth.getToken === "function") {
        var t2 = auth.getToken();
        if (t2) return t2;
      }
    } catch (e) {}
    try {
      var rawStore = findByStoreName("AuthenticationStore");
      if (rawStore && typeof rawStore.getToken === "function") {
        var t3 = rawStore.getToken();
        if (t3) return t3;
      }
    } catch (e) {}
    return null;
  }

  function findInReactTree(tree, filter) {
    if (vendetta.utils && typeof vendetta.utils.findInReactTree === "function") {
      try {
        var found = vendetta.utils.findInReactTree(tree, filter);
        if (found) return found;
      } catch (e) {}
    }
    return (function search(node) {
      if (!node || typeof node !== "object") return null;
      try {
        if (filter(node)) return node;
      } catch (e) {}
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) {
          var res = search(node[i]);
          if (res) return res;
        }
      } else {
        var keys = Object.keys(node);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          if (key === "children" || key === "props" || key === "child" || key === "sibling") {
            var res2 = search(node[key]);
            if (res2) return res2;
          }
        }
      }
      return null;
    })(tree);
  }

  function inferMimeType(nameOrUrl) {
    if (!nameOrUrl || typeof nameOrUrl !== "string") return "";
    var clean = nameOrUrl.toLowerCase().split("?")[0];
    if (clean.endsWith(".mp3")) return "audio/mpeg";
    if (clean.endsWith(".ogg") || clean.endsWith(".opus")) return "audio/ogg";
    if (clean.endsWith(".wav")) return "audio/wav";
    if (clean.endsWith(".m4a")) return "audio/mp4";
    if (clean.endsWith(".flac")) return "audio/flac";
    if (clean.endsWith(".aac")) return "audio/aac";
    if (clean.endsWith(".weba")) return "audio/webm";
    if (clean.endsWith(".mp4")) return "video/mp4";
    if (clean.endsWith(".webm")) return "video/webm";
    if (clean.endsWith(".mov")) return "video/quicktime";
    if (clean.endsWith(".png")) return "image/png";
    if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
    if (clean.endsWith(".gif")) return "image/gif";
    if (clean.endsWith(".webp")) return "image/webp";
    return "";
  }

  function extractAttachments(rawMsg) {
    var attachments = [];
    if (!rawMsg) return attachments;

    var msg = (rawMsg && typeof rawMsg.toJS === "function") ? rawMsg.toJS() : rawMsg;

    var rawAtts = msg.attachments || msg._attachments || msg.attachments_;
    if (rawAtts && typeof rawAtts.toJS === "function") {
      try { rawAtts = rawAtts.toJS(); } catch (e) {}
    }

    var list = [];
    if (Array.isArray(rawAtts)) {
      list = rawAtts;
    } else if (rawAtts && typeof rawAtts.forEach === "function") {
      rawAtts.forEach(function (item) { list.push(item); });
    } else if (rawAtts && typeof rawAtts.toArray === "function") {
      try { list = rawAtts.toArray(); } catch (e) {}
    } else if (rawAtts && typeof rawAtts === "object") {
      var keys = Object.keys(rawAtts);
      for (var k = 0; k < keys.length; k++) {
        var val = rawAtts[keys[k]];
        if (val && (typeof val === "object" || typeof val === "string")) {
          list.push(val);
        }
      }
    }

    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a && typeof a.toJS === "function") {
        try { a = a.toJS(); } catch (e) {}
      }
      if (typeof a === "string" && (a.startsWith("http://") || a.startsWith("https://"))) {
        var inferred = inferMimeType(a);
        attachments.push({
          url: a,
          filename: a.split("/").pop().split("?")[0] || "attachment",
          content_type: inferred || "",
          size: 0,
          duration_secs: null,
          waveform: null,
          flags: 0,
        });
      } else if (a && typeof a === "object") {
        var url = a.url || a.proxy_url || a.proxyUrl || a.uri || a.src || (a.source && a.source.uri) || (a.file && a.file.url);
        if (url) {
          var fn = a.filename || a.name || (url.split("/").pop().split("?")[0]) || "attachment";
          var ct = a.content_type || a.contentType || a.mime_type || inferMimeType(fn) || inferMimeType(url) || "";
          attachments.push({
            url: url,
            filename: fn,
            content_type: ct,
            size: a.size || 0,
            duration_secs: a.duration_secs || a.durationSecs || a.duration || null,
            waveform: a.waveform || null,
            flags: a.flags || 0,
          });
        }
      }
    }

    var rawEmbeds = msg.embeds;
    if (rawEmbeds && typeof rawEmbeds.toJS === "function") {
      try { rawEmbeds = rawEmbeds.toJS(); } catch (e) {}
    }
    if (Array.isArray(rawEmbeds) && rawEmbeds.length > 0) {
      for (var eIdx = 0; eIdx < rawEmbeds.length; eIdx++) {
        var emb = rawEmbeds[eIdx];
        if (!emb) continue;
        if (typeof emb.toJS === "function") {
          try { emb = emb.toJS(); } catch (e) {}
        }
        var embAudioUrl = (emb.audio && (emb.audio.url || emb.audio.proxy_url)) ||
                          (emb.video && emb.type === "audio" && (emb.video.url || emb.video.proxy_url));
        if (embAudioUrl && !attachments.some(function (x) { return x.url === embAudioUrl; })) {
          var embFn = emb.title ? (emb.title.replace(/[^a-zA-Z0-9_\-\.]/g, "_") + ".mp3") : (embAudioUrl.split("/").pop().split("?")[0] || "audio.mp3");
          attachments.push({
            url: embAudioUrl,
            filename: embFn,
            content_type: inferMimeType(embFn) || "audio/mpeg",
            size: 0,
            duration_secs: (emb.audio && emb.audio.duration) || null,
            waveform: null,
            flags: 0,
            isEmbed: true,
          });
        } else if (emb.url) {
          var mime = inferMimeType(emb.url);
          if (mime.indexOf("audio/") === 0 && !attachments.some(function (x) { return x.url === emb.url; })) {
            var urlFn = emb.title ? (emb.title.replace(/[^a-zA-Z0-9_\-\.]/g, "_") + ".mp3") : (emb.url.split("/").pop().split("?")[0] || "song.mp3");
            attachments.push({
              url: emb.url,
              filename: urlFn,
              content_type: mime,
              size: 0,
              duration_secs: null,
              waveform: null,
              flags: 0,
              isEmbed: true,
            });
          }
        }
      }
    }

    if (typeof msg.content === "string" && msg.content) {
      var audioUrlRegex = /(https?:\/\/[^\s<>]+\.(?:mp3|wav|ogg|opus|m4a|flac|aac)(?:\?[^\s<>]*)?)/gi;
      var match;
      while ((match = audioUrlRegex.exec(msg.content)) !== null) {
        var matchUrl = match[1];
        if (!attachments.some(function (x) { return x.url === matchUrl; })) {
          var audioFn = matchUrl.split("/").pop().split("?")[0] || "audio.mp3";
          attachments.push({
            url: matchUrl,
            filename: audioFn,
            content_type: inferMimeType(audioFn) || "audio/mpeg",
            size: 0,
            duration_secs: null,
            waveform: null,
            flags: 0,
          });
        }
      }
    }

    var rawStickers = msg.sticker_items || msg.stickers;
    if (rawStickers && typeof rawStickers.toJS === "function") {
      try { rawStickers = rawStickers.toJS(); } catch (e) {}
    }
    if (Array.isArray(rawStickers) && rawStickers.length > 0) {
      for (var s = 0; s < rawStickers.length; s++) {
        var st = rawStickers[s];
        if (st && st.id) {
          var ext = (st.format_type === 4) ? "gif" : "png";
          attachments.push({
            url: "https://media.discordapp.net/stickers/" + st.id + "." + ext + "?size=160",
            filename: (st.name || "sticker") + "." + ext,
            content_type: "image/" + ext,
            size: 0,
            duration_secs: null,
            waveform: null,
            flags: 0,
          });
        }
      }
    }

    return attachments;
  }

  function isVoiceItem(item) {
    if (!item) return false;
    var att = item.attachments && item.attachments[0];
    if (!att) return Boolean(item.isVoice);
    var fn = (att.filename || att.url || "").toLowerCase().split("?")[0];
    if (fn.endsWith(".mp3") || fn.endsWith(".wav") || fn.endsWith(".m4a") || fn.endsWith(".flac") || fn.endsWith(".aac")) {
      return false;
    }
    if (att.waveform) return true;
    if (fn.indexOf("voice-message") !== -1) return true;
    if (item.isVoice && (fn.endsWith(".ogg") || fn.endsWith(".opus"))) return true;
    return false;
  }

  function isAudioItem(item) {
    if (!item || isVoiceItem(item)) return false;
    if (item.isAudio) return true;
    if (!item.attachments || !item.attachments.length) return false;
    return item.attachments.some(function (a) {
      if (!a) return false;
      var ct = (a.content_type || "").toLowerCase();
      if (ct.indexOf("audio/") === 0) return true;
      var fn = (a.filename || a.url || "").toLowerCase().split("?")[0];
      return fn.endsWith(".mp3") || fn.endsWith(".wav") || fn.endsWith(".ogg") ||
             fn.endsWith(".opus") || fn.endsWith(".m4a") || fn.endsWith(".flac") ||
             fn.endsWith(".aac") || fn.endsWith(".weba");
    });
  }

  function saveMessageObject(rawMsg, customName, fallbackChannelId) {
    if (!rawMsg) return null;

    var msg = (rawMsg && typeof rawMsg.toJS === "function") ? rawMsg.toJS() : rawMsg;
    var id = msg.id || String(Date.now());
    var chanId = msg.channel_id || msg.channelId || fallbackChannelId || getActiveChannelId();

    var attachments = extractAttachments(msg);

    if (attachments.length === 0 && id) {
      try {
        var stored = null;
        if (MessageStore && chanId && typeof MessageStore.getMessage === "function") {
          stored = MessageStore.getMessage(chanId, id);
        }
        if (!stored && MessageStore && typeof MessageStore.getMessage === "function") {
          stored = MessageStore.getMessage(id);
        }
        if (!stored && chanId) {
          var cm = findByProps("_channelMessages");
          if (cm) {
            var chan = cm.get ? cm.get(chanId) : (cm._channelMessages && cm._channelMessages[chanId]);
            stored = chan && (chan.get ? chan.get(id) : (chan._array && chan._array.find(function (x) { return x.id === id; })));
          }
        }
        if (stored) {
          var storedMsg = (typeof stored.toJS === "function") ? stored.toJS() : stored;
          var storedAtts = extractAttachments(storedMsg);
          if (storedAtts.length > 0) {
            attachments = storedAtts;
          }
          if (!msg.content && storedMsg.content) msg.content = storedMsg.content;
          if (!msg.author && storedMsg.author) msg.author = storedMsg.author;
          if (!msg.flags && storedMsg.flags) msg.flags = storedMsg.flags;
        }
      } catch (e) {}
    }

    var content = typeof msg.content === "string" ? msg.content : "";
    var firstAtt = attachments[0];
    var firstAttFn = (firstAtt && (firstAtt.filename || firstAtt.url || "")).toLowerCase().split("?")[0];

    var isVoice = Boolean(
      (msg.flags && (msg.flags & 8192)) ||
      (firstAtt && firstAtt.waveform) ||
      (firstAtt && firstAttFn.indexOf("voice-message") !== -1)
    );

    var isAudio = !isVoice && attachments.some(function (a) {
      if (!a) return false;
      var ct = (a.content_type || "").toLowerCase();
      if (ct.indexOf("audio/") === 0) return true;
      var fn = (a.filename || a.url || "").toLowerCase().split("?")[0];
      return fn.endsWith(".mp3") || fn.endsWith(".wav") || fn.endsWith(".ogg") ||
             fn.endsWith(".opus") || fn.endsWith(".m4a") || fn.endsWith(".flac") ||
             fn.endsWith(".aac") || fn.endsWith(".weba");
    });

    var author = msg.author || {};
    var authorName = author.global_name || author.username || "Unknown";
    if (author.discriminator && author.discriminator !== "0") {
      authorName += "#" + author.discriminator;
    }

    var defaultName;
    if (isVoice) {
      var dur = firstAtt && firstAtt.duration_secs;
      defaultName = dur ? "Voice Message (" + Math.round(dur) + "s)" : "Voice Message";
    } else if (isAudio) {
      var audioAtt = attachments.find(function (a) {
        if (!a) return false;
        var ct = (a.content_type || "").toLowerCase();
        var fn = (a.filename || a.url || "").toLowerCase().split("?")[0];
        return ct.indexOf("audio/") === 0 || fn.endsWith(".mp3") || fn.endsWith(".wav") ||
               fn.endsWith(".ogg") || fn.endsWith(".opus") || fn.endsWith(".m4a") ||
               fn.endsWith(".flac") || fn.endsWith(".aac");
      }) || firstAtt;
      var audioFn = (audioAtt && audioAtt.filename) || "Audio Song";
      defaultName = audioFn.replace(/[\n\r]+/g, " ").trim();
    } else if (content) {
      defaultName = content.slice(0, 30).replace(/[\n\r]+/g, " ").trim();
    } else if (firstAtt && firstAtt.filename) {
      defaultName = firstAtt.filename;
    } else {
      defaultName = "Message " + id.slice(-4);
    }

    var name = (customName && customName.trim()) ? customName.trim() : defaultName;

    var item = {
      id: id,
      name: name,
      content: content,
      attachments: attachments,
      authorName: authorName,
      authorId: author.id || "",
      isVoice: isVoice,
      isAudio: isAudio,
      savedAt: Date.now(),
    };

    if (!Array.isArray(storage.saved)) storage.saved = [];

    var trimmedName = (customName && customName.trim().toLowerCase()) || null;
    var existingIndex = storage.saved.findIndex(function (x) {
      if (trimmedName) {
        return x.name && x.name.toLowerCase() === trimmedName;
      }
      return x.id === id && (!x.name || x.name === defaultName);
    });

    if (existingIndex !== -1) {
      storage.saved[existingIndex] = item;
    } else {
      storage.saved.unshift(item);
    }

    return item;
  }

  function formatMessageToSend(item) {
    if (!item) return "";
    var parts = [];
    if (item.content && item.content.trim()) {
      parts.push(item.content.trim());
    }
    if (Array.isArray(item.attachments)) {
      for (var i = 0; i < item.attachments.length; i++) {
        var att = item.attachments[i];
        var url = typeof att === "string" ? att : (att && att.url);
        if (url && parts.indexOf(url) === -1) {
          parts.push(url);
        }
      }
    }
    return parts.join("\n");
  }

  function refreshAttachmentUrl(url, token) {
    if (!token || !url) return Promise.resolve(url);
    if (url.indexOf("cdn.discordapp.com") === -1 && url.indexOf("media.discordapp.net") === -1) {
      return Promise.resolve(url);
    }
    return fetch("https://discord.com/api/v9/attachments/refresh-urls", {
      method: "POST",
      headers: {
        "Authorization": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ attachment_urls: [url] })
    }).then(function (res) {
      if (!res.ok) return url;
      return res.json().then(function (data) {
        if (data && Array.isArray(data.refreshed_urls) && data.refreshed_urls[0] && data.refreshed_urls[0].refreshed) {
          return data.refreshed_urls[0].refreshed;
        }
        return url;
      }).catch(function () { return url; });
    }).catch(function () { return url; });
  }

  function fetchAttachmentBlob(att, token) {
    var rawUrl = typeof att === "string" ? att : (att && att.url);
    if (!rawUrl) return Promise.reject(new Error("Attachment has no URL"));

    function tryFetch(urlToFetch) {
      return fetch(urlToFetch).then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status + " fetching attachment");
        }
        if (typeof res.blob === "function") {
          return res.blob().catch(function () {
            if (typeof res.arrayBuffer === "function") {
              return res.arrayBuffer().then(function (buf) {
                var mime = (att && att.content_type) || inferMimeType(att && att.filename) || "application/octet-stream";
                return new Blob([buf], { type: mime });
              });
            }
            throw new Error("Cannot parse blob from response");
          });
        }
        if (typeof res.arrayBuffer === "function") {
          return res.arrayBuffer().then(function (buf) {
            var mime = (att && att.content_type) || inferMimeType(att && att.filename) || "application/octet-stream";
            return new Blob([buf], { type: mime });
          });
        }
        throw new Error("Fetch response does not support blob or arrayBuffer");
      });
    }

    return tryFetch(rawUrl).catch(function (err) {
      return refreshAttachmentUrl(rawUrl, token).then(function (refreshed) {
        if (refreshed && refreshed !== rawUrl) {
          return tryFetch(refreshed);
        }
        throw err;
      });
    });
  }

  function uploadAttachmentToDiscord(channelId, att, token, slotId) {
    var idStr = String(slotId || 0);
    return fetchAttachmentBlob(att, token).then(function (blob) {
      var filename = (att && att.filename) || (att && att.url && att.url.split("/").pop().split("?")[0]) || ("file_" + idStr);
      var fileSize = (blob && blob.size) || (att && att.size) || 1024;
      var mimeType = (blob && blob.type) || (att && att.content_type) || inferMimeType(filename) || "application/octet-stream";

      return fetch("https://discord.com/api/v9/channels/" + channelId + "/attachments", {
        method: "POST",
        headers: {
          "Authorization": token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          files: [
            {
              id: idStr,
              filename: filename,
              file_size: fileSize
            }
          ]
        })
      }).then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (errData) {
            var msg = (errData && errData.message) || ("HTTP " + res.status + " requesting upload URL");
            throw new Error(msg);
          });
        }
        return res.json();
      }).then(function (data) {
        var uploadItem = data && data.attachments && data.attachments[0];
        if (!uploadItem || !uploadItem.upload_url || !uploadItem.upload_filename) {
          throw new Error("Discord did not return upload_url");
        }

        return fetch(uploadItem.upload_url, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType
          },
          body: blob
        }).then(function (putRes) {
          if (!putRes.ok) {
            throw new Error("HTTP " + putRes.status + " uploading binary to storage");
          }
          return {
            id: idStr,
            filename: filename,
            uploaded_filename: uploadItem.upload_filename,
            duration_secs: att && att.duration_secs,
            waveform: att && att.waveform
          };
        });
      });
    });
  }

  function sendMessageToChannel(channelId, itemOrContent) {
    if (!channelId || !itemOrContent) return Promise.reject(new Error("Missing channel or content"));

    var token = getAuthToken();
    var item = (typeof itemOrContent === "object") ? itemOrContent : null;
    var rawText = (typeof itemOrContent === "string") ? itemOrContent : (item ? (item.content || "") : "");

    if (!item || !Array.isArray(item.attachments) || item.attachments.length === 0) {
      var contentToSend = rawText || (item ? formatMessageToSend(item) : "");
      if (!contentToSend) return Promise.reject(new Error("No content to send"));

      if (token) {
        return fetch("https://discord.com/api/v9/channels/" + channelId + "/messages", {
          method: "POST",
          headers: {
            "Authorization": token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ content: contentToSend })
        }).then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () { return {}; }).then(function (data) {
              var errMsg = (data && (data.message || (data.content && data.content[0]))) || ("Discord HTTP " + res.status);
              throw new Error(errMsg);
            });
          }
          return res.json().catch(function () { return {}; });
        });
      }

      try {
        var Messages = findByProps("sendMessage", "editMessage");
        if (Messages && typeof Messages.sendMessage === "function") {
          var res2 = Messages.sendMessage(channelId, { content: contentToSend });
          if (res2 && typeof res2.then === "function") return res2;
          return Promise.resolve();
        }
      } catch (e) {
        return Promise.reject(e);
      }
      return Promise.reject(new Error("No auth token available"));
    }

    if (!token) {
      return sendMessageToChannel(channelId, formatMessageToSend(item));
    }

    var isVoice = isVoiceItem(item);

    if (isVoice) {
      var voiceAtt = item.attachments[0];
      return uploadAttachmentToDiscord(channelId, voiceAtt, token, 0).then(function (uploaded) {
        var payload = {
          flags: 8192,
          attachments: [
            {
              id: "0",
              filename: uploaded.filename || "voice-message.ogg",
              uploaded_filename: uploaded.uploaded_filename,
              duration_secs: Number(voiceAtt.duration_secs) || 5,
              waveform: voiceAtt.waveform || "AAAAAAAA"
            }
          ]
        };

        return fetch("https://discord.com/api/v9/channels/" + channelId + "/messages", {
          method: "POST",
          headers: {
            "Authorization": token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }).then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () { return {}; }).then(function (data) {
              var errMsg = (data && (data.message || (data.content && data.content[0]))) || ("Discord HTTP " + res.status);
              throw new Error(errMsg);
            });
          }
          return res.json().catch(function () { return {}; });
        });
      }).catch(function (uploadErr) {
        console.warn("[MessageSaver] Voice upload failed, falling back to text:", uploadErr);
        return sendMessageToChannel(channelId, formatMessageToSend(item));
      });
    }

    var uploadPromises = [];
    for (var i = 0; i < Math.min(item.attachments.length, 10); i++) {
      (function (att, idx) {
        uploadPromises.push(
          uploadAttachmentToDiscord(channelId, att, token, idx).catch(function (e) {
            console.warn("[MessageSaver] Attachment " + idx + " upload failed:", e);
            return null;
          })
        );
      })(item.attachments[i], i);
    }

    return Promise.all(uploadPromises).then(function (results) {
      var successfulUploads = [];
      var failedUrls = [];

      for (var j = 0; j < results.length; j++) {
        if (results[j]) {
          successfulUploads.push({
            id: String(successfulUploads.length),
            filename: results[j].filename,
            uploaded_filename: results[j].uploaded_filename
          });
        } else {
          var failedAtt = item.attachments[j];
          var u = typeof failedAtt === "string" ? failedAtt : (failedAtt && failedAtt.url);
          if (u) failedUrls.push(u);
        }
      }

      if (successfulUploads.length === 0) {
        return sendMessageToChannel(channelId, formatMessageToSend(item));
      }

      var textParts = [];
      if (item.content && item.content.trim()) textParts.push(item.content.trim());
      for (var f = 0; f < failedUrls.length; f++) textParts.push(failedUrls[f]);

      var payload = {
        content: textParts.join("\n"),
        attachments: successfulUploads
      };

      return fetch("https://discord.com/api/v9/channels/" + channelId + "/messages", {
        method: "POST",
        headers: {
          "Authorization": token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            var errMsg = (data && (data.message || (data.content && data.content[0]))) || ("Discord HTTP " + res.status);
            throw new Error(errMsg);
          });
        }
        return res.json().catch(function () { return {}; });
      });
    });
  }

  function getActiveChannelId() {
    try {
      if (SelectedChannelStore && typeof SelectedChannelStore.getChannelId === "function") {
        var id = SelectedChannelStore.getChannelId();
        if (id) return id;
      }
    } catch (e) {}
    try {
      if (SelectedChannelStore && typeof SelectedChannelStore.getCurrentlySelectedChannelId === "function") {
        var id2 = SelectedChannelStore.getCurrentlySelectedChannelId();
        if (id2) return id2;
      }
    } catch (e) {}
    return null;
  }

  function resolvePendingReplyMessage(channelId) {
    try {
      var pending = (PendingReplyStore && PendingReplyStore.getPendingReply(channelId)) ||
                    (PendingReplyStore && PendingReplyStore.getPendingReply());
      if (!pending) return null;

      var msg = pending.message || pending.reply || pending;
      var msgId = pending.messageId || pending.message_id || (msg && msg.id);
      var chanId = pending.channelId || pending.channel_id || channelId;

      if (msgId && chanId && MessageStore) {
        var m = (MessageStore.getMessage.length >= 2 ? MessageStore.getMessage(chanId, msgId) : MessageStore.getMessage(msgId)) ||
                MessageStore.getMessage(chanId, msgId) || MessageStore.getMessage(msgId);
        if (m) return m.toJS ? m.toJS() : m;
      }
      if (!m && chanId && msgId) {
        var cm = findByProps("_channelMessages");
        if (cm) {
          var chan = cm.get ? cm.get(chanId) : (cm._channelMessages && cm._channelMessages[chanId]);
          m = chan && (chan.get ? chan.get(msgId) : (chan._array && chan._array.find(function (x) { return x.id === msgId; })));
          if (m) return m.toJS ? m.toJS() : m;
        }
      }

      if (msg) return msg.toJS ? msg.toJS() : msg;
    } catch (e) {}
    return null;
  }

  function getCommandOption(args, name) {
    if (!args) return undefined;
    if (Array.isArray(args)) {
      if (name) {
        for (var i = 0; i < args.length; i++) {
          var a = args[i];
          if (a && typeof a === "object" && a.name === name) {
            return (a.value !== undefined && a.value !== null) ? String(a.value).trim() : undefined;
          }
        }
      }
      if (args[0] !== undefined && args[0] !== null) {
        if (typeof args[0] === "object") {
          if (args[0].value !== undefined && args[0].value !== null) {
            return String(args[0].value).trim();
          }
        } else {
          return String(args[0]).trim();
        }
      }
    } else if (typeof args === "object") {
      if (name && args[name] !== undefined && args[name] !== null) {
        var v = args[name];
        return (typeof v === "object" && v && v.value !== undefined) ? String(v.value).trim() : String(v).trim();
      }
      if (args.value !== undefined && args.value !== null) {
        return String(args.value).trim();
      }
    } else if (typeof args === "string" && args.trim()) {
      return args.trim();
    }
    return undefined;
  }

  function resolveMessageFromProps(sheetProps) {
    if (!sheetProps) return null;
    if (sheetProps.message && (sheetProps.message.id || sheetProps.message.content !== undefined || sheetProps.message.attachments)) {
      return sheetProps.message;
    }
    if (sheetProps.targetMessage) return sheetProps.targetMessage;
    if (sheetProps.item) {
      if (sheetProps.item.message) return sheetProps.item.message;
      if (sheetProps.item.id && (sheetProps.item.content !== undefined || sheetProps.item.attachments)) return sheetProps.item;
    }
    var chanId = sheetProps.channelId || (sheetProps.channel && sheetProps.channel.id) ||
                 (sheetProps.attachment && (sheetProps.attachment.channel_id || sheetProps.attachment.channelId)) ||
                 getActiveChannelId();
    var msgId = sheetProps.messageId || sheetProps.message_id ||
                (sheetProps.attachment && (sheetProps.attachment.message_id || sheetProps.attachment.messageId));
    if (msgId && chanId && MessageStore) {
      var stored = null;
      try {
        stored = (MessageStore.getMessage.length >= 2 ? MessageStore.getMessage(chanId, msgId) : MessageStore.getMessage(msgId)) ||
                 MessageStore.getMessage(chanId, msgId) || MessageStore.getMessage(msgId);
      } catch (e) {}
      if (!stored && chanId) {
        try {
          var cm = findByProps("_channelMessages");
          if (cm) {
            var chan = cm.get ? cm.get(chanId) : (cm._channelMessages && cm._channelMessages[chanId]);
            stored = chan && (chan.get ? chan.get(msgId) : (chan._array && chan._array.find(function (x) { return x.id === msgId; })));
          }
        } catch (e) {}
      }
      if (stored) return stored;
    }
    if (sheetProps.attachment) {
      return {
        id: sheetProps.attachment.id || String(Date.now()),
        channel_id: chanId,
        content: "",
        attachments: [sheetProps.attachment],
        author: sheetProps.attachment.author || {}
      };
    }
    return null;
  }

  function patchActionSheet() {
    if (!ActionSheet || typeof ActionSheet.openLazy !== "function") return;

    patches.push(
      before("openLazy", ActionSheet, function (args) {
        var componentPromise = args[0];
        var key = args[1];
        var sheetProps = args[2];

        if (!componentPromise || typeof componentPromise.then !== "function") return;

        var isRelevantKey = !key || typeof key !== "string" ||
          key.indexOf("Message") !== -1 ||
          key.indexOf("Attachment") !== -1 ||
          key.indexOf("Media") !== -1 ||
          key.indexOf("Audio") !== -1 ||
          key.indexOf("Action") !== -1 ||
          key.indexOf("File") !== -1;

        if (!isRelevantKey) return;

        var targetMsg = resolveMessageFromProps(sheetProps);
        if (!targetMsg) return;

        componentPromise.then(function (module) {
          if (!module) return;
          var unpatchSheet = after("default", module, function (sheetArgs, sheetResult) {
            if (React && React.useEffect) {
              React.useEffect(function () {
                return function () { unpatchSheet(); };
              }, []);
            }

            var buttonRows = findInReactTree(sheetResult, function (node) {
              return (
                Array.isArray(node) && node.length > 0 &&
                node.some(function (item) {
                  return item && item.props && (item.props.label !== undefined || item.props.title !== undefined);
                })
              );
            });

            if (!buttonRows) return;

            for (var i = 0; i < buttonRows.length; i++) {
              var p = buttonRows[i] && buttonRows[i].props;
              if (p && (p.label === "Save Message" || p.title === "Save Message")) {
                return;
              }
            }

            var RowComponent = FormRow || (findByProps("ActionSheetRow") && findByProps("ActionSheetRow").ActionSheetRow);
            if (!RowComponent) return;

            var saveIcon = getAssetIDByName ? (getAssetIDByName("ic_bookmark") || getAssetIDByName("BookmarkIcon") || getAssetIDByName("ic_download") || getAssetIDByName("ic_message_copy")) : null;

            var chanId = (sheetProps && sheetProps.channel && sheetProps.channel.id) ||
                         (targetMsg && (targetMsg.channel_id || targetMsg.channelId)) ||
                         getActiveChannelId();

            var elementProps = {
              key: "save-message-item-" + (targetMsg.id || "audio"),
              label: "Save Message",
              title: "Save Message",
              onPress: function () {
                if (ActionSheet.hideActionSheet) ActionSheet.hideActionSheet();
                var saved = saveMessageObject(targetMsg, null, chanId);
                if (saved) {
                  toast("Saved: " + saved.name);
                } else {
                  toast("Failed to save message", true);
                }
              },
            };

            if (FormIcon && saveIcon) {
              elementProps.leading = React.createElement(FormIcon, {
                style: { opacity: 1 },
                source: saveIcon,
              });
            }

            buttonRows.push(React.createElement(RowComponent, elementProps));
          });
        });
      })
    );
  }

  function registerSlashCommands() {
    if (!vendetta.commands || typeof vendetta.commands.registerCommand !== "function") return;

    function cleanCommands(names) {
      if (vendetta.commands && Array.isArray(vendetta.commands.commands)) {
        for (var i = vendetta.commands.commands.length - 1; i >= 0; i--) {
          var cmd = vendetta.commands.commands[i];
          if (cmd && names.indexOf(cmd.name) !== -1) {
            vendetta.commands.commands.splice(i, 1);
          }
        }
      }
    }

    cleanCommands(["save", "resend", "saved-list"]);

    unregisterCommands.push(
      vendetta.commands.registerCommand({
        name: "save",
        displayName: "save",
        description: "Save a replied message (or specify a name) to resend later",
        displayDescription: "Save a replied message to resend later",
        applicationId: "-1",
        type: 1,
        inputType: 1,
        options: [
          {
            name: "name",
            displayName: "name",
            description: "Custom name or tag for this saved message",
            displayDescription: "Custom name or tag for this saved message",
            type: 3,
            required: false,
          }
        ],
        execute: function (args, ctx) {
          var chanId = (ctx && ctx.channel && ctx.channel.id) || getActiveChannelId();
          var customName = getCommandOption(args, "name");

          var target = resolvePendingReplyMessage(chanId);
          if (!target && MessageStore && chanId) {
            var msgs = MessageStore.getMessages(chanId);
            var arr = msgs && (msgs._array || msgs);
            if (Array.isArray(arr) && arr.length > 0) {
              target = arr[arr.length - 1];
            }
          }

          if (!target) {
            toast("No message to save. Reply to a message and run /save!", true);
            return;
          }

          var saved = saveMessageObject(target, customName, chanId);
          if (saved) {
            toast("Saved: " + saved.name);
          } else {
            toast("Failed to save message", true);
          }
        }
      })
    );

    unregisterCommands.push(
      vendetta.commands.registerCommand({
        name: "resend",
        displayName: "resend",
        description: "Resend a saved message (with text & attachments) as it was",
        displayDescription: "Resend a saved message as it was",
        applicationId: "-1",
        type: 1,
        inputType: 1,
        options: [
          {
            name: "name",
            displayName: "name",
            description: "Name of the saved message to send (defaults to newest)",
            displayDescription: "Name of the saved message to send",
            type: 3,
            required: false,
          }
        ],
        execute: function (args, ctx) {
          var chanId = (ctx && ctx.channel && ctx.channel.id) || getActiveChannelId();
          if (!chanId) {
            toast("Could not detect active channel", true);
            return;
          }

          var list = storage.saved || [];
          if (!list.length) {
            toast("No saved messages found! Long press any message to save one.", true);
            return;
          }

          var query = getCommandOption(args, "name");
          var targetItem = null;

          if (query && query.trim()) {
            var q = query.trim().toLowerCase();

            targetItem = list.find(function (x) {
              return x && x.name && x.name.toLowerCase() === q;
            });

            if (!targetItem) {
              targetItem = list.find(function (x) {
                return x && x.name && x.name.toLowerCase().startsWith(q);
              });
            }

            if (!targetItem) {
              targetItem = list.find(function (x) {
                return x && x.name && x.name.toLowerCase().indexOf(q) !== -1;
              });
            }

            if (!targetItem) {
              toast('No saved message found matching "' + query.trim() + '"', true);
              return;
            }
          } else {

            targetItem = list[0];
          }

          sendMessageToChannel(chanId, targetItem).then(function () {
            toast("Resent \"" + targetItem.name + "\"");
          }).catch(function (err) {
            toast("Failed to send: " + err.message, true);
          });
        }
      })
    );

    unregisterCommands.push(
      vendetta.commands.registerCommand({
        name: "saved-list",
        displayName: "saved-list",
        description: "List all your saved messages and their attachments",
        displayDescription: "List all your saved messages",
        applicationId: "-1",
        type: 1,
        inputType: 1,
        options: [],
        execute: function () {
          var list = storage.saved || [];
          if (!list.length) {
            toast("No saved messages yet! Long press any message to save.", false);
            return;
          }

          var lines = ["**Saved Messages (" + list.length + "):**"];
          for (var i = 0; i < Math.min(list.length, 10); i++) {
            var item = list[i];
            var attCount = (item.attachments && item.attachments.length) || 0;
            var voice = isVoiceItem(item);
            var audio = isAudioItem(item);
            var attBadge = voice ? " [Voice]" : (audio ? " [Audio/Song]" : (attCount ? " [" + attCount + " attachment" + (attCount > 1 ? "s" : "") + "]" : ""));
            lines.push((i + 1) + ". **" + item.name + "**" + attBadge + " *(by " + item.authorName + ")*");
          }
          if (list.length > 10) {
            lines.push("*...and " + (list.length - 10) + " more (view in Settings)*");
          }

          toast(lines.slice(0, 4).join("\n"));
        }
      })
    );
  }

  function Settings() {
    var forceUpdate = React.useReducer(function (x) { return x + 1; }, 0)[1];
    var list = storage.saved || [];
    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;

    function handleDelete(idx) {
      storage.saved.splice(idx, 1);
      forceUpdate();
      toast("Message deleted");
    }

    function handleSend(item) {
      var chanId = getActiveChannelId();
      if (!chanId) {
        toast("Open a channel first, or use /resend", true);
        return;
      }
      sendMessageToChannel(chanId, item).then(function () {
        toast("Sent to current channel!");
      }).catch(function (err) {
        toast("Send failed: " + err.message, true);
      });
    }

    function handleCopy(item) {
      try {
        var clip = vendetta.metro.common.clipboard;
        if (clip && typeof clip.setString === "function") {
          clip.setString(formatMessageToSend(item));
          toast("Copied to clipboard!");
        }
      } catch (e) {}
    }

    function handleClearAll() {
      storage.saved = [];
      forceUpdate();
      toast("All saved messages cleared");
    }

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1 },
        contentContainerStyle: { paddingBottom: 40 },
      },
      React.createElement(
        FormSection,
        { title: "SAVED MESSAGES (" + list.length + ")" },
        list.length > 0 && React.createElement(FormRow, {
          label: "Clear All Saved Messages",
          subLabel: "Permanently delete all " + list.length + " saved message(s)",
          onPress: handleClearAll
        }),
        list.length === 0
          ? React.createElement(FormRow, {
              label: "No saved messages yet",
              subLabel: "Long-press any message in chat and tap 'Save Message' or use /save"
            })
          : list.map(function (item, idx) {
              var attCount = (item.attachments && item.attachments.length) || 0;
              var voice = isVoiceItem(item);
              var audio = isAudioItem(item);
              var details = "By " + item.authorName + " • " + new Date(item.savedAt).toLocaleDateString();
              if (voice) details += " • Voice Msg";
              else if (audio) details += " • Audio Track";
              else if (attCount > 0) details += " • " + attCount + " file(s)";

              return React.createElement(
                FormRow,
                {
                  key: item.id + "_" + idx,
                  label: item.name || "Saved Message",
                  subLabel: (item.content ? (item.content.slice(0, 90) + (item.content.length > 90 ? "..." : "") + "\n") : "") + details,
                  trailing: React.createElement(
                    RN.View,
                    { style: { flexDirection: "row", alignItems: "center" } },
                    React.createElement(
                      Btn,
                      {
                        onPress: function () { handleSend(item); },
                        style: { backgroundColor: "#5865f2", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginRight: 6 }
                      },
                      React.createElement(RN.Text, { style: { color: "#ffffff", fontSize: 12, fontWeight: "600" } }, "Send")
                    ),
                    React.createElement(
                      Btn,
                      {
                        onPress: function () { handleCopy(item); },
                        style: { backgroundColor: "rgba(128, 128, 128, 0.2)", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, marginRight: 6 }
                      },
                      React.createElement(RN.Text, { style: { color: "inherit", fontSize: 12, fontWeight: "600" } }, "Copy")
                    ),
                    React.createElement(
                      Btn,
                      {
                        onPress: function () { handleDelete(idx); },
                        style: { backgroundColor: "rgba(218, 55, 60, 0.15)", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 }
                      },
                      React.createElement(RN.Text, { style: { color: "#da373c", fontSize: 12, fontWeight: "600" } }, "Delete")
                    )
                  )
                }
              );
            })
      ),

      React.createElement(
        FormSection,
        { title: "HOW TO USE" },
        React.createElement(FormRow, {
          label: "Save Any Message",
          subLabel: "Long-press any message in chat and tap 'Save Message', or run /save"
        }),
        React.createElement(FormRow, {
          label: "Resend to Chat",
          subLabel: "Tap 'Send' above or type /resend in any channel"
        })
      )
    );
  }

  return {
    onLoad: function () {
      patchActionSheet();
      registerSlashCommands();
    },
    onUnload: function () {
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];

      for (var j = 0; j < unregisterCommands.length; j++) {
        try { unregisterCommands[j](); } catch (e) {}
      }
      unregisterCommands = [];
    },
    settings: Settings,
  };
})();
