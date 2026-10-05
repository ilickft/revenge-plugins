(function () {
  "use strict";

  var findByProps = vendetta.metro.findByProps;
  var instead     = vendetta.patcher.instead;

  var patches = [];

  function safeInstead(mod, prop, retVal) {
    if (mod && typeof mod[prop] === "function") {
      try {
        patches.push(
          instead(prop, mod, function () {
            return typeof retVal === "function" ? retVal.apply(this, arguments) : retVal;
          })
        );
      } catch (e) {}
    }
  }

  function patchAllByProp(prop, retVal) {
    try {
      if (typeof vendetta.metro.findByPropsAll === "function") {
        var all = vendetta.metro.findByPropsAll(prop);
        if (Array.isArray(all)) {
          for (var i = 0; i < all.length; i++) {
            safeInstead(all[i], prop, retVal);
          }
          return;
        }
      }
    } catch (e) {}

    var single = findByProps(prop);
    if (single) safeInstead(single, prop, retVal);
  }

  var originalRequirements = null;

  return {
    onLoad: function () {

      var trueProps = [
        "canUseHighVideoUploadQuality",
        "canStreamQuality",
        "canStreamHighQuality",
        "canStreamMidQuality",
        "canStreamHD",
        "canStream1080p",
        "canUseHighQualityStream",
        "canUsePremiumStreamQuality"
      ];

      for (var i = 0; i < trueProps.length; i++) {
        patchAllByProp(trueProps[i], true);
      }

      var falseProps = [
        "isPremiumResolution",
        "isPremiumFPS",
        "isPremiumRequirement"
      ];

      for (var j = 0; j < falseProps.length; j++) {
        patchAllByProp(falseProps[j], false);
      }

      try {
        var reqModule = findByProps("ApplicationStreamSettingRequirements");
        if (reqModule && Array.isArray(reqModule.ApplicationStreamSettingRequirements)) {
          var reqs = reqModule.ApplicationStreamSettingRequirements;
          originalRequirements = reqs.map(function (r) { return Object.assign({}, r); });
          for (var k = 0; k < reqs.length; k++) {
            if (reqs[k]) {
              delete reqs[k].guildPremiumTier;
              delete reqs[k].quality;
              delete reqs[k].userPremiumType;
            }
          }
        }
      } catch (e) {}
    },

    onUnload: function () {
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];

      try {
        if (originalRequirements) {
          var reqModule = findByProps("ApplicationStreamSettingRequirements");
          if (reqModule && Array.isArray(reqModule.ApplicationStreamSettingRequirements)) {
            for (var k = 0; k < originalRequirements.length; k++) {
              reqModule.ApplicationStreamSettingRequirements[k] = originalRequirements[k];
            }
          }
        }
      } catch (e) {}
      originalRequirements = null;
    }
  };
})();
