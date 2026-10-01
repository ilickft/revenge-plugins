(function () {
  var findByStoreName = vendetta.metro.findByStoreName;
  var FluxDispatcher  = vendetta.metro.common.FluxDispatcher;
  var React           = vendetta.metro.common.React;
  var ReactNative     = vendetta.metro.common.ReactNative;
  var storage         = vendetta.plugin.storage;
  var showToast       = vendetta.ui.toasts.showToast;
  var getAssetIDByName = vendetta.ui.assets.getAssetIDByName;

  var View             = ReactNative.View;
  var Text             = ReactNative.Text;
  var ScrollView       = ReactNative.ScrollView;
  var TouchableOpacity = ReactNative.TouchableOpacity;
  var StyleSheet       = ReactNative.StyleSheet;

  var ChannelStore = findByStoreName("ChannelStore");
  var GuildStore   = findByStoreName("GuildStore");

  // Persist up to 100 entries of each type
  var MAX = 100;
  if (!storage.deleted) storage.deleted = [];
  if (!storage.edited)  storage.edited  = [];

  // ── Message cache ─────────────────────────────────────────────────────────
  // We keep a local Map of id→data so we can still read content after
  // Discord's MessageStore has already removed / updated the entry.
  var cache = new Map();

  function tag(author) {
    if (!author) return "Unknown";
    var disc = author.discriminator && author.discriminator !== "0"
      ? "#" + author.discriminator : "";
    return author.username + disc;
  }

  function storeMsg(msg) {
    if (!msg || !msg.id) return;
    cache.set(msg.id, {
      content:   msg.content || "",
      channelId: msg.channel_id,
      authorTag: tag(msg.author),
      authorId:  msg.author && msg.author.id,
    });
    // Prevent unbounded growth — evict oldest when over 3 000
    if (cache.size > 3000) cache.delete(cache.keys().next().value);
  }

  function channelLabel(channelId) {
    var ch    = ChannelStore && ChannelStore.getChannel(channelId);
    if (!ch) return "#" + channelId;
    var guild = ch.guild_id && GuildStore && GuildStore.getGuild(ch.guild_id);
    return guild ? guild.name + " › #" + ch.name : "DM";
  }

  // ── Flux handlers ─────────────────────────────────────────────────────────
  function onMessageCreate(payload) {
    if (payload && payload.message) storeMsg(payload.message);
  }

  function onMessageUpdate(payload) {
    var msg = payload && payload.message;
    if (!msg || !msg.id) return;
    var cached = cache.get(msg.id);
    // Only log if content actually changed and we had a previous version
    if (cached && cached.content && msg.content && cached.content !== msg.content) {
      storage.edited.unshift({
        ts:         Date.now(),
        channel:    channelLabel(msg.channel_id),
        oldContent: cached.content,
        newContent: msg.content,
        authorTag:  cached.authorTag,
      });
      if (storage.edited.length > MAX) storage.edited.pop();
      showToast("edited message logged", getAssetIDByName("PencilIcon"));
    }
    storeMsg(msg); // update cache to new content
  }

  function onMessageDelete(payload) {
    var id        = payload && payload.id;
    var channelId = payload && payload.channelId;
    var cached    = id && cache.get(id);
    if (!cached || !cached.content) return;

    storage.deleted.unshift({
      ts:        Date.now(),
      channel:   channelLabel(cached.channelId || channelId),
      content:   cached.content,
      authorTag: cached.authorTag,
    });
    if (storage.deleted.length > MAX) storage.deleted.pop();
    showToast("deleted message logged", getAssetIDByName("TrashIcon"));
    cache.delete(id);
  }

  FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
  FluxDispatcher.subscribe("MESSAGE_UPDATE", onMessageUpdate);
  FluxDispatcher.subscribe("MESSAGE_DELETE", onMessageDelete);

  // ── Settings UI ──────────────────────────────────────────────────────────
  var s = StyleSheet.create({
    wrap:    { flex: 1, padding: 16 },
    row:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 8 },
    heading: { fontSize: 11, fontWeight: "700", letterSpacing: 0.9, textTransform: "uppercase", opacity: 0.4 },
    clearTxt:{ fontSize: 12, fontWeight: "700", color: "#5865f2" },
    card:    { borderRadius: 10, padding: 12, marginBottom: 8 },
    author:  { fontSize: 13, fontWeight: "700", marginBottom: 1 },
    channel: { fontSize: 11, opacity: 0.4, marginBottom: 6 },
    body:    { fontSize: 14, lineHeight: 21 },
    strike:  { textDecorationLine: "line-through", opacity: 0.45 },
    time:    { fontSize: 11, opacity: 0.3, marginTop: 5 },
    empty:   { fontSize: 14, opacity: 0.3, textAlign: "center", marginTop: 10 },
  });

  function fmtTime(ts) { return new Date(ts).toLocaleString(); }

  function e(type, props) {
    var children = Array.prototype.slice.call(arguments, 2);
    return React.createElement.apply(React, [type, props].concat(children));
  }

  function DeletedCard(props) {
    var item = props.item;
    return e(View, { style: [s.card, { backgroundColor: "rgba(237,66,69,0.12)" }] },
      e(Text, { style: [s.author, { color: "#ed4245" }] }, item.authorTag),
      e(Text, { style: s.channel }, item.channel),
      e(Text, { style: s.body }, item.content),
      e(Text, { style: s.time }, fmtTime(item.ts))
    );
  }

  function EditedCard(props) {
    var item = props.item;
    return e(View, { style: [s.card, { backgroundColor: "rgba(88,101,242,0.12)" }] },
      e(Text, { style: [s.author, { color: "#5865f2" }] }, item.authorTag),
      e(Text, { style: s.channel }, item.channel),
      e(Text, { style: [s.body, s.strike] }, item.oldContent),
      e(Text, { style: s.body }, item.newContent),
      e(Text, { style: s.time }, fmtTime(item.ts))
    );
  }

  function Section(props) {
    var title   = props.title;
    var entries = props.entries;
    var color   = props.color;
    var Card    = props.card;
    var onClear = props.onClear;
    return e(View, null,
      e(View, { style: s.row },
        e(Text, { style: [s.heading, { color: color }] }, title),
        entries.length > 0 && e(TouchableOpacity, { onPress: onClear },
          e(Text, { style: s.clearTxt }, "clear")
        )
      ),
      entries.length === 0
        ? e(Text, { style: s.empty }, "nothing logged yet")
        : entries.map(function(item, i) { return e(Card, { key: i, item: item }); })
    );
  }

  function Settings() {
    var state   = React.useState(0);
    var refresh = function() { state[1](function(n) { return n + 1; }); };
    return e(ScrollView, { style: s.wrap },
      e(Section, {
        title:   "🗑  deleted",
        color:   "#ed4245",
        entries: storage.deleted,
        card:    DeletedCard,
        onClear: function() { storage.deleted = []; refresh(); },
      }),
      e(Section, {
        title:   "✏️  edited",
        color:   "#5865f2",
        entries: storage.edited,
        card:    EditedCard,
        onClear: function() { storage.edited = []; refresh(); },
      })
    );
  }

  return {
    onLoad: function() {
      if (!storage.deleted) storage.deleted = [];
      if (!storage.edited)  storage.edited  = [];
    },
    onUnload: function() {
      FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
      FluxDispatcher.unsubscribe("MESSAGE_UPDATE", onMessageUpdate);
      FluxDispatcher.unsubscribe("MESSAGE_DELETE", onMessageDelete);
    },
    settings: Settings,
  };
})();
