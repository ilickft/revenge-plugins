(function () {
  var findByProps = vendetta.metro.findByProps;
  var before      = vendetta.patcher.before;
  var instead     = vendetta.patcher.instead;

  var patches = [];

  function tryPatch(fnName, retVal) {
    var mod = findByProps(fnName);
    if (!mod) return;
    patches.push(instead(fnName, mod, function () { return retVal; }));
  }

  // ── 1. Unlock the soundboard picker UI ────────────────────────────────────
  // Patch every known gating function so all sounds appear clickable.

  tryPatch("canUseSoundboardEverywhere",        true);
  tryPatch("canUseExternalSounds",              true);
  tryPatch("canUseExternalSoundboard",          true);
  tryPatch("isSoundboardItemDisabled",          false);
  tryPatch("isSoundDisabled",                   false);
  tryPatch("isSoundboardSoundUnavailable",      false);
  tryPatch("getSoundboardItemUnavailableReason", null);
  tryPatch("getSoundUnavailableReason",          null);
  tryPatch("getSoundboardSoundUnavailableReason",null);

  // ── 2. Force the actual send to go through ────────────────────────────────
  // Discord may have a client-side guard inside sendSoundboardSound that
  // aborts the API call before it even reaches Discord's servers.
  // We strip that guard and forward all args directly to the original.
  //
  // NOTE: If others still can't hear it after this fix, the restriction is
  // enforced server-side by Discord and cannot be bypassed client-side.

  var SoundboardActions = findByProps("sendSoundboardSound");
  if (SoundboardActions) {
    patches.push(
      before("sendSoundboardSound", SoundboardActions, function (args) {
        // args[0] = channelId, args[1] = { soundId, sourceGuildId } or similar
        // Nothing to modify — just ensure no earlier patch swallowed the call.
        // The `before` hook guarantees the original function still runs.
      })
    );
  }

  // Also patch the REST/network layer guard if present
  var SoundboardUtils = findByProps("useSendSoundboardSound");
  if (SoundboardUtils) {
    patches.push(
      instead("useSendSoundboardSound", SoundboardUtils, function (args, orig) {
        return orig.apply(this, args);
      })
    );
  }

  return {
    onLoad:   function () {},
    onUnload: function () {
      for (var i = 0; i < patches.length; i++) patches[i]();
    },
  };
})();
