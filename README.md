<div align="center">

# revenge plugins

a collection of plugins for [Revenge](https://github.com/revenge-mod/revenge-bundle) — the mobile Discord client mod

[![platform](https://img.shields.io/badge/platform-Revenge-5865F2?style=flat-square&logo=discord&logoColor=white)](https://github.com/revenge-mod/revenge-bundle)
[![last commit](https://img.shields.io/github/last-commit/ilickft/revenge-plugins?style=flat-square&color=5865F2)](https://github.com/ilickft/revenge-plugins/commits/main)

</div>

---

## plugins

### 🔕 no-embeds

> suppress link previews on every message you send

wraps every `http(s)` url in `<angle brackets>` before it leaves your client — discord's own syntax for hiding embed previews. recipients still see a normal clickable link, just no preview card. skips links inside code blocks and ones already wrapped.

```
https://ilickft.github.io/revenge-plugins/no-embeds/
```

---

### 🎭 emoji anywhere

> use emojis from any server, even without nitro

patches discord's emoji picker to remove the nitro lock, letting you click any custom emoji. server emojis available without nitro stay as normal emojis, while external or animated emojis get formatted as `[text](cdn_url)` to embed them. open the plugin settings to customize the link text to anything you want (e.g. `:)`, `{{name}}`, invisible characters, or any string).

```
https://ilickft.github.io/revenge-plugins/emoji-anywhere/
```

---

### 🔊 soundboard anywhere

> use soundboard sounds from any server, even without nitro

patches every discord function that gates soundboard sounds behind nitro or server membership — same approach as emoji anywhere. open the soundboard, pick any sound, it plays.

```
https://ilickft.github.io/revenge-plugins/soundboard-anywhere/
```

---

### 🕵️ message logger

> ghost deleted messages and see original text on edits

keeps deleted messages and attachments visible directly in chat with decreased opacity (no extra tags or trash bins added). when someone edits a message, the original text is displayed faded with reduced opacity while the new edited message stays bright right below it. works for your own messages too.

```
https://ilickft.github.io/revenge-plugins/message-logger/
```

---

### 💾 message saver

> save any message with text & attachments, resend it back anytime

save any message sent by anyone (text, images, videos, audio, or files) directly from the long-press menu or via `/save`. resend it back to any channel exactly as it was using `/resend` or from the plugin's settings manager.

```
https://ilickft.github.io/revenge-plugins/message-saver/
```

---

### 💬 message quote

> make a PNG quote card of any message or text, styled like Discord

reply to any message and type `/quote` to turn it into an authentic Discord message PNG card — complete with the author's avatar, display name, role color, local timestamp, and text — and send it directly to the same chat. You can also quote custom text using `/quote text:...`, or long-press any message and tap "Quote as PNG".

```
https://ilickft.github.io/revenge-plugins/message-quote/
```

---

### 🐾 pet pet

> pet-pet gif of anyone, right in chat

adds a `/petpet` slash command. reply to someone and run `/petpet`, or do `/petpet @user` to pet them directly. falls back to petting yourself if no target is given. generates an animated pet-pet gif via nekobot and sends it as a discord image embed.

```
https://ilickft.github.io/revenge-plugins/pet-pet/
```

---

### 📺 stream 1080p

> unlock 1080p, 60 fps, and source quality screen sharing

removes nitro restrictions and server boost locks from stream quality settings. unlocks 1080p, 60 fps, and source resolution options in the stream quality selector when screen sharing.

```
https://ilickft.github.io/revenge-plugins/stream-1080p/
```

---

### 🔊 discordo

> classic japanese "DISCORDO!" startup sound

plays the famous official japanese "DISCORDO!" chime whenever discord launches. includes a test button in the plugin settings to replay the sound anytime.

```
https://ilickft.github.io/revenge-plugins/discordo/
```

---

### 🛡️ shadow-ban

> disappear any user from DMs, chats, voice channels, and everywhere

shadow ban users so they completely vanish from your client. blocks messages and edits, wipes them from voice channel lists, mutes their incoming voice audio to 0%, hides 1-on-1 direct messages, and strips them from server member sidebars and typing indicators. manage shadow-banned users via `/sban`, `/unsban`, message long-press menu, or the built-in plugin settings dashboard.

```
https://ilickft.github.io/revenge-plugins/shadow-ban/
```

---


## installation

open Revenge → **Settings → Plugins → `+`** → paste the plugin url.

---

## disclaimer

> client mods violate Discord's Terms of Service. use at your own risk.
