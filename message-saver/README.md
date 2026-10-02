# Message Saver

Save any message with its text and attachments as it is, and resend it back to any channel whenever you want — no matter who originally sent it.

## Features

- **Save Any Message:** Save messages sent by anyone (other users, bots, or yourself) containing text, images, videos, audio files/songs, voice messages, or attachments.
- **Native Playable Resend:** Resending a voice message uploads it as a genuine Discord voice message (with waveform & player), and audio files/songs are resent as playable audio attachments rather than plain links.
- **Long-Press Menu Action:** Long-press any message in Discord to open the action menu and tap **"Save Message"** to instantly save it.
- **Slash Commands:**
  - `/save [name]`: Reply to any message and run `/save` with an optional custom name.
  - `/resend [name]`: Resend a saved message (with text & attachments) into the active channel as it was. If no name is provided, sends the most recently saved message.
  - `/saved-list`: View a list of your saved messages.
- **Settings UI & Manager:**
  - Open **Settings \u2192 Plugins \u2192 Message Saver** to browse all your saved messages.
  - Preview message text, sender name, and saved attachments.
  - **"Send"** button: Directly sends that saved message to your currently active channel.
  - **"Copy"** button: Copies the message content and attachment URLs to your clipboard.
  - **"Delete"** / **"Clear All"**: Easily manage or clean up your saved messages.

## Usage

### 1. Saving a message
- **Method A:** Long-press any message in chat and tap **"Save Message"**.
- **Method B:** Reply to a message and type `/save` (or `/save name:my_meme`).

### 2. Resending the message back
- **Method A:** Type `/resend` in any channel to send the most recently saved message, or `/resend name:my_meme` to send a specific one.
- **Method B:** Open the plugin's settings page and tap the **"Send"** button on any message card.

## Installation

Add the plugin URL to Revenge/Vendetta:
```
https://ilickft.github.io/revenge-plugins/message-saver/
```
