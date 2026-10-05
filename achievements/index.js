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

  var UserStore        = findByStoreName("UserStore");
  var UserProfileStore = findByStoreName("UserProfileStore") || findByProps("getUserProfile");
  var ChannelStore     = findByStoreName("ChannelStore") || findByProps("getChannel");
  var LocaleStore      = findByStoreName("LocaleStore") || findByProps("locale");
  var Messages         = findByProps("sendMessage", "editMessage");
  var Upload           = findByProps("uploadLocalFiles");
  var MessageReactions = findByProps("addReaction");
  var TokenModule      = findByProps("getToken");
  var Forms            = (vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms) || findByProps("FormRow", "FormSection") || {};
  var FormRow          = Forms && (Forms.FormRow || Forms.TableRow);
  var FormSection      = Forms && (Forms.FormSection || Forms.TableSection);
  var FormSwitch       = Forms && (Forms.FormSwitch || Forms.FormSwitchRow);
  var FormDivider      = Forms && Forms.FormDivider;

  var patches = [];

  var SOUND_URLS = {
    default: "https://raw.githubusercontent.com/ilickft/revenge-plugins/main/achievements/default.ogg",
    rare: "https://raw.githubusercontent.com/ilickft/revenge-plugins/main/achievements/rare.ogg",
    fallback_default: "https://ettacent.dev/files/default.ogg",
    fallback_rare: "https://ettacent.dev/files/rare.ogg"
  };

  function playSound(isRare) {
    if (storage.soundEnabled === false) return;

    var primaryUrl = isRare ? SOUND_URLS.rare : SOUND_URLS.default;
    var fallbackUrl = isRare ? SOUND_URLS.fallback_rare : SOUND_URLS.fallback_default;

    var played = false;

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

  var RARITY_INFO = {
    common:    { emoji: "⚪", sound: "default", color: "#95a5a6", en: "Common",    ru: "Обычное" },
    uncommon:  { emoji: "🟢", sound: "default", color: "#2ecc71", en: "Uncommon",  ru: "Необычное" },
    rare:      { emoji: "🔵", sound: "rare",    color: "#3498db", en: "Rare",      ru: "Редкое" },
    epic:      { emoji: "🟣", sound: "rare",    color: "#9b59b6", en: "Epic",      ru: "Эпическое" },
    legendary: { emoji: "🟡", sound: "rare",    color: "#f1c40f", en: "Legendary", ru: "Легендарное" },
    mythic:    { emoji: "🔴", sound: "rare",    color: "#e74c3c", en: "Mythic",    ru: "Мифическое" },
    secret:    { emoji: "🔮", sound: "rare",    color: "#8e44ad", en: "Secret",    ru: "Секретное" }
  };

  var RAW_ACHIEVEMENTS = [["first_message", "messages", "💬", "common", 1, "", "Первые шаги", "Отправьте первое сообщение", "First Steps", "Send your first message", "messages_sent"], ["getting_started", "messages", "🚀", "common", 10, "", "Начало пути", "Отправьте 10 сообщений", "Getting Started", "Send 10 messages", "messages_sent"], ["warming_up", "messages", "🔥", "common", 50, "", "Разминка", "Отправьте 50 сообщений", "Warming Up", "Send 50 messages", "messages_sent"], ["talkative", "messages", "🗣️", "uncommon", 100, "", "Разговорчивый", "Отправьте 100 сообщений", "Talkative", "Send 100 messages", "messages_sent"], ["chatterbox", "messages", "📢", "uncommon", 500, "", "Болтун", "Отправьте 500 сообщений", "Chatterbox", "Send 500 messages", "messages_sent"], ["messenger", "messages", "📬", "rare", 1000, "", "Вестник", "Отправьте 1,000 сообщений", "Messenger", "Send 1,000 messages", "messages_sent"], ["communicator", "messages", "📡", "rare", 2500, "", "Коммуникатор", "Отправьте 2,500 сообщений", "Communicator", "Send 2,500 messages", "messages_sent"], ["orator", "messages", "🎤", "epic", 5000, "", "Оратор", "Отправьте 5,000 сообщений", "Orator", "Send 5,000 messages", "messages_sent"], ["word_master", "messages", "📖", "epic", 10000, "", "Мастер слова", "Отправьте 10,000 сообщений", "Word Master", "Send 10,000 messages", "messages_sent"], ["legend", "messages", "🏆", "legendary", 25000, "", "Легенда общения", "Отправьте 25,000 сообщений", "Legend", "Send 25,000 messages", "messages_sent"], ["immortal", "messages", "👑", "legendary", 50000, "", "Бессмертный", "Отправьте 50,000 сообщений", "Immortal", "Send 50,000 messages", "messages_sent"], ["god_of_words", "messages", "🌟", "mythic", 100000, "", "Бог слов", "Отправьте 100,000 сообщений", "God of Words", "Send 100,000 messages", "messages_sent"], ["minimalist", "messages", "📍", "uncommon", 1, "T50", "Минималист", "Отправьте сообщение из 1 символа (после 50 сообщений)", "Minimalist", "Send a 1-character message (after 50 messages)", ""], ["writer", "messages", "✍️", "uncommon", 1, "", "Писатель", "Отправьте сообщение длиннее 300 символов", "Writer", "Send a message longer than 300 characters", ""], ["novelist", "messages", "📚", "rare", 1, "", "Романист", "Отправьте сообщение длиннее 700 символов", "Novelist", "Send a message longer than 700 characters", ""], ["epic_writer", "messages", "📜", "epic", 1, "", "Эпический писатель", "Отправьте сообщение длиннее 1500 символов", "Epic Writer", "Send a message longer than 1500 characters", ""], ["tolstoy", "messages", "🎭", "legendary", 1, "", "Лев Толстой", "Отправьте сообщение длиннее 3000 символов", "Tolstoy", "Send a message longer than 3000 characters", ""], ["speed_demon", "messages", "⚡", "uncommon", 1, "", "Скоростной демон", "Отправьте 5 сообщений за 30 секунд", "Speed Demon", "Send 5 messages in 30 seconds", ""], ["spam_master", "messages", "💨", "rare", 1, "", "Спам-мастер", "Отправьте 10 сообщений за минуту", "Spam Master", "Send 10 messages in a minute", ""], ["keyboard_warrior", "messages", "⌨️", "epic", 1, "", "Клавиатурный воин", "Отправьте 20 сообщений за минуту", "Keyboard Warrior", "Send 20 messages in a minute", ""], ["typing_god", "messages", "🏎️", "legendary", 1, "", "Бог печати", "Отправьте 30 сообщений за минуту", "Typing God", "Send 30 messages in a minute", ""], ["editor", "messages", "✏️", "common", 1, "", "Редактор", "Отредактируйте сообщение", "Editor", "Edit a message", "edits_made"], ["perfectionist", "messages", "🎯", "uncommon", 25, "", "Перфекционист", "Отредактируйте 25 сообщений", "Perfectionist", "Edit 25 messages", "edits_made"], ["never_satisfied", "messages", "🔧", "rare", 100, "", "Вечно недовольный", "Отредактируйте 100 сообщений", "Never Satisfied", "Edit 100 messages", "edits_made"], ["obsessive_editor", "messages", "⚙️", "epic", 500, "", "Одержимый редактор", "Отредактируйте 500 сообщений", "Obsessive Editor", "Edit 500 messages", "edits_made"], ["replier", "messages", "↩️", "common", 1, "", "Ответчик", "Ответьте на сообщение", "Replier", "Reply to a message", "replies_made"], ["conversationalist", "messages", "💬", "uncommon", 50, "", "Собеседник", "Ответьте на 50 сообщений", "Conversationalist", "Reply to 50 messages", "replies_made"], ["discussion_lover", "messages", "🗨️", "rare", 200, "", "Любитель дискуссий", "Ответьте на 200 сообщений", "Discussion Lover", "Reply to 200 messages", "replies_made"], ["debate_master", "messages", "🎓", "epic", 1000, "", "Мастер дебатов", "Ответьте на 1000 сообщений", "Debate Master", "Reply to 1000 messages", "replies_made"], ["first_photo", "media", "📷", "common", 1, "", "Первый кадр", "Отправьте первое фото", "First Shot", "Send your first photo", "photos_sent"], ["amateur_photographer", "media", "📸", "common", 25, "", "Фотолюбитель", "Отправьте 25 фото", "Amateur Photographer", "Send 25 photos", "photos_sent"], ["photographer", "media", "🖼️", "uncommon", 100, "", "Фотограф", "Отправьте 100 фото", "Photographer", "Send 100 photos", "photos_sent"], ["pro_photographer", "media", "🎨", "rare", 500, "", "Профессионал", "Отправьте 500 фото", "Pro Photographer", "Send 500 photos", "photos_sent"], ["paparazzi", "media", "📹", "epic", 1000, "", "Папарацци", "Отправьте 1000 фото", "Paparazzi", "Send 1000 photos", "photos_sent"], ["photo_legend", "media", "🌟", "legendary", 5000, "", "Легенда фотографии", "Отправьте 5000 фото", "Photo Legend", "Send 5000 photos", "photos_sent"], ["first_video", "media", "🎬", "common", 1, "", "Мотор!", "Отправьте первое видео", "Action!", "Send your first video", "videos_sent"], ["video_amateur", "media", "🎥", "common", 10, "", "Видеолюбитель", "Отправьте 10 видео", "Video Amateur", "Send 10 videos", "videos_sent"], ["videographer", "media", "📽️", "uncommon", 50, "", "Видеограф", "Отправьте 50 видео", "Videographer", "Send 50 videos", "videos_sent"], ["director", "media", "🎦", "rare", 200, "", "Режиссёр", "Отправьте 200 видео", "Director", "Send 200 videos", "videos_sent"], ["hollywood", "media", "⭐", "epic", 1000, "", "Голливуд", "Отправьте 1000 видео", "Hollywood", "Send 1000 videos", "videos_sent"], ["first_voice", "media", "🎙️", "common", 1, "", "Голос", "Отправьте первое голосовое", "Voice", "Send your first voice message", "voice_sent"], ["voice_user", "media", "🔊", "common", 25, "", "Голосовой пользователь", "Отправьте 25 голосовых", "Voice User", "Send 25 voice messages", "voice_sent"], ["podcaster", "media", "🎧", "uncommon", 100, "", "Подкастер", "Отправьте 100 голосовых", "Podcaster", "Send 100 voice messages", "voice_sent"], ["radio_host", "media", "📻", "rare", 500, "", "Радиоведущий", "Отправьте 500 голосовых", "Radio Host", "Send 500 voice messages", "voice_sent"], ["voice_legend", "media", "🎼", "epic", 2000, "", "Голосовая легенда", "Отправьте 2000 голосовых", "Voice Legend", "Send 2000 voice messages", "voice_sent"], ["first_sticker", "media", "🏷️", "common", 1, "", "Стикермен", "Отправьте первый стикер", "Sticker Man", "Send your first sticker", "stickers_sent"], ["sticker_fan", "media", "🎭", "common", 50, "", "Фанат стикеров", "Отправьте 50 стикеров", "Sticker Fan", "Send 50 stickers", "stickers_sent"], ["sticker_lover", "media", "🎨", "uncommon", 250, "", "Любитель стикеров", "Отправьте 250 стикеров", "Sticker Lover", "Send 250 stickers", "stickers_sent"], ["sticker_addict", "media", "🃏", "rare", 1000, "", "Стикерозависимый", "Отправьте 1000 стикеров", "Sticker Addict", "Send 1000 stickers", "stickers_sent"], ["sticker_maniac", "media", "🎪", "epic", 5000, "", "Стикер-маньяк", "Отправьте 5000 стикеров", "Sticker Maniac", "Send 5000 stickers", "stickers_sent"], ["sticker_god", "media", "👑", "legendary", 15000, "", "Бог стикеров", "Отправьте 15000 стикеров", "Sticker God", "Send 15000 stickers", "stickers_sent"], ["first_gif", "media", "🎞️", "common", 1, "", "Гифка", "Отправьте первую GIF", "First GIF", "Send your first GIF", "gifs_sent"], ["gif_user", "media", "🎬", "common", 25, "", "GIF-пользователь", "Отправьте 25 GIF", "GIF User", "Send 25 GIFs", "gifs_sent"], ["animator", "media", "🎭", "uncommon", 100, "", "Аниматор", "Отправьте 100 GIF", "Animator", "Send 100 GIFs", "gifs_sent"], ["gif_master", "media", "🎪", "rare", 500, "", "Мастер GIF", "Отправьте 500 GIF", "GIF Master", "Send 500 GIFs", "gifs_sent"], ["gif_lord", "media", "🌟", "epic", 2000, "", "Повелитель GIF", "Отправьте 2000 GIF", "GIF Lord", "Send 2000 GIFs", "gifs_sent"], ["first_file", "media", "📁", "common", 1, "", "Файлообменник", "Отправьте первый файл", "File Sharer", "Send your first file", "files_sent"], ["file_sharer", "media", "📂", "common", 25, "", "Файлодел", "Отправьте 25 файлов", "File Dealer", "Send 25 files", "files_sent"], ["archivist", "media", "🗄️", "uncommon", 100, "", "Архивариус", "Отправьте 100 файлов", "Archivist", "Send 100 files", "files_sent"], ["data_hoarder", "media", "💾", "rare", 500, "", "Накопитель данных", "Отправьте 500 файлов", "Data Hoarder", "Send 500 files", "files_sent"], ["cloud_storage", "media", "☁️", "epic", 2000, "", "Облачное хранилище", "Отправьте 2000 файлов", "Cloud Storage", "Send 2000 files", "files_sent"], ["first_audio", "media", "🎵", "common", 1, "", "Меломан", "Отправьте первое аудио", "Music Lover", "Send your first audio", "audios_sent"], ["music_lover", "media", "🎶", "common", 25, "", "Любитель музыки", "Отправьте 25 аудио", "Music Fan", "Send 25 audio files", "audios_sent"], ["dj", "media", "🎧", "uncommon", 100, "", "Диджей", "Отправьте 100 аудио", "DJ", "Send 100 audio files", "audios_sent"], ["music_producer", "media", "🎹", "rare", 500, "", "Музыкальный продюсер", "Отправьте 500 аудио", "Music Producer", "Send 500 audio files", "audios_sent"], ["first_chat", "social", "👋", "common", 1, "", "Первый контакт", "Напишите в первый чат", "First Contact", "Write to your first chat", "unique_chats"], ["social_starter", "social", "🤝", "common", 5, "", "Начинающий социал", "Напишите в 5 разных чатов", "Social Starter", "Write to 5 different chats", "unique_chats"], ["social_10", "social", "👥", "common", 10, "", "Общительный", "Напишите в 10 разных чатов", "Sociable", "Write to 10 different chats", "unique_chats"], ["social_25", "social", "👨‍👩‍👧‍👦", "uncommon", 25, "", "Социальный", "Напишите в 25 разных чатов", "Social", "Write to 25 different chats", "unique_chats"], ["social_50", "social", "🎉", "uncommon", 50, "", "Душа компании", "Напишите в 50 разных чатов", "Life of the Party", "Write to 50 different chats", "unique_chats"], ["social_100", "social", "🌐", "rare", 100, "", "Нетворкер", "Напишите в 100 разных чатов", "Networker", "Write to 100 different chats", "unique_chats"], ["social_250", "social", "🦋", "epic", 250, "", "Социальная бабочка", "Напишите в 250 разных чатов", "Social Butterfly", "Write to 250 different chats", "unique_chats"], ["social_500", "social", "🌍", "legendary", 500, "", "Всемирная сеть", "Напишите в 500 разных чатов", "World Wide Web", "Write to 500 different chats", "unique_chats"], ["group_member", "social", "👥", "common", 1, "", "Групповой игрок", "Напишите в групповой чат", "Team Player", "Write to a group chat", ""], ["private_talk", "social", "🔒", "common", 1, "", "Приватный разговор", "Напишите в личные сообщения", "Private Talk", "Write to a private chat", ""], ["channel_writer", "social", "📢", "uncommon", 1, "", "Автор канала", "Напишите в канал", "Channel Author", "Write to a channel", ""], ["bot_friend", "social", "🤖", "common", 1, "", "Друг ботов", "Напишите боту", "Bot Friend", "Write to a bot", ""], ["night_owl", "time", "🦉", "rare", 1, "", "Ночная сова", "Отправьте сообщение между 2:00 и 5:00", "Night Owl", "Send a message between 2:00 and 5:00", ""], ["early_bird", "time", "🐦", "rare", 1, "", "Ранняя пташка", "Отправьте сообщение между 5:00 и 6:00", "Early Bird", "Send a message between 5:00 and 6:00", ""], ["morning_person", "time", "🌅", "uncommon", 1, "", "Жаворонок", "Отправьте сообщение между 6:00 и 7:00", "Morning Person", "Send a message between 6:00 and 7:00", ""], ["lunch_break", "time", "🍽️", "common", 1, "", "Обеденный перерыв", "Отправьте сообщение между 12:00 и 13:00", "Lunch Break", "Send a message between 12:00 and 13:00", ""], ["evening_chatter", "time", "🌆", "common", 1, "", "Вечерний болтун", "Отправьте сообщение между 20:00 и 22:00", "Evening Chatter", "Send a message between 20:00 and 22:00", ""], ["monday_blues", "time", "😫", "common", 1, "", "Понедельник", "Отправьте сообщение в понедельник", "Monday Blues", "Send a message on Monday", ""], ["friday_vibes", "time", "🎊", "common", 1, "", "Пятница!", "Отправьте сообщение в пятницу", "Friday Vibes", "Send a message on Friday", ""], ["weekend_warrior", "time", "🏖️", "common", 1, "", "Воин выходных", "Отправьте сообщение в выходные", "Weekend Warrior", "Send a message on weekend", ""], ["new_year", "time", "🎆", "epic", 1, "", "С Новым Годом!", "Отправьте сообщение 1 января", "Happy New Year!", "Send a message on January 1st", ""], ["valentine", "time", "💕", "epic", 1, "", "Валентинка", "Отправьте сообщение 14 февраля", "Valentine", "Send a message on February 14th", ""], ["defender", "time", "🎖️", "epic", 1, "", "Защитник", "Отправьте сообщение 23 февраля", "Defender", "Send a message on February 23rd", ""], ["womens_day", "time", "💐", "epic", 1, "", "Джентльмен", "Отправьте сообщение 8 марта", "Gentleman", "Send a message on March 8th", ""], ["april_fools", "time", "🃏", "epic", 1, "", "День дурака", "Отправьте сообщение 1 апреля", "April Fools", "Send a message on April 1st", ""], ["may_day", "time", "🌸", "epic", 1, "", "Первомай", "Отправьте сообщение 1 мая", "May Day", "Send a message on May 1st", ""], ["victory_day", "time", "🎗️", "epic", 1, "", "День Победы", "Отправьте сообщение 9 мая", "Victory Day", "Send a message on May 9th", ""], ["halloween", "time", "🎃", "epic", 1, "", "Хэллоуин", "Отправьте сообщение 31 октября", "Halloween", "Send a message on October 31st", ""], ["christmas", "time", "🎄", "epic", 1, "", "Рождество", "Отправьте сообщение 25 декабря", "Christmas", "Send a message on December 25th", ""], ["discord_birthday", "time", "🎂", "epic", 1, "", "День рождения Discord", "Отправьте сообщение в день рождения Discord (13 мая)", "Discord Birthday", "Send a message on Discord birthday (May 13th)", ""], ["midnight", "time", "🌙", "rare", 1, "", "Полуночник", "Отправьте сообщение ровно в 00:00", "Midnight", "Send a message exactly at 00:00", ""], ["high_noon", "time", "☀️", "rare", 1, "", "Полдень", "Отправьте сообщение ровно в 12:00", "High Noon", "Send a message exactly at 12:00", ""], ["lucky_time", "time", "🍀", "rare", 1, "", "Счастливое время", "Отправьте сообщение в 11:11", "Lucky Time", "Send a message at 11:11", ""], ["double_luck", "time", "🎰", "rare", 1, "", "Двойная удача", "Отправьте сообщение в 22:22", "Double Luck", "Send a message at 22:22", ""], ["triple_digits", "time", "🔢", "uncommon", 1, "", "Три одинаковых", "Отправьте сообщение когда минуты = часам", "Triple Digits", "Send a message when minutes = hours", ""], ["fire_streak", "streaks", "✨", "uncommon", 1, "", "Искра", "Заведите огонёк с кем-то", "Spark", "Start a streak with someone", ""], ["fire_streak_7", "streaks", "🔥", "uncommon", 7, "", "Пламя", "Держите огонёк 7 дней", "Flame", "Keep a streak for 7 days", "_fire_streak"], ["fire_streak_14", "streaks", "🔥", "rare", 14, "", "Костёр", "Держите огонёк 14 дней", "Campfire", "Keep a streak for 14 days", "_fire_streak"], ["fire_streak_30", "streaks", "🔥", "rare", 30, "", "Факел", "Держите огонёк 30 дней", "Torch", "Keep a streak for 30 days", "_fire_streak"], ["fire_streak_60", "streaks", "🔥", "epic", 60, "", "Пожар", "Держите огонёк 60 дней", "Blaze", "Keep a streak for 60 days", "_fire_streak"], ["fire_streak_100", "streaks", "🔥", "epic", 100, "", "Вечный огонь", "Держите огонёк 100 дней", "Eternal Flame", "Keep a streak for 100 days", "_fire_streak"], ["fire_streak_200", "streaks", "☀️", "legendary", 200, "", "Солнце", "Держите огонёк 200 дней", "Sun", "Keep a streak for 200 days", "_fire_streak"], ["fire_streak_365", "streaks", "💫", "mythic", 365, "", "Сверхновая", "Держите огонёк 365 дней", "Supernova", "Keep a streak for 365 days", "_fire_streak"], ["multi_streaks_3", "streaks", "🎪", "uncommon", 3, "", "Огненный жонглёр", "Имейте 3 активных огонька", "Fire Juggler", "Have 3 active streaks", "_active_streaks"], ["multi_streaks_5", "streaks", "🧙", "rare", 5, "", "Огненный маг", "Имейте 5 активных огоньков", "Fire Mage", "Have 5 active streaks", "_active_streaks"], ["multi_streaks_10", "streaks", "👑", "epic", 10, "", "Повелитель огня", "Имейте 10 активных огоньков", "Fire Lord", "Have 10 active streaks", "_active_streaks"], ["emoji_only", "special", "😀", "uncommon", 1, "T10", "Эмодзимен", "Отправьте сообщение только из эмодзи (5+ эмодзи)", "Emoji Man", "Send a message with only emojis (5+ emojis)", ""], ["emoji_master", "special", "🎭", "rare", 1, "T10", "Мастер эмодзи", "Отправьте сообщение из 20+ эмодзи", "Emoji Master", "Send a message with 20+ emojis", ""], ["caps_lock", "special", "🔠", "uncommon", 1, "T10", "КАПСЛОКЕР", "Отправьте сообщение ЗАГЛАВНЫМИ БУКВАМИ (10+ букв)", "CAPS LOCK", "Send a message in ALL CAPS (10+ letters)", ""], ["link_sharer", "special", "🔗", "common", 1, "", "Ссылочник", "Отправьте сообщение со ссылкой", "Link Sharer", "Send a message with a link", ""], ["question", "special", "❓", "common", 1, "", "Любопытный", "Задайте вопрос (сообщение с ?)", "Curious", "Ask a question (message with ?)", ""], ["double_question", "special", "⁉️", "uncommon", 1, "", "Очень любопытный", "Используйте ?? в сообщении", "Very Curious", "Use ?? in a message", ""], ["exclamation", "special", "❗", "common", 1, "", "Восклицатель", "Выразите эмоции (сообщение с !!!)", "Exclaimer", "Express emotions (message with !!!)", ""], ["numbers_only", "special", "🔢", "uncommon", 1, "T10", "Математик", "Отправьте сообщение только из цифр (5+ цифр)", "Mathematician", "Send a message with only numbers (5+ digits)", ""], ["hashtag", "special", "#️⃣", "common", 1, "", "Хэштегер", "Используйте хэштег в сообщении", "Hashtagger", "Use a hashtag in a message", ""], ["multi_hashtag", "special", "📊", "uncommon", 1, "", "Тренды", "Используйте 3+ хэштега в сообщении", "Trending", "Use 3+ hashtags in a message", ""], ["mention", "special", "📣", "common", 1, "", "Упоминатель", "Упомяните пользователя (@username)", "Mentioner", "Mention a user (@username)", ""], ["multi_mention", "special", "📢", "rare", 1, "", "Массовое упоминание", "Упомяните 5+ пользователей в сообщении", "Mass Mention", "Mention 5+ users in a message", ""], ["multilingual", "special", "🌍", "uncommon", 1, "", "Полиглот", "Используйте 2 разных алфавита в сообщении", "Polyglot", "Use 2 different alphabets in a message", ""], ["trilingual", "special", "🌐", "rare", 1, "", "Трилингв", "Используйте 3+ разных алфавита в сообщении", "Trilingual", "Use 3+ different alphabets in a message", ""], ["long_word", "special", "📏", "uncommon", 1, "", "Словоблуд", "Используйте слово длиннее 15 букв", "Wordsmith", "Use a word longer than 15 letters", ""], ["mega_word", "special", "📐", "rare", 1, "", "Мега-слово", "Используйте слово длиннее 25 букв", "Mega Word", "Use a word longer than 25 letters", ""], ["repeater", "special", "🔁", "common", 1, "", "Повторяшка", "Повторите одну букву 5+ раз подряд", "Repeater", "Repeat a letter 5+ times in a row", ""], ["mega_repeater", "special", "🔄", "uncommon", 1, "", "Мега-повтор", "Повторите одну букву 15+ раз подряд", "Mega Repeater", "Repeat a letter 15+ times in a row", ""], ["no_vowels", "special", "🤫", "rare", 1, "", "Без гласных", "Отправьте слово без гласных (4+ буквы)", "No Vowels", "Send a word without vowels (4+ letters)", ""], ["all_vowels", "special", "🗣️", "rare", 1, "", "Все гласные", "Используйте все гласные в одном слове", "All Vowels", "Use all vowels in one word", ""], ["first_reaction", "reactions", "❤️", "common", 1, "", "Первая реакция", "Поставьте первую реакцию", "First Reaction", "Add your first reaction", "reactions_made"], ["reactor", "reactions", "⚛️", "common", 25, "", "Реактор", "Поставьте 25 реакций", "Reactor", "Add 25 reactions", "reactions_made"], ["reaction_fan", "reactions", "💖", "uncommon", 100, "", "Фанат реакций", "Поставьте 100 реакций", "Reaction Fan", "Add 100 reactions", "reactions_made"], ["reaction_lover", "reactions", "💝", "rare", 500, "", "Любитель реакций", "Поставьте 500 реакций", "Reaction Lover", "Add 500 reactions", "reactions_made"], ["reaction_master", "reactions", "🏆", "epic", 2000, "", "Мастер реакций", "Поставьте 2000 реакций", "Reaction Master", "Add 2000 reactions", "reactions_made"], ["day_1", "veteran", "📅", "common", 1, "", "День первый", "Используйте Discord 1 день", "Day One", "Use Discord for 1 day", "days_active"], ["week_1", "veteran", "📆", "uncommon", 7, "", "Неделя первая", "Используйте Discord 7 дней", "Week One", "Use Discord for 7 days", "days_active"], ["month_1", "veteran", "🗓️", "rare", 30, "", "Месяц первый", "Используйте Discord 30 дней", "Month One", "Use Discord for 30 days", "days_active"], ["quarter", "veteran", "📊", "epic", 90, "", "Квартал", "Используйте Discord 90 дней", "Quarter", "Use Discord for 90 days", "days_active"], ["half_year", "veteran", "🎯", "epic", 180, "", "Полгода", "Используйте Discord 180 дней", "Half Year", "Use Discord for 180 days", "days_active"], ["year_1", "veteran", "🏆", "legendary", 365, "", "Год первый", "Используйте Discord 365 дней", "Year One", "Use Discord for 365 days", "days_active"], ["media_variety", "collector", "🎨", "uncommon", 1, "", "Разнообразие", "Отправьте фото, видео, голосовое и стикер", "Variety", "Send a photo, video, voice and sticker", ""], ["complete_set", "collector", "📦", "rare", 1, "", "Полный набор", "Отправьте все типы медиа", "Complete Set", "Send all types of media", ""], ["chat_explorer", "explorer", "🧭", "uncommon", 1, "", "Исследователь чатов", "Напишите в ЛС, группу и канал", "Chat Explorer", "Write to DM, group and channel", ""], ["full_explorer", "explorer", "🗺️", "rare", 1, "", "Полный исследователь", "Напишите во все типы чатов", "Full Explorer", "Write to all chat types including bots", ""], ["secret_42", "secret", "🌌", "secret", 1, "S", "Ответ на всё", "Найдите ответ на главный вопрос", "Answer to Everything", "Find the answer to the ultimate question", ""], ["secret_hello_world", "secret", "💻", "secret", 1, "S", "Hello World", "Напишите как настоящий программист", "Hello World", "Write like a true programmer", ""], ["secret_lorem", "secret", "📝", "secret", 1, "S", "Lorem Ipsum", "Используйте заглушку дизайнера", "Lorem Ipsum", "Use the designer's placeholder", ""], ["secret_rickroll", "secret", "🎵", "secret", 1, "S", "Never Gonna", "Вы знаете правила, и я тоже", "Never Gonna", "You know the rules, and so do I", ""], ["secret_konami", "secret", "🎮", "secret", 1, "S", "Konami Code", "Введите легендарный код", "Konami Code", "Enter the legendary code", ""], ["secret_1337", "secret", "💀", "secret", 1, "S", "L33T", "Напишите на языке хакеров", "L33T", "Write in hacker language", ""], ["secret_pi", "secret", "🥧", "secret", 1, "S", "Число Пи", "Вспомните математику", "Pi", "Remember mathematics", ""], ["secret_matrix", "secret", "💊", "secret", 1, "S", "Матрица", "Красная или синяя?", "Matrix", "Red or blue?", ""], ["secret_palindrome", "secret", "🔄", "secret", 1, "S", "Палиндром", "Напишите слово-перевёртыш (5+ букв)", "Palindrome", "Write a palindrome word (5+ letters)", ""], ["secret_gg", "secret", "🎮", "secret", 1, "S", "GG", "Хорошая игра!", "GG", "Good game!", ""], ["secret_lol", "secret", "😂", "secret", 1, "S", "LOL", "Смех да и только", "LOL", "Laughing out loud", ""], ["secret_bruh", "secret", "😑", "secret", 1, "S", "Bruh", "Момент...", "Bruh", "That moment...", ""], ["secret_sus", "secret", "📮", "secret", 1, "S", "Sus", "Подозрительно...", "Sus", "Suspicious...", ""], ["secret_ok_boomer", "secret", "👴", "secret", 1, "S", "OK Boomer", "Ладно, бумер", "OK Boomer", "Alright, boomer", ""], ["secret_f_respect", "secret", "🙏", "secret", 1, "S", "F", "Выразите уважение", "F", "Pay respects", ""], ["secret_nice", "secret", "😏", "secret", 1, "S", "Nice", "Напишите магическое число", "Nice", "Write the magic number", ""], ["secret_uwu", "secret", "🥺", "secret", 1, "S", "UwU", "Милый момент", "UwU", "Cute moment", ""], ["secret_xd", "secret", "😆", "secret", 1, "S", "XD", "Классический смех", "XD", "Classic laugh", ""], ["secret_facepalm", "secret", "🤦", "secret", 1, "S", "Фейспалм", "Используйте 🤦", "Facepalm", "Use 🤦", ""], ["secret_thinking", "secret", "🤔", "secret", 1, "S", "Мыслитель", "Используйте 🤔", "Thinker", "Use 🤔", ""], ["secret_fire_emoji", "secret", "🔥", "secret", 1, "S", "Огонь", "Используйте 🔥", "Fire", "Use 🔥", ""], ["secret_heart", "secret", "❤️", "secret", 1, "S", "Любовь", "Отправьте ❤️", "Love", "Send ❤️", ""], ["secret_goodnight", "secret", "🌙", "secret", 1, "S", "Спокойной ночи", "Пожелайте спокойной ночи после полуночи", "Good Night", "Say good night after midnight", ""], ["secret_goodmorning", "secret", "🌅", "secret", 1, "S", "Доброе утро", "Пожелайте доброго утра до 8:00", "Good Morning", "Say good morning before 8:00", ""], ["secret_birthday", "secret", "🎂", "secret", 1, "S", "С днём рождения", "Поздравьте с днём рождения", "Happy Birthday", "Wish someone happy birthday", ""], ["secret_thanks", "secret", "🙏", "secret", 1, "S", "Благодарность", "Скажите спасибо", "Gratitude", "Say thank you", ""], ["secret_sorry", "secret", "😔", "secret", 1, "S", "Извинения", "Попросите прощения", "Apology", "Apologize", ""], ["secret_welcome", "secret", "👋", "secret", 1, "S", "Добро пожаловать", "Поприветствуйте кого-то", "Welcome", "Welcome someone", ""], ["secret_congrats", "secret", "🎉", "secret", 1, "S", "Поздравления", "Поздравьте с чем-то", "Congratulations", "Congratulate someone", ""], ["secret_bye", "secret", "👋", "secret", 1, "S", "До свидания", "Попрощайтесь", "Goodbye", "Say goodbye", ""], ["private_5", "social", "💌", "common", 5, "", "Близкий круг", "Напишите в 5 личных чатов", "Inner Circle", "Write to 5 private chats", "private_chats_count"], ["private_25", "social", "🤝", "uncommon", 25, "", "Свои люди", "Напишите в 25 личных чатов", "My People", "Write to 25 private chats", "private_chats_count"], ["private_100", "social", "👫", "rare", 100, "", "Личная сеть", "Напишите в 100 личных чатов", "Personal Network", "Write to 100 private chats", "private_chats_count"], ["private_500", "social", "💎", "epic", 500, "", "Армия друзей", "Напишите в 500 личных чатов", "Army of Friends", "Write to 500 private chats", "private_chats_count"], ["group_5", "social", "👨‍👩‍👧", "common", 5, "", "Командный игрок", "Напишите в 5 групп", "Team Player+", "Write to 5 groups", "group_chats_count"], ["group_25", "social", "🏟️", "uncommon", 25, "", "Активист", "Напишите в 25 групп", "Activist", "Write to 25 groups", "group_chats_count"], ["group_100", "social", "🎪", "rare", 100, "", "Универсал", "Напишите в 100 групп", "All-rounder", "Write to 100 groups", "group_chats_count"], ["group_500", "social", "🏛️", "epic", 500, "", "Глава фракций", "Напишите в 500 групп", "Faction Leader", "Write to 500 groups", "group_chats_count"], ["channel_5", "social", "📻", "uncommon", 5, "", "Голос редакции", "Напишите в 5 каналов", "Editorial Voice", "Write to 5 channels", "channel_chats_count"], ["channel_25", "social", "🎙️", "rare", 25, "", "Медиа-магнат", "Напишите в 25 каналов", "Media Mogul", "Write to 25 channels", "channel_chats_count"], ["channel_100", "social", "📡", "epic", 100, "", "Медиа-империя", "Напишите в 100 каналов", "Media Empire", "Write to 100 channels", "channel_chats_count"], ["bot_5", "social", "🤖", "common", 5, "", "Бот-фанат", "Напишите 5 ботам", "Bot Fan", "Write to 5 bots", "bot_chats_count"], ["bot_25", "social", "⚙️", "uncommon", 25, "", "Автоматизатор", "Напишите 25 ботам", "Automator", "Write to 25 bots", "bot_chats_count"], ["bot_100", "social", "🦾", "rare", 100, "", "Кибернетик", "Напишите 100 ботам", "Cybernetician", "Write to 100 bots", "bot_chats_count"], ["social_1000", "social", "🌌", "mythic", 1000, "", "Бог общения", "Напишите в 1,000 разных чатов", "God of Communication", "Write to 1,000 different chats", "unique_chats"], ["photo_god", "media", "🌌", "mythic", 10000, "", "Бог фотографии", "Отправьте 10,000 фото", "God of Photography", "Send 10,000 photos", "photos_sent"], ["video_god", "media", "🌌", "mythic", 5000, "", "Бог видео", "Отправьте 5,000 видео", "God of Video", "Send 5,000 videos", "videos_sent"], ["voice_god", "media", "🌌", "mythic", 10000, "", "Бог голоса", "Отправьте 10,000 голосовых", "God of Voice", "Send 10,000 voice messages", "voice_sent"], ["sticker_overlord", "media", "🌌", "mythic", 50000, "", "Властелин стикеров", "Отправьте 50,000 стикеров", "Sticker Overlord", "Send 50,000 stickers", "stickers_sent"], ["gif_god", "media", "🌌", "mythic", 10000, "", "Бог GIF", "Отправьте 10,000 GIF", "God of GIFs", "Send 10,000 GIFs", "gifs_sent"], ["file_god", "media", "🌌", "mythic", 10000, "", "Бог файлов", "Отправьте 10,000 файлов", "File God", "Send 10,000 files", "files_sent"], ["audio_god", "media", "🌌", "mythic", 2500, "", "Бог аудио", "Отправьте 2,500 аудио", "God of Audio", "Send 2,500 audio files", "audios_sent"], ["editor_legend", "messages", "🏆", "legendary", 2500, "", "Легендарный редактор", "Отредактируйте 2,500 сообщений", "Editor Legend", "Edit 2,500 messages", "edits_made"], ["reply_legend", "messages", "🏆", "legendary", 5000, "", "Легендарный собеседник", "Ответьте на 5,000 сообщений", "Reply Legend", "Reply to 5,000 messages", "replies_made"], ["reaction_god", "reactions", "🌌", "mythic", 10000, "", "Бог реакций", "Поставьте 10,000 реакций", "Reaction God", "Add 10,000 reactions", "reactions_made"], ["two_years", "veteran", "🎖️", "mythic", 730, "", "Два года", "Используйте Discord 730 дней", "Two Years", "Use Discord for 730 days", "days_active"], ["three_years", "veteran", "💎", "mythic", 1095, "", "Три года", "Используйте Discord 1,095 дней", "Three Years", "Use Discord for 1,095 days", "days_active"], ["fire_streak_500", "streaks", "☄️", "mythic", 500, "", "Метеор", "Держите огонёк 500 дней", "Meteor", "Keep a streak for 500 days", "_fire_streak"], ["fire_streak_1000", "streaks", "🌌", "mythic", 1000, "", "Галактика", "Держите огонёк 1,000 дней", "Galaxy", "Keep a streak for 1,000 days", "_fire_streak"], ["multi_streaks_15", "streaks", "🌟", "legendary", 15, "", "Огненный император", "Имейте 15 активных огоньков", "Fire Emperor", "Have 15 active streaks", "_active_streaks"], ["multi_streaks_25", "streaks", "🌌", "mythic", 25, "", "Звёздный император", "Имейте 25 активных огоньков", "Star Emperor", "Have 25 active streaks", "_active_streaks"], ["lightspeed", "messages", "💫", "mythic", 1, "", "Скорость света", "Отправьте 50 сообщений за минуту", "Lightspeed", "Send 50 messages in a minute", ""], ["russian_christmas", "time", "🎁", "epic", 1, "", "Православное Рождество", "Отправьте сообщение 7 января", "Orthodox Christmas", "Send a message on January 7th", ""], ["cosmonauts_day", "time", "🚀", "epic", 1, "", "День космонавтики", "Отправьте сообщение 12 апреля", "Cosmonautics Day", "Send a message on April 12th", ""], ["pi_day", "time", "🥧", "epic", 1, "", "День числа Пи", "Отправьте сообщение 14 марта", "Pi Day", "Send a message on March 14th", ""], ["programmers_day", "time", "💻", "epic", 1, "", "День программиста", "Отправьте сообщение 13 сентября", "Programmers' Day", "Send a message on September 13th", ""], ["friendship_day", "time", "🤝", "epic", 1, "", "День дружбы", "Отправьте сообщение 30 июля", "Friendship Day", "Send a message on July 30th", ""], ["triple_threes", "time", "🎲", "rare", 1, "", "Три тройки", "Отправьте сообщение в 3:33", "Triple Threes", "Send a message at 3:33", ""], ["lucky_777", "time", "🎰", "rare", 1, "", "Джекпот", "Отправьте сообщение в 7:07", "Jackpot", "Send a message at 7:07", ""], ["thirteen_thirteen", "time", "🔮", "rare", 1, "", "Чёртова дюжина", "Отправьте сообщение в 13:13", "Devil's Dozen", "Send a message at 13:13", ""], ["twenty_three", "time", "🌃", "rare", 1, "", "Перед сном", "Отправьте сообщение в 23:23", "Before Sleep", "Send a message at 23:23", ""], ["three_am_club", "time", "🌙", "epic", 1, "", "Клуб 3:00", "Отправьте сообщение ровно в 3:00", "3 AM Club", "Send a message exactly at 3:00", ""], ["triple_question", "special", "⁉️", "rare", 1, "", "Очень-очень любопытный", "Используйте ??? в сообщении", "Extremely Curious", "Use ??? in a message", ""], ["secret_terminator", "secret", "🦾", "secret", 1, "S", "Я вернусь", "Цитата робота из будущего", "I'll Be Back", "Quote from a future robot", ""], ["secret_force", "secret", "⚔️", "secret", 1, "S", "Сила с тобой", "Цитата далёкой галактики", "May The Force", "Far far away quote", ""], ["secret_wakanda", "secret", "🐆", "secret", 1, "S", "Ваканда навсегда", "Цитата супергероя", "Wakanda Forever", "Superhero quote", ""], ["secret_winter_is_coming", "secret", "🐺", "secret", 1, "S", "Зима близко", "Цитата с престолов", "Winter Is Coming", "Throne quote", ""], ["secret_bazinga", "secret", "🤓", "secret", 1, "S", "Базинга", "Любимое слово физика", "Bazinga", "Physicist's favorite", ""], ["secret_gandalf", "secret", "🧙‍♂️", "secret", 1, "S", "Ты не пройдёшь", "Цитата мага", "You Shall Not Pass", "Wizard quote", ""], ["secret_inception", "secret", "🌀", "secret", 1, "S", "Глубже", "Цитата из сна", "Inception", "Dream quote", ""], ["secret_chicken_dinner", "secret", "🍗", "secret", 1, "S", "Победный ужин", "Цитата королевской битвы", "Chicken Dinner", "Battle royale quote", ""], ["secret_meow", "secret", "🐱", "secret", 1, "S", "Мяу", "Привет от кота", "Meow", "Cat says hi", ""], ["secret_woof", "secret", "🐶", "secret", 1, "S", "Гав", "Привет от пса", "Woof", "Dog says hi", ""], ["secret_phi", "secret", "🌀", "secret", 1, "S", "Золотое сечение", "Магическое число 1.618", "Golden Ratio", "The magic 1.618", ""], ["secret_e_const", "secret", "🔢", "secret", 1, "S", "Число Эйлера", "Константа e", "Euler's Number", "Constant e", ""], ["secret_binary", "secret", "💾", "secret", 1, "S", "Двоичный код", "Сообщение из 0 и 1", "Binary Code", "Message of 0s and 1s", ""], ["secret_hex", "secret", "🎨", "secret", 1, "S", "Hex-код", "Шестнадцатеричное сообщение", "Hex Code", "Hexadecimal message", ""], ["secret_morse", "secret", "📡", "secret", 1, "S", "Морзянка", "Точки, тире и пробелы", "Morse Code", "Dots, dashes and spaces", ""], ["new_years_eve", "time", "🎆", "epic", 1, "", "Канун Нового Года", "Отправьте сообщение 31 декабря", "New Years Eve", "Send a message on December 31st", ""], ["leap_day", "time", "📆", "legendary", 1, "", "Високосный день", "Отправьте сообщение 29 февраля", "Leap Day", "Send a message on February 29th", ""], ["summer_solstice", "time", "☀️", "epic", 1, "", "Летнее солнцестояние", "Отправьте сообщение 21 июня", "Summer Solstice", "Send a message on June 21st", ""], ["winter_solstice", "time", "❄️", "epic", 1, "", "Зимнее солнцестояние", "Отправьте сообщение 21 декабря", "Winter Solstice", "Send a message on December 21st", ""], ["earth_day", "time", "🌍", "epic", 1, "", "День Земли", "Отправьте сообщение 22 апреля", "Earth Day", "Send a message on April 22nd", ""], ["friday_13", "time", "🔪", "legendary", 1, "", "Пятница 13-е", "Отправьте сообщение в пятницу 13-го", "Friday the 13th", "Send a message on Friday the 13th", ""], ["high_five", "time", "✋", "rare", 1, "", "Дай пять", "Отправьте сообщение в 5:55", "High Five", "Send a message at 5:55", ""], ["nine_nine", "time", "9️⃣", "rare", 1, "", "Девяносто девять", "Отправьте сообщение в 9:09", "Nine Nine", "Send a message at 9:09", ""], ["interrobang", "special", "⁉️", "rare", 1, "", "Интерробанг", "Используйте ?! или !? в сообщении", "Interrobang", "Use ?! or !? in a message", ""], ["lots_of_dots", "special", "⋯", "common", 1, "", "Многоточие", "Закончите сообщение на ...", "Trailing Off", "End a message with ...", ""], ["sequence_numbers", "special", "🔢", "uncommon", 1, "", "Последовательность", "Отправьте 5+ цифр подряд по порядку", "Sequence", "Send 5+ consecutive digits in order", ""], ["triple_emoji_combo", "special", "🎰", "uncommon", 1, "", "Тройное комбо", "Повторите эмодзи 3+ раз подряд", "Triple Combo", "Repeat an emoji 3+ times in a row", ""], ["emoticon_only", "special", "🙂", "common", 1, "", "Смайлик", "Отправьте только смайлик типа :) или ^_^", "Emoticon", "Send a single emoticon like :) or ^_^", ""], ["same_word_3x", "special", "🔁", "uncommon", 1, "", "Заело", "Повторите одно слово 3+ раз", "Stuck Record", "Repeat the same word 3+ times", ""], ["mega_collector", "collector", "🎁", "epic", 1, "", "Мега-коллекционер", "Отправьте 100+ каждого типа медиа", "Mega Collector", "Send 100+ of every media type", ""], ["chat_emperor", "explorer", "👑", "legendary", 1, "", "Император чатов", "Напишите в 50+ ЛС, групп, каналов и ботов", "Chat Emperor", "Write to 50+ DMs, groups, channels and bots", ""], ["secret_father", "secret", "🌠", "secret", 1, "S", "Я твой отец", "Шокирующее откровение", "I Am Your Father", "Shocking revelation", ""], ["secret_shut_up_money", "secret", "💰", "secret", 1, "S", "Заткнись и возьми мои деньги", "Цитата покупателя", "Take My Money", "Buyer quote", ""], ["secret_great_power", "secret", "🕷️", "secret", 1, "S", "С большой силой", "Цитата паука", "Great Power", "Spider quote", ""], ["secret_elementary", "secret", "🔍", "secret", 1, "S", "Элементарно", "Цитата детектива", "Elementary", "Detective quote", ""], ["secret_to_be", "secret", "💀", "secret", 1, "S", "Быть или не быть", "Шекспир", "To Be Or Not To Be", "Shakespeare", ""], ["secret_houston", "secret", "🚀", "secret", 1, "S", "Хьюстон, у нас проблема", "Цитата астронавта", "Houston", "Astronaut quote", ""], ["secret_poehali", "secret", "🛰️", "secret", 1, "S", "Поехали!", "Цитата Гагарина", "Poyekhali", "Gagarin quote", ""], ["secret_precious", "secret", "💍", "secret", 1, "S", "Моя прелесть", "Цитата Голлума", "My Precious", "Gollum quote", ""], ["first_poll", "interactive", "📊", "common", 1, "", "Опросник", "Создайте первый опрос", "First Poll", "Create your first poll", "polls_created"], ["pollster", "interactive", "📈", "uncommon", 10, "", "Социолог", "Создайте 10 опросов", "Pollster", "Create 10 polls", "polls_created"], ["poll_master", "interactive", "📉", "rare", 50, "", "Мастер опросов", "Создайте 50 опросов", "Poll Master", "Create 50 polls", "polls_created"], ["referendum", "interactive", "🗳️", "epic", 200, "", "Референдум", "Создайте 200 опросов", "Referendum", "Create 200 polls", "polls_created"], ["first_spoiler", "interactive", "🫥", "common", 1, "", "Спойлерист", "Отправьте медиа со спойлером", "Spoilerist", "Send media with spoiler", "spoilers_sent"], ["spoiler_addict", "interactive", "👁️", "rare", 100, "", "Любитель тайн", "Отправьте 100 спойлеров", "Mystery Lover", "Send 100 spoilers", "spoilers_sent"], ["first_dice", "luck", "🎲", "common", 1, "", "Игрок", "Бросьте кубик", "Roller", "Roll a dice", "dice_rolled"], ["dice_addict", "luck", "🎰", "uncommon", 50, "", "Зависимый от удачи", "Бросьте 50 кубиков", "Luck Addict", "Roll 50 dice", "dice_rolled"], ["dice_legend", "luck", "🎯", "rare", 250, "", "Легенда удачи", "Бросьте 250 кубиков", "Luck Legend", "Roll 250 dice", "dice_rolled"], ["lucky_six", "luck", "🎲", "rare", 1, "", "Шестёрка!", "Выбросите 6 на кубике", "Lucky Six", "Roll a 6 on dice", ""], ["dart_bullseye", "luck", "🎯", "rare", 1, "", "Яблочко", "Попадите точно в центр на дартсе", "Bullseye", "Hit the bullseye on darts", ""], ["bowling_strike", "luck", "🎳", "rare", 1, "", "Страйк", "Сделайте страйк в боулинге", "Strike", "Roll a strike in bowling", ""], ["basketball_score", "luck", "🏀", "rare", 1, "", "Точный бросок", "Забейте мяч в баскетболе", "Slam Dunk", "Score in basketball", ""], ["football_goal", "luck", "⚽", "rare", 1, "", "Гол!", "Забейте гол в футболе", "Goal!", "Score in football", ""], ["slot_jackpot", "luck", "🎰", "mythic", 1, "", "ДЖЕКПОТ 777", "Выбейте 777 на слот-машине", "JACKPOT 777", "Hit 777 on the slot machine", ""], ["genz_rizz", "special", "🔥", "rare", 1, "S", "Rizz Господа", "Отправил сообщение с «rizz»", "Rizz God", "Sent a message containing «rizz»", ""], ["genz_slay", "special", "💅", "common", 1, "S", "Слей", "Отправил сообщение с «slay»", "Slay", "Sent a message containing «slay»", ""], ["genz_bussin", "special", "😤", "common", 1, "S", "Буссин", "Отправил сообщение с «bussin»", "Bussin", "Sent a message containing «bussin»", ""], ["genz_no_cap", "special", "🧢", "common", 1, "S", "Без Кэпа", "Отправил сообщение с «no cap» или «nocap»", "No Cap", "Sent a message containing «no cap» or «nocap»", ""], ["genz_lowkey", "special", "🤫", "common", 1, "S", "Лоукей", "Отправил сообщение с «lowkey»", "Lowkey", "Sent a message containing «lowkey»", ""], ["genz_highkey", "special", "📢", "common", 1, "S", "Хайкей", "Отправил сообщение с «highkey»", "Highkey", "Sent a message containing «highkey»", ""], ["genz_based", "special", "🗿", "rare", 1, "S", "Основан", "Отправил сообщение с «based»", "Based", "Sent a message containing «based»", ""], ["genz_cringe", "special", "😬", "common", 1, "S", "Кринж", "Отправил сообщение с «cringe»", "Cringe", "Sent a message containing «cringe»", ""], ["genz_mid", "special", "😐", "common", 1, "S", "Мид", "Отправил сообщение с «mid»", "Mid", "Sent a message containing «mid»", ""], ["genz_sheesh", "special", "😤", "common", 1, "S", "Шиш", "Отправил сообщение с «sheesh»", "Sheesh", "Sent a message containing «sheesh»", ""], ["genz_yeet", "special", "🚀", "common", 1, "S", "Йит", "Отправил сообщение с «yeet»", "Yeet", "Sent a message containing «yeet»", ""], ["genz_vibe", "special", "✨", "common", 1, "S", "Вайб", "Отправил сообщение с «vibes» или «vibe check»", "Vibe Check", "Sent a message containing «vibes» or «vibe check»", ""], ["genz_rent_free", "special", "🧠", "rare", 1, "S", "Живёт В Голове", "Отправил сообщение с «rent free»", "Living Rent Free", "Sent a message containing «rent free»", ""], ["genz_understood", "special", "🎯", "rare", 1, "S", "Понял Задание", "Отправил «understood the assignment»", "Understood the Assignment", "Sent «understood the assignment»", ""], ["genz_main_char", "special", "⭐", "rare", 1, "S", "Главный Персонаж", "Отправил «main character» или «main character energy»", "Main Character", "Sent «main character» or «main character energy»", ""], ["genz_era", "special", "🕰️", "common", 1, "S", "Эра", "Отправил сообщение с «era» (напр. «villain era»)", "Era", "Sent a message with «era» (e.g. «villain era»)", ""], ["genz_delulu", "special", "🌈", "rare", 1, "S", "Делюлу", "Отправил сообщение с «delulu»", "Delulu", "Sent a message containing «delulu»", ""], ["genz_salty", "special", "🧂", "common", 1, "S", "Солёный", "Отправил сообщение с «salty»", "Salty", "Sent a message containing «salty»", ""], ["genz_ghosted", "special", "👻", "common", 1, "S", "Гостед", "Отправил сообщение с «ghosted»", "Ghosted", "Sent a message containing «ghosted»", ""], ["genz_glow_up", "special", "✨", "rare", 1, "S", "Трансформация", "Отправил сообщение с «glow up»", "Glow Up", "Sent a message containing «glow up»", ""], ["genz_flex", "special", "💪", "common", 1, "S", "Флекс", "Отправил сообщение с «flex»", "Flex", "Sent a message containing «flex»", ""], ["genz_goat", "special", "🐐", "rare", 1, "S", "GOAT", "Отправил сообщение с «goat» или «GOAT»", "GOAT", "Sent a message containing «goat» or «GOAT»", ""], ["genz_caught_4k", "special", "📸", "rare", 1, "S", "Пойман В 4К", "Отправил «caught in 4k»", "Caught in 4K", "Sent «caught in 4k»", ""], ["genz_brainrot", "special", "🧠", "rare", 1, "S", "Ротация Мозга", "Отправил сообщение с «brainrot» или «brain rot»", "Brain Rot", "Sent a message containing «brainrot» or «brain rot»", ""], ["genz_ick", "special", "🤢", "common", 1, "S", "Ик", "Отправил сообщение с «the ick» или «ick»", "The Ick", "Sent a message containing «the ick» or «ick»", ""], ["genz_simp", "special", "💔", "common", 1, "S", "Симп", "Отправил сообщение с «simp»", "Simp", "Sent a message containing «simp»", ""], ["genz_pick_me", "special", "🙋", "common", 1, "S", "Выбери Меня", "Отправил «pick me» или «pickme»", "Pick Me", "Sent «pick me» or «pickme»", ""], ["genz_press_f", "special", "⌨️", "common", 1, "S", "Нажми F", "Отправил «press f» или «f in chat»", "Press F", "Sent «press f» or «f in chat»", ""], ["genz_gg_ez", "special", "🎮", "common", 1, "S", "GG EZ", "Отправил «gg ez» или «gg easy»", "GG EZ", "Sent «gg ez» or «gg easy»", ""], ["genz_plot_armor", "special", "🛡️", "rare", 1, "S", "Броня Сюжета", "Отправил «plot armor»", "Plot Armor", "Sent «plot armor»", ""], ["genz_lore", "special", "📖", "common", 1, "S", "Лор", "Отправил сообщение с «lore» или «lore drop»", "Lore", "Sent a message containing «lore» or «lore drop»", ""], ["genz_shitpost", "special", "💩", "common", 1, "S", "Шитпост", "Отправил «shitpost» или «shitposting»", "Shitpost", "Sent «shitpost» or «shitposting»", ""], ["genz_cursed", "special", "🤮", "rare", 1, "S", "Проклятый", "Отправил сообщение с «cursed»", "Cursed", "Sent a message containing «cursed»", ""], ["genz_blessed", "special", "🙏", "common", 1, "S", "Благословенный", "Отправил сообщение с «blessed»", "Blessed", "Sent a message containing «blessed»", ""], ["genz_galaxy_brain", "special", "🌌", "rare", 1, "S", "Галактический Мозг", "Отправил «galaxy brain»", "Galaxy Brain", "Sent «galaxy brain»", ""], ["genz_touch_grass", "special", "🌿", "rare", 1, "S", "Трогай Траву", "Отправил «touch grass» или «go outside»", "Touch Grass", "Sent «touch grass» or «go outside»", ""], ["genz_ratio", "special", "📊", "rare", 1, "S", "Рейшо", "Отправил «ratio» или «L + ratio»", "Ratio'd", "Sent «ratio» or «L + ratio»", ""], ["genz_clout", "special", "👑", "common", 1, "S", "Клаут", "Отправил сообщение с «clout»", "Clout", "Sent a message containing «clout»", ""], ["genz_cope", "special", "😭", "common", 1, "S", "Коп", "Отправил «cope», «coping», или «skill issue»", "Cope", "Sent «cope», «coping», or «skill issue»", ""], ["genz_seethe", "special", "😤", "common", 1, "S", "Сейс", "Отправил сообщение с «seethe»", "Seethe", "Sent a message containing «seethe»", ""], ["genz_mald", "special", "😡", "common", 1, "S", "Малд", "Отправил сообщение с «mald» или «malding»", "Malding", "Sent a message containing «mald» or «malding»", ""], ["genz_sigma", "special", "😎", "rare", 1, "S", "Сигма", "Отправил «sigma» или «sigma male»", "Sigma", "Sent «sigma» or «sigma male»", ""], ["genz_grindset", "special", "💼", "rare", 1, "S", "Гриндсет", "Отправил «grindset», «sigma grindset» или «hustle»", "Grindset", "Sent «grindset», «sigma grindset», or «hustle»", ""], ["genz_chronically_online", "special", "📱", "rare", 1, "S", "Хронически Онлайн", "Отправил «chronically online»", "Chronically Online", "Sent «chronically online»", ""], ["genz_doomscroll", "special", "📜", "common", 1, "S", "Думскролл", "Отправил «doomscroll» или «doom scrolling»", "Doomscroll", "Sent «doomscroll» or «doom scrolling»", ""], ["genz_parasocial", "special", "👁️", "rare", 1, "S", "Парасоциальный", "Отправил «parasocial»", "Parasocial", "Sent a message containing «parasocial»", ""], ["genz_clip_it", "special", "🎬", "common", 1, "S", "Клипани", "Отправил «clip it» или «clip that»", "Clip It", "Sent «clip it» or «clip that»", ""], ["genz_no_bitches", "special", "🚫", "rare", 1, "S", "Нет Битчей", "Отправил «no bitches» или «do you have any bitches»", "No Bitches", "Sent «no bitches» or «do you have any bitches»", ""], ["genz_didnt_ask", "special", "🤷", "common", 1, "S", "Не Спрашивал", "Отправил «didn't ask» или «nobody asked»", "Didn't Ask", "Sent «didn't ask» or «nobody asked»", ""], ["genz_npc", "special", "🤖", "rare", 1, "S", "NPC", "Отправил сообщение с «npc» или «npc behavior»", "NPC", "Sent a message containing «npc» or «npc behavior»", ""], ["genz_fr_fr", "special", "💯", "common", 1, "S", "Факт Факт", "Отправил «fr fr», «frfr», или «for real»", "Fr Fr", "Sent «fr fr», «frfr», or «for real»", ""], ["genz_hit_diff", "special", "💥", "rare", 1, "S", "Бьёт Иначе", "Отправил «hit different» или «hits different»", "Hits Different", "Sent «hit different» or «hits different»", ""], ["genz_deadass", "special", "💀", "common", 1, "S", "Дедасс", "Отправил «deadass»", "Deadass", "Sent a message containing «deadass»", ""], ["genz_big_brain", "special", "🧠", "rare", 1, "S", "Большой Мозг", "Отправил «big brain» или «5head»", "Big Brain", "Sent «big brain» or «5head»", ""], ["tiktok_pov", "special", "📱", "common", 1, "S", "PoV", "Отправил «pov:» или «point of view»", "PoV", "Sent «pov:» or «point of view»", ""], ["tiktok_fyp", "special", "🎯", "common", 1, "S", "FYP", "Отправил «fyp», «for you page» или «for you»", "FYP", "Sent «fyp», «for you page», or «for you»", ""], ["tiktok_duet", "special", "🎤", "common", 1, "S", "Дуэт", "Отправил «duet» в контексте тиктока", "TikTok Duet", "Sent «duet» in a TikTok context", ""], ["tiktok_stitched", "special", "✂️", "common", 1, "S", "Стич", "Отправил «stitch this» или «stitched»", "Stitched", "Sent «stitch this» or «stitched»", ""], ["tiktok_live", "special", "🔴", "common", 1, "S", "Тикток Лайв", "Отправил «go live» или «tiktok live»", "TikTok Live", "Sent «go live» or «tiktok live»", ""], ["tiktok_algo", "special", "⚙️", "rare", 1, "S", "Алгоритм", "Отправил «the algorithm» или «feed the algorithm»", "The Algorithm", "Sent «the algorithm» or «feed the algorithm»", ""], ["tiktok_sounds", "special", "🔊", "common", 1, "S", "Использую Звук", "Отправил «use this sound» или «using this sound»", "Use This Sound", "Sent «use this sound» or «using this sound»", ""], ["tiktok_greenscreen", "special", "💚", "common", 1, "S", "Зелёный Экран", "Отправил «green screen»", "Green Screen", "Sent «green screen»", ""], ["tiktok_ratio_comment", "special", "📊", "rare", 1, "S", "Комментарий Рейшо", "Отправил «ratio» в ответ на чужое сообщение", "Ratio Comment", "Sent «ratio» as a reply", ""], ["tiktok_foryou", "special", "💫", "common", 1, "S", "Рекомендации", "Отправил «for you» или «landed on your fyp»", "For You", "Sent «for you» or «landed on your fyp»", ""], ["tiktok_tok", "special", "🎵", "common", 1, "S", "ТикТокер", "Отправил «tiktok» в сообщении", "TikToker", "Sent a message containing «tiktok»", ""], ["insta_reel", "special", "🎥", "common", 1, "S", "Рилс", "Отправил «reel» или «reels»", "Reels", "Sent a message containing «reel» or «reels»", ""], ["insta_story", "special", "⭕", "common", 1, "S", "Сториз", "Отправил «story» или «insta story»", "Story Time", "Sent «story» or «insta story»", ""], ["insta_close_friends", "special", "💚", "rare", 1, "S", "Близкие Друзья", "Отправил «close friends» или «cf»", "Close Friends", "Sent «close friends» or «cf»", ""], ["insta_collab", "special", "🤝", "common", 1, "S", "Коллаб", "Отправил «collab» или «collaboration»", "Collab", "Sent «collab» or «collaboration»", ""], ["insta_dm", "special", "💌", "common", 1, "S", "DM Меня", "Отправил «dm me», «slide into dms», или «check your dms»", "DM Me", "Sent «dm me», «slide into dms», or «check your dms»", ""], ["insta_aesthetic", "special", "🎨", "rare", 1, "S", "Эстетика", "Отправил «aesthetic» или «core aesthetic»", "Aesthetic", "Sent «aesthetic» or «core aesthetic»", ""], ["insta_follow_back", "special", "👀", "common", 1, "S", "Взаимная Подписка", "Отправил «follow back» или «f4f»", "Follow Back", "Sent «follow back» or «f4f»", ""], ["insta_explore", "special", "🔍", "common", 1, "S", "Страница Обзора", "Отправил «explore page» или «on the explore»", "Explore Page", "Sent «explore page» or «on the explore»", ""], ["twitter_ratio_l", "special", "📉", "rare", 1, "S", "L + Рейшо", "Отправил «L +» или «L + ratio»", "L + Ratio", "Sent «L +» or «L + ratio»", ""], ["twitter_w", "special", "🏆", "common", 1, "S", "W", "Отправил «W» или «taking the W»", "W", "Sent «W» or «taking the W»", ""], ["twitter_l", "special", "📉", "common", 1, "S", "L", "Отправил «took an L» или «big L»", "L", "Sent «took an L» or «big L»", ""], ["twitter_thread", "special", "🧵", "rare", 1, "S", "Тред", "Отправил «thread» или «a thread»", "Thread", "Sent «thread» or «a thread»", ""], ["twitter_quote_tweet", "special", "💬", "common", 1, "S", "Цитата", "Отправил «quote tweet» или «quote this»", "Quote Tweet", "Sent «quote tweet» or «quote this»", ""], ["alpha_skibidi", "special", "🚽", "rare", 1, "S", "Скибиди", "Отправил «skibidi»", "Skibidi", "Sent a message containing «skibidi»", ""], ["alpha_sigma_ohio", "special", "🏠", "rare", 1, "S", "Огайо", "Отправил «ohio» или «only in ohio»", "Ohio", "Sent «ohio» or «only in ohio»", ""], ["alpha_fanum_tax", "special", "💸", "rare", 1, "S", "Фанум Такс", "Отправил «fanum tax»", "Fanum Tax", "Sent «fanum tax»", ""], ["alpha_rizz_w", "special", "🎯", "rare", 1, "S", "Безграничный Ризз", "Отправил «rizzler» или «unspoken rizz»", "Rizz W", "Sent «rizzler» or «unspoken rizz»", ""], ["alpha_hawk_tuah", "special", "🦅", "legendary", 1, "S", "Хок Туа", "Отправил «hawk tuah»", "Hawk Tuah", "Sent «hawk tuah»", ""], ["alpha_gyatt", "special", "😳", "rare", 1, "S", "Гайат", "Отправил «gyatt» или «gyat»", "Gyatt", "Sent «gyatt» or «gyat»", ""], ["alpha_mewing", "special", "😤", "common", 1, "S", "Мьюинг", "Отправил «mewing»", "Mewing", "Sent a message containing «mewing»", ""], ["alpha_looksmaxx", "special", "💎", "rare", 1, "S", "Луксмакс", "Отправил «looksmaxxing» или «looksmax»", "Looksmax", "Sent «looksmaxxing» or «looksmax»", ""], ["alpha_gooning", "special", "🧌", "rare", 1, "S", "Гунинг", "Отправил «gooning»", "Gooning", "Sent a message containing «gooning»", ""], ["alpha_glaze", "special", "🪟", "common", 1, "S", "Глейз", "Отправил «glazing» или «glaze»", "Glazing", "Sent «glazing» or «glaze»", ""], ["alpha_aura", "special", "✨", "rare", 1, "S", "Аура", "Отправил «aura» или «negative aura»", "Aura", "Sent «aura» or «negative aura»", ""], ["alpha_cooked", "special", "🍳", "common", 1, "S", "Сгорел", "Отправил «cooked» или «you're cooked»", "Cooked", "Sent «cooked» or «you're cooked»", ""], ["alpha_bomboclat", "special", "💥", "rare", 1, "S", "Бомбоклат", "Отправил «bomboclat»", "Bomboclat", "Sent «bomboclat»", ""], ["alpha_what_da_dog", "special", "🐶", "rare", 1, "S", "Что Делает Собака", "Отправил «what da dog doin»", "What Da Dog Doin", "Sent «what da dog doin»", ""], ["alpha_bro_cooked", "special", "🧑‍🍳", "common", 1, "S", "Бро Сгорел", "Отправил «bro is cooked» или «bro cooked»", "Bro Is Cooked", "Sent «bro is cooked» or «bro cooked»", ""], ["alpha_bro_told", "special", "🗣️", "common", 1, "S", "Бро Сказал", "Отправил «bro said», «bro told me» или «bro thought»", "Bro Told", "Sent «bro said», «bro told me», or «bro thought»", ""], ["alpha_ts_real", "special", "💯", "rare", 1, "S", "Это Реально", "Отправил «ts is real», «this is real»", "This Is Real", "Sent «ts is real» or «this is real»", ""], ["alpha_aint_real", "special", "🤯", "rare", 1, "S", "Это Нереально", "Отправил «ain't real», «this ain't real»", "Ain't Real", "Sent «ain't real» or «this ain't real»", ""], ["alpha_nuh_uh", "special", "🙅", "common", 1, "S", "Нет", "Отправил «nuh uh» или «nuh-uh»", "Nuh Uh", "Sent «nuh uh» or «nuh-uh»", ""], ["alpha_yuh", "special", "👍", "common", 1, "S", "Юх", "Отправил «yuh», «yuh yuh» или «yurrr»", "Yuh", "Sent «yuh», «yuh yuh», or «yurrr»", ""], ["alpha_its_giving", "special", "💁", "rare", 1, "S", "Это Даёт", "Отправил «it's giving» или «its giving»", "It's Giving", "Sent «it's giving» or «its giving»", ""], ["alpha_ate_no_left", "special", "🍽️", "rare", 1, "S", "Съел И Ничего", "Отправил «ate and left no crumbs»", "Ate, Left No Crumbs", "Sent «ate and left no crumbs»", ""], ["alpha_mother", "special", "👑", "rare", 1, "S", "Матушка", "Отправил «mother» (в мемном контексте)", "Mother", "Sent «mother» (in meme context)", ""], ["alpha_very_demure", "special", "🌸", "rare", 1, "S", "Очень Скромно", "Отправил «very demure» или «very mindful»", "Very Demure", "Sent «very demure» or «very mindful»", ""], ["alpha_no_skips", "special", "⏭️", "common", 1, "S", "Без Скипов", "Отправил «no skips» или «banger»", "No Skips", "Sent «no skips» or «banger»", ""], ["alpha_sped_up", "special", "⏩", "common", 1, "S", "Ускорено", "Отправил «sped up» или «slowed + reverb»", "Sped Up", "Sent «sped up» or «slowed + reverb»", ""], ["alpha_we_are_so_back", "special", "💪", "legendary", 1, "S", "Мы Вернулись", "Отправил «we are so back» или «we're so back»", "We Are SO Back", "Sent «we are so back» or «we're so back»", ""], ["alpha_its_over", "special", "😔", "rare", 1, "S", "Всё Кончено", "Отправил «it's over» или «its over»", "It's Over", "Sent «it's over» or «its over»", ""], ["alpha_real", "special", "💯", "common", 1, "S", "Реальный", "Отправил «real» или «realest»", "Real", "Sent «real» or «realest»", ""], ["alpha_cap", "special", "🧢", "common", 1, "S", "Кэп", "Отправил «cap» или «capping»", "Cap", "Sent «cap» or «capping»", ""], ["alpha_mf", "special", "🤦", "common", 1, "S", "МФ", "Отправил «mf» или «this mf»", "MF", "Sent «mf» or «this mf»", ""], ["alpha_buss", "special", "🔥", "rare", 1, "S", "Басс", "Отправил «buss» или «bussin bussin»", "Buss", "Sent «buss» or «bussin bussin»", ""], ["alpha_pmo", "special", "😤", "common", 1, "S", "PMO", "Отправил «pmo» или «pisses me off»", "PMO", "Sent «pmo» or «pisses me off»", ""], ["alpha_type_beat", "special", "🎵", "rare", 1, "S", "Тайп Бит", "Отправил «type beat» (напр. «lofi type beat»)", "Type Beat", "Sent «type beat» (e.g. «lofi type beat»)", ""], ["alpha_understood_assignment", "special", "✅", "legendary", 5, "S", "Мастер Задания", "Отправил «understood the assignment» 5 раз", "Assignment Master", "Sent «understood the assignment» 5 times", ""], ["meme_ngl", "special", "🫣", "common", 1, "S", "НГЛ", "Отправил «ngl» или «not gonna lie»", "NGL", "Sent «ngl» or «not gonna lie»", ""], ["meme_tbh", "special", "🤷", "common", 1, "S", "Честно", "Отправил «tbh» или «to be honest»", "TBH", "Sent «tbh» or «to be honest»", ""], ["meme_imo", "special", "💬", "common", 1, "S", "ПМО", "Отправил «imo» или «in my opinion»", "IMO", "Sent «imo» or «in my opinion»", ""], ["meme_istg", "special", "🤬", "common", 1, "S", "Клянусь", "Отправил «istg» или «i swear to god»", "ISTG", "Sent «istg» or «i swear to god»", ""], ["meme_ong", "special", "💯", "common", 1, "S", "ОНГ", "Отправил «ong» или «on god»", "ONG", "Sent «ong» or «on god»", ""], ["meme_say_less", "special", "🤐", "common", 1, "S", "Больше Не Надо", "Отправил «say less»", "Say Less", "Sent «say less»", ""], ["meme_it_do_be", "special", "😔", "common", 1, "S", "Ну Бывает", "Отправил «it do be like that»", "It Do Be", "Sent «it do be like that»", ""], ["meme_ong_fr", "special", "🔥", "rare", 1, "S", "Ong Fr", "Отправил «ong fr» или «on god for real»", "Ong Fr", "Sent «ong fr» or «on god for real»", ""], ["meme_bestie", "special", "👫", "common", 1, "S", "Бести", "Отправил «bestie»", "Bestie", "Sent a message containing «bestie»", ""], ["meme_periodt", "special", "💅", "common", 1, "S", "Период", "Отправил «periodt» или «period»", "Periodt", "Sent «periodt» or «period.»", ""], ["meme_no_printer", "special", "🖨️", "rare", 1, "S", "Только Факты", "Отправил «facts no printer»", "Facts No Printer", "Sent «facts no printer»", ""], ["meme_sending", "special", "😂", "common", 1, "S", "В Потоке", "Отправил «i'm sending» или «sending me»", "Sending Me", "Sent «i'm sending» or «sending me»", ""], ["meme_im_weak", "special", "😵", "common", 1, "S", "Без Сил", "Отправил «i'm weak» или «im dead»", "I'm Weak", "Sent «i'm weak» or «im dead»", ""], ["meme_dead", "special", "💀", "common", 1, "S", "Мёртвый", "Отправил «im dead» или «i'm dying»", "I'm Dead", "Sent «im dead» or «i'm dying»", ""], ["meme_whats_the_vibe", "special", "✨", "common", 1, "S", "Какой Вайб", "Отправил «what's the vibe» или «what's the energy»", "What's the Vibe", "Sent «what's the vibe» or «what's the energy»", ""], ["meme_hold_on", "special", "🛑", "common", 1, "S", "Стоп", "Отправил «hold on step bro» или «hold on»", "Hold On", "Sent «hold on step» or «hold on»", ""], ["meme_not_me", "special", "🙈", "common", 1, "S", "Не Я", "Отправил «not me» или «not me doing»", "Not Me", "Sent «not me» or «not me doing»", ""], ["meme_core", "special", "🎯", "rare", 1, "S", "Кор", "Отправил «core» как часть эстетики (напр. «cottagecore»)", "Core", "Sent «core» as part of an aesthetic (e.g. «cottagecore»)", ""], ["meme_ate", "special", "🍽️", "common", 1, "S", "Съел", "Отправил «ate» или «she ate»", "Ate", "Sent «ate» or «she ate»", ""], ["meme_snatched", "special", "💅", "rare", 1, "S", "Снатчед", "Отправил «snatched» или «outfit snatched»", "Snatched", "Sent «snatched» or «outfit snatched»", ""], ["meme_slaps", "special", "🎵", "common", 1, "S", "Слэпс", "Отправил «this slaps» или «song slaps»", "Slaps", "Sent «this slaps» or «song slaps»", ""], ["meme_no_thoughts", "special", "🫥", "rare", 1, "S", "Пустая Голова", "Отправил «no thoughts head empty»", "No Thoughts", "Sent «no thoughts head empty»", ""], ["meme_rotting", "special", "😴", "rare", 1, "S", "Гнию", "Отправил «rotting in bed» или «bed rotting»", "Bed Rotting", "Sent «rotting in bed» or «bed rotting»", ""], ["meme_villain_arc", "special", "😈", "legendary", 1, "S", "Вилейн Эра", "Отправил «villain arc» или «entering villain arc»", "Villain Arc", "Sent «villain arc» or «entering villain arc»", ""], ["meme_main_char_energy", "special", "⭐", "rare", 1, "S", "Энергия Главного", "Отправил «main character energy»", "Main Character Energy", "Sent «main character energy»", ""], ["meme_pookie", "special", "🐻", "common", 1, "S", "Пуки", "Отправил «pookie»", "Pookie", "Sent a message containing «pookie»", ""], ["meme_beige_flag", "special", "🏳️", "rare", 1, "S", "Бежевый Флаг", "Отправил «beige flag»", "Beige Flag", "Sent «beige flag»", ""], ["meme_red_flag", "special", "🚩", "common", 1, "S", "Красный Флаг", "Отправил «red flag» или «🚩🚩🚩»", "Red Flag", "Sent «red flag» or «🚩🚩🚩»", ""], ["meme_green_flag", "special", "✅", "common", 1, "S", "Зелёный Флаг", "Отправил «green flag»", "Green Flag", "Sent «green flag»", ""], ["meme_ratioed", "special", "📊", "rare", 1, "S", "Рейшоед", "Отправил «ratioed»", "Ratioed", "Sent «ratioed»", ""], ["meme_touch_grass_100", "special", "🌿", "legendary", 10, "S", "Садовник", "Написал «touch grass» 10 раз. Выйди на улицу!", "Grass Toucher", "Sent «touch grass» 10 times. Go outside!", ""], ["meme_yap", "special", "🗣️", "common", 1, "S", "Яп", "Отправил «yapping» или «yap session»", "Yap", "Sent «yapping» or «yap session»", ""], ["meme_understood_x10", "special", "✅", "legendary", 10, "S", "Суперисполнитель", "Отправил «understood the assignment» 10 раз", "Assignment God", "Sent «understood the assignment» 10 times", ""], ["meme_lowk_unhinged", "special", "🤪", "rare", 1, "S", "Немного Неуравновешен", "Отправил «lowkey unhinged» или «unhinged»", "Lowkey Unhinged", "Sent «lowkey unhinged» or «unhinged»", ""], ["meme_ate_that", "special", "🍽️", "rare", 1, "S", "Съел Это", "Отправил «ate that» или «absolutely ate»", "Ate That", "Sent «ate that» or «absolutely ate»", ""], ["meme_understood_assignment_2", "special", "🎯", "legendary", 3, "S", "Троекратный Исполнитель", "Отправил «understood the assignment» 3 раза", "Triple Assignment", "Sent «understood the assignment» 3 times", ""], ["meme_zero_rizz", "special", "📉", "rare", 1, "S", "Ноль Ризза", "Отправил «zero rizz» или «negative rizz»", "Zero Rizz", "Sent «zero rizz» or «negative rizz»", ""], ["meme_W_rizz", "special", "🏆", "legendary", 1, "S", "W Ризз", "Отправил «W rizz» или «ultimate rizz»", "W Rizz", "Sent «W rizz» or «ultimate rizz»", ""], ["meme_banger", "special", "🎵", "common", 1, "S", "Банер", "Отправил «banger» или «absolute banger»", "Banger", "Sent «banger» or «absolute banger»", ""], ["meme_mid_song", "special", "😐", "common", 1, "S", "Мид Трек", "Отправил «mid song» или «that song is mid»", "Mid Song", "Sent «mid song» or «that song is mid»", ""], ["meme_frfr_ong", "special", "💯", "rare", 1, "S", "Fr Fr Ong", "Отправил «frfr ong» или «for real on god»", "Frfr Ong", "Sent «frfr ong» or «for real on god»", ""], ["meme_looksmaxx_grind", "special", "💪", "legendary", 1, "S", "Луксмакс Гринд", "Отправил «looksmaxxing grind» или «maxxing»", "Looksmaxx Grind", "Sent «looksmaxxing grind» or «maxxing»", ""], ["alpha_rizz_up", "special", "💫", "rare", 1, "S", "Ризз Ап", "Отправил «rizz up» или «rizzed her up»", "Rizz Up", "Sent «rizz up» or «rizzed her up»", ""], ["alpha_ohio_only", "special", "🏠", "legendary", 3, "S", "Только В Огайо", "Отправил «only in ohio» 3 раза", "Only In Ohio", "Sent «only in ohio» 3 times", ""]];

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

  if (storage.unlocked === undefined) storage.unlocked = {};
  if (storage.soundEnabled === undefined) storage.soundEnabled = true;
  if (storage.toastsEnabled === undefined) storage.toastsEnabled = true;
  if (storage.showProgressOnBio === undefined) storage.showProgressOnBio = false;
  if (storage.savedBaseBio === undefined) storage.savedBaseBio = "";
  if (storage.language === undefined) storage.language = "auto";
  if (storage.stats === undefined) storage.stats = {};
  var sInit = storage.stats;
  if (sInit.messages_sent === undefined) sInit.messages_sent = 0;
  if (sInit.photos_sent === undefined) sInit.photos_sent = 0;
  if (sInit.videos_sent === undefined) sInit.videos_sent = 0;
  if (sInit.voice_sent === undefined) sInit.voice_sent = 0;
  if (sInit.stickers_sent === undefined) sInit.stickers_sent = 0;
  if (sInit.gifs_sent === undefined) sInit.gifs_sent = 0;
  if (sInit.files_sent === undefined) sInit.files_sent = 0;
  if (sInit.audios_sent === undefined) sInit.audios_sent = 0;
  if (sInit.spoilers_sent === undefined) sInit.spoilers_sent = 0;
  if (sInit.edits_made === undefined) sInit.edits_made = 0;
  if (sInit.replies_made === undefined) sInit.replies_made = 0;
  if (sInit.reactions_made === undefined) sInit.reactions_made = 0;
  if (sInit.polls_created === undefined) sInit.polls_created = 0;
  if (sInit.dice_rolled === undefined) sInit.dice_rolled = 0;
  if (!Array.isArray(sInit.unique_chats)) sInit.unique_chats = [];
  if (!Array.isArray(sInit.private_chats)) sInit.private_chats = [];
  if (!Array.isArray(sInit.group_chats)) sInit.group_chats = [];
  if (!Array.isArray(sInit.channel_chats)) sInit.channel_chats = [];
  if (!Array.isArray(sInit.bot_chats)) sInit.bot_chats = [];
  if (!Array.isArray(sInit.days_active)) sInit.days_active = [];
  if (sInit.fire_streak === undefined) sInit.fire_streak = 0;
  if (!sInit.fire_streaks) sInit.fire_streaks = {};

  function getUnlockedCount() {
    var unlockedMap = storage.unlocked || {};
    var count = 0;
    for (var id in unlockedMap) {
      if (unlockedMap[id] && ACH_BY_ID[id]) {
        count++;
      }
    }
    return count;
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

  var bioDebounceTimer = null;

  function stripAchievementsLine(bio) {
    if (!bio || typeof bio !== "string") return "";
    return bio.replace(/(?:^|\r?\n)(?:🏆|\uD83C\uDFC6)\s*(?:Achievements|Достижения)[^\r\n]*/gi, "").trim();
  }

  function fetchUserBio(callback) {
    try {
      var currentUser = UserStore && UserStore.getCurrentUser && UserStore.getCurrentUser();
      var userId = currentUser && currentUser.id;

      if (UserProfileStore && UserProfileStore.getUserProfile && userId) {
        var profile = UserProfileStore.getUserProfile(userId);
        if (profile && typeof profile.bio === "string" && profile.bio.length > 0) {
          callback(profile.bio);
          return;
        }
      }

      if (currentUser && typeof currentUser.bio === "string" && currentUser.bio.length > 0) {
        callback(currentUser.bio);
        return;
      }

      var token = TokenModule && TokenModule.getToken && TokenModule.getToken();
      if (!token) {
        callback(storage.savedBaseBio || "");
        return;
      }

      fetch("https://discord.com/api/v9/users/@me/profile", {
        headers: { "Authorization": token }
      }).then(function (res) {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      }).then(function (data) {
        var fetched = (data && data.user_profile && typeof data.user_profile.bio === "string" && data.user_profile.bio) ||
                      (data && data.user && typeof data.user.bio === "string" && data.user.bio) ||
                      (data && typeof data.bio === "string" && data.bio) || "";
        if (fetched) {
          callback(fetched);
        } else {
          callback(storage.savedBaseBio || "");
        }
      }).catch(function () {
        callback(storage.savedBaseBio || "");
      });
    } catch (e) {
      callback(storage.savedBaseBio || "");
    }
  }

  function syncProgressToBio() {
    try {
      var token = TokenModule && TokenModule.getToken && TokenModule.getToken();
      if (!token) return;

      var currentUser = UserStore && UserStore.getCurrentUser && UserStore.getCurrentUser();
      if (!currentUser) return;

      fetchUserBio(function (rawBio) {
        var unlockedCount = getUnlockedCount();
        var totalCount = ACHIEVEMENTS.length;
        var pct = Math.round((unlockedCount / totalCount) * 100);

        var achLine = (isRussian() ? "🏆 Достижения: " : "🏆 Achievements: ") + unlockedCount + "/" + totalCount + " (" + pct + "%)";

        var cleanBio = stripAchievementsLine(rawBio);

        if (cleanBio) {
          if (!storage.savedBaseBio || cleanBio.length >= storage.savedBaseBio.length) {
            storage.savedBaseBio = cleanBio;
          }
        }

        var baseToUse = cleanBio || storage.savedBaseBio || "";

        var newBio = "";
        if (baseToUse) {
          var neededLen = achLine.length + 1;
          var maxBaseLength = 190 - neededLen;
          if (baseToUse.length > maxBaseLength) {

            var trimmedBase = baseToUse.slice(0, Math.max(0, maxBaseLength)).replace(/\s+$/, "");
            newBio = trimmedBase ? (trimmedBase + "\n" + achLine) : achLine;
          } else {
            newBio = baseToUse + "\n" + achLine;
          }
        } else {
          newBio = achLine;
        }

        if (newBio.length > 190) {
          newBio = newBio.slice(0, 190);
        }

        fetch("https://discord.com/api/v9/users/@me/profile", {
          method: "PATCH",
          headers: {
            "Authorization": token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ bio: newBio })
        }).then(function (res) {
          if (res.ok) {
            if (currentUser) currentUser.bio = newBio;
            var prof = currentUser && UserProfileStore && UserProfileStore.getUserProfile && UserProfileStore.getUserProfile(currentUser.id);
            if (prof) prof.bio = newBio;
          }
        }).catch(function () {});
      });
    } catch (e) {}
  }

  function removeProgressFromBio() {
    try {
      if (bioDebounceTimer) {
        clearTimeout(bioDebounceTimer);
        bioDebounceTimer = null;
      }
      var token = TokenModule && TokenModule.getToken && TokenModule.getToken();
      if (!token) return;

      var currentUser = UserStore && UserStore.getCurrentUser && UserStore.getCurrentUser();

      fetchUserBio(function (rawBio) {

        var restoreBio = "";
        if (storage.savedBaseBio !== undefined && storage.savedBaseBio !== "") {
          restoreBio = storage.savedBaseBio;
        } else if (rawBio) {
          restoreBio = stripAchievementsLine(rawBio);
        }

        fetch("https://discord.com/api/v9/users/@me/profile", {
          method: "PATCH",
          headers: {
            "Authorization": token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ bio: restoreBio })
        }).then(function (res) {
          if (res.ok) {
            if (currentUser) currentUser.bio = restoreBio;
            var prof = currentUser && UserProfileStore && UserProfileStore.getUserProfile && UserProfileStore.getUserProfile(currentUser.id);
            if (prof) prof.bio = restoreBio;
          }
        }).catch(function () {});
      });
    } catch (e) {}
  }

  function scheduleBioUpdate(immediate) {
    if (!storage.showProgressOnBio) return;
    if (bioDebounceTimer) {
      clearTimeout(bioDebounceTimer);
      bioDebounceTimer = null;
    }
    if (immediate) {
      syncProgressToBio();
    } else {
      bioDebounceTimer = setTimeout(function () {
        bioDebounceTimer = null;
        syncProgressToBio();
      }, 3000);
    }
  }

  function showBioWarning(onConfirm, onCancel) {
    var isRu = isRussian();
    var title = isRu ? "⚠️ Предупреждение: Синхронизация «О себе»" : "⚠️ Warning: Bio Synchronization";
    var message = isRu
      ? "Включение этой опции добавит прогресс ваших достижений новой строкой внизу вашего профиля («О себе»).\n\nЕсли места недостаточно (лимит 190 символов), необходимая часть текста будет обрезана снизу, чтобы поместился счётчик.\n\nВаш исходный профиль сохраняется и будет восстановлен при отключении опции.\n\nВключить синхронизацию?"
      : "Enabling this will append your achievement progress on a new line at the bottom of your Discord bio.\n\nIf there is not enough space (Discord limit: 190 chars), the required space will be cut from the bottom of your bio to fit the counter.\n\nYour original bio is saved and will be restored when turned off.\n\nAre you sure you want to enable bio sync?";
    var confirmText = isRu ? "Включить" : "Enable";
    var cancelText = isRu ? "Отмена" : "Cancel";

    var alerts = vendetta.ui && vendetta.ui.alerts;
    if (alerts && typeof alerts.showConfirmationAlert === "function") {
      try {
        alerts.showConfirmationAlert({
          title: title,
          content: message,
          confirmText: confirmText,
          cancelText: cancelText,
          onConfirm: onConfirm,
          onCancel: onCancel
        });
        return;
      } catch (e) {}
    }

    var RN = vendetta.metro.common && vendetta.metro.common.ReactNative;
    var Alert = (RN && RN.Alert) || findByProps("alert");
    if (Alert && typeof Alert.alert === "function") {
      try {
        Alert.alert(
          title,
          message,
          [
            { text: cancelText, style: "cancel", onPress: onCancel },
            { text: confirmText, onPress: onConfirm }
          ],
          { cancelable: true, onDismiss: onCancel }
        );
        return;
      } catch (e) {}
    }

    onConfirm();
  }

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
    scheduleBioUpdate(false);
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

  var recentMessageTimestamps = [];
  var seenSignatures = {};

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function detectGifs(content, attachments, embeds) {
    var text = (typeof content === "string") ? content : "";
    if (/(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?(?:tenor\.com|giphy\.com)\/\S+/i.test(text) ||
        /https?:\/\/\S+\.gif(?:[\?#]\S*)?$/i.test(text.trim()) ||
        /https?:\/\/\S+\.gifv(?:[\?#]\S*)?$/i.test(text.trim())) {
      return true;
    }
    if (Array.isArray(attachments)) {
      for (var i = 0; i < attachments.length; i++) {
        var a = attachments[i];
        var ct = (a.content_type || a.mimeType || a.type || "").toLowerCase();
        var fn = (a.filename || a.name || a.url || "").toLowerCase();
        if (ct.startsWith("image/gif") || fn.endsWith(".gif") || fn.indexOf(".gif?") !== -1) {
          return true;
        }
      }
    }
    if (Array.isArray(embeds)) {
      for (var j = 0; j < embeds.length; j++) {
        var emb = embeds[j];
        if (emb.type === "gifv" || (emb.provider && (emb.provider.name === "Tenor" || emb.provider.name === "Giphy"))) {
          return true;
        }
        if (emb.url && /(?:tenor\.com|giphy\.com|\.gif)/i.test(emb.url)) return true;
        if (emb.video && emb.video.url && /\.gif/i.test(emb.video.url)) return true;
      }
    }
    return false;
  }

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

    var unicodeEmojis = text.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
    var customEmojis  = text.match(/<a?:[a-zA-Z0-9_]+:\d+>/g) || [];
    var totalEmojis   = unicodeEmojis.length + customEmojis.length;
    var nonEmojiText  = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]/gu, "").replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, "");

    if (totalEmojis >= 20) tryUnlock("emoji_master");
    if (totalEmojis >= 5 && nonEmojiText.length === 0) tryUnlock("emoji_only");

    var lettersOnly = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
    if (lettersOnly.length >= 10 && lettersOnly === lettersOnly.toUpperCase()) {
      tryUnlock("caps_lock");
    }

    if (ts.length >= 5 && /^\d+$/.test(ts)) {
      tryUnlock("numbers_only");
    }

    if (/https?:\/\/\S+/.test(text)) {
      tryUnlock("link_sharer");
    }

    var hashtags = text.match(/#[a-zA-Z0-9_]+/g) || [];
    if (hashtags.length >= 3) tryUnlock("multi_hashtag");
    if (hashtags.length >= 1) tryUnlock("hashtag");

    var mentions = text.match(/@[a-zA-Z0-9_]+|<@!?\d+>|<@&\d+>/g) || [];
    if (mentions.length >= 5) tryUnlock("multi_mention");
    if (mentions.length >= 1) tryUnlock("mention");

    if (text.indexOf("???") !== -1) tryUnlock("triple_question");
    if (text.indexOf("??") !== -1)  tryUnlock("double_question");
    if (text.indexOf("?") !== -1)   tryUnlock("question");
    if (text.indexOf("!!!") !== -1) tryUnlock("exclamation");
    if (text.indexOf("?!") !== -1 || text.indexOf("!?") !== -1) tryUnlock("interrobang");
    if (ts.endsWith("...") || ts.endsWith("…")) tryUnlock("lots_of_dots");

    if (ts.length >= 8 && /^[01\s]+$/.test(ts) && ts.indexOf("0") !== -1 && ts.indexOf("1") !== -1) {
      tryUnlock("secret_binary");
    }
    if (ts.length >= 10 && /^0x[0-9a-fA-F]+$/.test(ts)) {
      tryUnlock("secret_hex");
    }
    if (ts.length >= 10 && /^[.\-/\s]+$/.test(ts) && ts.indexOf(".") !== -1 && ts.indexOf("-") !== -1) {
      tryUnlock("secret_morse");
    }

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

    if (/([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}])\1{2,}/u.test(text)) {
      tryUnlock("triple_emoji_combo");
    }

    var emoticons = [":3", ":p", ":d", ":)", ":(", ":-)", ":-(", ":o", ";)", "^_^", "x_x", "xd"];
    if (emoticons.indexOf(ts.toLowerCase()) !== -1) {
      tryUnlock("emoticon_only");
    }

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

    var pureWords = text.match(/[a-zA-Zа-яА-ЯёЁ]+/g) || [];
    for (var pw = 0; pw < pureWords.length; pw++) {
      var pWord = pureWords[pw];
      if (pWord.length > 25) tryUnlock("mega_word");
      if (pWord.length > 15) tryUnlock("long_word");

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

    if (/(.)\1{14,}/.test(text)) tryUnlock("mega_repeater");
    if (/(.)\1{4,}/.test(text))  tryUnlock("repeater");

    var scriptCount = 0;
    if (/[a-zA-Z]/.test(text)) scriptCount++;
    if (/[а-яА-ЯёЁ]/.test(text)) scriptCount++;
    if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text)) scriptCount++;
    if (/[\u0600-\u06FF]/.test(text)) scriptCount++;
    if (/[\u0590-\u05FF]/.test(text)) scriptCount++;
    if (/[\uAC00-\uD7AF]/.test(text)) scriptCount++;
    if (scriptCount >= 3) tryUnlock("trilingual");
    if (scriptCount >= 2) tryUnlock("multilingual");

    var cleanLetters = tl.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
    if (cleanLetters.length >= 5 && cleanLetters === cleanLetters.split("").reverse().join("")) {
      tryUnlock("secret_palindrome");
    }

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

    if (tl.indexOf("🤦") !== -1) tryUnlock("secret_facepalm");
    if (tl.indexOf("🤔") !== -1) tryUnlock("secret_thinking");
    if (tl.indexOf("🔥") !== -1) tryUnlock("secret_fire_emoji");
    if (/[❤️❤♥️♥]/.test(tl))    tryUnlock("secret_heart");

    if (tl.indexOf("🎲") !== -1 || tl.indexOf(":game_die:") !== -1 || /^[!/]roll\b|^[!/]dice\b/.test(tl)) {
      s.dice_rolled = (s.dice_rolled || 0) + 1;
      checkThresholdAchievements("dice_rolled", s.dice_rolled);
      if (Math.random() < 0.16) tryUnlock("lucky_six");
    }
    if (tl.indexOf("🎯") !== -1 || tl.indexOf(":dart:") !== -1) {
      if (Math.random() < 0.2) tryUnlock("dart_bullseye");
    }
    if (tl.indexOf("🎳") !== -1 || tl.indexOf(":bowling:") !== -1) {
      if (Math.random() < 0.2) tryUnlock("bowling_strike");
    }
    if (tl.indexOf("🏀") !== -1 || tl.indexOf(":basketball:") !== -1) {
      if (Math.random() < 0.25) tryUnlock("basketball_score");
    }
    if (tl.indexOf("⚽") !== -1 || tl.indexOf(":soccer:") !== -1) {
      if (Math.random() < 0.25) tryUnlock("football_goal");
    }
    if (tl.indexOf("🎰") !== -1 || tl.indexOf(":slot_machine:") !== -1) {
      if (Math.random() < 0.05) tryUnlock("slot_jackpot");
    }

    var h = now.getHours();
    if (h >= 0 && h < 5 && (tl.indexOf("спокойной") !== -1 || tl.indexOf("goodnight") !== -1 || tl.indexOf("gn") !== -1)) {
      tryUnlock("secret_goodnight");
    }
    if (h >= 5 && h < 9 && (tl.indexOf("доброе утро") !== -1 || tl.indexOf("good morning") !== -1 || tl.indexOf("gm") !== -1)) {
      tryUnlock("secret_goodmorning");
    }

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

    var genzKws = [
      [["rizz"], "genz_rizz"],
      [["slay"], "genz_slay"],
      [["bussin"], "genz_bussin"],
      [["no cap", "nocap"], "genz_no_cap"],
      [["lowkey"], "genz_lowkey"],
      [["highkey"], "genz_highkey"],
      [["based"], "genz_based"],
      [["cringe"], "genz_cringe"],
      [[" mid ","mid.","mid!","mid?","that's mid","its mid","is mid"], "genz_mid"],
      [["sheesh"], "genz_sheesh"],
      [["yeet"], "genz_yeet"],
      [["vibes","vibe check"], "genz_vibe"],
      [["rent free"], "genz_rent_free"],
      [["understood the assignment"], "genz_understood"],
      [["main character"], "genz_main_char"],
      [["villain era","healing era","girl era","that era"," my era"], "genz_era"],
      [["delulu"], "genz_delulu"],
      [["salty"], "genz_salty"],
      [["ghosted"], "genz_ghosted"],
      [["glow up"], "genz_glow_up"],
      [[" flex ","flexing","the flex"], "genz_flex"],
      [["goat","g.o.a.t"], "genz_goat"],
      [["caught in 4k"], "genz_caught_4k"],
      [["brainrot","brain rot"], "genz_brainrot"],
      [["the ick"," ick.","getting the ick"], "genz_ick"],
      [["simp"], "genz_simp"],
      [["pick me","pickme"], "genz_pick_me"],
      [["press f","f in chat"], "genz_press_f"],
      [["gg ez","gg easy"], "genz_gg_ez"],
      [["plot armor"], "genz_plot_armor"],
      [["lore drop","the lore","found the lore"], "genz_lore"],
      [["shitpost","shitposting"], "genz_shitpost"],
      [["cursed image","this is cursed","so cursed"], "genz_cursed"],
      [["blessed image","so blessed"," blessed "], "genz_blessed"],
      [["galaxy brain"], "genz_galaxy_brain"],
      [["touch grass","go outside"], "genz_touch_grass"],
      [["ratio","l + ratio"], "genz_ratio"],
      [["clout"], "genz_clout"],
      [["skill issue","cope ","coping with"], "genz_cope"],
      [["seethe"], "genz_seethe"],
      [["malding","mald "], "genz_mald"],
      [["sigma male","sigma grind","sigma mode"], "genz_sigma"],
      [["grindset","sigma grindset","hustle culture"], "genz_grindset"],
      [["chronically online"], "genz_chronically_online"],
      [["doomscroll","doom scrolling"], "genz_doomscroll"],
      [["parasocial"], "genz_parasocial"],
      [["clip it","clip that"], "genz_clip_it"],
      [["no bitches","do you have any bitches"], "genz_no_bitches"],
      [["didn't ask","nobody asked","no one asked"], "genz_didnt_ask"],
      [["npc behavior","acting like an npc"," npc moment"], "genz_npc"],
      [["fr fr","frfr","for real for real"], "genz_fr_fr"],
      [["hit different","hits different"], "genz_hit_diff"],
      [["deadass"], "genz_deadass"],
      [["big brain","5head"], "genz_big_brain"],
      [["pov:","point of view -"], "tiktok_pov"],
      [["fyp","for you page"], "tiktok_fyp"],
      [["tiktok duet","do a duet with me"], "tiktok_duet"],
      [["stitch this","stitched by"], "tiktok_stitched"],
      [["going live","tiktok live"], "tiktok_live"],
      [["the algorithm","feed the algorithm"], "tiktok_algo"],
      [["use this sound","using this sound"], "tiktok_sounds"],
      [["green screen effect"], "tiktok_greenscreen"],
      [["tiktok"], "tiktok_tok"],
      [["instagram reel","ig reel","posted a reel"], "insta_reel"],
      [["insta story","instagram story","on my story"], "insta_story"],
      [["close friends list","cf only"], "insta_close_friends"],
      [["collab post","brand collab","brand deal"], "insta_collab"],
      [["dm me","slide into my dms","check your dms"], "insta_dm"],
      [["aesthetic","core aesthetic","dark aesthetic"], "insta_aesthetic"],
      [["follow back","follow for follow","f4f"], "insta_follow_back"],
      [["explore page","landed on explore"], "insta_explore"],
      [["l +","l + ratio"], "twitter_ratio_l"],
      [["taking the w","got the w","the w goes to"], "twitter_w"],
      [["took an l","big l moment","taking an l"], "twitter_l"],
      [["🧵 thread","a thread:","long thread"], "twitter_thread"],
      [["quote tweet","quote this tweet"], "twitter_quote_tweet"],
      [["skibidi"], "alpha_skibidi"],
      [["only in ohio","ohio moment"], "alpha_sigma_ohio"],
      [["fanum tax"], "alpha_fanum_tax"],
      [["rizzler","unspoken rizz"], "alpha_rizz_w"],
      [["hawk tuah"], "alpha_hawk_tuah"],
      [["gyatt","gyat "], "alpha_gyatt"],
      [["mewing"], "alpha_mewing"],
      [["looksmaxxing","looksmax"], "alpha_looksmaxx"],
      [["gooning"], "alpha_gooning"],
      [["glazing","total glaze"], "alpha_glaze"],
      [["negative aura","aura points","lost aura"], "alpha_aura"],
      [["you're cooked","ur cooked","he's cooked","she's cooked"], "alpha_cooked"],
      [["bomboclat"], "alpha_bomboclat"],
      [["what da dog doin"], "alpha_what_da_dog"],
      [["bro is cooked","bro cooked"], "alpha_bro_cooked"],
      [["bro said that","bro told me","bro thought"], "alpha_bro_told"],
      [["ts is real","this ts is"], "alpha_ts_real"],
      [["ain't real","this ain't real"], "alpha_aint_real"],
      [["nuh uh","nuh-uh"], "alpha_nuh_uh"],
      [["yurrr","yuh yuh"], "alpha_yuh"],
      [["it's giving","its giving "], "alpha_its_giving"],
      [["ate and left no crumbs","left no crumbs"], "alpha_ate_no_left"],
      [["slay mother","the mother","she's mother","he's mother"], "alpha_mother"],
      [["very demure","very mindful"], "alpha_very_demure"],
      [["no skips","zero skips"], "alpha_no_skips"],
      [["sped up version","slowed + reverb","slowed reverb"], "alpha_sped_up"],
      [["we are so back","we're so back"], "alpha_we_are_so_back"],
      [["it's over boys","its over boys","bro it's over"], "alpha_its_over"],
      [["the realest","being real","keeping it real"], "alpha_real"],
      [["capping hard","big cap","you capping"], "alpha_cap"],
      [["this mf","that mf here"], "alpha_mf"],
      [["bussin bussin"], "alpha_buss"],
      [["pmo ","this pmo","pisses me off"], "alpha_pmo"],
      [["type beat"], "alpha_type_beat"],
      [["rizz up","rizzed her up","rizzed him up"], "alpha_rizz_up"],
      [["ngl","not gonna lie"], "meme_ngl"],
      [["tbh","to be honest"], "meme_tbh"],
      [["imo ","in my opinion"], "meme_imo"],
      [["istg","i swear to god"], "meme_istg"],
      [["ong ","on god "], "meme_ong"],
      [["say less"], "meme_say_less"],
      [["it do be like that","it do be"], "meme_it_do_be"],
      [["ong fr","on god for real"], "meme_ong_fr"],
      [["bestie"], "meme_bestie"],
      [["periodt","period."], "meme_periodt"],
      [["facts no printer"], "meme_no_printer"],
      [["sending me","this sent me","i'm sending"], "meme_sending"],
      [["i'm weak","im weak","too weak"], "meme_im_weak"],
      [["im dead","i'm dead","i'm dying"], "meme_dead"],
      [["what's the vibe","what's the energy"], "meme_whats_the_vibe"],
      [["hold on step bro","hold on bestie"], "meme_hold_on"],
      [["not me doing","not me being","not me crying"], "meme_not_me"],
      [["cottagecore","darkcore","corecore","goblincore"], "meme_core"],
      [["she ate","he ate","they ate"], "meme_ate"],
      [["outfit snatched","she's snatched","he's snatched"], "meme_snatched"],
      [["this slaps","song slaps","track slaps"], "meme_slaps"],
      [["no thoughts head empty"], "meme_no_thoughts"],
      [["rotting in bed","bed rotting","bed rot"], "meme_rotting"],
      [["villain arc","entering my villain arc"], "meme_villain_arc"],
      [["main character energy"], "meme_main_char_energy"],
      [["pookie"], "meme_pookie"],
      [["beige flag"], "meme_beige_flag"],
      [["red flag","🚩🚩"], "meme_red_flag"],
      [["green flag"], "meme_green_flag"],
      [["got ratioed","was ratioed"], "meme_ratioed"],
      [["yapping","yap session"], "meme_yap"],
      [["lowkey unhinged","kinda unhinged"], "meme_lowk_unhinged"],
      [["absolutely ate","ate that"], "meme_ate_that"],
      [["zero rizz","negative rizz"], "meme_zero_rizz"],
      [["w rizz","ultimate rizz","max rizz"], "meme_W_rizz"],
      [["absolute banger","certified banger"], "meme_banger"],
      [["mid song","song is mid","that's mid"], "meme_mid_song"],
      [["frfr ong","for real on god"], "meme_frfr_ong"],
      [["looksmaxxing grind","maxxing out"], "meme_looksmaxx_grind"]
    ];

    if (!s._genz_understood_count) s._genz_understood_count = 0;
    if (!s._genz_touch_grass_count) s._genz_touch_grass_count = 0;
    if (!s._genz_ohio_count) s._genz_ohio_count = 0;

    if (tl.indexOf("understood the assignment") !== -1) {
      s._genz_understood_count++;
      if (s._genz_understood_count >= 3)  tryUnlock("meme_understood_assignment_2");
      if (s._genz_understood_count >= 5)  tryUnlock("alpha_understood_assignment");
      if (s._genz_understood_count >= 10) tryUnlock("meme_understood_x10");
    }
    if (tl.indexOf("touch grass") !== -1) {
      s._genz_touch_grass_count++;
      if (s._genz_touch_grass_count >= 10) tryUnlock("meme_touch_grass_100");
    }
    if (tl.indexOf("only in ohio") !== -1) {
      s._genz_ohio_count++;
      if (s._genz_ohio_count >= 3) tryUnlock("alpha_ohio_only");
    }

    for (var gi = 0; gi < genzKws.length; gi++) {
      var kwList = genzKws[gi][0];
      var achId  = genzKws[gi][1];
      for (var gk = 0; gk < kwList.length; gk++) {
        if (tl.indexOf(kwList[gk]) !== -1) {
          tryUnlock(achId);
          break;
        }
      }
    }
  }

  function analyzeTime(now) {
    var h  = now.getHours();
    var m  = now.getMinutes();
    var wd = now.getDay();
    var mo = now.getMonth() + 1;
    var d  = now.getDate();

    if (h >= 2 && h < 5)   tryUnlock("night_owl");
    if (h >= 5 && h < 6)   tryUnlock("early_bird");
    if (h >= 6 && h < 7)   tryUnlock("morning_person");
    if (h >= 12 && h < 13) tryUnlock("lunch_break");
    if (h >= 20 && h < 22) tryUnlock("evening_chatter");

    if (wd === 1) tryUnlock("monday_blues");
    if (wd === 5) tryUnlock("friday_vibes");
    if (wd === 0 || wd === 6) tryUnlock("weekend_warrior");
    if (wd === 5 && d === 13) tryUnlock("friday_13");

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

    var holidays = {
      "1-1": "new_year", "1-7": "russian_christmas", "2-14": "valentine",
      "2-23": "defender", "2-29": "leap_day", "3-8": "womens_day",
      "3-14": "pi_day", "4-1": "april_fools", "4-12": "cosmonauts_day",
      "4-22": "earth_day", "5-1": "may_day", "5-9": "victory_day",
      "5-13": "discord_birthday", "6-21": "summer_solstice", "7-30": "friendship_day",
      "9-13": "programmers_day", "10-31": "halloween", "12-21": "winter_solstice",
      "12-25": "christmas", "12-31": "new_years_eve"
    };
    var hKey = mo + "-" + d;
    if (holidays[hKey]) tryUnlock(holidays[hKey]);
  }

  function analyzeSpeed() {
    var nowSec = Date.now() / 1000;
    recentMessageTimestamps.push(nowSec);
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
        var last = new Date(streak.last_date);
        var curr = new Date(today);
        var diffDays = Math.round((curr - last) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          streak.streak_days = (streak.streak_days || 1) + 1;
          streak.last_date = today;
        } else if (diffDays > 1) {
          streak.streak_days = 1;
          streak.last_date = today;
        }
      }
    }

    var maxStreak = 0;
    var activeCount = 0;
    for (var k in s.fire_streaks) {
      var item = s.fire_streaks[k];
      if (item.streak_days > maxStreak) {
        maxStreak = item.streak_days;
      }
      if (item.streak_days >= 1) {
        activeCount++;
      }
    }
    s.fire_streak = maxStreak;
    checkThresholdAchievements("_fire_streak", maxStreak);
    checkThresholdAchievements("_active_streaks", activeCount);
  }

  function processMessage(msgData) {
    if (!msgData) return;
    var s = storage.stats;
    if (!s) return;

    var now = new Date();
    var today = todayStr();

    s.messages_sent = (s.messages_sent || 0) + 1;
    checkThresholdAchievements("messages_sent", s.messages_sent);

    if (!Array.isArray(s.days_active)) s.days_active = [];
    if (s.days_active.indexOf(today) === -1) {
      s.days_active.push(today);
    }
    checkThresholdAchievements("days_active", s.days_active.length);

    var chId = msgData.channelId || msgData.channel_id;
    if (chId) {
      if (!Array.isArray(s.unique_chats)) s.unique_chats = [];
      if (s.unique_chats.indexOf(chId) === -1) {
        s.unique_chats.push(chId);
      }
      checkThresholdAchievements("unique_chats", s.unique_chats.length);

      var chan = ChannelStore && ChannelStore.getChannel && ChannelStore.getChannel(chId);
      if (chan) {
        if (chan.type === 1) {
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
        } else if (chan.type === 3) {
          tryUnlock("group_member");
          if (!Array.isArray(s.group_chats)) s.group_chats = [];
          if (s.group_chats.indexOf(chId) === -1) s.group_chats.push(chId);
          checkThresholdAchievements("group_chats_count", s.group_chats.length);
        } else {
          tryUnlock("channel_writer");
          if (!Array.isArray(s.channel_chats)) s.channel_chats = [];
          if (s.channel_chats.indexOf(chId) === -1) s.channel_chats.push(chId);
          checkThresholdAchievements("channel_chats_count", s.channel_chats.length);
        }
      }
    }

    if (msgData.isReply || msgData.message_reference) {
      s.replies_made = (s.replies_made || 0) + 1;
      checkThresholdAchievements("replies_made", s.replies_made);
    }

    if (detectGifs(msgData.content, msgData.attachments, msgData.embeds)) {
      s.gifs_sent = (s.gifs_sent || 0) + 1;
      checkThresholdAchievements("gifs_sent", s.gifs_sent);
    }

    var hasSpoiler = false;
    if (msgData.content && /\|\|.+?\|\|/.test(msgData.content)) {
      hasSpoiler = true;
    }
    if (Array.isArray(msgData.attachments)) {
      for (var sp = 0; sp < msgData.attachments.length; sp++) {
        var spAtt = msgData.attachments[sp];
        if (spAtt.spoiler || (spAtt.filename && spAtt.filename.toUpperCase().indexOf("SPOILER_") !== -1)) {
          hasSpoiler = true;
          break;
        }
      }
    }
    if (hasSpoiler) {
      s.spoilers_sent = (s.spoilers_sent || 0) + 1;
      checkThresholdAchievements("spoilers_sent", s.spoilers_sent);
    }

    var atts = msgData.attachments;
    if (Array.isArray(atts) && atts.length > 0) {
      for (var a = 0; a < atts.length; a++) {
        var att = atts[a];
        var ct = (att.content_type || att.mimeType || att.type || "").toLowerCase();
        var fn = (att.filename || att.name || "").toLowerCase();

        if (ct.startsWith("image/gif") || fn.endsWith(".gif")) {

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

    if ((msgData.sticker_items && msgData.sticker_items.length > 0) || (msgData.stickerIds && msgData.stickerIds.length > 0)) {
      s.stickers_sent = (s.stickers_sent || 0) + 1;
      checkThresholdAchievements("stickers_sent", s.stickers_sent);
    }

    if (msgData.poll) {
      s.polls_created = (s.polls_created || 0) + 1;
      checkThresholdAchievements("polls_created", s.polls_created);
    }

    var isVoice = Boolean((msgData.flags && (msgData.flags & 8192)) ||
      (Array.isArray(msgData.attachments) && msgData.attachments.some(function (va) {
        return va.waveform || va.duration_secs || (va.filename && va.filename.indexOf("voice-message") !== -1);
      }))
    );
    if (isVoice) {
      s.voice_sent = (s.voice_sent || 0) + 1;
      checkThresholdAchievements("voice_sent", s.voice_sent);
    }

    if (msgData.content) {
      analyzeText(msgData.content, now);
    }

    analyzeTime(now);
    analyzeSpeed();
    analyzeCollector();
  }

  var isStatsModalOpen = false;
  var statsModalListeners = [];

  function setStatsModalOpen(val) {
    isStatsModalOpen = val;
    for (var m = 0; m < statsModalListeners.length; m++) {
      try { statsModalListeners[m](val); } catch (e) {}
    }
  }

  function StatsCardView() {
    var React = vendetta.metro.common.React;
    var RN    = vendetta.metro.common.ReactNative;
    if (!React || !RN || !RN.View || !RN.Text) return null;

    try {
      var currentUser = UserStore && UserStore.getCurrentUser && UserStore.getCurrentUser();
      var userId = currentUser && currentUser.id;
      var avatarUrl = (currentUser && currentUser.avatar && userId)
        ? ("https://cdn.discordapp.com/avatars/" + userId + "/" + currentUser.avatar + ".png?size=128")
        : null;
      var displayName = (currentUser && (currentUser.globalName || currentUser.username)) || "User";

      var total    = ACHIEVEMENTS.length;
      var unlocked = getUnlockedCount();
      var pct      = total > 0 ? Math.round((unlocked / total) * 100) : 0;
      var barPct   = Math.max(pct, 2);

      var mythicCount = 0;
      var secretCount = 0;
      var unlockedMap = storage.unlocked || {};
      for (var achId in unlockedMap) {
        if (!unlockedMap[achId]) continue;
        var a = ACH_BY_ID[achId];
        if (!a) continue;
        if (a.rarity === "mythic")  mythicCount++;
        if (a.rarity === "secret")  secretCount++;
      }

      var accent = pct >= 75 ? "#f1c40f" : pct >= 50 ? "#9b59b6" : pct >= 25 ? "#3498db" : "#5865f2";

      return React.createElement(
        RN.View,
        {
          style: {
            backgroundColor: "#111214",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 14
          }
        },

        React.createElement(
          RN.View,
          { style: { flexDirection: "row", alignItems: "center", marginBottom: 14 } },

          React.createElement(
            RN.View,
            {
              style: {
                width: 52,
                height: 52,
                borderRadius: 26,
                borderWidth: 2,
                borderColor: accent,
                backgroundColor: "#1e1f22",
                overflow: "hidden",
                justifyContent: "center",
                alignItems: "center"
              }
            },
            avatarUrl
              ? React.createElement(RN.Image, {
                  source: { uri: avatarUrl },
                  style: { width: 48, height: 48, borderRadius: 24 }
                })
              : React.createElement(
                  RN.Text,
                  { style: { fontSize: 22 } },
                  "👤"
                )
          ),

          React.createElement(
            RN.View,
            { style: { marginLeft: 12, flex: 1 } },
            React.createElement(
              RN.Text,
              { style: { color: "#f2f3f5", fontSize: 16, fontWeight: "700" }, numberOfLines: 1 },
              displayName
            ),
            React.createElement(
              RN.Text,
              { style: { color: "#5c6068", fontSize: 11, marginTop: 2 } },
              "🏆 Achievement Stats"
            )
          )
        ),

        React.createElement(
          RN.View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
          React.createElement(
            RN.Text,
            { style: { color: "#949ba4", fontSize: 11, fontWeight: "600" } },
            isRussian() ? "🏆 Прогресс" : "🏆 Progress"
          ),
          React.createElement(
            RN.View,
            { style: { flexDirection: "row", alignItems: "center" } },
            React.createElement(
              RN.Text,
              { style: { color: "#f2f3f5", fontSize: 13, fontWeight: "800" } },
              String(unlocked)
            ),
            React.createElement(
              RN.Text,
              { style: { color: "#5c6068", fontSize: 12 } },
              "/" + total
            ),
            React.createElement(
              RN.View,
              { style: { marginLeft: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: accent + "22" } },
              React.createElement(
                RN.Text,
                { style: { color: accent, fontSize: 11, fontWeight: "800" } },
                pct + "%"
              )
            )
          )
        ),

        React.createElement(
          RN.View,
          { style: { height: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 14 } },
          React.createElement(
            RN.View,
            { style: { height: 6, width: barPct + "%", borderRadius: 3, backgroundColor: accent } }
          )
        ),

        React.createElement(
          RN.View,
          { style: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginBottom: 12 } }
        ),

        React.createElement(
          RN.View,
          { style: { flexDirection: "row" } },

          React.createElement(
            RN.View,
            {
              style: {
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: secretCount > 0 ? "rgba(142,68,173,0.15)" : "rgba(255,255,255,0.03)",
                borderWidth: 1,
                borderColor: secretCount > 0 ? "#8e44ad55" : "rgba(255,255,255,0.04)",
                marginRight: 8
              }
            },
            React.createElement(
              RN.Text,
              { style: { fontSize: 16, marginRight: 6 } },
              "🔮"
            ),
            React.createElement(
              RN.View,
              null,
              React.createElement(
                RN.Text,
                { style: { color: secretCount > 0 ? "#8e44ad" : "#4a4f58", fontSize: 13, fontWeight: "800" } },
                String(secretCount)
              ),
              React.createElement(
                RN.Text,
                { style: { color: "#5c6068", fontSize: 10 } },
                isRussian() ? "Секретных" : "Secret"
              )
            )
          ),

          React.createElement(
            RN.View,
            {
              style: {
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: mythicCount > 0 ? "rgba(231,76,60,0.15)" : "rgba(255,255,255,0.03)",
                borderWidth: 1,
                borderColor: mythicCount > 0 ? "#e74c3c55" : "rgba(255,255,255,0.04)"
              }
            },
            React.createElement(
              RN.Text,
              { style: { fontSize: 16, marginRight: 6 } },
              "🔴"
            ),
            React.createElement(
              RN.View,
              null,
              React.createElement(
                RN.Text,
                { style: { color: mythicCount > 0 ? "#e74c3c" : "#4a4f58", fontSize: 13, fontWeight: "800" } },
                String(mythicCount)
              ),
              React.createElement(
                RN.Text,
                { style: { color: "#5c6068", fontSize: 10 } },
                isRussian() ? "Мифических" : "Mythic"
              )
            )
          )
        )
      );
    } catch (e) {
      return null;
    }
  }

  function StatsModalView(props) {
    var React = vendetta.metro.common.React;
    var RN    = vendetta.metro.common.ReactNative;
    if (!React || !RN || !RN.Modal) return null;

    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;

    return React.createElement(
      RN.Modal,
      {
        visible: Boolean(props.visible),
        animationType: "fade",
        transparent: true,
        onRequestClose: props.onClose
      },
      React.createElement(
        RN.View,
        { style: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center" } },

        React.createElement(Btn, {
          style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
          onPress: props.onClose,
          activeOpacity: 1
        }),

        React.createElement(
          RN.View,
          { style: { width: "88%", zIndex: 10 } },

          React.createElement(
            RN.View,
            { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
            React.createElement(
              RN.Text,
              { style: { color: "#f2f3f5", fontSize: 14, fontWeight: "700" } },
              isRussian() ? "📊 Моя статистика" : "📊 My Stats"
            ),
            React.createElement(
              Btn,
              {
                onPress: props.onClose,
                activeOpacity: 0.7,
                style: {
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: "rgba(255,255,255,0.1)",
                  justifyContent: "center",
                  alignItems: "center"
                }
              },
              React.createElement(
                RN.Text,
                { style: { color: "#949ba4", fontSize: 14, fontWeight: "700" } },
                "✕"
              )
            )
          ),
          React.createElement(StatsCardView, {})
        )
      )
    );
  }

  function registerStatsCommand() {
    try {
      var commands = vendetta.commands;
      if (!commands || typeof commands.registerCommand !== "function") return;

      var unreg = commands.registerCommand({
        name: "stats",
        displayName: "stats",
        description: isRussian() ? "Показать статистику достижений" : "Show your achievement stats",
        displayDescription: isRussian() ? "Показать статистику достижений" : "Show your achievement stats",
        inputType: 1,
        type: 1,
        options: [],
        execute: function () {
          try {
            var total    = ACHIEVEMENTS.length;
            var unlocked = getUnlockedCount();
            var pct      = total > 0 ? Math.round((unlocked / total) * 100) : 0;
            var mythicC  = 0;
            var secretC  = 0;
            var unlockedMap = storage.unlocked || {};
            for (var id in unlockedMap) {
              if (!unlockedMap[id]) continue;
              var ac = ACH_BY_ID[id];
              if (!ac) continue;
              if (ac.rarity === "mythic")  mythicC++;
              if (ac.rarity === "secret")  secretC++;
            }
            var s = storage.stats || {};
            var msg = [
              "🏆 " + (isRussian() ? "Достижения: " : "Achievements: ") + unlocked + "/" + total + " (" + pct + "%)",
              "🔮 " + (isRussian() ? "Секретные: " : "Secret: ") + secretC + "   🔴 " + (isRussian() ? "Мифические: " : "Mythic: ") + mythicC,
              "💬 " + (isRussian() ? "Сообщения: " : "Messages: ") + (s.messages_sent || 0),
              "🔥 " + (isRussian() ? "Стрик: " : "Streak: ") + (s.fire_streak || 0) + (isRussian() ? " дн." : " days")
            ].join("\n");

            var RN = vendetta.metro.common && vendetta.metro.common.ReactNative;
            var Alert = RN && RN.Alert;
            if (Alert && typeof Alert.alert === "function") {
              Alert.alert(
                "📊 " + (isRussian() ? "Статистика" : "Achievement Stats"),
                msg,
                [
                  {
                    text: isRussian() ? "Открыть все" : "View All",
                    onPress: function () {
                      setModalOpen(true);
                    }
                  },
                  { text: "OK", style: "cancel" }
                ]
              );
            } else if (showToast) {
              showToast("🏆 " + unlocked + "/" + total + " (" + pct + "%)", null);
            }
          } catch (e) {}
          return { shouldntSend: true };
        }
      });
      if (typeof unreg === "function") patches.push(unreg);
    } catch (e) {}
  }

  var isAchievementsModalOpen = false;
  var modalListeners = [];

  function setModalOpen(val) {
    isAchievementsModalOpen = val;
    for (var m = 0; m < modalListeners.length; m++) {
      try { modalListeners[m](val); } catch (e) {}
    }
  }

  function AchievementsModalView(props) {
    var React = vendetta.metro.common.React;
    var RN    = vendetta.metro.common.ReactNative;

    if (!React || !RN || !RN.Modal) return null;

    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;

    return React.createElement(
      RN.Modal,
      {
        visible: Boolean(props.visible),
        animationType: "slide",
        transparent: false,
        onRequestClose: props.onClose
      },
      React.createElement(
        RN.SafeAreaView,
        { style: { flex: 1 } },

        React.createElement(
          RN.View,
          {
            style: {
              height: 52,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(128, 128, 128, 0.2)"
            }
          },
          React.createElement(
            RN.Text,
            { style: { fontSize: 18, fontWeight: "700" } },
            "🏆 " + (isRussian() ? "Достижения" : "Achievements")
          ),
          React.createElement(
            Btn,
            {
              onPress: props.onClose,
              style: {
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: "rgba(128, 128, 128, 0.2)"
              }
            },
            React.createElement(
              RN.Text,
              { style: { fontSize: 15, fontWeight: "bold" } },
              "✕"
            )
          )
        ),

        React.createElement(Settings, { isModal: true })
      )
    );
  }

  function ProfilePillComponent(props) {
    var React = vendetta.metro.common.React;
    var RN    = vendetta.metro.common.ReactNative;
    var origElement = props.origElement;
    var user = props.user;

    var modalState = React.useState(isAchievementsModalOpen);
    var isOpen = modalState[0];
    var setIsOpen = modalState[1];

    React.useEffect(function () {
      modalListeners.push(setIsOpen);
      return function () {
        var idx = modalListeners.indexOf(setIsOpen);
        if (idx !== -1) modalListeners.splice(idx, 1);
      };
    }, []);

    var myId = UserStore && UserStore.getCurrentUser && UserStore.getCurrentUser() && UserStore.getCurrentUser().id;
    var isSelf = !user || (user && user.id === myId);

    if (!isSelf) {
      return origElement;
    }

    var unlockedCount = getUnlockedCount();
    var totalCount = ACHIEVEMENTS.length;
    var pct = Math.round((unlockedCount / totalCount) * 100);

    var Btn = RN.TouchableOpacity || RN.Pressable || RN.View;

    var pill = React.createElement(
      Btn,
      {
        key: "achievement-orb-shortcut",
        onPress: function () {
          setModalOpen(true);
        },
        activeOpacity: 0.7,
        style: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#2b2d31",
          borderColor: "#383a40",
          borderWidth: 1,
          borderRadius: 20,
          paddingHorizontal: 10,
          paddingVertical: 5,
          marginVertical: 4,
          marginRight: 8,
          alignSelf: "flex-start"
        }
      },
      React.createElement(
        RN.Text,
        { style: { fontSize: 14, marginRight: 5 } },
        "🏆"
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#f2f3f5", fontSize: 12, fontWeight: "700" } },
        unlockedCount + "/" + totalCount
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#949ba4", fontSize: 11, marginLeft: 4, fontWeight: "600" } },
        "(" + pct + "%)"
      )
    );

    var modal = isOpen ? React.createElement(AchievementsModalView, {
      visible: true,
      onClose: function () {
        setModalOpen(false);
      }
    }) : null;

    return React.createElement(
      RN.View,
      { key: "achievement-pill-wrapper" },
      origElement,
      pill,
      modal
    );
  }

  function setupProfileShortcut() {
    var targets = [
      { name: "UserProfileBadges", mod: findByProps("UserProfileBadges") },
      { name: "UserProfileHeaderActions", mod: findByProps("UserProfileHeaderActions") },
      { name: "UserProfileBio", mod: findByProps("UserProfileBio") },
      { name: "UserProfileHeader", mod: findByProps("UserProfileHeader") }
    ];

    for (var t = 0; t < targets.length; t++) {
      var item = targets[t];
      var m = item.mod;
      if (!m) continue;

      var targetObj = (m.default && typeof m.default === "function") ? m : (typeof m === "function" ? { default: m } : null);
      var fnName = (targetObj && targetObj.default) ? "default" : null;

      if (!fnName && typeof m[item.name] === "function") {
        targetObj = m;
        fnName = item.name;
      }

      if (targetObj && fnName) {
        try {
          var un = after(fnName, targetObj, function (args, res) {
            if (!res) return res;
            var user = args && (args[0] && (args[0].user || args[0].currentUser || (args[0].profile && args[0].profile.user)));
            var React = vendetta.metro.common.React;
            return React.createElement(ProfilePillComponent, {
              user: user,
              origElement: res
            });
          });
          patches.push(un);
          break;
        } catch (e) {}
      }
    }
  }

  function setupHooks() {
    setupProfileShortcut();
    registerStatsCommand();

    if (Messages && typeof Messages.sendMessage === "function") {
      patches.push(
        before("sendMessage", Messages, function (args) {
          try {
            var channelId = args[0];
            var msgObj = args[1];
            var extra = args[2];
            var text = msgObj ? (typeof msgObj === "string" ? msgObj : msgObj.content) : "";

            var sig = channelId + ":" + (text || "").slice(0, 50);
            seenSignatures[sig] = Date.now();

            var isReply = Boolean(extra && (extra.message_reference || extra.replyToMsg));
            processMessage({
              channelId: channelId,
              content: text,
              isReply: isReply,
              stickerIds: msgObj && msgObj.stickerIds
            });
          } catch (e) {}
          return args;
        })
      );
    }

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
                  content_type: itItem.mimeType || itItem.type || "",
                  spoiler: Boolean(itItem.spoiler || (itItem.filename && itItem.filename.toUpperCase().indexOf("SPOILER_") !== -1))
                };
              });

              var pText = pMsg ? pMsg.content : "";
              var sig = cId + ":" + (pText || "").slice(0, 50);
              seenSignatures[sig] = Date.now();

              processMessage({
                channelId: cId,
                content: pText,
                attachments: atts
              });
            }
          } catch (e) {}
          return args;
        })
      );
    }

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
                var sig = msg.channel_id + ":" + (msg.content || "").slice(0, 50);
                var lastSeen = seenSignatures[sig];

                if (lastSeen && (Date.now() - lastSeen < 5000)) {
                  return args;
                }
                seenSignatures[sig] = Date.now();

                processMessage({
                  channelId: msg.channel_id,
                  content: msg.content,
                  attachments: msg.attachments,
                  sticker_items: msg.sticker_items,
                  message_reference: msg.message_reference,
                  poll: msg.poll,
                  flags: msg.flags,
                  embeds: msg.embeds
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

  function Settings(props) {
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
    var unlockedCount = getUnlockedCount();
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
        style: { flex: 1 },
        contentContainerStyle: { paddingBottom: 40 }
      },

      React.createElement(
        RN.View,
        { style: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 } },
        React.createElement(StatsCardView, {})
      ),

      React.createElement(
        FormSection,
        { title: isRussian() ? "ПРОГРЕСС" : "PROGRESS" },
        React.createElement(FormRow, {
          label: (isRussian() ? "🏆 Разблокировано: " : "🏆 Unlocked: ") + unlockedCount + " / " + totalCount + " (" + pct + "%)",
          subLabel: isRussian() ? "Ваш личный прогресс в сборе достижений" : "Your overall achievement progress"
        }),
        React.createElement(
          RN.View,
          { style: { paddingHorizontal: 16, paddingBottom: 12 } },
          React.createElement(
            RN.View,
            {
              style: {
                height: 8,
                backgroundColor: "rgba(128, 128, 128, 0.2)",
                borderRadius: 4,
                overflow: "hidden"
              }
            },
            React.createElement(
              RN.View,
              {
                style: {
                  height: 8,
                  width: pct + "%",
                  backgroundColor: "#5865f2",
                  borderRadius: 4
                }
              }
            )
          )
        )
      ),

      React.createElement(
        FormSection,
        { title: isRussian() ? "НАСТРОЙКИ" : "SETTINGS" },
        React.createElement(FormRow, {
          label: isRussian() ? "Показывать прогресс в «О себе» (Bio)" : "Show Progress on Bio",
          subLabel: isRussian()
            ? "⚠️ Добавляет прогресс в конец bio. Если нет места, текст снизу обрезается."
            : "⚠️ Appends progress to bio. If space is tight, cuts from the bottom.",
          trailing: React.createElement(FormSwitch, {
            value: storage.showProgressOnBio === true,
            onValueChange: function (val) {
              if (val) {
                showBioWarning(
                  function () {
                    storage.showProgressOnBio = true;
                    scheduleBioUpdate(true);
                    forceUpdate();
                  },
                  function () {
                    storage.showProgressOnBio = false;
                    forceUpdate();
                  }
                );
              } else {
                storage.showProgressOnBio = false;
                removeProgressFromBio();
                forceUpdate();
              }
            }
          })
        }),
        React.createElement(FormRow, {
          label: isRussian() ? "Звуки достижений" : "Achievement Sounds",
          subLabel: isRussian() ? "Воспроизводить звук при получении достижения" : "Play authentic sound when unlocking an achievement",
          trailing: React.createElement(FormSwitch, {
            value: storage.soundEnabled !== false,
            onValueChange: function (val) {
              storage.soundEnabled = val;
              forceUpdate();
            }
          })
        }),
        React.createElement(FormRow, {
          label: isRussian() ? "Верхний тост (баннер)" : "Top Toast Banner",
          subLabel: isRussian() ? "Показывать всплывающее уведомление вверху экрана" : "Show toast notification at top of screen on unlock",
          trailing: React.createElement(FormSwitch, {
            value: storage.toastsEnabled !== false,
            onValueChange: function (val) {
              storage.toastsEnabled = val;
              forceUpdate();
            }
          })
        }),
        React.createElement(FormRow, {
          label: "⚪ " + (isRussian() ? "Тест Обычного Звука" : "Test Common Sound"),
          subLabel: "default.ogg",
          onPress: function () {
            playSound(false);
            if (showToast) showToast("⚪ Common Sound (default.ogg)");
          }
        }),
        React.createElement(FormRow, {
          label: "🔔 " + (isRussian() ? "Тест Редкого Звука" : "Test Rare Sound"),
          subLabel: "rare.ogg",
          onPress: function () {
            playSound(true);
            if (showToast) showToast("🔵 Rare Sound (rare.ogg)");
          }
        })
      ),

      React.createElement(
        FormSection,
        { title: isRussian() ? "КАТЕГОРИИ" : "CATEGORIES" },
        React.createElement(
          RN.ScrollView,
          {
            horizontal: true,
            showsHorizontalScrollIndicator: false,
            style: { paddingHorizontal: 16, paddingVertical: 10 }
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
                  backgroundColor: active ? "#5865f2" : "rgba(128, 128, 128, 0.15)",
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  borderRadius: 18,
                  marginRight: 8
                }
              },
              React.createElement(
                RN.Text,
                { style: { color: active ? "#ffffff" : "inherit", fontSize: 13, fontWeight: "600" } },
                c.icon + " " + c.label
              )
            );
          })
        )
      ),

      React.createElement(
        FormSection,
        { title: (isRussian() ? "СПИСОК ДОСТИЖЕНИЙ (" : "ACHIEVEMENTS (") + filtered.length + ")" },
        filtered.map(function (a) {
          var isUnlocked = Boolean(unlockedMap[a.id]);
          var rInfo = RARITY_INFO[a.rarity] || RARITY_INFO.common;
          var achName = getAchName(a);
          var achDesc = (a.is_secret && !isUnlocked)
            ? (isRussian() ? "🔮 Секретное достижение. Разблокируйте его!" : "🔮 Secret achievement. Unlock it to reveal description.")
            : getAchDesc(a);

          return React.createElement(
            FormRow,
            {
              key: a.id,
              label: (isUnlocked ? "✓ " : "🔒 ") + a.icon + "  " + achName,
              subLabel: achDesc + (isUnlocked && unlockedMap[a.id].date ? ("\n" + (isRussian() ? "Разблокировано: " : "Unlocked: ") + unlockedMap[a.id].date.substring(0, 10)) : ""),
              trailing: React.createElement(
                RN.View,
                {
                  style: {
                    backgroundColor: rInfo.color + "22",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: rInfo.color
                  }
                },
                React.createElement(
                  RN.Text,
                  { style: { color: rInfo.color, fontSize: 11, fontWeight: "700" } },
                  rInfo.emoji + " " + (isRussian() ? rInfo.ru : rInfo.en)
                )
              )
            }
          );
        })
      )
    );
  }

  return {
    onLoad: function () {
      setupHooks();
    },
    onUnload: function () {
      if (bioDebounceTimer) {
        clearTimeout(bioDebounceTimer);
        bioDebounceTimer = null;
      }
      for (var p = 0; p < patches.length; p++) {
        try { patches[p](); } catch (e) {}
      }
      patches = [];
      recentMessageTimestamps = [];
      seenSignatures = {};
      modalListeners = [];
      statsModalListeners = [];
    },
    settings: Settings
  };
})();
