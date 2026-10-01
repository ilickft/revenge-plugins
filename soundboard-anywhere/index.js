(function () {
  var findByProps = vendetta.metro.findByProps;
  var instead     = vendetta.patcher.instead;

  var patches = [];

  function tryPatch(fnName, retVal) {
    var mod = findByProps(fnName);
    if (!mod) return;
    patches.push(instead(fnName, mod, function () { return retVal; }));
  }

  // ── Unlock the soundboard picker ──────────────────────────────────────────
  // Discord gates sounds from other servers behind Nitro, exactly like it
  // does with cross-server emojis. We try every known gating function name
  // and patch whichever ones exist in this build of Discord.

  // Returns true  → sound is playable
  tryPatch("canUseSoundboardEverywhere",       true);
  tryPatch("canUseExternalSounds",             true);
  tryPatch("canUseExternalSoundboard",         true);

  // Returns false → sound is NOT disabled / NOT locked
  tryPatch("isSoundboardItemDisabled",         false);
  tryPatch("isSoundDisabled",                  false);
  tryPatch("isSoundboardSoundUnavailable",     false);

  // Returns null  → no unavailability reason = available
  tryPatch("getSoundboardItemUnavailableReason", null);
  tryPatch("getSoundUnavailableReason",          null);
  tryPatch("getSoundboardSoundUnavailableReason",null);

  return {
    onLoad:   function () {},
    onUnload: function () {
      for (var i = 0; i < patches.length; i++) patches[i]();
    },
  };
})();
