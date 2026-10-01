(function () {
  "use strict";

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

    if (!React || !RN || !RN.View || !RN.Text) return null;

    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1, backgroundColor: "#313338" },
        contentContainerStyle: { padding: 16, paddingBottom: 40 }
      },
      React.createElement(
        RN.Text,
        { style: { color: "#f2f3f5", fontSize: 20, fontWeight: "700", marginBottom: 6 } },
        "Discordo Startup Sound"
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#949ba4", fontSize: 14, marginBottom: 18, lineHeight: 18 } },
        "Plays the classic Japanese \"DISCORDO!\" easter egg chime whenever Discord launches."
      ),
      React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#2b2d31",
            borderRadius: 12,
            padding: 16
          }
        },
        React.createElement(
          RN.Text,
          { style: { color: "#f2f3f5", fontSize: 16, fontWeight: "600", marginBottom: 6 } },
          "Test Sound"
        ),
        React.createElement(
          RN.Text,
          { style: { color: "#949ba4", fontSize: 13, marginBottom: 14 } },
          "Tap the button below to test the startup sound right now."
        ),
        React.createElement(
          Btn,
          {
            onPress: function () {
              playDiscordo();
            },
            style: {
              backgroundColor: "#5865f2",
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              alignItems: "center"
            }
          },
          React.createElement(
            RN.Text,
            { style: { color: "#ffffff", fontSize: 15, fontWeight: "600" } },
            "\uD83D\uDD0A Play Discordo!"
          )
        )
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
