(function () {
  "use strict";

  var findByProps     = vendetta.metro.findByProps;
  var findByPropsAll  = vendetta.metro.findByPropsAll;
  var findByStoreName = vendetta.metro.findByStoreName;
  var instead         = vendetta.patcher.instead;
  var after           = vendetta.patcher.after;

  var patches = [];
  var restoredIdMods = [];

  // Helper to safely strip isPremium from an icon object (handles Object.freeze safely)
  function makeIconFree(icon) {
    if (!icon || typeof icon !== "object") return icon;
    try {
      icon.isPremium = false;
    } catch (e) {
      try {
        return Object.assign({}, icon, { isPremium: false });
      } catch (err) {}
    }
    return icon;
  }

  function safeInstead(mod, prop, retVal) {
    if (!mod || typeof mod[prop] !== "function") return;
    try {
      patches.push(
        instead(prop, mod, function () {
          return typeof retVal === "function" ? retVal.apply(this, arguments) : retVal;
        })
      );
    } catch (e) {}
  }

  function patchAllByProp(prop, retVal) {
    var all = [];
    try {
      if (typeof findByPropsAll === "function") {
        all = findByPropsAll(prop) || [];
      }
    } catch (e) {}

    if (all.length > 0) {
      for (var i = 0; i < all.length; i++) {
        safeInstead(all[i], prop, retVal);
      }
    } else {
      var single = findByProps(prop);
      if (single) safeInstead(single, prop, retVal);
    }
  }

  return {
    onLoad: function () {
      // ── 1. The Core: Unlock all official icons and freemium IDs ─────────────
      // Discord mobile uses `getOfficialAlternateIcons`, `getIcons`, `getIconById`
      // and checks if selected icons are in `FreemiumAppIconIds`.
      try {
        var iconMods = [];
        try {
          if (typeof findByPropsAll === "function") {
            iconMods = findByPropsAll("getOfficialAlternateIcons") || [];
          }
        } catch (e) {}
        if (iconMods.length === 0) {
          var singleIconMod = findByProps("getOfficialAlternateIcons");
          if (singleIconMod) iconMods.push(singleIconMod);
        }

        for (var m = 0; m < iconMods.length; m++) {
          var icons = iconMods[m];
          if (!icons) continue;

          var altIcons = typeof icons.getOfficialAlternateIcons === "function" ? icons.getOfficialAlternateIcons() : [];
          var mainIcons = typeof icons.getIcons === "function" ? icons.getIcons() : [];

          if (Array.isArray(altIcons)) {
            altIcons.forEach(makeIconFree);
          }
          if (Array.isArray(mainIcons)) {
            mainIcons.forEach(makeIconFree);
          }

          if (typeof icons.getIcons === "function") {
            patches.push(
              instead("getIcons", icons, function () {
                if (Array.isArray(mainIcons)) {
                  return mainIcons.map(makeIconFree);
                }
                return mainIcons;
              })
            );
          }

          if (typeof icons.getOfficialAlternateIcons === "function") {
            patches.push(
              instead("getOfficialAlternateIcons", icons, function () {
                if (Array.isArray(altIcons)) {
                  return altIcons.map(makeIconFree);
                }
                return altIcons;
              })
            );
          }

          if (typeof icons.getIconById === "function") {
            patches.push(
              after("getIconById", icons, function (args, ret) {
                return makeIconFree(ret);
              })
            );
          }
        }
      } catch (e) {}

      // ── 2. Allow selecting all icons (FreemiumAppIconIds = MasterAppIconIds) ──
      try {
        var idMods = [];
        try {
          if (typeof findByPropsAll === "function") {
            idMods = findByPropsAll("FreemiumAppIconIds") || [];
          }
        } catch (e) {}
        if (idMods.length === 0) {
          var singleIdMod = findByProps("FreemiumAppIconIds");
          if (singleIdMod) idMods.push(singleIdMod);
        }

        for (var k = 0; k < idMods.length; k++) {
          var idMod = idMods[k];
          if (!idMod) continue;

          var origFreemium = idMod.FreemiumAppIconIds;
          var origPremium = idMod.PremiumAppIconIds;
          restoredIdMods.push({
            mod: idMod,
            origFreemium: origFreemium,
            origPremium: origPremium
          });

          if (idMod.MasterAppIconIds) {
            idMod.FreemiumAppIconIds = idMod.MasterAppIconIds;
          }
          if (idMod.PremiumAppIconIds) {
            idMod.PremiumAppIconIds = Array.isArray(idMod.PremiumAppIconIds) ? [] : {};
          }
          if (typeof idMod.isFreemiumIcon === "function") {
            safeInstead(idMod, "isFreemiumIcon", true);
          }
          if (typeof idMod.isPremiumIcon === "function") {
            safeInstead(idMod, "isPremiumIcon", false);
          }
        }
      } catch (e) {}

      // ── 3. Fallback for builds with getAppIcons / getAlternateIcons ─────────
      try {
        var fallbackIconMods = [];
        try {
          if (typeof findByPropsAll === "function") {
            fallbackIconMods = (findByPropsAll("getAppIcons") || []).concat(findByPropsAll("getAlternateIcons") || []);
          }
        } catch (e) {}

        for (var f = 0; f < fallbackIconMods.length; f++) {
          var fb = fallbackIconMods[f];
          if (typeof fb.getAppIcons === "function") {
            (function (mod) {
              var origFn = mod.getAppIcons;
              patches.push(
                instead("getAppIcons", mod, function () {
                  var res = origFn.apply(this, arguments);
                  if (Array.isArray(res)) return res.map(makeIconFree);
                  return res;
                })
              );
            })(fb);
          }
          if (typeof fb.getAlternateIcons === "function") {
            (function (mod) {
              var origFn = mod.getAlternateIcons;
              patches.push(
                instead("getAlternateIcons", mod, function () {
                  var res = origFn.apply(this, arguments);
                  if (Array.isArray(res)) return res.map(makeIconFree);
                  return res;
                })
              );
            })(fb);
          }
        }
      } catch (e) {}

      // ── 4. Premium / Nitro capability checks & React hooks ──────────────────
      var trueProps = [
        "canUseAppIcons",
        "hasPremiumAppIcons",
        "canUsePremiumAppIcons",
        "canUseCustomAppIcons",
        "hasAppIcons",
        "canChangeAppIcon",
        "isCustomAppIconEnabled",
        "hasCustomAppIcon",
        "useCanUseAppIcons",
        "useHasPremiumAppIcons",
        "useCanUsePremiumAppIcons",
        "useCanUseCustomAppIcons",
        "useHasAppIcons",
        "useCanChangeAppIcon",
        "useIsCustomAppIconEnabled"
      ];
      for (var p = 0; p < trueProps.length; p++) {
        patchAllByProp(trueProps[p], true);
      }

      var falseProps = [
        "isPremiumIcon",
        "isPremiumRequired",
        "useIsPremiumIcon",
        "useIsPremiumRequired"
      ];
      for (var q = 0; q < falseProps.length; q++) {
        patchAllByProp(falseProps[q], false);
      }

      // ── 5. AppIconStore patches ─────────────────────────────────────────────
      try {
        var appIconStore = findByStoreName("AppIconStore");
        if (appIconStore) {
          if (typeof appIconStore.isPremiumRequired === "function") {
            safeInstead(appIconStore, "isPremiumRequired", false);
          }
          if (typeof appIconStore.canUsePremiumIcons === "function") {
            safeInstead(appIconStore, "canUsePremiumIcons", true);
          }
          if (typeof appIconStore.canUseCustomIcons === "function") {
            safeInstead(appIconStore, "canUseCustomIcons", true);
          }
          if (typeof appIconStore.canUseAppIcons === "function") {
            safeInstead(appIconStore, "canUseAppIcons", true);
          }
        }
      } catch (e) {}

      // ── 6. Hide the bottom Nitro Upsell Card on App Icon screen ─────────────
      var upsellNames = [
        "AppIconUpsell",
        "AppIconsUpsell",
        "AppIconUpsellCard",
        "AppIconTier2Upsell",
        "AppIconUpsellView",
        "NitroAppIconUpsell",
        "AppIconsUpsellView",
        "AppIconBanner",
        "AppIconsBanner",
        "AppIconSettingsUpsell"
      ];
      for (var u = 0; u < upsellNames.length; u++) {
        var name = upsellNames[u];
        try {
          var uMod = findByProps(name);
          if (uMod && typeof uMod[name] === "function") {
            safeInstead(uMod, name, function () { return null; });
          }
        } catch (e) {}
      }
    },

    onUnload: function () {
      // 1. Unpatch all function hooks
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];

      // 2. Restore original Freemium & Premium ID arrays
      for (var r = 0; r < restoredIdMods.length; r++) {
        try {
          var item = restoredIdMods[r];
          if (item.mod) {
            if (item.origFreemium !== undefined) item.mod.FreemiumAppIconIds = item.origFreemium;
            if (item.origPremium !== undefined) item.mod.PremiumAppIconIds = item.origPremium;
          }
        } catch (e) {}
      }
      restoredIdMods = [];
    }
  };
})();
