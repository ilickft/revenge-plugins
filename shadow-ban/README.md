# Shadow Ban

Completely disappear users from your Discord client — across all direct messages (DMs), chat messages, voice channels (VC), server member lists, and typing indicators.

## Features

- **Vanishes from All Chats:** Drops new incoming messages, edits, and reactions. Automatically filters out shadow-banned users from message history and search results.
- **Vanishes from Voice Channels (VC):** Removes shadow-banned users from the voice channel participant list, suppresses speaking rings, and automatically mutes incoming audio to 0% volume.
- **Vanishes from Direct Messages (DMs):** Completely hides 1-on-1 DM conversations and blocks incoming calls and ring notifications.
- **Vanishes from Member Lists & Typing:** Strips shadow-banned users from server member lists (sidebars), suppresses their typing indicators, and excludes them from mention suggestions.
- **Slash Commands (`/sban` & `/unsban`):**
  - `/sban`: Shadow-ban any user by picking them with `user:@someone`, specifying their Snowflake `id:123456...`, or simply replying to one of their messages and typing `/sban`.
  - `/unsban`: Un-shadowban via `user:@someone`, `id:123456...`, or replying to their message.
- **Message Context Menu:** Long-press any message in chat and tap **Shadow Ban User** (or **Un-shadowban User**) for instant one-tap action.
- **Plugin Settings Manager:**
  - View all currently shadow-banned users with avatars, display names, and user IDs.
  - Search / filter through banned users.
  - Un-shadowban any user with a single tap, or use **Unban All**.
  - Shadow-ban any user directly by pasting their Discord User ID.
  - Granular toggles to enable or disable individual protection modules.

## Usage

- `/sban` *(while replying to a message)*: Shadow-bans the author of the replied message.
- `/sban user:@username`: Shadow-bans the specified user.
- `/sban id:123456789012345678`: Shadow-bans any user by their Discord Snowflake ID.
- `/unsban user:@username` or `/unsban id:123456...`: Un-shadowbans the user.
- **Long-press any message** → Tap **Shadow Ban User** to ban them directly from chat.
- **Plugin Settings** → Revenge Settings → Plugins → Shadow Ban Settings to manage all banned users.

## Installation

Add the plugin URL to Revenge / Vendetta:
```
https://ilickft.github.io/revenge-plugins/shadow-ban/
```
