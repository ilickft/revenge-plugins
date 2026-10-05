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

  tryPatch("canUseSoundboardEverywhere",        true);
  tryPatch("canUseExternalSounds",              true);
  tryPatch("canUseExternalSoundboard",          true);
  tryPatch("isSoundboardItemDisabled",          false);
  tryPatch("isSoundDisabled",                   false);
  tryPatch("isSoundboardSoundUnavailable",      false);
  tryPatch("getSoundboardItemUnavailableReason", null);
  tryPatch("getSoundUnavailableReason",          null);
  tryPatch("getSoundboardSoundUnavailableReason",null);

  var SoundboardActions = findByProps("sendSoundboardSound");
  if (SoundboardActions) {
    patches.push(
      before("sendSoundboardSound", SoundboardActions, function (args) {

      })
    );
  }

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
