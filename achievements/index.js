(function () {
  "use strict";

  var findByProps     = vendetta.metro.findByProps;
  var findByStoreName = vendetta.metro.findByStoreName;
  var before          = vendetta.patcher.before;
  var after           = vendetta.patcher.after;
  var storage         = vendetta.plugin.storage;
  var showToast       = vendetta.ui.toasts.showToast;
  var getAssetIDByName = vendetta.ui.assets.getAssetIDByName;
  var FluxDispatcher  = vendetta.metro.common.FluxDispatcher;

  // ── Stores ────────────────────────────────────────────────────────────────
  var UserStore        = findByStoreName("UserStore");
  var ChannelStore     = findByStoreName("ChannelStore") || findByProps("getChannel");
  var LocaleStore      = findByStoreName("LocaleStore") || findByProps("locale");
  var Messages         = findByProps("sendMessage", "editMessage");
  var Upload           = findByProps("uploadLocalFiles");
  var MessageReactions = findByProps("addReaction");

  var patches = [];

  // ── Sounds ────────────────────────────────────────────────────────────────
  var SOUND_URLS = {
    default: "https://raw.githubusercontent.com/ilickft/revenge-plugins/main/achievements/default.ogg",
    rare: "https://raw.githubusercontent.com/ilickft/revenge-plugins/main/achievements/rare.ogg",
    fallback_default: "https://ettacent.dev/files/default.ogg",
    fallback_rare: "https://ettacent.dev/files/rare.ogg"
  };

  // ── Sound Playback ────────────────────────────────────────────────────────
  function playSound(isRare) {
    if (storage.soundEnabled === false) return;

    var primaryUrl = isRare ? SOUND_URLS.rare : SOUND_URLS.default;
    var fallbackUrl = isRare ? SOUND_URLS.fallback_rare : SOUND_URLS.fallback_default;

    var played = false;

    // Method 1: React Native DCDSoundManager (primary audio module on Discord Mobile)
    try {
      var RN = vendetta.metro.common.ReactNative;
      var DCDSoundManager = RN && RN.NativeModules && RN.NativeModules.DCDSoundManager;
      if (DCDSoundManager && typeof DCDSoundManager.prepare === "function") {
        var soundId = Math.floor(Math.random() * 1000000) + 1000;
        DCDSoundManager.prepare(primaryUrl, "notification", soundId, function (err, meta) {
          if (!err) {
            try {
              DCDSoundManager.play(soundId);
              var duration = (meta && meta.duration) ? meta.duration : 2500;
              setTimeout(function () {
                try { DCDSoundManager.stop(soundId); } catch (e) {}
                try { DCDSoundManager.release(soundId); } catch (e) {}
              }, duration + 500);
            } catch (e) {}
          } else {
            // Fallback URL
            var soundId2 = Math.floor(Math.random() * 1000000) + 2000;
            DCDSoundManager.prepare(fallbackUrl, "notification", soundId2, function (err2, meta2) {
              if (!err2) {
                try {
                  DCDSoundManager.play(soundId2);
                  var dur = (meta2 && meta2.duration) ? meta2.duration : 2500;
                  setTimeout(function () {
                    try { DCDSoundManager.stop(soundId2); } catch (e) {}
                    try { DCDSoundManager.release(soundId2); } catch (e) {}
                  }, dur + 500);
                } catch (e) {}
              }
            });
          }
        });
        played = true;
      }
    } catch (e) {}

    // Method 2: Discord Mobile internal SoundUtils
    if (!played) {
      try {
        var SoundUtils = findByProps("createSound", "playSound");
        if (SoundUtils && typeof SoundUtils.createSound === "function") {
          var s = SoundUtils.createSound(primaryUrl, "achievement", 1);
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
          var a = new Audio(primaryUrl);
          a.volume = 1;
          a.play().catch(function () {
            try {
              var a2 = new Audio(fallbackUrl);
              a2.volume = 1;
              a2.play().catch(function () {});
            } catch (e2) {}
          });
          played = true;
        }
      } catch (e) {}
    }
  }

  // ── Rarity Data ───────────────────────────────────────────────────────────
  var RARITY_INFO = {
    common:    { emoji: "⚪", sound: "default", color: "#95a5a6", en: "Common",    ru: "Обычное" },
    uncommon:  { emoji: "🟢", sound: "default", color: "#2ecc71", en: "Uncommon",  ru: "Необычное" },
    rare:      { emoji: "🔵", sound: "rare",    color: "#3498db", en: "Rare",      ru: "Редкое" },
    epic:      { emoji: "🟣", sound: "rare",    color: "#9b59b6", en: "Epic",      ru: "Эпическое" },
    legendary: { emoji: "🟡", sound: "rare",    color: "#f1c40f", en: "Legendary", ru: "Легендарное" },
    mythic:    { emoji: "🔴", sound: "rare",    color: "#e74c3c", en: "Mythic",    ru: "Мифическое" },
    secret:    { emoji: "🔮", sound: "rare",    color: "#8e44ad", en: "Secret",    ru: "Секретное" }
  };

  // ── Raw Achievements List (308 achievements) ──────────────────────────────
  var RAW_ACHIEVEMENTS = [["first_message", "messages", "💬", "common", 1, "", "Первые шаги", "Отправьте первое сообщение", "First Steps", "Send your first message", "messages_sent"], ["getting_started", "messages", "🚀", "common", 10, "", "Начало пути", "Отправьте 10 сообщений", "Getting Started", "Send 10 messages", "messages_sent"], ["warming_up", "messages", "🔥", "common", 50, "", "Разминка", "Отправьте 50 сообщений", "Warming Up", "Send 50 messages", "messages_sent"], ["talkative", "messages", "🗣️", "uncommon", 100, "", "Разговорчивый", "Отправьте 100 сообщений", "Talkative", "Send 100 messages", "messages_sent"], ["chatterbox", "messages", "📢", "uncommon", 500, "", "Болтун", "Отправьте 500 сообщений", "Chatterbox", "Send 500 messages", "messages_sent"], ["messenger", "messages", "📬", "rare", 1000, "", "Вестник", "Отправьте 1,000 сообщений", "Messenger", "Send 1,000 messages", "messages_sent"], ["communicator", "messages", "📡", "rare", 2500, "", "Коммуникатор", "Отправьте 2,500 сообщений", "Communicator", "Send 2,500 messages", "messages_sent"], ["orator", "messages", "🎤", "epic", 5000, "", "Оратор", "Отправьте 5,000 сообщений", "Orator", "Send 5,000 messages", "messages_sent"], ["word_master", "messages", "📖", "epic", 10000, "", "Мастер слова", "Отправьте 10,000 сообщений", "Word Master", "Send 10,000 messages", "messages_sent"], ["legend", "messages", "🏆", "legendary", 25000, "", "Легенда общения", "Отправьте 25,000 сообщений", "Legend", "Send 25,000 messages", "messages_sent"], ["immortal", "messages", "👑", "legendary", 50000, "", "Бессмертный", "Отправьте 50,000 сообщений", "Immortal", "Send 50,000 messages", "messages_sent"], ["god_of_words", "messages", "🌟", "mythic", 100000, "", "Бог слов", "Отправьте 100,000 сообщений", "God of Words", "Send 100,000 messages", "messages_sent"], ["minimalist", "messages", "📍", "uncommon", 1, "T50", "Минималист", "Отправьте сообщение из 1 символа (после 50 сообщений)", "Minimalist", "Send a 1-character message (after 50 messages)", ""], ["writer", "messages", "✍️", "uncommon", 1, "", "Писатель", "Отправьте сообщение длиннее 300 символов", "Writer", "Send a message longer than 300 characters", ""], ["novelist", "messages", "📚", "rare", 1, "", "Романист", "Отправьте сообщение длиннее 700 символов", "Novelist", "Send a message longer than 700 characters", ""], ["epic_writer", "messages", "📜", "epic", 1, "", "Эпический писатель", "Отправьте сообщение длиннее 1500 символов", "Epic Writer", "Send a message longer than 1500 characters", ""], ["tolstoy", "messages", "🎭", "legendary", 1, "", "Лев Толстой", "Отправьте сообщение длиннее 3000 символов", "Tolstoy", "Send a message longer than 3000 characters", ""], ["speed_demon", "messages", "⚡", "uncommon", 1, "", "Скоростной демон", "Отправьте 5 сообщений за 30 секунд", "Speed Demon", "Send 5 messages in 30 seconds", ""], ["spam_master", "messages", "💨", "rare", 1, "", "Спам-мастер", "Отправьте 10 сообщений за минуту", "Spam Master", "Send 10 messages in a minute", ""], ["keyboard_warrior", "messages", "⌨️", "epic", 1, "", "Клавиатурный воин", "Отправьте 20 сообщений за минуту", "Keyboard Warrior", "Send 20 messages in a minute", ""], ["typing_god", "messages", "🏎️", "legendary", 1, "", "Бог печати", "Отправьте 30 сообщений за минуту", "Typing God", "Send 30 messages in a minute", ""], ["editor", "messages", "✏️", "common", 1, "", "Редактор", "Отредактируйте сообщение", "Editor", "Edit a message", "edits_made"], ["perfectionist", "messages", "🎯", "uncommon", 25, "", "Перфекционист", "Отредактируйте 25 сообщений", "Perfectionist", "Edit 25 messages", "edits_made"], ["never_satisfied", "messages", "🔧", "rare", 100, "", "Вечно недовольный", "Отредактируйте 100 сообщений", "Never Satisfied", "Edit 100 messages", "edits_made"], ["obsessive_editor", "messages", "⚙️", "epic", 500, "", "Одержимый редактор", "Отредактируйте 500 сообщений", "Obsessive Editor", "Edit 500 messages", "edits_made"], ["replier", "messages", "↩️", "common", 1, "", "Ответчик", "Ответьте на сообщение", "Replier", "Reply to a message", "replies_made"], ["conversationalist", "messages", "💬", "uncommon", 50, "", "Собеседник", "Ответьте на 50 сообщений", "Conversationalist", "Reply to 50 messages", "replies_made"], ["discussion_lover", "messages", "🗨️", "rare", 200, "", "Любитель дискуссий", "Ответьте на 200 сообщений", "Discussion Lover", "Reply to 200 messages", "replies_made"], ["debate_master", "messages", "🎓", "epic", 1000, "", "Мастер дебатов", "Ответьте на 1000 сообщений", "Debate Master", "Reply to 1000 messages", "replies_made"], ["forwarder", "messages", "📨", "common", 1, "", "Почтальон", "Перешлите сообщение", "Forwarder", "Forward a message", "forwards_made"], ["news_spreader", "messages", "📰", "uncommon", 25, "", "Распространитель", "Перешлите 25 сообщений", "News Spreader", "Forward 25 messages", "forwards_made"], ["viral_agent", "messages", "🌐", "rare", 100, "", "Вирусный агент", "Перешлите 100 сообщений", "Viral Agent", "Forward 100 messages", "forwards_made"], ["information_broker", "messages", "🕵️", "epic", 500, "", "Информационный брокер", "Перешлите 500 сообщений", "Information Broker", "Forward 500 messages", "forwards_made"], ["first_photo", "media", "📷", "common", 1, "", "Первый кадр", "Отправьте первое фото", "First Shot", "Send your first photo", "photos_sent"], ["amateur_photographer", "media", "📸", "common", 25, "", "Фотолюбитель", "Отправьте 25 фото", "Amateur Photographer", "Send 25 photos", "photos_sent"], ["photographer", "media", "🖼️", "uncommon", 100, "", "Фотограф", "Отправьте 100 фото", "Photographer", "Send 100 photos", "photos_sent"], ["pro_photographer", "media", "🎨", "rare", 500, "", "Профессионал", "Отправьте 500 фото", "Pro Photographer", "Send 500 photos", "photos_sent"], ["paparazzi", "media", "📹", "epic", 1000, "", "Папарацци", "Отправьте 1000 фото", "Paparazzi", "Send 1000 photos", "photos_sent"], ["photo_legend", "media", "🌟", "legendary", 5000, "", "Легенда фотографии", "Отправьте 5000 фото", "Photo Legend", "Send 5000 photos", "photos_sent"], ["first_video", "media", "🎬", "common", 1, "", "Мотор!", "Отправьте первое видео", "Action!", "Send your first video", "videos_sent"], ["video_amateur", "media", "🎥", "common", 10, "", "Видеолюбитель", "Отправьте 10 видео", "Video Amateur", "Send 10 videos", "videos_sent"], ["videographer", "media", "📽️", "uncommon", 50, "", "Видеограф", "Отправьте 50 видео", "Videographer", "Send 50 videos", "videos_sent"], ["director", "media", "🎦", "rare", 200, "", "Режиссёр", "Отправьте 200 видео", "Director", "Send 200 videos", "videos_sent"], ["hollywood", "media", "⭐", "epic", 1000, "", "Голливуд", "Отправьте 1000 видео", "Hollywood", "Send 1000 videos", "videos_sent"], ["first_voice", "media", "🎙️", "common", 1, "", "Голос", "Отправьте первое голосовое", "Voice", "Send your first voice message", "voice_sent"], ["voice_user", "media", "🔊", "common", 25, "", "Голосовой пользователь", "Отправьте 25 голосовых", "Voice User", "Send 25 voice messages", "voice_sent"], ["podcaster", "media", "🎧", "uncommon", 100, "", "Подкастер", "Отправьте 100 голосовых", "Podcaster", "Send 100 voice messages", "voice_sent"], ["radio_host", "media", "📻", "rare", 500, "", "Радиоведущий", "Отправьте 500 голосовых", "Radio Host", "Send 500 voice messages", "voice_sent"], ["voice_legend", "media", "🎼", "epic", 2000, "", "Голосовая легенда", "Отправьте 2000 голосовых", "Voice Legend", "Send 2000 voice messages", "voice_sent"], ["first_sticker", "media", "🏷️", "common", 1, "", "Стикермен", "Отправьте первый стикер", "Sticker Man", "Send your first sticker", "stickers_sent"], ["sticker_fan", "media", "🎭", "common", 50, "", "Фанат стикеров", "Отправьте 50 стикеров", "Sticker Fan", "Send 50 stickers", "stickers_sent"], ["sticker_lover", "media", "🎨", "uncommon", 250, "", "Любитель стикеров", "Отправьте 250 стикеров", "Sticker Lover", "Send 250 stickers", "stickers_sent"], ["sticker_addict", "media", "🃏", "rare", 1000, "", "Стикерозависимый", "Отправьте 1000 стикеров", "Sticker Addict", "Send 1000 stickers", "stickers_sent"], ["sticker_maniac", "media", "🎪", "epic", 5000, "", "Стикер-маньяк", "Отправьте 5000 стикеров", "Sticker Maniac", "Send 5000 stickers", "stickers_sent"], ["sticker_god", "media", "👑", "legendary", 15000, "", "Бог стикеров", "Отправьте 15000 стикеров", "Sticker God", "Send 15000 stickers", "stickers_sent"], ["first_gif", "media", "🎞️", "common", 1, "", "Гифка", "Отправьте первую GIF", "First GIF", "Send your first GIF", "gifs_sent"], ["gif_user", "media", "🎬", "common", 25, "", "GIF-пользователь", "Отправьте 25 GIF", "GIF User", "Send 25 GIFs", "gifs_sent"], ["animator", "media", "🎭", "uncommon", 100, "", "Аниматор", "Отправьте 100 GIF", "Animator", "Send 100 GIFs", "gifs_sent"], ["gif_master", "media", "🎪", "rare", 500, "", "Мастер GIF", "Отправьте 500 GIF", "GIF Master", "Send 500 GIFs", "gifs_sent"], ["gif_lord", "media", "🌟", "epic", 2000, "", "Повелитель GIF", "Отправьте 2000 GIF", "GIF Lord", "Send 2000 GIFs", "gifs_sent"], ["first_file", "media", "📁", "common", 1, "", "Файлообменник", "Отправьте первый файл", "File Sharer", "Send your first file", "files_sent"], ["file_sharer", "media", "📂", "common", 25, "", "Файлодел", "Отправьте 25 файлов", "File Dealer", "Send 25 files", "files_sent"], ["archivist", "media", "🗄️", "uncommon", 100, "", "Архивариус", "Отправьте 100 файлов", "Archivist", "Send 100 files", "files_sent"], ["data_hoarder", "media", "💾", "rare", 500, "", "Накопитель данных", "Отправьте 500 файлов", "Data Hoarder", "Send 500 files", "files_sent"], ["cloud_storage", "media", "☁️", "epic", 2000, "", "Облачное хранилище", "Отправьте 2000 файлов", "Cloud Storage", "Send 2000 files", "files_sent"], ["first_audio", "media", "🎵", "common", 1, "", "Меломан", "Отправьте первое аудио", "Music Lover", "Send your first audio", "audios_sent"], ["music_lover", "media", "🎶", "common", 25, "", "Любитель музыки", "Отправьте 25 аудио", "Music Fan", "Send 25 audio files", "audios_sent"], ["dj", "media", "🎧", "uncommon", 100, "", "Диджей", "Отправьте 100 аудио", "DJ", "Send 100 audio files", "audios_sent"], ["music_producer", "media", "🎹", "rare", 500, "", "Музыкальный продюсер", "Отправьте 500 аудио", "Music Producer", "Send 500 audio files", "audios_sent"], ["first_video_note", "media", "⚪", "common", 1, "", "Кружочек", "Отправьте первый видеокружок", "Circle", "Send your first video note", "video_notes_sent"], ["circle_fan", "media", "🔵", "common", 25, "", "Фанат кружков", "Отправьте 25 видеокружков", "Circle Fan", "Send 25 video notes", "video_notes_sent"], ["circle_master", "media", "🟣", "uncommon", 100, "", "Мастер кружков", "Отправьте 100 видеокружков", "Circle Master", "Send 100 video notes", "video_notes_sent"], ["circle_legend", "media", "🟡", "rare", 500, "", "Легенда кружков", "Отправьте 500 видеокружков", "Circle Legend", "Send 500 video notes", "video_notes_sent"], ["first_chat", "social", "👋", "common", 1, "", "Первый контакт", "Напишите в первый чат", "First Contact", "Write to your first chat", "unique_chats"], ["social_starter", "social", "🤝", "common", 5, "", "Начинающий социал", "Напишите в 5 разных чатов", "Social Starter", "Write to 5 different chats", "unique_chats"], ["social_10", "social", "👥", "common", 10, "", "Общительный", "Напишите в 10 разных чатов", "Sociable", "Write to 10 different chats", "unique_chats"], ["social_25", "social", "👨‍👩‍👧‍👦", "uncommon", 25, "", "Социальный", "Напишите в 25 разных чатов", "Social", "Write to 25 different chats", "unique_chats"], ["social_50", "social", "🎉", "uncommon", 50, "", "Душа компании", "Напишите в 50 разных чатов", "Life of the Party", "Write to 50 different chats", "unique_chats"], ["social_100", "social", "🌐", "rare", 100, "", "Нетворкер", "Напишите в 100 разных чатов", "Networker", "Write to 100 different chats", "unique_chats"], ["social_250", "social", "🦋", "epic", 250, "", "Социальная бабочка", "Напишите в 250 разных чатов", "Social Butterfly", "Write to 250 different chats", "unique_chats"], ["social_500", "social", "🌍", "legendary", 500, "", "Всемирная сеть", "Напишите в 500 разных чатов", "World Wide Web", "Write to 500 different chats", "unique_chats"], ["group_member", "social", "👥", "common", 1, "", "Групповой игрок", "Напишите в групповой чат", "Team Player", "Write to a group chat", ""], ["private_talk", "social", "🔒", "common", 1, "", "Приватный разговор", "Напишите в личные сообщения", "Private Talk", "Write to a private chat", ""], ["channel_writer", "social", "📢", "uncommon", 1, "", "Автор канала", "Напишите в канал", "Channel Author", "Write to a channel", ""], ["bot_friend", "social", "🤖", "common", 1, "", "Друг ботов", "Напишите боту", "Bot Friend", "Write to a bot", ""], ["night_owl", "time", "🦉", "rare", 1, "", "Ночная сова", "Отправьте сообщение между 2:00 и 5:00", "Night Owl", "Send a message between 2:00 and 5:00", ""], ["early_bird", "time", "🐦", "rare", 1, "", "Ранняя пташка", "Отправьте сообщение между 5:00 и 6:00", "Early Bird", "Send a message between 5:00 and 6:00", ""], ["morning_person", "time", "🌅", "uncommon", 1, "", "Жаворонок", "Отправьте сообщение между 6:00 и 7:00", "Morning Person", "Send a message between 6:00 and 7:00", ""], ["lunch_break", "time", "🍽️", "common", 1, "", "Обеденный перерыв", "Отправьте сообщение между 12:00 и 13:00", "Lunch Break", "Send a message between 12:00 and 13:00", ""], ["evening_chatter", "time", "🌆", "common", 1, "", "Вечерний болтун", "Отправьте сообщение между 20:00 и 22:00", "Evening Chatter", "Send a message between 20:00 and 22:00", ""], ["monday_blues", "time", "😫", "common", 1, "", "Понедельник", "Отправьте сообщение в понедельник", "Monday Blues", "Send a message on Monday", ""], ["friday_vibes", "time", "🎊", "common", 1, "", "Пятница!", "Отправьте сообщение в пятницу", "Friday Vibes", "Send a message on Friday", ""], ["weekend_warrior", "time", "🏖️", "common", 1, "", "Воин выходных", "Отправьте сообщение в выходные", "Weekend Warrior", "Send a message on weekend", ""], ["new_year", "time", "🎆", "epic", 1, "", "С Новым Годом!", "Отправьте сообщение 1 января", "Happy New Year!", "Send a message on January 1st", ""], ["valentine", "time", "💕", "epic", 1, "", "Валентинка", "Отправьте сообщение 14 февраля", "Valentine", "Send a message on February 14th", ""], ["defender", "time", "🎖️", "epic", 1, "", "Защитник", "Отправьте сообщение 23 февраля", "Defender", "Send a message on February 23rd", ""], ["womens_day", "time", "💐", "epic", 1, "", "Джентльмен", "Отправьте сообщение 8 марта", "Gentleman", "Send a message on March 8th", ""], ["april_fools", "time", "🃏", "epic", 1, "", "День дурака", "Отправьте сообщение 1 апреля", "April Fools", "Send a message on April 1st", ""], ["may_day", "time", "🌸", "epic", 1, "", "Первомай", "Отправьте сообщение 1 мая", "May Day", "Send a message on May 1st", ""], ["victory_day", "time", "🎗️", "epic", 1, "", "День Победы", "Отправьте сообщение 9 мая", "Victory Day", "Send a message on May 9th", ""], ["halloween", "time", "🎃", "epic", 1, "", "Хэллоуин", "Отправьте сообщение 31 октября", "Halloween", "Send a message on October 31st", ""], ["christmas", "time", "🎄", "epic", 1, "", "Рождество", "Отправьте сообщение 25 декабря", "Christmas", "Send a message on December 25th", ""], ["telegram_birthday", "time", "🎂", "epic", 1, "", "День рождения Discord", "Отправьте сообщение 14 августа", "Discord Birthday", "Send a message on August 14th", ""], ["midnight", "time", "🌙", "rare", 1, "", "Полуночник", "Отправьте сообщение ровно в 00:00", "Midnight", "Send a message exactly at 00:00", ""], ["high_noon", "time", "☀️", "rare", 1, "", "Полдень", "Отправьте сообщение ровно в 12:00", "High Noon", "Send a message exactly at 12:00", ""], ["lucky_time", "time", "🍀", "rare", 1, "", "Счастливое время", "Отправьте сообщение в 11:11", "Lucky Time", "Send a message at 11:11", ""], ["double_luck", "time", "🎰", "rare", 1, "", "Двойная удача", "Отправьте сообщение в 22:22", "Double Luck", "Send a message at 22:22", ""], ["triple_digits", "time", "🔢", "uncommon", 1, "", "Три одинаковых", "Отправьте сообщение когда минуты = часам", "Triple Digits", "Send a message when minutes = hours", ""], ["fire_streak", "streaks", "✨", "uncommon", 1, "", "Искра", "Заведите огонёк с кем-то", "Spark", "Start a streak with someone", ""], ["fire_streak_7", "streaks", "🔥", "uncommon", 7, "", "Пламя", "Держите огонёк 7 дней", "Flame", "Keep a streak for 7 days", "_fire_streak"], ["fire_streak_14", "streaks", "🔥", "rare", 14, "", "Костёр", "Держите огонёк 14 дней", "Campfire", "Keep a streak for 14 days", "_fire_streak"], ["fire_streak_30", "streaks", "🔥", "rare", 30, "", "Факел", "Держите огонёк 30 дней", "Torch", "Keep a streak for 30 days", "_fire_streak"], ["fire_streak_60", "streaks", "🔥", "epic", 60, "", "Пожар", "Держите огонёк 60 дней", "Blaze", "Keep a streak for 60 days", "_fire_streak"], ["fire_streak_100", "streaks", "🔥", "epic", 100, "", "Вечный огонь", "Держите огонёк 100 дней", "Eternal Flame", "Keep a streak for 100 days", "_fire_streak"], ["fire_streak_200", "streaks", "☀️", "legendary", 200, "", "Солнце", "Держите огонёк 200 дней", "Sun", "Keep a streak for 200 days", "_fire_streak"], ["fire_streak_365", "streaks", "💫", "mythic", 365, "", "Сверхновая", "Держите огонёк 365 дней", "Supernova", "Keep a streak for 365 days", "_fire_streak"], ["multi_streaks_3", "streaks", "🎪", "uncommon", 3, "", "Огненный жонглёр", "Имейте 3 активных огонька", "Fire Juggler", "Have 3 active streaks", "_active_streaks"], ["multi_streaks_5", "streaks", "🧙", "rare", 5, "", "Огненный маг", "Имейте 5 активных огоньков", "Fire Mage", "Have 5 active streaks", "_active_streaks"], ["multi_streaks_10", "streaks", "👑", "epic", 10, "", "Повелитель огня", "Имейте 10 активных огоньков", "Fire Lord", "Have 10 active streaks", "_active_streaks"], ["streak_saved", "streaks", "🛟", "uncommon", 1, "", "Спасатель", "Восстановите потухший огонёк", "Savior", "Restore an expired streak", ""], ["emoji_only", "special", "😀", "uncommon", 1, "T10", "Эмодзимен", "Отправьте сообщение только из эмодзи (5+ эмодзи)", "Emoji Man", "Send a message with only emojis (5+ emojis)", ""], ["emoji_master", "special", "🎭", "rare", 1, "T10", "Мастер эмодзи", "Отправьте сообщение из 20+ эмодзи", "Emoji Master", "Send a message with 20+ emojis", ""], ["caps_lock", "special", "🔠", "uncommon", 1, "T10", "КАПСЛОКЕР", "Отправьте сообщение ЗАГЛАВНЫМИ БУКВАМИ (10+ букв)", "CAPS LOCK", "Send a message in ALL CAPS (10+ letters)", ""], ["link_sharer", "special", "🔗", "common", 1, "", "Ссылочник", "Отправьте сообщение со ссылкой", "Link Sharer", "Send a message with a link", ""], ["question", "special", "❓", "common", 1, "", "Любопытный", "Задайте вопрос (сообщение с ?)", "Curious", "Ask a question (message with ?)", ""], ["double_question", "special", "⁉️", "uncommon", 1, "", "Очень любопытный", "Используйте ?? в сообщении", "Very Curious", "Use ?? in a message", ""], ["exclamation", "special", "❗", "common", 1, "", "Восклицатель", "Выразите эмоции (сообщение с !!!)", "Exclaimer", "Express emotions (message with !!!)", ""], ["numbers_only", "special", "🔢", "uncommon", 1, "T10", "Математик", "Отправьте сообщение только из цифр (5+ цифр)", "Mathematician", "Send a message with only numbers (5+ digits)", ""], ["hashtag", "special", "#️⃣", "common", 1, "", "Хэштегер", "Используйте хэштег в сообщении", "Hashtagger", "Use a hashtag in a message", ""], ["multi_hashtag", "special", "📊", "uncommon", 1, "", "Тренды", "Используйте 3+ хэштега в сообщении", "Trending", "Use 3+ hashtags in a message", ""], ["mention", "special", "📣", "common", 1, "", "Упоминатель", "Упомяните пользователя (@username)", "Mentioner", "Mention a user (@username)", ""], ["multi_mention", "special", "📢", "rare", 1, "", "Массовое упоминание", "Упомяните 5+ пользователей в сообщении", "Mass Mention", "Mention 5+ users in a message", ""], ["multilingual", "special", "🌍", "uncommon", 1, "", "Полиглот", "Используйте 2 разных алфавита в сообщении", "Polyglot", "Use 2 different alphabets in a message", ""], ["trilingual", "special", "🌐", "rare", 1, "", "Трилингв", "Используйте 3+ разных алфавита в сообщении", "Trilingual", "Use 3+ different alphabets in a message", ""], ["long_word", "special", "📏", "uncommon", 1, "", "Словоблуд", "Используйте слово длиннее 15 букв", "Wordsmith", "Use a word longer than 15 letters", ""], ["mega_word", "special", "📐", "rare", 1, "", "Мега-слово", "Используйте слово длиннее 25 букв", "Mega Word", "Use a word longer than 25 letters", ""], ["repeater", "special", "🔁", "common", 1, "", "Повторяшка", "Повторите одну букву 5+ раз подряд", "Repeater", "Repeat a letter 5+ times in a row", ""], ["mega_repeater", "special", "🔄", "uncommon", 1, "", "Мега-повтор", "Повторите одну букву 15+ раз подряд", "Mega Repeater", "Repeat a letter 15+ times in a row", ""], ["no_vowels", "special", "🤫", "rare", 1, "", "Без гласных", "Отправьте слово без гласных (4+ буквы)", "No Vowels", "Send a word without vowels (4+ letters)", ""], ["all_vowels", "special", "🗣️", "rare", 1, "", "Все гласные", "Используйте все гласные в одном слове", "All Vowels", "Use all vowels in one word", ""], ["first_reaction", "reactions", "❤️", "common", 1, "", "Первая реакция", "Поставьте первую реакцию", "First Reaction", "Add your first reaction", "reactions_made"], ["reactor", "reactions", "⚛️", "common", 25, "", "Реактор", "Поставьте 25 реакций", "Reactor", "Add 25 reactions", "reactions_made"], ["reaction_fan", "reactions", "💖", "uncommon", 100, "", "Фанат реакций", "Поставьте 100 реакций", "Reaction Fan", "Add 100 reactions", "reactions_made"], ["reaction_lover", "reactions", "💝", "rare", 500, "", "Любитель реакций", "Поставьте 500 реакций", "Reaction Lover", "Add 500 reactions", "reactions_made"], ["reaction_master", "reactions", "🏆", "epic", 2000, "", "Мастер реакций", "Поставьте 2000 реакций", "Reaction Master", "Add 2000 reactions", "reactions_made"], ["day_1", "veteran", "📅", "common", 1, "", "День первый", "Используйте Discord 1 день", "Day One", "Use Discord for 1 day", "days_active"], ["week_1", "veteran", "📆", "uncommon", 7, "", "Неделя первая", "Используйте Discord 7 дней", "Week One", "Use Discord for 7 days", "days_active"], ["month_1", "veteran", "🗓️", "rare", 30, "", "Месяц первый", "Используйте Discord 30 дней", "Month One", "Use Discord for 30 days", "days_active"], ["quarter", "veteran", "📊", "epic", 90, "", "Квартал", "Используйте Discord 90 дней", "Quarter", "Use Discord for 90 days", "days_active"], ["half_year", "veteran", "🎯", "epic", 180, "", "Полгода", "Используйте Discord 180 дней", "Half Year", "Use Discord for 180 days", "days_active"], ["year_1", "veteran", "🏆", "legendary", 365, "", "Год первый", "Используйте Discord 365 дней", "Year One", "Use Discord for 365 days", "days_active"], ["media_variety", "collector", "🎨", "uncommon", 1, "", "Разнообразие", "Отправьте фото, видео, голосовое и стикер", "Variety", "Send a photo, video, voice and sticker", ""], ["complete_set", "collector", "📦", "rare", 1, "", "Полный набор", "Отправьте все типы медиа", "Complete Set", "Send all types of media", ""], ["chat_explorer", "explorer", "🧭", "uncommon", 1, "", "Исследователь чатов", "Напишите в ЛС, группу и канал", "Chat Explorer", "Write to DM, group and channel", ""], ["full_explorer", "explorer", "🗺️", "rare", 1, "", "Полный исследователь", "Напишите во все типы чатов", "Full Explorer", "Write to all chat types including bots", ""], ["secret_42", "secret", "🌌", "secret", 1, "S", "Ответ на всё", "Найдите ответ на главный вопрос", "Answer to Everything", "Find the answer to the ultimate question", ""], ["secret_hello_world", "secret", "💻", "secret", 1, "S", "Hello World", "Напишите как настоящий программист", "Hello World", "Write like a true programmer", ""], ["secret_lorem", "secret", "📝", "secret", 1, "S", "Lorem Ipsum", "Используйте заглушку дизайнера", "Lorem Ipsum", "Use the designer's placeholder", ""], ["secret_rickroll", "secret", "🎵", "secret", 1, "S", "Never Gonna", "Вы знаете правила, и я тоже", "Never Gonna", "You know the rules, and so do I", ""], ["secret_konami", "secret", "🎮", "secret", 1, "S", "Konami Code", "Введите легендарный код", "Konami Code", "Enter the legendary code", ""], ["secret_1337", "secret", "💀", "secret", 1, "S", "L33T", "Напишите на языке хакеров", "L33T", "Write in hacker language", ""], ["secret_pi", "secret", "🥧", "secret", 1, "S", "Число Пи", "Вспомните математику", "Pi", "Remember mathematics", ""], ["secret_matrix", "secret", "💊", "secret", 1, "S", "Матрица", "Красная или синяя?", "Matrix", "Red or blue?", ""], ["secret_palindrome", "secret", "🔄", "secret", 1, "S", "Палиндром", "Напишите слово-перевёртыш (5+ букв)", "Palindrome", "Write a palindrome word (5+ letters)", ""], ["secret_gg", "secret", "🎮", "secret", 1, "S", "GG", "Хорошая игра!", "GG", "Good game!", ""], ["secret_lol", "secret", "😂", "secret", 1, "S", "LOL", "Смех да и только", "LOL", "Laughing out loud", ""], ["secret_bruh", "secret", "😑", "secret", 1, "S", "Bruh", "Момент...", "Bruh", "That moment...", ""], ["secret_sus", "secret", "📮", "secret", 1, "S", "Sus", "Подозрительно...", "Sus", "Suspicious...", ""], ["secret_ok_boomer", "secret", "👴", "secret", 1, "S", "OK Boomer", "Ладно, бумер", "OK Boomer", "Alright, boomer", ""], ["secret_f_respect", "secret", "🙏", "secret", 1, "S", "F", "Выразите уважение", "F", "Pay respects", ""], ["secret_nice", "secret", "😏", "secret", 1, "S", "Nice", "Напишите магическое число", "Nice", "Write the magic number", ""], ["secret_uwu", "secret", "🥺", "secret", 1, "S", "UwU", "Милый момент", "UwU", "Cute moment", ""], ["secret_xd", "secret", "😆", "secret", 1, "S", "XD", "Классический смех", "XD", "Classic laugh", ""], ["secret_facepalm", "secret", "🤦", "secret", 1, "S", "Фейспалм", "Используйте 🤦", "Facepalm", "Use 🤦", ""], ["secret_thinking", "secret", "🤔", "secret", 1, "S", "Мыслитель", "Используйте 🤔", "Thinker", "Use 🤔", ""], ["secret_fire_emoji", "secret", "🔥", "secret", 1, "S", "Огонь", "Используйте 🔥", "Fire", "Use 🔥", ""], ["secret_heart", "secret", "❤️", "secret", 1, "S", "Любовь", "Отправьте ❤️", "Love", "Send ❤️", ""], ["secret_goodnight", "secret", "🌙", "secret", 1, "S", "Спокойной ночи", "Пожелайте спокойной ночи после полуночи", "Good Night", "Say good night after midnight", ""], ["secret_goodmorning", "secret", "🌅", "secret", 1, "S", "Доброе утро", "Пожелайте доброго утра до 8:00", "Good Morning", "Say good morning before 8:00", ""], ["secret_birthday", "secret", "🎂", "secret", 1, "S", "С днём рождения", "Поздравьте с днём рождения", "Happy Birthday", "Wish someone happy birthday", ""], ["secret_thanks", "secret", "🙏", "secret", 1, "S", "Благодарность", "Скажите спасибо", "Gratitude", "Say thank you", ""], ["secret_sorry", "secret", "😔", "secret", 1, "S", "Извинения", "Попросите прощения", "Apology", "Apologize", ""], ["secret_welcome", "secret", "👋", "secret", 1, "S", "Добро пожаловать", "Поприветствуйте кого-то", "Welcome", "Welcome someone", ""], ["secret_congrats", "secret", "🎉", "secret", 1, "S", "Поздравления", "Поздравьте с чем-то", "Congratulations", "Congratulate someone", ""], ["secret_bye", "secret", "👋", "secret", 1, "S", "До свидания", "Попрощайтесь", "Goodbye", "Say goodbye", ""], ["private_5", "social", "💌", "common", 5, "", "Близкий круг", "Напишите в 5 личных чатов", "Inner Circle", "Write to 5 private chats", "private_chats_count"], ["private_25", "social", "🤝", "uncommon", 25, "", "Свои люди", "Напишите в 25 личных чатов", "My People", "Write to 25 private chats", "private_chats_count"], ["private_100", "social", "👫", "rare", 100, "", "Личная сеть", "Напишите в 100 личных чатов", "Personal Network", "Write to 100 private chats", "private_chats_count"], ["private_500", "social", "💎", "epic", 500, "", "Армия друзей", "Напишите в 500 личных чатов", "Army of Friends", "Write to 500 private chats", "private_chats_count"], ["group_5", "social", "👨‍👩‍👧", "common", 5, "", "Командный игрок", "Напишите в 5 групп", "Team Player+", "Write to 5 groups", "group_chats_count"], ["group_25", "social", "🏟️", "uncommon", 25, "", "Активист", "Напишите в 25 групп", "Activist", "Write to 25 groups", "group_chats_count"], ["group_100", "social", "🎪", "rare", 100, "", "Универсал", "Напишите в 100 групп", "All-rounder", "Write to 100 groups", "group_chats_count"], ["group_500", "social", "🏛️", "epic", 500, "", "Глава фракций", "Напишите в 500 групп", "Faction Leader", "Write to 500 groups", "group_chats_count"], ["channel_5", "social", "📻", "uncommon", 5, "", "Голос редакции", "Напишите в 5 каналов", "Editorial Voice", "Write to 5 channels", "channel_chats_count"], ["channel_25", "social", "🎙️", "rare", 25, "", "Медиа-магнат", "Напишите в 25 каналов", "Media Mogul", "Write to 25 channels", "channel_chats_count"], ["channel_100", "social", "📡", "epic", 100, "", "Медиа-империя", "Напишите в 100 каналов", "Media Empire", "Write to 100 channels", "channel_chats_count"], ["bot_5", "social", "🤖", "common", 5, "", "Бот-фанат", "Напишите 5 ботам", "Bot Fan", "Write to 5 bots", "bot_chats_count"], ["bot_25", "social", "⚙️", "uncommon", 25, "", "Автоматизатор", "Напишите 25 ботам", "Automator", "Write to 25 bots", "bot_chats_count"], ["bot_100", "social", "🦾", "rare", 100, "", "Кибернетик", "Напишите 100 ботам", "Cybernetician", "Write to 100 bots", "bot_chats_count"], ["social_1000", "social", "🌌", "mythic", 1000, "", "Бог общения", "Напишите в 1,000 разных чатов", "God of Communication", "Write to 1,000 different chats", "unique_chats"], ["photo_god", "media", "🌌", "mythic", 10000, "", "Бог фотографии", "Отправьте 10,000 фото", "God of Photography", "Send 10,000 photos", "photos_sent"], ["video_god", "media", "🌌", "mythic", 5000, "", "Бог видео", "Отправьте 5,000 видео", "God of Video", "Send 5,000 videos", "videos_sent"], ["voice_god", "media", "🌌", "mythic", 10000, "", "Бог голоса", "Отправьте 10,000 голосовых", "God of Voice", "Send 10,000 voice messages", "voice_sent"], ["sticker_overlord", "media", "🌌", "mythic", 50000, "", "Властелин стикеров", "Отправьте 50,000 стикеров", "Sticker Overlord", "Send 50,000 stickers", "stickers_sent"], ["gif_god", "media", "🌌", "mythic", 10000, "", "Бог GIF", "Отправьте 10,000 GIF", "God of GIFs", "Send 10,000 GIFs", "gifs_sent"], ["file_god", "media", "🌌", "mythic", 10000, "", "Бог файлов", "Отправьте 10,000 файлов", "File God", "Send 10,000 files", "files_sent"], ["audio_god", "media", "🌌", "mythic", 2500, "", "Бог аудио", "Отправьте 2,500 аудио", "God of Audio", "Send 2,500 audio files", "audios_sent"], ["circle_god", "media", "🌌", "mythic", 2500, "", "Бог кружков", "Отправьте 2,500 кружков", "God of Circles", "Send 2,500 video notes", "video_notes_sent"], ["editor_legend", "messages", "🏆", "legendary", 2500, "", "Легендарный редактор", "Отредактируйте 2,500 сообщений", "Editor Legend", "Edit 2,500 messages", "edits_made"], ["reply_legend", "messages", "🏆", "legendary", 5000, "", "Легендарный собеседник", "Ответьте на 5,000 сообщений", "Reply Legend", "Reply to 5,000 messages", "replies_made"], ["forward_legend", "messages", "🏆", "legendary", 2500, "", "Легендарный курьер", "Перешлите 2,500 сообщений", "Forward Legend", "Forward 2,500 messages", "forwards_made"], ["reaction_god", "reactions", "🌌", "mythic", 10000, "", "Бог реакций", "Поставьте 10,000 реакций", "Reaction God", "Add 10,000 reactions", "reactions_made"], ["two_years", "veteran", "🎖️", "mythic", 730, "", "Два года", "Используйте Discord 730 дней", "Two Years", "Use Discord for 730 days", "days_active"], ["three_years", "veteran", "💎", "mythic", 1095, "", "Три года", "Используйте Discord 1,095 дней", "Three Years", "Use Discord for 1,095 days", "days_active"], ["fire_streak_500", "streaks", "☄️", "mythic", 500, "", "Метеор", "Держите огонёк 500 дней", "Meteor", "Keep a streak for 500 days", "_fire_streak"], ["fire_streak_1000", "streaks", "🌌", "mythic", 1000, "", "Галактика", "Держите огонёк 1,000 дней", "Galaxy", "Keep a streak for 1,000 days", "_fire_streak"], ["multi_streaks_15", "streaks", "🌟", "legendary", 15, "", "Огненный император", "Имейте 15 активных огоньков", "Fire Emperor", "Have 15 active streaks", "_active_streaks"], ["multi_streaks_25", "streaks", "🌌", "mythic", 25, "", "Звёздный император", "Имейте 25 активных огоньков", "Star Emperor", "Have 25 active streaks", "_active_streaks"], ["lightspeed", "messages", "💫", "mythic", 1, "", "Скорость света", "Отправьте 50 сообщений за минуту", "Lightspeed", "Send 50 messages in a minute", ""], ["russian_christmas", "time", "🎁", "epic", 1, "", "Православное Рождество", "Отправьте сообщение 7 января", "Orthodox Christmas", "Send a message on January 7th", ""], ["cosmonauts_day", "time", "🚀", "epic", 1, "", "День космонавтики", "Отправьте сообщение 12 апреля", "Cosmonautics Day", "Send a message on April 12th", ""], ["pi_day", "time", "🥧", "epic", 1, "", "День числа Пи", "Отправьте сообщение 14 марта", "Pi Day", "Send a message on March 14th", ""], ["programmers_day", "time", "💻", "epic", 1, "", "День программиста", "Отправьте сообщение 13 сентября", "Programmers' Day", "Send a message on September 13th", ""], ["friendship_day", "time", "🤝", "epic", 1, "", "День дружбы", "Отправьте сообщение 30 июля", "Friendship Day", "Send a message on July 30th", ""], ["triple_threes", "time", "🎲", "rare", 1, "", "Три тройки", "Отправьте сообщение в 3:33", "Triple Threes", "Send a message at 3:33", ""], ["lucky_777", "time", "🎰", "rare", 1, "", "Джекпот", "Отправьте сообщение в 7:07", "Jackpot", "Send a message at 7:07", ""], ["thirteen_thirteen", "time", "🔮", "rare", 1, "", "Чёртова дюжина", "Отправьте сообщение в 13:13", "Devil's Dozen", "Send a message at 13:13", ""], ["twenty_three", "time", "🌃", "rare", 1, "", "Перед сном", "Отправьте сообщение в 23:23", "Before Sleep", "Send a message at 23:23", ""], ["three_am_club", "time", "🌙", "epic", 1, "", "Клуб 3:00", "Отправьте сообщение ровно в 3:00", "3 AM Club", "Send a message exactly at 3:00", ""], ["triple_question", "special", "⁉️", "rare", 1, "", "Очень-очень любопытный", "Используйте ??? в сообщении", "Extremely Curious", "Use ??? in a message", ""], ["secret_terminator", "secret", "🦾", "secret", 1, "S", "Я вернусь", "Цитата робота из будущего", "I'll Be Back", "Quote from a future robot", ""], ["secret_force", "secret", "⚔️", "secret", 1, "S", "Сила с тобой", "Цитата далёкой галактики", "May The Force", "Far far away quote", ""], ["secret_wakanda", "secret", "🐆", "secret", 1, "S", "Ваканда навсегда", "Цитата супергероя", "Wakanda Forever", "Superhero quote", ""], ["secret_winter_is_coming", "secret", "🐺", "secret", 1, "S", "Зима близко", "Цитата с престолов", "Winter Is Coming", "Throne quote", ""], ["secret_bazinga", "secret", "🤓", "secret", 1, "S", "Базинга", "Любимое слово физика", "Bazinga", "Physicist's favorite", ""], ["secret_gandalf", "secret", "🧙‍♂️", "secret", 1, "S", "Ты не пройдёшь", "Цитата мага", "You Shall Not Pass", "Wizard quote", ""], ["secret_inception", "secret", "🌀", "secret", 1, "S", "Глубже", "Цитата из сна", "Inception", "Dream quote", ""], ["secret_chicken_dinner", "secret", "🍗", "secret", 1, "S", "Победный ужин", "Цитата королевской битвы", "Chicken Dinner", "Battle royale quote", ""], ["secret_meow", "secret", "🐱", "secret", 1, "S", "Мяу", "Привет от кота", "Meow", "Cat says hi", ""], ["secret_woof", "secret", "🐶", "secret", 1, "S", "Гав", "Привет от пса", "Woof", "Dog says hi", ""], ["secret_phi", "secret", "🌀", "secret", 1, "S", "Золотое сечение", "Магическое число 1.618", "Golden Ratio", "The magic 1.618", ""], ["secret_e_const", "secret", "🔢", "secret", 1, "S", "Число Эйлера", "Константа e", "Euler's Number", "Constant e", ""], ["secret_binary", "secret", "💾", "secret", 1, "S", "Двоичный код", "Сообщение из 0 и 1", "Binary Code", "Message of 0s and 1s", ""], ["secret_hex", "secret", "🎨", "secret", 1, "S", "Hex-код", "Шестнадцатеричное сообщение", "Hex Code", "Hexadecimal message", ""], ["secret_morse", "secret", "📡", "secret", 1, "S", "Морзянка", "Точки, тире и пробелы", "Morse Code", "Dots, dashes and spaces", ""], ["new_years_eve", "time", "🎆", "epic", 1, "", "Канун Нового Года", "Отправьте сообщение 31 декабря", "New Years Eve", "Send a message on December 31st", ""], ["leap_day", "time", "📆", "legendary", 1, "", "Високосный день", "Отправьте сообщение 29 февраля", "Leap Day", "Send a message on February 29th", ""], ["summer_solstice", "time", "☀️", "epic", 1, "", "Летнее солнцестояние", "Отправьте сообщение 21 июня", "Summer Solstice", "Send a message on June 21st", ""], ["winter_solstice", "time", "❄️", "epic", 1, "", "Зимнее солнцестояние", "Отправьте сообщение 21 декабря", "Winter Solstice", "Send a message on December 21st", ""], ["earth_day", "time", "🌍", "epic", 1, "", "День Земли", "Отправьте сообщение 22 апреля", "Earth Day", "Send a message on April 22nd", ""], ["friday_13", "time", "🔪", "legendary", 1, "", "Пятница 13-е", "Отправьте сообщение в пятницу 13-го", "Friday the 13th", "Send a message on Friday the 13th", ""], ["high_five", "time", "✋", "rare", 1, "", "Дай пять", "Отправьте сообщение в 5:55", "High Five", "Send a message at 5:55", ""], ["nine_nine", "time", "9️⃣", "rare", 1, "", "Девяносто девять", "Отправьте сообщение в 9:09", "Nine Nine", "Send a message at 9:09", ""], ["interrobang", "special", "⁉️", "rare", 1, "", "Интерробанг", "Используйте ?! или !? в сообщении", "Interrobang", "Use ?! or !? in a message", ""], ["lots_of_dots", "special", "⋯", "common", 1, "", "Многоточие", "Закончите сообщение на ...", "Trailing Off", "End a message with ...", ""], ["sequence_numbers", "special", "🔢", "uncommon", 1, "", "Последовательность", "Отправьте 5+ цифр подряд по порядку", "Sequence", "Send 5+ consecutive digits in order", ""], ["triple_emoji_combo", "special", "🎰", "uncommon", 1, "", "Тройное комбо", "Повторите эмодзи 3+ раз подряд", "Triple Combo", "Repeat an emoji 3+ times in a row", ""], ["emoticon_only", "special", "🙂", "common", 1, "", "Смайлик", "Отправьте только смайлик типа :) или ^_^", "Emoticon", "Send a single emoticon like :) or ^_^", ""], ["same_word_3x", "special", "🔁", "uncommon", 1, "", "Заело", "Повторите одно слово 3+ раз", "Stuck Record", "Repeat the same word 3+ times", ""], ["mega_collector", "collector", "🎁", "epic", 1, "", "Мега-коллекционер", "Отправьте 100+ каждого типа медиа", "Mega Collector", "Send 100+ of every media type", ""], ["chat_emperor", "explorer", "👑", "legendary", 1, "", "Император чатов", "Напишите в 50+ ЛС, групп, каналов и ботов", "Chat Emperor", "Write to 50+ DMs, groups, channels and bots", ""], ["secret_father", "secret", "🌠", "secret", 1, "S", "Я твой отец", "Шокирующее откровение", "I Am Your Father", "Shocking revelation", ""], ["secret_shut_up_money", "secret", "💰", "secret", 1, "S", "Заткнись и возьми мои деньги", "Цитата покупателя", "Take My Money", "Buyer quote", ""], ["secret_great_power", "secret", "🕷️", "secret", 1, "S", "С большой силой", "Цитата паука", "Great Power", "Spider quote", ""], ["secret_elementary", "secret", "🔍", "secret", 1, "S", "Элементарно", "Цитата детектива", "Elementary", "Detective quote", ""], ["secret_to_be", "secret", "💀", "secret", 1, "S", "Быть или не быть", "Шекспир", "To Be Or Not To Be", "Shakespeare", ""], ["secret_houston", "secret", "🚀", "secret", 1, "S", "Хьюстон, у нас проблема", "Цитата астронавта", "Houston", "Astronaut quote", ""], ["secret_poehali", "secret", "🛰️", "secret", 1, "S", "Поехали!", "Цитата Гагарина", "Poyekhali", "Gagarin quote", ""], ["secret_precious", "secret", "💍", "secret", 1, "S", "Моя прелесть", "Цитата Голлума", "My Precious", "Gollum quote", ""], ["first_poll", "interactive", "📊", "common", 1, "", "Опросник", "Создайте первый опрос", "First Poll", "Create your first poll", "polls_created"], ["pollster", "interactive", "📈", "uncommon", 10, "", "Социолог", "Создайте 10 опросов", "Pollster", "Create 10 polls", "polls_created"], ["poll_master", "interactive", "📉", "rare", 50, "", "Мастер опросов", "Создайте 50 опросов", "Poll Master", "Create 50 polls", "polls_created"], ["referendum", "interactive", "🗳️", "epic", 200, "", "Референдум", "Создайте 200 опросов", "Referendum", "Create 200 polls", "polls_created"], ["first_todo", "interactive", "✅", "common", 1, "", "Список дел", "Создайте первый to-do", "First To-Do", "Create your first to-do list", "todos_created"], ["todo_master", "interactive", "📋", "rare", 25, "", "Планировщик", "Создайте 25 to-do", "Planner", "Create 25 to-do lists", "todos_created"], ["first_invoice", "interactive", "💸", "uncommon", 1, "", "Счёт", "Создайте первый счёт", "First Invoice", "Create your first invoice", "invoices_sent"], ["invoice_master", "interactive", "💼", "rare", 25, "", "Бухгалтер", "Создайте 25 счетов", "Accountant", "Create 25 invoices", "invoices_sent"], ["first_game", "interactive", "🎮", "common", 1, "", "Геймер", "Отправьте первую игру", "Gamer", "Send your first game", "games_sent"], ["game_lover", "interactive", "🕹️", "uncommon", 25, "", "Любитель игр", "Отправьте 25 игр", "Game Lover", "Send 25 games", "games_sent"], ["first_spoiler", "interactive", "🫥", "common", 1, "", "Спойлерист", "Отправьте медиа со спойлером", "Spoilerist", "Send media with spoiler", "spoilers_sent"], ["spoiler_addict", "interactive", "👁️", "rare", 100, "", "Любитель тайн", "Отправьте 100 спойлеров", "Mystery Lover", "Send 100 spoilers", "spoilers_sent"], ["first_effect", "interactive", "✨", "common", 1, "", "Эффект", "Отправьте сообщение с эффектом", "Effect", "Send a message with effect", "effects_used"], ["effects_fan", "interactive", "🎆", "uncommon", 50, "", "Любитель эффектов", "Отправьте 50 сообщений с эффектами", "Effects Fan", "Send 50 messages with effects", "effects_used"], ["effects_master", "interactive", "🎇", "rare", 250, "", "Мастер эффектов", "Отправьте 250 сообщений с эффектами", "Effects Master", "Send 250 messages with effects", "effects_used"], ["first_quick_reply", "interactive", "⚡", "common", 1, "", "Быстрый ответ", "Используйте quick reply", "Quick Reply", "Use a quick reply", "quick_replies_used"], ["quick_master", "interactive", "🚀", "uncommon", 50, "", "Молниеносный", "Используйте quick reply 50 раз", "Lightning Fast", "Use quick reply 50 times", "quick_replies_used"], ["first_inverted", "interactive", "🔄", "uncommon", 1, "", "Перевёртыш", "Отправьте медиа под текстом", "Inverted", "Send media below text", "inverted_media_sent"], ["first_contact", "social", "📇", "common", 1, "", "Визитка", "Поделитесь контактом", "Card", "Share a contact", "contacts_shared"], ["contact_sharer", "social", "📑", "uncommon", 25, "", "Связной", "Поделитесь 25 контактами", "Connector", "Share 25 contacts", "contacts_shared"], ["first_location", "social", "📍", "common", 1, "", "Геолокация", "Отправьте местоположение", "Geolocation", "Send a location", "locations_sent"], ["geo_tagger", "social", "🗺️", "uncommon", 25, "", "Геотегер", "Отправьте 25 локаций", "Geo Tagger", "Send 25 locations", "locations_sent"], ["cartographer", "social", "🧭", "rare", 100, "", "Картограф", "Отправьте 100 локаций", "Cartographer", "Send 100 locations", "locations_sent"], ["first_live_location", "social", "📡", "uncommon", 1, "", "Прямая трансляция", "Поделитесь живой локацией", "Live Location", "Share a live location", "live_locations_sent"], ["first_story_share", "media", "🌟", "common", 1, "", "Расшаренная сторис", "Поделитесь сторис", "Shared Story", "Share a story", "stories_shared"], ["story_amplifier", "media", "📣", "uncommon", 25, "", "Усилитель историй", "Поделитесь 25 сторис", "Story Amplifier", "Share 25 stories", "stories_shared"], ["first_story_reply", "media", "💬", "common", 1, "", "Ответ на сторис", "Ответьте на сторис", "Story Reply", "Reply to a story", "story_replies"], ["story_commenter", "media", "🗯️", "uncommon", 50, "", "Комментатор сторис", "Ответьте на 50 сторис", "Story Commenter", "Reply to 50 stories", "story_replies"], ["first_quote_reply", "messages", "💭", "common", 1, "", "Цитата", "Ответьте с цитатой", "Quote", "Reply with a quote", "quote_replies"], ["quote_master", "messages", "📜", "uncommon", 50, "", "Цитатник", "Ответьте с цитатой 50 раз", "Quote Master", "Reply with quote 50 times", "quote_replies"], ["first_dice", "luck", "🎲", "common", 1, "", "Игрок", "Бросьте кубик", "Roller", "Roll a dice", "dice_rolled"], ["dice_addict", "luck", "🎰", "uncommon", 50, "", "Зависимый от удачи", "Бросьте 50 кубиков", "Luck Addict", "Roll 50 dice", "dice_rolled"], ["dice_legend", "luck", "🎯", "rare", 250, "", "Легенда удачи", "Бросьте 250 кубиков", "Luck Legend", "Roll 250 dice", "dice_rolled"], ["lucky_six", "luck", "🎲", "rare", 1, "", "Шестёрка!", "Выбросите 6 на кубике", "Lucky Six", "Roll a 6 on dice", ""], ["dart_bullseye", "luck", "🎯", "rare", 1, "", "Яблочко", "Попадите точно в центр на дартсе", "Bullseye", "Hit the bullseye on darts", ""], ["bowling_strike", "luck", "🎳", "rare", 1, "", "Страйк", "Сделайте страйк в боулинге", "Strike", "Roll a strike in bowling", ""], ["basketball_score", "luck", "🏀", "rare", 1, "", "Точный бросок", "Забейте мяч в баскетболе", "Slam Dunk", "Score in basketball", ""], ["football_goal", "luck", "⚽", "rare", 1, "", "Гол!", "Забейте гол в футболе", "Goal!", "Score in football", ""], ["slot_jackpot", "luck", "🎰", "mythic", 1, "", "ДЖЕКПОТ 777", "Выбейте 777 на слот-машине", "JACKPOT 777", "Hit 777 on the slot machine", ""]];

  var ACHIEVEMENTS = [];
  var ACH_BY_ID = {};
  var ACH_BY_STAT = {};

  for (var i = 0; i < RAW_ACHIEVEMENTS.length; i++) {
    var r = RAW_ACHIEVEMENTS[i];
    var ach = {
      id: r[0],
      category: r[1],
      icon: r[2],
      rarity: r[3],
      target: r[4],
      is_secret: r[5].indexOf("S") !== -1,
      requires_threshold: r[5].indexOf("T") !== -1 ? parseInt(r[5].replace("T", ""), 10) : 0,
      name_ru: r[6],
      desc_ru: r[7],
      name_en: r[8],
      desc_en: r[9],
      stat_field: r[10]
    };
    ACHIEVEMENTS.push(ach);
    ACH_BY_ID[ach.id] = ach;
    if (ach.stat_field && ach.target > 0) {
      if (!ACH_BY_STAT[ach.stat_field]) ACH_BY_STAT[ach.stat_field] = [];
      ACH_BY_STAT[ach.stat_field].push(ach);
    }
  }

  // ── Default Storage Initialization ────────────────────────────────────────
  if (storage.unlocked === undefined) storage.unlocked = {};
  if (storage.soundEnabled === undefined) storage.soundEnabled = true;
  if (storage.toastsEnabled === undefined) storage.toastsEnabled = true;
  if (storage.language === undefined) storage.language = "auto";
  if (storage.stats === undefined) {
    storage.stats = {
      messages_sent: 0,
      photos_sent: 0,
      videos_sent: 0,
      voice_sent: 0,
      stickers_sent: 0,
      gifs_sent: 0,
      files_sent: 0,
      audios_sent: 0,
      video_notes_sent: 0,
      edits_made: 0,
      replies_made: 0,
      forwards_made: 0,
      reactions_made: 0,
      polls_created: 0,
      dice_rolled: 0,
      unique_chats: [],
      private_chats: [],
      group_chats: [],
      channel_chats: [],
      bot_chats: [],
      days_active: [],
      fire_streak: 0,
      fire_streaks: {}
    };
  }

  function isRussian() {
    if (storage.language === "ru") return true;
    if (storage.language === "en") return false;
    var loc = (LocaleStore && LocaleStore.locale) || "";
    return loc.startsWith("ru") || loc.startsWith("uk") || loc.startsWith("be");
  }

  function getAchName(ach) {
    return isRussian() ? ach.name_ru : ach.name_en;
  }

  function getAchDesc(ach) {
    return isRussian() ? ach.desc_ru : ach.desc_en;
  }

  // ── Toast Notification (Top toast matching Vendetta UI) ───────────────────
  function showUnlockToast(ach) {
    if (storage.toastsEnabled === false) return;
    try {
      var rInfo = RARITY_INFO[ach.rarity] || RARITY_INFO.common;
      var name = getAchName(ach);
      var title = isRussian() ? "🏆 Достижение разблокировано!" : "🏆 Achievement Unlocked!";
      var msg = title + "\n" + ach.icon + " " + name + " " + rInfo.emoji;

      var icon = getAssetIDByName("ShieldUserIcon") ||
                 getAssetIDByName("ImageIcon") ||
                 getAssetIDByName("StickerIcon");

      if (showToast) {
        showToast(msg, icon);
      }
    } catch (e) {}
  }

  // ── Unlocking Achievements ────────────────────────────────────────────────
  function tryUnlock(achId) {
    if (!achId) return;
    if (storage.unlocked && storage.unlocked[achId]) return;

    var ach = ACH_BY_ID[achId];
    if (!ach) return;

    if (ach.requires_threshold > 0) {
      var msgs = (storage.stats && storage.stats.messages_sent) || 0;
      if (msgs < ach.requires_threshold) return;
    }

    if (!storage.unlocked) storage.unlocked = {};
    storage.unlocked[achId] = {
      date: new Date().toISOString(),
      timestamp: Date.now()
    };

    var isRare = ach.rarity !== "common" && ach.rarity !== "uncommon";
    playSound(isRare);
    showUnlockToast(ach);
  }

  function checkThresholdAchievements(field, value) {
    var list = ACH_BY_STAT[field];
    if (!list) return;
    for (var j = 0; j < list.length; j++) {
      var a = list[j];
      if (value >= a.target) {
        tryUnlock(a.id);
      }
    }
  }

  // ── Helper Sets in Memory ─────────────────────────────────────────────────
  var recentMessageTimestamps = [];
  var seenMessageIds = new Set();

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // ── Text Pattern Analysis ─────────────────────────────────────────────────
  function analyzeText(text, now) {
    if (!text || typeof text !== "string") return;
    var ts = text.trim();
    if (!ts) return;

    var s = storage.stats;
    if (ts.length === 1 && s.messages_sent >= 50) {
      tryUnlock("minimalist");
    }

    if (ts.length >= 3000) tryUnlock("tolstoy");
    if (ts.length >= 1500) tryUnlock("epic_writer");
    if (ts.length >= 700)  tryUnlock("novelist");
    if (ts.length >= 300)  tryUnlock("writer");

    var tl = text.toLowerCase();

    // Emoji pattern matching
    var emojiMatches = text.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
    var nonEmoji = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]/gu, "");
    if (emojiMatches.length >= 20 && nonEmoji.length === 0) tryUnlock("emoji_master");
    if (emojiMatches.length >= 5 && nonEmoji.length === 0) tryUnlock("emoji_only");

    // All caps
    var lettersOnly = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
    if (lettersOnly.length >= 10 && lettersOnly === lettersOnly.toUpperCase()) {
      tryUnlock("caps_lock");
    }

    // Numbers only
    if (ts.length >= 5 && /^\d+$/.test(ts)) {
      tryUnlock("numbers_only");
    }

    // Links
    if (/https?:\/\/\S+/.test(text)) {
      tryUnlock("link_sharer");
    }

    // Hashtags
    var hashtags = text.match(/#[a-zA-Z0-9_]+/g) || [];
    if (hashtags.length >= 3) tryUnlock("multi_hashtag");
    if (hashtags.length >= 1) tryUnlock("hashtag");

    // Mentions
    var mentions = text.match(/@[a-zA-Z0-9_]+|<@!?\d+>/g) || [];
    if (mentions.length >= 5) tryUnlock("multi_mention");
    if (mentions.length >= 1) tryUnlock("mention");

    // Punctuation
    if (text.indexOf("???") !== -1) tryUnlock("triple_question");
    if (text.indexOf("??") !== -1)  tryUnlock("double_question");
    if (text.indexOf("?") !== -1)   tryUnlock("question");
    if (text.indexOf("!!!") !== -1) tryUnlock("exclamation");
    if (text.indexOf("?!") !== -1 || text.indexOf("!?") !== -1) tryUnlock("interrobang");
    if (ts.endsWith("...") || ts.endsWith("…")) tryUnlock("lots_of_dots");

    // Formats & Ciphers
    if (ts.length >= 8 && /^[01\s]+$/.test(ts) && ts.indexOf("0") !== -1 && ts.indexOf("1") !== -1) {
      tryUnlock("secret_binary");
    }
    if (ts.length >= 10 && /^0x[0-9a-fA-F]+$/.test(ts)) {
      tryUnlock("secret_hex");
    }
    if (ts.length >= 10 && /^[.\-/\s]+$/.test(ts) && ts.indexOf(".") !== -1 && ts.indexOf("-") !== -1) {
      tryUnlock("secret_morse");
    }

    // Sequences (12345 or 54321)
    var seqMatch = text.match(/\d{5,}/);
    if (seqMatch) {
      var ds = seqMatch[0];
      var isAsc = true, isDesc = true;
      for (var k = 0; k < ds.length - 1; k++) {
        var diff = Number(ds[k+1]) - Number(ds[k]);
        if (diff !== 1) isAsc = false;
        if (diff !== -1) isDesc = false;
      }
      if (isAsc || isDesc) tryUnlock("sequence_numbers");
    }

    // Repeated identical emojis
    if (/([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}])\1{2,}/u.test(text)) {
      tryUnlock("triple_emoji_combo");
    }

    // Emoticons
    var emoticons = [":3", ":p", ":d", ":)", ":(", ":-)", ":-(", ":o", ";)", "^_^", "x_x", "xd"];
    if (emoticons.indexOf(ts.toLowerCase()) !== -1) {
      tryUnlock("emoticon_only");
    }

    // Same word 3 times
    var words = (tl.match(/[a-zA-Zа-яА-ЯёЁ0-9_]{3,}/g) || []);
    if (words.length >= 3) {
      var wCount = {};
      for (var w = 0; w < words.length; w++) {
        wCount[words[w]] = (wCount[words[w]] || 0) + 1;
        if (wCount[words[w]] >= 3) {
          tryUnlock("same_word_3x");
          break;
        }
      }
    }

    // Word length
    var pureWords = text.match(/[a-zA-Zа-яА-ЯёЁ]+/g) || [];
    for (var pw = 0; pw < pureWords.length; pw++) {
      var pWord = pureWords[pw];
      if (pWord.length > 25) tryUnlock("mega_word");
      if (pWord.length > 15) tryUnlock("long_word");

      // Vowels check
      var pwLow = pWord.toLowerCase();
      if (pwLow.length >= 4) {
        var hasVowel = /[aeiouаеёиоуыэюя]/.test(pwLow);
        if (!hasVowel) tryUnlock("no_vowels");

        var ruVowels = "аеёиоуыэюя";
        var hasAllRu = true;
        for (var rv = 0; rv < ruVowels.length; rv++) {
          if (pwLow.indexOf(ruVowels[rv]) === -1) { hasAllRu = false; break; }
        }
        var enVowels = "aeiou";
        var hasAllEn = true;
        for (var ev = 0; ev < enVowels.length; ev++) {
          if (pwLow.indexOf(enVowels[ev]) === -1) { hasAllEn = false; break; }
        }
        if (hasAllRu || hasAllEn) tryUnlock("all_vowels");
      }
    }

    // Repeated characters
    if (/(.)\1{14,}/.test(text)) tryUnlock("mega_repeater");
    if (/(.)\1{4,}/.test(text))  tryUnlock("repeater");

    // Multilingual scripts
    var scriptCount = 0;
    if (/[a-zA-Z]/.test(text)) scriptCount++;
    if (/[а-яА-ЯёЁ]/.test(text)) scriptCount++;
    if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text)) scriptCount++;
    if (/[\u0600-\u06FF]/.test(text)) scriptCount++;
    if (/[\u0590-\u05FF]/.test(text)) scriptCount++;
    if (/[\uAC00-\uD7AF]/.test(text)) scriptCount++;
    if (scriptCount >= 3) tryUnlock("trilingual");
    if (scriptCount >= 2) tryUnlock("multilingual");

    // Palindrome (5+ letters)
    var cleanLetters = tl.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
    if (cleanLetters.length >= 5 && cleanLetters === cleanLetters.split("").reverse().join("")) {
      tryUnlock("secret_palindrome");
    }

    // Secret patterns
    var secrets = [
      [/\b42\b/, "secret_42"],
      [/hello[,]?\s*world/, "secret_hello_world"],
      [/lorem ipsum/, "secret_lorem"],
      [/never gonna give you up|rickroll/, "secret_rickroll"],
      [/↑↑↓↓←→←→ba|uuddlrlrba/, "secret_konami"],
      [/\b1337\b|l33t|h4x0r/, "secret_1337"],
      [/3[.,]14159/, "secret_pi"],
      [/red pill|blue pill|красная таблетка|синяя таблетка/, "secret_matrix"],
      [/\bgg\b|\bгг\b/, "secret_gg"],
      [/\blol\b|\bлол\b/, "secret_lol"],
      [/\bbruh\b|\bбрух?\b/, "secret_bruh"],
      [/\bsus\b|\bсас\b/, "secret_sus"],
      [/ok boomer|окей бумер/, "secret_ok_boomer"],
      [/\b69\b|\bnice\b/, "secret_nice"],
      [/uwu|owo/, "secret_uwu"],
      [/\bxd\b/, "secret_xd"],
      [/^f$|press f|^ф$/, "secret_f_respect"],
      [/i'?ll be back|я ?вернусь/, "secret_terminator"],
      [/may the force|да пребудет с тобой сила/, "secret_force"],
      [/wakanda forever|ваканда навсегда/, "secret_wakanda"],
      [/winter is coming|зима близко/, "secret_winter_is_coming"],
      [/\bbazinga\b|\bбазинга\b/, "secret_bazinga"],
      [/you shall not pass|ты не пройд[её]шь/, "secret_gandalf"],
      [/we need to go deeper/, "secret_inception"],
      [/winner winner chicken dinner|chicken dinner/, "secret_chicken_dinner"],
      [/\bmeow+\b|\bмяу+\b/, "secret_meow"],
      [/\bwoof+\b|\bгав+\b|\bbark+\b/, "secret_woof"],
      [/1[.,]618|golden ratio|золотое сечение/, "secret_phi"],
      [/2[.,]71828/, "secret_e_const"],
      [/i am your father|i'?m your father|я твой отец/, "secret_father"],
      [/shut up and take my money|заткнись и возьми мои деньги/, "secret_shut_up_money"],
      [/with great power/, "secret_great_power"],
      [/\belementary\b|элементарно[, ]+ватсон/, "secret_elementary"],
      [/to be or not to be|быть или не быть/, "secret_to_be"],
      [/houston[, ]+we have a problem|хьюстон[, ]+у нас проблема/, "secret_houston"],
      [/\bпоехали\b|let'?s go to space/, "secret_poehali"],
      [/\bmy precious\b|моя прелесть/, "secret_precious"]
    ];

    for (var sIdx = 0; sIdx < secrets.length; sIdx++) {
      if (secrets[sIdx][0].test(tl)) {
        tryUnlock(secrets[sIdx][1]);
      }
    }

    // Secret emojis
    if (tl.indexOf("🤦") !== -1) tryUnlock("secret_facepalm");
    if (tl.indexOf("🤔") !== -1) tryUnlock("secret_thinking");
    if (tl.indexOf("🔥") !== -1) tryUnlock("secret_fire_emoji");
    if (/[❤️❤♥️♥]/.test(tl))    tryUnlock("secret_heart");

    // Luck emojis
    if (tl.indexOf("🎲") !== -1) {
      s.dice_rolled = (s.dice_rolled || 0) + 1;
      checkThresholdAchievements("dice_rolled", s.dice_rolled);
      if (Math.random() < 0.16) tryUnlock("lucky_six");
    }
    if (tl.indexOf("🎯") !== -1) {
      if (Math.random() < 0.2) tryUnlock("dart_bullseye");
    }
    if (tl.indexOf("🎳") !== -1) {
      if (Math.random() < 0.2) tryUnlock("bowling_strike");
    }
    if (tl.indexOf("🏀") !== -1) {
      if (Math.random() < 0.25) tryUnlock("basketball_score");
    }
    if (tl.indexOf("⚽") !== -1) {
      if (Math.random() < 0.25) tryUnlock("football_goal");
    }
    if (tl.indexOf("🎰") !== -1) {
      if (Math.random() < 0.05) tryUnlock("slot_jackpot");
    }

    // Good morning & Good night
    var h = now.getHours();
    if (h >= 0 && h < 5 && (tl.indexOf("спокойной") !== -1 || tl.indexOf("goodnight") !== -1 || tl.indexOf("gn") !== -1)) {
      tryUnlock("secret_goodnight");
    }
    if (h >= 5 && h < 9 && (tl.indexOf("доброе утро") !== -1 || tl.indexOf("good morning") !== -1 || tl.indexOf("gm") !== -1)) {
      tryUnlock("secret_goodmorning");
    }

    // Social phrases
    var phraseAchs = [
      [["с днём рождения", "happy birthday", "с др"], "secret_birthday"],
      [["спасибо", "thank you", "thanks", "благодарю"], "secret_thanks"],
      [["извини", "sorry", "прости", "простите"], "secret_sorry"],
      [["добро пожаловать", "welcome"], "secret_welcome"],
      [["поздравляю", "congratulations", "congrats"], "secret_congrats"],
      [["пока", "goodbye", "bye", "до свидания"], "secret_bye"]
    ];
    for (var p = 0; p < phraseAchs.length; p++) {
      var pList = phraseAchs[p][0];
      for (var pl = 0; pl < pList.length; pl++) {
        if (tl.indexOf(pList[pl]) !== -1) {
          tryUnlock(phraseAchs[p][1]);
          break;
        }
      }
    }
  }

  // ── Time & Date Analysis ──────────────────────────────────────────────────
  function analyzeTime(now) {
    var h  = now.getHours();
    var m  = now.getMinutes();
    var wd = now.getDay(); // 0 is Sunday, 1 is Monday...
    var mo = now.getMonth() + 1;
    var d  = now.getDate();

    // Time ranges
    if (h >= 2 && h < 5)   tryUnlock("night_owl");
    if (h >= 5 && h < 6)   tryUnlock("early_bird");
    if (h >= 6 && h < 7)   tryUnlock("morning_person");
    if (h >= 12 && h < 13) tryUnlock("lunch_break");
    if (h >= 20 && h < 22) tryUnlock("evening_chatter");

    // Weekdays
    if (wd === 1) tryUnlock("monday_blues");
    if (wd === 5) tryUnlock("friday_vibes");
    if (wd === 0 || wd === 6) tryUnlock("weekend_warrior");
    if (wd === 5 && d === 13) tryUnlock("friday_13");

    // Exact times
    var exactMap = {
      "0:0":   "midnight",
      "3:0":   "three_am_club",
      "3:33":  "triple_threes",
      "5:55":  "high_five",
      "7:7":   "lucky_777",
      "9:9":   "nine_nine",
      "11:11": "lucky_time",
      "12:0":  "high_noon",
      "13:13": "thirteen_thirteen",
      "22:22": "double_luck",
      "23:23": "twenty_three"
    };
    var key = h + ":" + m;
    if (exactMap[key]) {
      tryUnlock(exactMap[key]);
    } else if (h === m) {
      tryUnlock("triple_digits");
    }

    // Holidays
    var holidays = {
      "1-1": "new_year", "1-7": "russian_christmas", "2-14": "valentine",
      "2-23": "defender", "2-29": "leap_day", "3-8": "womens_day",
      "3-14": "pi_day", "4-1": "april_fools", "4-12": "cosmonauts_day",
      "4-22": "earth_day", "5-1": "may_day", "5-9": "victory_day",
      "6-21": "summer_solstice", "7-30": "friendship_day", "8-14": "telegram_birthday",
      "9-13": "programmers_day", "10-31": "halloween", "12-21": "winter_solstice",
      "12-25": "christmas", "12-31": "new_years_eve"
    };
    var hKey = mo + "-" + d;
    if (holidays[hKey]) tryUnlock(holidays[hKey]);
  }

  // ── Speed Achievements ────────────────────────────────────────────────────
  function analyzeSpeed() {
    var nowSec = Date.now() / 1000;
    recentMessageTimestamps.push(nowSec);
    // Keep last 60s
    while (recentMessageTimestamps.length > 0 && nowSec - recentMessageTimestamps[0] > 60) {
      recentMessageTimestamps.shift();
    }

    var msgs30s = 0;
    for (var i = recentMessageTimestamps.length - 1; i >= 0; i--) {
      if (nowSec - recentMessageTimestamps[i] <= 30) msgs30s++;
      else break;
    }
    var msgs60s = recentMessageTimestamps.length;

    if (msgs30s >= 5)  tryUnlock("speed_demon");
    if (msgs60s >= 10) tryUnlock("spam_master");
    if (msgs60s >= 20) tryUnlock("keyboard_warrior");
    if (msgs60s >= 30) tryUnlock("typing_god");
    if (msgs60s >= 50) tryUnlock("lightspeed");
  }

  // ── Collector Achievements ────────────────────────────────────────────────
  function analyzeCollector() {
    var s = storage.stats;
    var hp  = s.photos_sent > 0;
    var hv  = s.videos_sent > 0;
    var hvo = s.voice_sent > 0;
    var hs  = s.stickers_sent > 0;
    var hg  = s.gifs_sent > 0;
    var hf  = s.files_sent > 0;
    var ha  = s.audios_sent > 0;

    if (hp && hv && hvo && hs) {
      tryUnlock("media_variety");
    }
    if (hp && hv && hvo && hs && hg && hf && ha) {
      tryUnlock("complete_set");
    }
    if (s.photos_sent >= 100 && s.videos_sent >= 100 && s.voice_sent >= 100 &&
        s.stickers_sent >= 100 && s.gifs_sent >= 100 && s.files_sent >= 100 &&
        s.audios_sent >= 100) {
      tryUnlock("mega_collector");
    }

    var privCount = (s.private_chats && s.private_chats.length) || 0;
    var grpCount  = (s.group_chats && s.group_chats.length) || 0;
    var chanCount = (s.channel_chats && s.channel_chats.length) || 0;
    var botCount  = (s.bot_chats && s.bot_chats.length) || 0;

    if (privCount > 0 && grpCount > 0 && chanCount > 0) {
      tryUnlock("chat_explorer");
    }
    if (privCount > 0 && grpCount > 0 && chanCount > 0 && botCount > 0) {
      tryUnlock("full_explorer");
    }
    if (privCount >= 50 && grpCount >= 50 && chanCount >= 50 && botCount >= 50) {
      tryUnlock("chat_emperor");
    }
  }

  // ── Streaks & Partner Handling ────────────────────────────────────────────
  function updateStreaks(channelId, isDM, partnerName) {
    if (!isDM || !channelId) return;
    var s = storage.stats;
    if (!s.fire_streaks) s.fire_streaks = {};

    var today = todayStr();
    var streak = s.fire_streaks[channelId];
    if (!streak) {
      streak = {
        partner_name: partnerName || "Friend",
        streak_days: 1,
        last_date: today,
        started_at: today
      };
      s.fire_streaks[channelId] = streak;
      tryUnlock("fire_streak");
    } else {
      if (streak.last_date !== today) {
        // Check if yesterday
        var last = new Date(streak.last_date);
        var curr = new Date(today);
        var diffDays = Math.round((curr - last) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          streak.streak_days = (streak.streak_days || 1) + 1;
          streak.last_date = today;
        } else if (diffDays > 1) {
          // Reset
          streak.streak_days = 1;
          streak.last_date = today;
        }
      }
    }

    var maxStreak = 0;
    for (var k in s.fire_streaks) {
      if (s.fire_streaks[k].streak_days > maxStreak) {
        maxStreak = s.fire_streaks[k].streak_days;
      }
    }
    s.fire_streak = maxStreak;
    checkThresholdAchievements("_fire_streak", maxStreak);
  }

  // ── Core Message Processing ───────────────────────────────────────────────
  function processMessage(msgData) {
    if (!msgData) return;
    var s = storage.stats;
    if (!s) return;

    var now = new Date();
    var today = todayStr();

    // 1. Messages count
    s.messages_sent = (s.messages_sent || 0) + 1;
    checkThresholdAchievements("messages_sent", s.messages_sent);

    // 2. Days active
    if (!Array.isArray(s.days_active)) s.days_active = [];
    if (s.days_active.indexOf(today) === -1) {
      s.days_active.push(today);
    }
    checkThresholdAchievements("days_active", s.days_active.length);

    // 3. Chat tracking
    var chId = msgData.channelId || msgData.channel_id;
    if (chId) {
      if (!Array.isArray(s.unique_chats)) s.unique_chats = [];
      if (s.unique_chats.indexOf(chId) === -1) {
        s.unique_chats.push(chId);
      }
      checkThresholdAchievements("unique_chats", s.unique_chats.length);

      var chan = ChannelStore && ChannelStore.getChannel && ChannelStore.getChannel(chId);
      if (chan) {
        if (chan.type === 1) { // DM
          tryUnlock("private_talk");
          if (!Array.isArray(s.private_chats)) s.private_chats = [];
          if (s.private_chats.indexOf(chId) === -1) s.private_chats.push(chId);
          checkThresholdAchievements("private_chats_count", s.private_chats.length);

          var recipientId = chan.recipients ? chan.recipients[0] : (chan.getRecipientId ? chan.getRecipientId() : null);
          var partnerUser = recipientId && UserStore && UserStore.getUser ? UserStore.getUser(recipientId) : null;
          if (partnerUser && partnerUser.bot) {
            tryUnlock("bot_friend");
            if (!Array.isArray(s.bot_chats)) s.bot_chats = [];
            if (s.bot_chats.indexOf(chId) === -1) s.bot_chats.push(chId);
            checkThresholdAchievements("bot_chats_count", s.bot_chats.length);
          } else {
            updateStreaks(chId, true, partnerUser ? (partnerUser.globalName || partnerUser.username) : "Friend");
          }
        } else if (chan.type === 3) { // Group DM
          tryUnlock("group_member");
          if (!Array.isArray(s.group_chats)) s.group_chats = [];
          if (s.group_chats.indexOf(chId) === -1) s.group_chats.push(chId);
          checkThresholdAchievements("group_chats_count", s.group_chats.length);
        } else { // Server Channel
          tryUnlock("channel_writer");
          if (!Array.isArray(s.channel_chats)) s.channel_chats = [];
          if (s.channel_chats.indexOf(chId) === -1) s.channel_chats.push(chId);
          checkThresholdAchievements("channel_chats_count", s.channel_chats.length);
        }
      }
    }

    // 4. Replies
    if (msgData.isReply || msgData.message_reference) {
      s.replies_made = (s.replies_made || 0) + 1;
      checkThresholdAchievements("replies_made", s.replies_made);
    }

    // 5. Attachments
    var atts = msgData.attachments;
    if (Array.isArray(atts) && atts.length > 0) {
      for (var a = 0; a < atts.length; a++) {
        var att = atts[a];
        var ct = (att.content_type || att.mimeType || "").toLowerCase();
        var fn = (att.filename || att.name || "").toLowerCase();

        if (ct.startsWith("image/gif") || fn.endsWith(".gif")) {
          s.gifs_sent = (s.gifs_sent || 0) + 1;
          checkThresholdAchievements("gifs_sent", s.gifs_sent);
        } else if (ct.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(fn)) {
          s.photos_sent = (s.photos_sent || 0) + 1;
          checkThresholdAchievements("photos_sent", s.photos_sent);
        } else if (ct.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(fn)) {
          s.videos_sent = (s.videos_sent || 0) + 1;
          checkThresholdAchievements("videos_sent", s.videos_sent);
        } else if (ct.startsWith("audio/") || /\.(mp3|ogg|wav|flac|m4a)$/i.test(fn)) {
          s.audios_sent = (s.audios_sent || 0) + 1;
          checkThresholdAchievements("audios_sent", s.audios_sent);
        } else {
          s.files_sent = (s.files_sent || 0) + 1;
          checkThresholdAchievements("files_sent", s.files_sent);
        }
      }
    }

    // Stickers
    if (msgData.sticker_items && msgData.sticker_items.length > 0) {
      s.stickers_sent = (s.stickers_sent || 0) + 1;
      checkThresholdAchievements("stickers_sent", s.stickers_sent);
    }

    // Polls
    if (msgData.poll) {
      s.polls_created = (s.polls_created || 0) + 1;
      checkThresholdAchievements("polls_created", s.polls_created);
    }

    // Voice
    if (msgData.flags && (msgData.flags & 8192)) {
      s.voice_sent = (s.voice_sent || 0) + 1;
      checkThresholdAchievements("voice_sent", s.voice_sent);
    }

    // 6. Text patterns
    if (msgData.content) {
      analyzeText(msgData.content, now);
    }

    // 7. Time & Speed & Collector
    analyzeTime(now);
    analyzeSpeed();
    analyzeCollector();
  }

  // ── Hooking Discord Actions ───────────────────────────────────────────────
  function setupHooks() {
    // 1. Hook Messages.sendMessage
    if (Messages && typeof Messages.sendMessage === "function") {
      patches.push(
        before("sendMessage", Messages, function (args) {
          try {
            var channelId = args[0];
            var msgObj = args[1];
            var extra = args[2];
            var text = msgObj ? (typeof msgObj === "string" ? msgObj : msgObj.content) : "";

            var isReply = Boolean(extra && (extra.message_reference || extra.replyToMsg));
            processMessage({
              channelId: channelId,
              content: text,
              isReply: isReply
            });
          } catch (e) {}
          return args;
        })
      );
    }

    // 2. Hook Messages.editMessage
    if (Messages && typeof Messages.editMessage === "function") {
      patches.push(
        before("editMessage", Messages, function (args) {
          try {
            var s = storage.stats;
            if (s) {
              s.edits_made = (s.edits_made || 0) + 1;
              checkThresholdAchievements("edits_made", s.edits_made);
            }
          } catch (e) {}
          return args;
        })
      );
    }

    // 3. Hook Upload.uploadLocalFiles
    if (Upload && typeof Upload.uploadLocalFiles === "function") {
      patches.push(
        before("uploadLocalFiles", Upload, function (args) {
          try {
            var upData = args[0];
            if (upData) {
              var cId = upData.channelId || (upData.channel && upData.channel.id);
              var pMsg = upData.parsedMessage;
              var items = upData.items || upData.files || [];
              var atts = items.map(function (it) {
                var itItem = it.item || it;
                return {
                  filename: itItem.filename || itItem.name || "",
                  content_type: itItem.mimeType || itItem.type || ""
                };
              });

              processMessage({
                channelId: cId,
                content: pMsg ? pMsg.content : "",
                attachments: atts
              });
            }
          } catch (e) {}
          return args;
        })
      );
    }

    // 4. Hook Reactions
    if (MessageReactions && typeof MessageReactions.addReaction === "function") {
      patches.push(
        before("addReaction", MessageReactions, function (args) {
          try {
            var s = storage.stats;
            if (s) {
              s.reactions_made = (s.reactions_made || 0) + 1;
              checkThresholdAchievements("reactions_made", s.reactions_made);
            }
          } catch (e) {}
          return args;
        })
      );
    }

    // 5. Hook FluxDispatcher for Gateway Confirmed MESSAGE_CREATE & REACTIONS
    if (FluxDispatcher && typeof FluxDispatcher.dispatch === "function") {
      patches.push(
        before("dispatch", FluxDispatcher, function (args) {
          try {
            var event = args && args[0];
            if (!event || !event.type) return args;

            var myId = UserStore && UserStore.getCurrentUser && UserStore.getCurrentUser() && UserStore.getCurrentUser().id;

            if (event.type === "MESSAGE_CREATE") {
              var msg = event.message;
              if (msg && msg.author && msg.author.id === myId) {
                if (msg.id && seenMessageIds.has(msg.id)) return args;
                if (msg.id) {
                  seenMessageIds.add(msg.id);
                  if (seenMessageIds.size > 1000) {
                    var oldId = seenMessageIds.values().next().value;
                    if (oldId) seenMessageIds.delete(oldId);
                  }
                }
                processMessage({
                  channelId: msg.channel_id,
                  content: msg.content,
                  attachments: msg.attachments,
                  sticker_items: msg.sticker_items,
                  message_reference: msg.message_reference,
                  poll: msg.poll,
                  flags: msg.flags
                });
              }
            } else if (event.type === "MESSAGE_REACTION_ADD") {
              if (event.userId === myId) {
                var s = storage.stats;
                if (s) {
                  s.reactions_made = (s.reactions_made || 0) + 1;
                  checkThresholdAchievements("reactions_made", s.reactions_made);
                }
              }
            }
          } catch (e) {}
          return args;
        })
      );
    }
  }

  // ── Settings UI ───────────────────────────────────────────────────────────
  function Settings() {
    var React = vendetta.metro.common.React;
    var RN    = vendetta.metro.common.ReactNative;

    if (!React || !RN || !RN.View || !RN.Text) return null;

    var useState = React.useState;
    var selectedCatState = useState("all");
    var selectedCat = selectedCatState[0];
    var setSelectedCat = selectedCatState[1];

    var searchQueryState = useState("");
    var searchQuery = searchQueryState[0];
    var setSearchQuery = searchQueryState[1];

    var dummyState = useState(0);
    var forceUpdate = function () { dummyState[1](dummyState[0] + 1); };

    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;

    var unlockedMap = storage.unlocked || {};
    var unlockedCount = Object.keys(unlockedMap).length;
    var totalCount = ACHIEVEMENTS.length;
    var pct = Math.round((unlockedCount / totalCount) * 100);

    var categories = [
      { id: "all",         label: isRussian() ? "Все" : "All",               icon: "🏆" },
      { id: "messages",    label: isRussian() ? "Сообщения" : "Messages",    icon: "💬" },
      { id: "media",       label: isRussian() ? "Медиа" : "Media",           icon: "🖼️" },
      { id: "social",      label: isRussian() ? "Общение" : "Social",        icon: "👥" },
      { id: "time",        label: isRussian() ? "Время" : "Time",            icon: "⏱️" },
      { id: "streaks",     label: isRussian() ? "Огоньки" : "Streaks",       icon: "🔥" },
      { id: "special",     label: isRussian() ? "Особые" : "Special",        icon: "⭐" },
      { id: "secret",      label: isRussian() ? "Секретные" : "Secret",      icon: "🔮" },
      { id: "reactions",   label: isRussian() ? "Реакции" : "Reactions",     icon: "❤️" },
      { id: "collector",   label: isRussian() ? "Коллекционер" : "Collector",icon: "📦" },
      { id: "explorer",    label: isRussian() ? "Исследователь" : "Explorer",icon: "🧭" },
      { id: "interactive", label: isRussian() ? "Интерактив" : "Interactive",icon: "📊" },
      { id: "luck",        label: isRussian() ? "Удача" : "Luck",            icon: "🎲" },
      { id: "veteran",     label: isRussian() ? "Ветеран" : "Veteran",        icon: "📅" }
    ];

    // Filter achievements
    var filtered = ACHIEVEMENTS.filter(function (a) {
      if (selectedCat !== "all" && a.category !== selectedCat) return false;
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var n = getAchName(a).toLowerCase();
        var d = getAchDesc(a).toLowerCase();
        if (n.indexOf(q) === -1 && d.indexOf(q) === -1) return false;
      }
      return true;
    });

    return React.createElement(
      RN.ScrollView,
      {
        style: { flex: 1, backgroundColor: "#1e1f22" },
        contentContainerStyle: { padding: 16, paddingBottom: 60 }
      },

      // Header card
      React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#2b2d31",
            borderRadius: 16,
            padding: 18,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#383a40"
          }
        },
        React.createElement(
          RN.Text,
          { style: { color: "#f2f3f5", fontSize: 22, fontWeight: "700", marginBottom: 6 } },
          "🏆 " + (isRussian() ? "Достижения" : "Achievements")
        ),
        React.createElement(
          RN.Text,
          { style: { color: "#949ba4", fontSize: 13, marginBottom: 14 } },
          isRussian()
            ? "Разблокировано " + unlockedCount + " из " + totalCount + " (" + pct + "%)"
            : "Unlocked " + unlockedCount + " of " + totalCount + " (" + pct + "%)"
        ),

        // Progress bar background
        React.createElement(
          RN.View,
          {
            style: {
              height: 10,
              backgroundColor: "#1e1f22",
              borderRadius: 5,
              overflow: "hidden"
            }
          },
          React.createElement(
            RN.View,
            {
              style: {
                height: 10,
                width: pct + "%",
                backgroundColor: "#5865f2",
                borderRadius: 5
              }
            }
          )
        )
      ),

      // Settings toggles & sound test card
      React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#2b2d31",
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#383a40"
          }
        },
        React.createElement(
          RN.Text,
          { style: { color: "#f2f3f5", fontSize: 16, fontWeight: "600", marginBottom: 12 } },
          "⚙️ " + (isRussian() ? "Настройки уведомлений" : "Notification Settings")
        ),

        // Sound switch
        React.createElement(
          RN.View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
          React.createElement(
            RN.View,
            { style: { flex: 1, marginRight: 10 } },
            React.createElement(
              RN.Text,
              { style: { color: "#f2f3f5", fontSize: 14, fontWeight: "500" } },
              "🔊 " + (isRussian() ? "Звуки достижений" : "Achievement Sounds")
            ),
            React.createElement(
              RN.Text,
              { style: { color: "#949ba4", fontSize: 12, marginTop: 2 } },
              isRussian() ? "Воспроизводить звук при получении достижения" : "Play sound when unlocking achievement"
            )
          ),
          React.createElement(RN.Switch, {
            value: storage.soundEnabled !== false,
            onValueChange: function (val) {
              storage.soundEnabled = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        ),

        // Toast switch
        React.createElement(
          RN.View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement(
            RN.View,
            { style: { flex: 1, marginRight: 10 } },
            React.createElement(
              RN.Text,
              { style: { color: "#f2f3f5", fontSize: 14, fontWeight: "500" } },
              "💬 " + (isRussian() ? "Верхний тост" : "Top Toast Banner")
            ),
            React.createElement(
              RN.Text,
              { style: { color: "#949ba4", fontSize: 12, marginTop: 2 } },
              isRussian() ? "Показывать уведомление вверху экрана" : "Show toast notification at top of screen"
            )
          ),
          React.createElement(RN.Switch, {
            value: storage.toastsEnabled !== false,
            onValueChange: function (val) {
              storage.toastsEnabled = val;
              forceUpdate();
            },
            trackColor: { false: "#4e5058", true: "#5865f2" }
          })
        ),

        // Sound test buttons row
        React.createElement(
          RN.View,
          { style: { flexDirection: "row", justifyContent: "space-between" } },
          React.createElement(
            Btn,
            {
              onPress: function () {
                playSound(false);
                if (showToast) showToast("⚪ Common Sound (default.ogg)");
              },
              style: {
                flex: 1,
                backgroundColor: "#383a40",
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
                marginRight: 6
              }
            },
            React.createElement(
              RN.Text,
              { style: { color: "#dbdee1", fontSize: 13, fontWeight: "600" } },
              "⚪ " + (isRussian() ? "Тест Обычного" : "Test Common")
            )
          ),
          React.createElement(
            Btn,
            {
              onPress: function () {
                playSound(true);
                if (showToast) showToast("🔵 Rare Sound (rare.ogg)");
              },
              style: {
                flex: 1,
                backgroundColor: "#5865f2",
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
                marginLeft: 6
              }
            },
            React.createElement(
              RN.Text,
              { style: { color: "#ffffff", fontSize: 13, fontWeight: "600" } },
              "🔔 " + (isRussian() ? "Тест Редкого" : "Test Rare")
            )
          )
        )
      ),

      // Categories filter pills
      React.createElement(
        RN.ScrollView,
        {
          horizontal: true,
          showsHorizontalScrollIndicator: false,
          style: { marginBottom: 16 }
        },
        categories.map(function (c) {
          var active = selectedCat === c.id;
          return React.createElement(
            Btn,
            {
              key: c.id,
              onPress: function () {
                setSelectedCat(c.id);
              },
              style: {
                backgroundColor: active ? "#5865f2" : "#2b2d31",
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 20,
                marginRight: 8,
                borderWidth: 1,
                borderColor: active ? "#5865f2" : "#383a40"
              }
            },
            React.createElement(
              RN.Text,
              { style: { color: active ? "#ffffff" : "#dbdee1", fontSize: 13, fontWeight: "600" } },
              c.icon + " " + c.label
            )
          );
        })
      ),

      // Achievements list
      filtered.map(function (a) {
        var isUnlocked = Boolean(unlockedMap[a.id]);
        var rInfo = RARITY_INFO[a.rarity] || RARITY_INFO.common;
        var achName = getAchName(a);
        var achDesc = (a.is_secret && !isUnlocked)
          ? (isRussian() ? "🔮 Секретное достижение. Разблокируйте его!" : "🔮 Secret achievement. Unlock it to reveal description.")
          : getAchDesc(a);

        return React.createElement(
          RN.View,
          {
            key: a.id,
            style: {
              backgroundColor: isUnlocked ? "#2b2d31" : "#232428",
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: isUnlocked ? rInfo.color : "#313338",
              opacity: isUnlocked ? 1 : 0.75
            }
          },
          React.createElement(
            RN.View,
            { style: { flexDirection: "row", alignItems: "center" } },
            // Icon
            React.createElement(
              RN.Text,
              { style: { fontSize: 28, marginRight: 12 } },
              a.icon
            ),
            // Text info
            React.createElement(
              RN.View,
              { style: { flex: 1 } },
              React.createElement(
                RN.View,
                { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } },
                React.createElement(
                  RN.Text,
                  { style: { color: isUnlocked ? "#f2f3f5" : "#949ba4", fontSize: 15, fontWeight: "700", flex: 1 } },
                  achName
                ),
                // Rarity badge
                React.createElement(
                  RN.View,
                  {
                    style: {
                      backgroundColor: rInfo.color + "22",
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: rInfo.color,
                      marginLeft: 8
                    }
                  },
                  React.createElement(
                    RN.Text,
                    { style: { color: rInfo.color, fontSize: 11, fontWeight: "700" } },
                    rInfo.emoji + " " + (isRussian() ? rInfo.ru : rInfo.en)
                  )
                )
              ),
              React.createElement(
                RN.Text,
                { style: { color: "#949ba4", fontSize: 13, marginTop: 4, lineHeight: 16 } },
                achDesc
              ),
              isUnlocked && unlockedMap[a.id].date && React.createElement(
                RN.Text,
                { style: { color: "#2ecc71", fontSize: 11, marginTop: 6, fontWeight: "600" } },
                "✓ " + (isRussian() ? "Разблокировано " : "Unlocked ") + unlockedMap[a.id].date.substring(0, 10)
              )
            )
          )
        );
      })
    );
  }

  return {
    onLoad: function () {
      setupHooks();
    },
    onUnload: function () {
      for (var p = 0; p < patches.length; p++) {
        try { patches[p](); } catch (e) {}
      }
      patches = [];
      recentMessageTimestamps = [];
      seenMessageIds.clear();
    },
    settings: Settings
  };
})();
