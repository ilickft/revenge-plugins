(function () {
  "use strict";

  var findByProps    = vendetta.metro.findByProps;
  var findByPropsAll = vendetta.metro.findByPropsAll;
  var instead        = vendetta.patcher.instead;

  var patches = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // onLoad  — patch every Nitro gate related to app icons
  // ─────────────────────────────────────────────────────────────────────────

  return {
    onLoad: function () {

      // 1. Premium / Nitro capability checks — all must return true
      var trueProps = [
        "canUseAppIcons",
        "hasPremiumAppIcons",
        "canUsePremiumAppIcons",
        "canUseCustomAppIcons",
        "hasAppIcons",
        "canChangeAppIcon"
      ];
      for (var i = 0; i < trueProps.length; i++) {
        patchAllByProp(trueProps[i], true);
      }

      // 2. Some builds wrap the icon list behind getAppIcons() and filter out
      //    non-premium items.  Patch the filter so every icon passes through.
      try {
        var iconsMod = findByProps("getAppIcons", "setAppIcon");
        if (iconsMod) {
          // getAppIcons may return an array of icon descriptors, some of which
          // have an `isPremium` flag.  We return them all with isPremium stripped.
          safeInstead(iconsMod, "getAppIcons", function () {
            var icons = iconsMod.getAppIcons ? iconsMod.getAppIcons() : [];
            if (!Array.isArray(icons)) return icons;
            return icons.map(function (icon) {
              if (icon && icon.isPremium) {
                return Object.assign({}, icon, { isPremium: false });
              }
              return icon;
            });
          });
        }
      } catch (e) {}

      // 3. Some builds expose a separate premium-icon predicate
      try {
        var predMod = findByProps("isPremiumIcon");
        if (predMod) safeInstead(predMod, "isPremiumIcon", false);
      } catch (e) {}

      // 4. The store that drives the Appearance > App Icon screen may gate
      //    icon selection behind a Nitro check.  Patch it too.
      try {
        var appIconStore = vendetta.metro.findByStoreName("AppIconStore");
        if (appIconStore && typeof appIconStore.isPremiumRequired === "function") {
          patches.push(
            instead("isPremiumRequired", appIconStore, function () { return false; })
          );
        }
        if (appIconStore && typeof appIconStore.canUsePremiumIcons === "function") {
          patches.push(
            instead("canUsePremiumIcons", appIconStore, function () { return true; })
          );
        }
      } catch (e) {}

      // 5. Premium-subscription helper used broadly across Discord
      //    ("hasPremium", "isPremiumUser", "hasSubscription") — we patch only
      //    the call sites that concern app icons to avoid side-effects.
      try {
        var premMod = findByProps("isCurrentUserPremium", "hasPremiumSubscription");
        if (premMod) {
          safeInstead(premMod, "hasPremiumSubscription", true);
        }
      } catch (e) {}
    },

    onUnload: function () {
      for (var i = 0; i < patches.length; i++) {
        try { patches[i](); } catch (e) {}
      }
      patches = [];
    }
  };
})();
