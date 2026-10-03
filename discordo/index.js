(function () {
  "use strict";

  var findByProps = vendetta.metro.findByProps;
  var Forms       = (vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms) || findByProps("FormRow", "FormSection") || {};
  var FormRow     = Forms.FormRow || Forms.TableRow;
  var FormSection = Forms.FormSection || Forms.TableSection;

  var DISCORDO_URL = "https://discord.com/assets/ae7d16bb2eea76b9b9977db0fad66658.mp3";

  function playDiscordo() {
    var played = false;

    // Method 1: React Native DCDSoundManager (primary audio module on Discord Mobile)
    try {
      var RN = vendetta.metro.common.ReactNative;
      var DCDSoundManager = RN && RN.NativeModules && RN.NativeModules.DCDSoundManager;
      if (DCDSoundManager && typeof DCDSoundManager.prepare === "function") {
        var soundId = Math.floor(Math.random() * 1000000) + 1000;
        DCDSoundManager.prepare(DISCORDO_URL, "notification", soundId, function (err, meta) {
          if (!err) {
            try {
              DCDSoundManager.play(soundId);
              var duration = (meta && meta.duration) ? meta.duration : 2000;
              setTimeout(function () {
                try { DCDSoundManager.stop(soundId); } catch (e) {}
                try { DCDSoundManager.release(soundId); } catch (e) {}
              }, duration + 500);
            } catch (e) {}
          }
        });
        played = true;
      }
    } catch (e) {}

    // Method 2: Discord Mobile internal SoundUtils
    if (!played) {
      try {
        var SoundUtils = vendetta.metro.findByProps("createSound", "playSound");
        if (SoundUtils && typeof SoundUtils.createSound === "function") {
          var s = SoundUtils.createSound(DISCORDO_URL, "discordo", 1);
          if (s && typeof s.play === "function") {
            s.volume = 1;
            s.play();
            played = true;
          }
        }
      } catch (e) {}
    }

    // Method 3: Standard Audio API (Web / Electron fallback)
    if (!played) {
      try {
        if (typeof Audio !== "undefined") {
          var a = new Audio(DISCORDO_URL);
          a.volume = 1;
          a.play().catch(function () {});
          played = true;
        }
      } catch (e) {}
    }
  }

  function Settings() {
    var React = vendetta.metro.common.React;
    var RN    = vendetta.metro.common.ReactNative;

    if (!React || !RN || !RN.ScrollView) return null;

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1 },
        contentContainerStyle: { paddingBottom: 40 }
      },
      React.createElement(
        FormSection,
        { title: "DISCORDO STARTUP SOUND" },
        React.createElement(FormRow, {
          label: "🔊 Play Discordo!",
          subLabel: "Tap to play the classic Japanese \"DISCORDO!\" easter egg chime",
          onPress: function () {
            playDiscordo();
          }
        }),
        React.createElement(FormRow, {
          label: "Startup Sound",
          subLabel: "Chimes automatically every time Discord is launched"
        })
      )
    );
  }

  return {
    onLoad: function () {
      // Play when Discord loads the plugin on app launch
      setTimeout(function () {
        playDiscordo();
      }, 500);
    },
    onUnload: function () {},
    settings: Settings
  };
})();
