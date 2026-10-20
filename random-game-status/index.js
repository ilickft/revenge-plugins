(function () {
  "use strict";

  var FluxDispatcher = vendetta.metro.common.FluxDispatcher;
  var findByProps    = vendetta.metro.findByProps;
  var storage        = vendetta.plugin.storage;
  var Forms          = (vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms) || findByProps("FormRow", "FormSection") || {};
  var FormRow        = Forms.FormRow || Forms.TableRow;
  var FormSection    = Forms.FormSection || Forms.TableSection;
  var FormSwitch     = Forms.FormSwitch || Forms.FormSwitchRow;

  var DEFAULT_GAMES = [
    "Minecraft",
    "Roblox",
    "Counter-Strike 2",
    "Fortnite",
    "Valorant",
    "Genshin Impact",
    "Among Us",
    "Terraria",
    "Grand Theft Auto V",
    "Rocket League",
    "League of Legends",
    "Dota 2",
    "Apex Legends",
    "Overwatch 2",
    "Call of Duty: Warzone",
    "Call of Duty: Modern Warfare III",
    "PUBG: Battlegrounds",
    "Rainbow Six Siege",
    "Team Fortress 2",
    "Left 4 Dead 2",
    "Garry's Mod",
    "Rust",
    "ARK: Survival Evolved",
    "7 Days to Die",
    "Project Zomboid",
    "Don't Starve Together",
    "Stardew Valley",
    "Cyberpunk 2077",
    "The Witcher 3: Wild Hunt",
    "Elden Ring",
    "Dark Souls III",
    "Sekiro: Shadows Die Twice",
    "Hollow Knight",
    "Celeste",
    "Hades",
    "Dead Cells",
    "Cuphead",
    "Undertale",
    "Deltarune",
    "Red Dead Redemption 2",
    "Skyrim",
    "Fallout 4",
    "Fallout: New Vegas",
    "Starfield",
    "Baldur's Gate 3",
    "Divinity: Original Sin 2",
    "Diablo IV",
    "Path of Exile",
    "Lost Ark",
    "World of Warcraft",
    "Final Fantasy XIV",
    "Guild Wars 2",
    "Old School RuneScape",
    "RuneScape 3",
    "Black Desert Online",
    "New World",
    "Destiny 2",
    "Halo Infinite",
    "Halo: The Master Chief Collection",
    "Titanfall 2",
    "Battlefield 2042",
    "Battlefield V",
    "Brawlhalla",
    "Mortal Kombat 11",
    "Street Fighter 6",
    "Tekken 8",
    "Fall Guys",
    "Phasmophobia",
    "Lethal Company",
    "Content Warning",
    "Dead by Daylight",
    "Friday the 13th: The Game",
    "Gang Beasts",
    "Human: Fall Flat",
    "Overcooked! 2",
    "It Takes Two",
    "Portal 2",
    "Half-Life 2",
    "Half-Life: Alyx",
    "Subnautica",
    "Raft",
    "The Forest",
    "Sons of the Forest",
    "Valheim",
    "Satisfactory",
    "Factorio",
    "Rimworld",
    "Cities: Skylines",
    "Euro Truck Simulator 2",
    "American Truck Simulator",
    "Forza Horizon 5",
    "Need for Speed Heat",
    "Assetto Corsa",
    "BeamNG.drive",
    "FIFA 23",
    "EA Sports FC 24",
    "NBA 2K24",
    "eFootball",
    "Honkai: Star Rail",
    "Zenless Zone Zero",
    "Wuthering Waves",
    "Osu!",
    "Beat Saber",
    "Geometry Dash",
    "Slay the Spire",
    "Balatro",
    "Vampire Survivors",
    "Risk of Rain 2",
    "Deep Rock Galactic",
    "Warframe",
    "Helldivers 2",
    "Palworld",
    "Monster Hunter: World",
    "Monster Hunter Rise",
    "Resident Evil 4",
    "Resident Evil Village",
    "Dead Space",
    "Alan Wake 2",
    "Hogwarts Legacy",
    "Spider-Man Remastered",
    "God of War",
    "Horizon Zero Dawn",
    "Sea of Thieves",
    "Age of Empires II",
    "Civilization VI",
    "Stellaris",
    "Hearts of Iron IV",
    "Total War: Warhammer III",
    "Sid Meier's Civilization V",
    "Crusader Kings III",
    "Cities: Skylines II",
    "Planet Zoo",
    "Planet Coaster",
    "Kerbal Space Program",
    "Microsoft Flight Simulator",
    "Elite Dangerous",
    "No Man's Sky",
    "Hunt: Showdown",
    "Escape from Tarkov",
    "Insurgency: Sandstorm",
    "Squad",
    "Arma 3",
    "DayZ",
    "Payday 2",
    "Payday 3",
    "Borderlands 3",
    "Mass Effect Legendary Edition",
    "Disco Elysium",
    "Persona 5 Royal",
    "Yakuza: Like a Dragon",
    "Monster Hunter Wilds",
    "Lies of P",
    "Black Myth: Wukong",
    "Stray",
    "Cult of the Lamb",
    "Dave the Diver"
  ];
  var MIN_FLOOR = 1;
  var TICK_MS = 5000;
  var REASSERT_MS = 300000;
  var MIN_GAP_MS = 15000;

  var tickTimer = null;
  var appStateSub = null;
  var lastAssert = 0;
  var lastSent = 0;
  var lastKey = "";
  var pendingTimer = null;
  var appIdTimer = null;

  // ---------- storage defaults ----------
  if (!Array.isArray(storage.games) || storage.games.length === 0) storage.games = DEFAULT_GAMES.slice();
  if (storage.enabled === undefined) storage.enabled = true;
  if (storage.minMinutes === undefined) storage.minMinutes = 21;
  if (storage.maxMinutes === undefined) storage.maxMinutes = 53;
  if (storage.countWhileClosed === undefined) storage.countWhileClosed = false;
  if (storage.applicationId === undefined) storage.applicationId = "";

  // ---------- helpers ----------
  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function getRange() {
    var lo = Math.max(MIN_FLOOR, parseInt(storage.minMinutes, 10) || 21);
    var hi = Math.max(lo, parseInt(storage.maxMinutes, 10) || 53);
    return [lo, hi];
  }

  function pickGame(exclude) {
    var list = (storage.games || []).filter(function (g) { return g && g.trim(); });
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];
    var pool = list.filter(function (g) { return g !== exclude; });
    return pool[randInt(0, pool.length - 1)];
  }

  function startNewSession() {
    var prev = storage.current ? storage.current.game : null;
    var game = pickGame(prev);
    if (!game) { storage.current = null; clearActivity(); return; }
    var r = getRange();
    storage.current = {
      game: game,
      durationMs: randInt(r[0], r[1]) * 60000,
      elapsedMs: 0,
      lastSeen: Date.now()
    };
    assertActivity(true);
  }

  function remainingMs() {
    var c = storage.current;
    if (!c) return 0;
    return Math.max(0, c.durationMs - c.elapsedMs);
  }

  function fmt(ms) {
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m + "m " + (sec < 10 ? "0" : "") + sec + "s";
  }

  // ---------- presence ----------
  function dispatchActivity(activity) {
    try {
      FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: activity,
        pid: 1608,
        socketId: "RandomGameStatus"
      });
    } catch (e) {}
  }

  function clearActivity() {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    lastKey = "";
    dispatchActivity(null);
  }

  function assertActivity(force) {
    var c = storage.current;
    if (!storage.enabled || !c) return;
    var now = Date.now();
    var appId = (storage.applicationId || "").trim();
    var key = c.game + "|" + appId;

    // Nothing changed and it was sent recently: don't send again.
    if (!force && key === lastKey && now - lastAssert < REASSERT_MS) return;

    // Global throttle: at most one presence update per MIN_GAP_MS.
    // Extra calls are merged into a single trailing update.
    if (now - lastSent < MIN_GAP_MS) {
      if (!pendingTimer) {
        pendingTimer = setTimeout(function () {
          pendingTimer = null;
          assertActivity(true);
        }, MIN_GAP_MS - (now - lastSent) + 50);
      }
      return;
    }

    lastSent = now;
    lastAssert = now;
    lastKey = key;
    var act = {
      name: c.game,
      type: 0,
      flags: 1,
      timestamps: { start: now - c.elapsedMs }
    };
    if (appId) act.application_id = appId;
    dispatchActivity(act);
  }

  // ---------- timer ----------
  function tick() {
    if (!storage.enabled) return;
    var now = Date.now();
    var c = storage.current;
    if (!c) { startNewSession(); return; }

    var delta = now - (c.lastSeen || now);
    if (delta < 0) delta = 0;
    c.elapsedMs += delta;
    c.lastSeen = now;
    storage.current = c;

    if (c.elapsedMs >= c.durationMs) {
      startNewSession();
    } else {
      assertActivity(false);
    }
  }

  function onResume() {
    // Called on plugin load and when the app returns to foreground.
    var c = storage.current;
    if (c) {
      var now = Date.now();
      if (storage.countWhileClosed) {
        var gap = Math.max(0, now - (c.lastSeen || now));
        c.elapsedMs += gap;
      }
      c.lastSeen = now;
      storage.current = c;
    }
    tick();
    assertActivity(true);
  }

  function onBackground() {
    var c = storage.current;
    if (c) {
      var now = Date.now();
      c.elapsedMs += Math.max(0, now - (c.lastSeen || now));
      c.lastSeen = now;
      storage.current = c;
    }
  }

  // ---------- settings ----------
  function Settings() {
    var React = vendetta.metro.common.React;
    var RN    = vendetta.metro.common.ReactNative;
    if (!React || !RN || !RN.ScrollView) return null;

    var forceUpdate = React.useReducer(function (x) { return x + 1; }, 0)[1];
    var newGameState = React.useState("");
    var newGame = newGameState[0];
    var setNewGame = newGameState[1];

    React.useEffect(function () {
      var id = setInterval(forceUpdate, 1000);
      return function () { clearInterval(id); };
    }, []);

    var c = storage.current;
    var inputStyle = {
      backgroundColor: "rgba(128, 128, 128, 0.15)",
      color: "inherit",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14
    };

    var statusLabel = !storage.enabled
      ? "Plugin is off"
      : c ? ("Playing " + c.game) : "No game picked yet";
    var statusSub = c && storage.enabled
      ? (fmt(remainingMs()) + " left of " + Math.round(c.durationMs / 60000) + " min")
      : "Add games below";

    var games = storage.games || [];

    return React.createElement(
      RN.ScrollView,
      { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 40 } },

      React.createElement(
        FormSection,
        { title: "CURRENT STATUS" },
        React.createElement(FormRow, { label: statusLabel, subLabel: statusSub }),
        React.createElement(FormRow, {
          label: "Skip to a new game now",
          subLabel: "Picks another random game with a fresh timer",
          onPress: function () { startNewSession(); forceUpdate(); }
        })
      ),

      React.createElement(
        FormSection,
        { title: "SETTINGS" },
        React.createElement(FormRow, {
          label: "Enabled",
          trailing: React.createElement(FormSwitch, {
            value: storage.enabled !== false,
            onValueChange: function (v) {
              storage.enabled = v;
              if (v) { onResume(); } else { clearActivity(); }
              forceUpdate();
            }
          })
        }),
        React.createElement(FormRow, {
          label: "Keep counting while Discord is closed",
          subLabel: storage.countWhileClosed
            ? "Timer runs in real time even when the app is closed"
            : "Timer pauses when closed and resumes where it left off",
          trailing: React.createElement(FormSwitch, {
            value: !!storage.countWhileClosed,
            onValueChange: function (v) { storage.countWhileClosed = v; forceUpdate(); }
          })
        })
      ),

      React.createElement(
        FormSection,
        { title: "DURATION (MINUTES)" },
        React.createElement(
          RN.View,
          { style: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row" } },
          React.createElement(RN.TextInput, {
            style: Object.assign({ flex: 1, marginRight: 8 }, inputStyle),
            value: String(storage.minMinutes),
            keyboardType: "numeric",
            placeholder: "Min",
            placeholderTextColor: "#80848e",
            onChangeText: function (t) {
              var n = parseInt(t.replace(/[^0-9]/g, ""), 10);
              storage.minMinutes = isNaN(n) ? "" : n;
              forceUpdate();
            }
          }),
          React.createElement(RN.TextInput, {
            style: Object.assign({ flex: 1 }, inputStyle),
            value: String(storage.maxMinutes),
            keyboardType: "numeric",
            placeholder: "Max",
            placeholderTextColor: "#80848e",
            onChangeText: function (t) {
              var n = parseInt(t.replace(/[^0-9]/g, ""), 10);
              storage.maxMinutes = isNaN(n) ? "" : n;
              forceUpdate();
            }
          })
        ),
        React.createElement(
          RN.Text,
          { style: { color: "#80848e", fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 } },
          "Each game lasts a random time between min and max (default 21-53). Applies to the next game."
        )
      ),

      React.createElement(
        FormSection,
        { title: "APPLICATION ID (OPTIONAL)" },
        React.createElement(
          RN.View,
          { style: { paddingHorizontal: 16, paddingVertical: 10 } },
          React.createElement(RN.TextInput, {
            style: inputStyle,
            value: storage.applicationId || "",
            keyboardType: "numeric",
            placeholder: "Discord application ID",
            placeholderTextColor: "#80848e",
            onChangeText: function (t) {
              storage.applicationId = t.replace(/[^0-9]/g, "");
              if (appIdTimer) clearTimeout(appIdTimer);
              appIdTimer = setTimeout(function () { appIdTimer = null; assertActivity(true); }, 2000);
              forceUpdate();
            }
          })
        )
      ),

      React.createElement(
        FormSection,
        { title: "ADD A GAME" },
        React.createElement(
          RN.View,
          { style: { paddingHorizontal: 16, paddingVertical: 10 } },
          React.createElement(RN.TextInput, {
            style: inputStyle,
            value: newGame,
            placeholder: "Game name",
            placeholderTextColor: "#80848e",
            onChangeText: setNewGame
          })
        ),
        React.createElement(FormRow, {
          label: "Add to list",
          onPress: function () {
            var name = (newGame || "").trim();
            if (!name) return;
            if (storage.games.indexOf(name) === -1) storage.games = storage.games.concat([name]);
            setNewGame("");
            if (!storage.current) startNewSession();
            forceUpdate();
          }
        })
      ),

      React.createElement(
        FormSection,
        { title: "GAME LIST (" + games.length + ") - TAP TO REMOVE" },
        games.map(function (g) {
          return React.createElement(FormRow, {
            key: g,
            label: g,
            subLabel: storage.current && storage.current.game === g ? "Currently playing" : undefined,
            onPress: function () {
              storage.games = storage.games.filter(function (x) { return x !== g; });
              if (storage.current && storage.current.game === g) startNewSession();
              forceUpdate();
            }
          });
        }),
        React.createElement(FormRow, {
          label: "Reset to default list",
          onPress: function () { storage.games = DEFAULT_GAMES.slice(); forceUpdate(); }
        })
      )
    );
  }

  return {
    onLoad: function () {
      try {
        var RN = vendetta.metro.common.ReactNative;
        if (RN && RN.AppState && typeof RN.AppState.addEventListener === "function") {
          appStateSub = RN.AppState.addEventListener("change", function (state) {
            if (state === "active") onResume();
            else onBackground();
          });
        }
      } catch (e) {}

      if (storage.enabled) {
        if (!storage.current) startNewSession();
        else onResume();
      }
      tickTimer = setInterval(tick, TICK_MS);
    },
    onUnload: function () {
      onBackground();
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
      if (appIdTimer) { clearTimeout(appIdTimer); appIdTimer = null; }
      try { if (appStateSub && appStateSub.remove) appStateSub.remove(); } catch (e) {}
      appStateSub = null;
      clearActivity();
    },
    settings: Settings
  };
})();
