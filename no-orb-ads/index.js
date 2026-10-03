(function () {
  "use strict";

  var findByProps    = vendetta.metro.findByProps;
  var findByPropsAll = vendetta.metro.findByPropsAll;
  var after          = vendetta.patcher.after;
  var instead        = vendetta.patcher.instead;
  var React          = vendetta.metro.common.React;
  var storage        = vendetta.plugin.storage;

  var patches = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Storage init (non-destructive)
  // ─────────────────────────────────────────────────────────────────────────
  if (storage.muteOnly === undefined) storage.muteOnly = false;

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

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

  // Walk a React element tree and call cb(el) on each node.
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

  // Null out a React element in-place (keeps array slot, just renders nothing)
  function nullifyEl(el) {
    if (!el || typeof el !== "object") return;
    el.type = function () { return null; };
    el.props = {};
  }

  // Check if a string contains any quest/orb keyword
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

  // ─────────────────────────────────────────────────────────────────────────
  // Strategy 1: Patch Video component — mute or collapse quest videos
  // ─────────────────────────────────────────────────────────────────────────
  function patchVideo() {
    // React Native's Video component (expo-av or react-native-video)
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

  // ─────────────────────────────────────────────────────────────────────────
  // Strategy 2: Hide quest/orb banner from the channel list / home screen
  // Patches the component that renders the Quest Bar / Quest Banner at the top
  // of the screen.
  // ─────────────────────────────────────────────────────────────────────────
  function patchQuestBar() {
    // Common prop names seen in Discord's metro bundle for quest UI
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

  // ─────────────────────────────────────────────────────────────────────────
  // Strategy 3: Patch ActionSheet / channel render — strip quest nodes from
  // React tree by walking the subtree returned by any matching render fn.
  // This is a catch-all that handles future prop name changes.
  // ─────────────────────────────────────────────────────────────────────────
  function patchRenderFunctions() {
    // Any module exporting a "renderGuildHeader" or similar that can embed
    // Quest UI will be patched after-the-fact.
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

  // ─────────────────────────────────────────────────────────────────────────
  // Strategy 4: Patch API call that fetches Quest data — so Discord doesn't
  // even download the video. Return empty quest list.
  // ─────────────────────────────────────────────────────────────────────────
  function patchQuestAPI() {
    // Discord fetches quests via REST — we can intercept the HTTP layer
    try {
      var HttpUtils = findByProps("getAPIBaseURL", "put", "get", "post");
      if (HttpUtils && typeof HttpUtils.get === "function") {
        safeInstead(HttpUtils, "get", function (args) {
          var url = (args && args[0] && typeof args[0] === "string") ? args[0] : "";
          if (url.indexOf("/quests") !== -1 || url.indexOf("/promotions") !== -1) {
            // Return a resolved promise with an empty result
            return Promise.resolve({ body: { quests: [], promotions: [] } });
          }
          return HttpUtils.get.apply(this, args);
        });
      }
    } catch (e) {}

    // Also try the APIModule path used in some builds
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

  // ─────────────────────────────────────────────────────────────────────────
  // Strategy 5: Patch UserSettingsProtoStore / experiment flags that enable
  // the Orb/Quest UI so it never renders in the first place.
  // ─────────────────────────────────────────────────────────────────────────
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

    // ExperimentStore may gate the Orb/Quest feature behind an experiment
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

  // ─────────────────────────────────────────────────────────────────────────
  // Settings UI
  // ─────────────────────────────────────────────────────────────────────────
  function SettingsPage() {
    var React = vendetta.metro.common.React;
    var RN = vendetta.metro.common.ReactNative;
    var FormRow = findByProps("FormRow") && findByProps("FormRow").FormRow;
    var FormSection = findByProps("FormSection") && findByProps("FormSection").FormSection;
    var FormSwitch = findByProps("FormSwitch") && findByProps("FormSwitch").FormSwitch;

    var muteOnly = storage.muteOnly || false;
    var setMute = function (v) { storage.muteOnly = v; };

    if (!FormRow || !FormSection || !FormSwitch) {
      return React.createElement(RN.View, { style: { padding: 16 } },
        React.createElement(RN.Text, { style: { color: "#fff" } },
          "No Orb Ads is active.\n\nAll Quest/Orb video ads are blocked.\nRestart Discord if the bar is still visible."
        )
      );
    }

    return React.createElement(FormSection, { title: "No Orb Ads" },
      React.createElement(FormRow, {
        label: "Mute Only (keep video, no sound)",
        subLabel: "OFF = completely hide the ad video. ON = keep the video but mute it.",
        trailing: React.createElement(FormSwitch, {
          value: muteOnly,
          onValueChange: setMute
        })
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Plugin lifecycle
  // ─────────────────────────────────────────────────────────────────────────
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
