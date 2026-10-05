(function () {
  "use strict";

  var findByProps    = vendetta.metro.findByProps;
  var findByPropsAll = vendetta.metro.findByPropsAll;
  var after          = vendetta.patcher.after;
  var instead        = vendetta.patcher.instead;
  var React          = vendetta.metro.common.React;
  var storage        = vendetta.plugin.storage;

  var patches = [];

  if (storage.muteOnly === undefined) storage.muteOnly = false;

  function safeAfter(obj, prop, fn) {
    if (!obj || typeof obj[prop] !== "function") return;
    try { patches.push(after(prop, obj, fn)); } catch (e) {}
  }

  function safeInstead(obj, prop, fn) {
    if (!obj || typeof obj[prop] !== "function") return;
    try { patches.push(instead(prop, obj, fn)); } catch (e) {}
  }

  function patchAllByProp(prop, fn) {
    var all = [];
    try {
      if (typeof findByPropsAll === "function") all = findByPropsAll(prop) || [];
    } catch (e) {}
    if (all.length > 0) {
      for (var i = 0; i < all.length; i++) safeInstead(all[i], prop, fn);
    } else {
      var single = findByProps(prop);
      if (single) safeInstead(single, prop, fn);
    }
  }

  function walkTree(el, cb) {
    if (!el || typeof el !== "object") return;
    cb(el);
    var children = el.props && el.props.children;
    if (!children) return;
    if (Array.isArray(children)) {
      for (var i = 0; i < children.length; i++) walkTree(children[i], cb);
    } else {
      walkTree(children, cb);
    }
  }

  function nullifyEl(el) {
    if (!el || typeof el !== "object") return;
    el.type = function () { return null; };
    el.props = {};
  }

  var QUEST_KEYS = ["quest", "orb", "reward", "ad_video", "adVideo", "QuestVideo",
                    "questbar", "questBar", "claimquest", "claimQuest",
                    "adsVideo", "videoAd", "video_ad", "promoVideo", "watchAd"];
  function isQuestKey(str) {
    var s = (str || "").toLowerCase();
    for (var i = 0; i < QUEST_KEYS.length; i++) {
      if (s.indexOf(QUEST_KEYS[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }

  function patchVideo() {

    var VideoMod = findByProps("Video") || findByProps("useVideoPlayer");
    if (!VideoMod) return;

    var prop = VideoMod.Video ? "Video" : null;
    if (!prop) return;

    safeAfter(VideoMod, prop, function (args, result) {
      if (!result || !result.props) return;
      var src = result.props.source || result.props.src || "";
      var srcStr = typeof src === "string" ? src : (src && src.uri) || "";
      if (isQuestKey(srcStr) || isQuestKey(result.props["data-quest"])) {
        if (storage.muteOnly) {
          result.props.muted  = true;
          result.props.volume = 0;
        } else {
          result.props.style = Object.assign({}, result.props.style || {}, {
            width: 0, height: 0, opacity: 0, overflow: "hidden"
          });
          result.props.muted = true;
        }
      }
    });
  }

  function patchQuestBar() {

    var candidates = [
      ["QuestBar", "renderQuestBar"],
      ["QuestBanner", "renderQuestBanner"],
      ["QuestVideo", "renderQuestVideo"],
      ["QuestRewardBar"],
      ["renderQuestBar"],
      ["renderQuestBanner"],
      ["renderOrb"],
      ["OrbBar"],
      ["claimQuest", "questVideoUrl"],
      ["questVideoUrl"],
      ["questProgressBar"]
    ];

    for (var i = 0; i < candidates.length; i++) {
      (function (keys) {
        try {
          var mod = findByProps.apply(null, keys);
          if (!mod) return;
          keys.forEach(function (key) {
            if (typeof mod[key] === "function") {
              safeInstead(mod, key, function () { return null; });
            }
          });
        } catch (e) {}
      })(candidates[i]);
    }
  }

  function patchRenderFunctions() {

    var mods = [];
    try {
      if (typeof findByPropsAll === "function") {
        ["renderGuildHeader", "renderChannelList", "renderHomeHeader"].forEach(function (p) {
          var found = findByPropsAll(p);
          if (found) mods = mods.concat(found);
        });
      }
    } catch (e) {}

    mods.forEach(function (mod) {
      ["renderGuildHeader", "renderChannelList", "renderHomeHeader"].forEach(function (fn) {
        if (typeof mod[fn] !== "function") return;
        safeAfter(mod, fn, function (args, result) {
          if (!result) return;
          walkTree(result, function (node) {
            if (!node || !node.type) return;
            var typeName = (typeof node.type === "string" ? node.type :
                            node.type.displayName || node.type.name || "");
            if (isQuestKey(typeName)) nullifyEl(node);
          });
        });
      });
    });
  }

  function patchQuestAPI() {

    try {
      var HttpUtils = findByProps("getAPIBaseURL", "put", "get", "post");
      if (HttpUtils && typeof HttpUtils.get === "function") {
        safeInstead(HttpUtils, "get", function (args) {
          var url = (args && args[0] && typeof args[0] === "string") ? args[0] : "";
          if (url.indexOf("/quests") !== -1 || url.indexOf("/promotions") !== -1) {

            return Promise.resolve({ body: { quests: [], promotions: [] } });
          }
          return HttpUtils.get.apply(this, args);
        });
      }
    } catch (e) {}

    try {
      var APIMod = findByProps("getQuests", "fetchQuests");
      if (APIMod) {
        ["getQuests", "fetchQuests", "getActiveQuests"].forEach(function (fn) {
          if (typeof APIMod[fn] === "function") {
            safeInstead(APIMod, fn, function () {
              return Promise.resolve([]);
            });
          }
        });
      }
    } catch (e) {}
  }

  function patchQuestFlags() {
    var falseProps = [
      "isQuestEnabled",
      "showQuestBar",
      "canSeeQuests",
      "hasActiveQuest",
      "isOrbEnabled",
      "showOrbRewards"
    ];
    for (var i = 0; i < falseProps.length; i++) {
      patchAllByProp(falseProps[i], function () { return false; });
    }

    try {
      var ExperimentStore = vendetta.metro.findByStoreName("ExperimentStore");
      if (ExperimentStore && typeof ExperimentStore.getUserExperimentBucket === "function") {
        safeInstead(ExperimentStore, "getUserExperimentBucket", function (args, orig) {
          var expName = (args && args[0]) ? String(args[0]).toLowerCase() : "";
          if (expName.indexOf("quest") !== -1 || expName.indexOf("orb") !== -1) return 0;
          return orig.apply(this, args);
        });
      }
    } catch (e) {}
  }

  function SettingsPage() {
    var React = vendetta.metro.common.React;
    var RN = vendetta.metro.common.ReactNative;
    var Forms = (vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms) || findByProps("FormRow", "FormSection") || {};
    var FormRow = Forms.FormRow || Forms.TableRow;
    var FormSection = Forms.FormSection || Forms.TableSection;
    var FormSwitch = Forms.FormSwitch || Forms.FormSwitchRow;

    if (!React || !RN || !RN.ScrollView) return null;

    var forceUpdate = React.useReducer(function (x) { return x + 1; }, 0)[1];
    var muteOnly = storage.muteOnly || false;

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1 },
        contentContainerStyle: { paddingBottom: 40 }
      },
      React.createElement(
        FormSection,
        { title: "ORB & QUEST ADS" },
        React.createElement(FormRow, {
          label: "Mute Only Mode",
          subLabel: muteOnly ? "Video plays silently without audio" : "Video ads are blocked and collapsed completely",
          trailing: React.createElement(FormSwitch, {
            value: muteOnly,
            onValueChange: function (val) {
              storage.muteOnly = val;
              forceUpdate();
            }
          })
        }),
        React.createElement(FormRow, {
          label: "Bandwidth Saver",
          subLabel: "Active • Intercepts ad video downloads and hides promo banners"
        })
      )
    );
  }

  return {
    onLoad: function () {
      patchQuestFlags();
      patchQuestBar();
      patchVideo();
      patchRenderFunctions();
      patchQuestAPI();
    },

    onUnload: function () {
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];
    },

    settings: SettingsPage
  };
})();
