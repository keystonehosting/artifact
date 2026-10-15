# Voice (read-aloud) download (ChatGPT only)

Strings: G-voice in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## Purpose
Turn a ChatGPT reply into an audio file using ChatGPT's own read-aloud voices, play it inline, download it, or download every reply of the chat at once.

## Site endpoints
- Synthesize: `GET https://chatgpt.com/backend-api/synthesize?message_id=<id>&conversation_id=<id>&voice=<voiceId>&format=aac` with the captured `Authorization` and `Chatgpt-Account-Id` headers; streamed body read to the end and wrapped as an `audio/aac` blob. Request aborted after 120 s. Goes through the interactive lane of the rate limiter.
- Voice-mode recordings already in a chat: `GET https://chatgpt.com/backend-api/conversation/<conversationId>/attachment/<filePointer>/download` → `{status: "success", download_url}`; the file pointer comes from the assistant message's `asset_pointer` captured during sync.

## Voices (display name → site voice ID; AIT hardcoded values, unverified)
Ember → `ember`, Cove → `cove`, Sol → `glimmer`, Breeze → `breeze`, Maple → `maple`, Spruce → `orbit`, Vale → `vale`, Juniper → `juniper`, Arbor → `fathom`. Each has a short descriptive tagline and an accent color in the menu. The last used voice is remembered.

## UI
- A voice/download control added to each assistant turn's action bar (next to the copy / feedback / read-aloud buttons: `[data-testid="copy-turn-action-button"]`, `[data-testid="bad-response-turn-action-button"]`, `[data-testid="voice-play-turn-action-button"]`). The menu lists voices, a last-used timestamp, and a download-everything action.
- While generating: an inline player placeholder under the message with animated bars and an elapsed-time counter, and a hint that long replies take a while. When ready: inline player with play and close; download button.
- Hotkey Cmd/Ctrl+Shift+L: generate and play the **last** assistant reply with the last-used voice (ignored while typing in inputs or editors).

## Files
- Single reply: `<chat title with spaces replaced by underscores>.mp3` (the bytes are AAC despite the extension; Artifact should use `.m4a`/`.aac` or transcode).
- Recording download: same naming.
- All messages: sequentially (AIT constant says concurrency 2) synthesize each assistant reply, add `message_<n>_<voice>.mp3` to a ZIP, save `conversation_audio_<voice>.zip`.

## Errors
Toasts for "downloading, please wait" and failure. Nothing is retried automatically.

## Server dependency and premium
Free users: 1 voice and 3 downloads per day, counted on the AIT server (`/voice-downloads/status`, `/use`). Do not port the quota. Artifact's spec routes read-aloud through the user's own API (§6J); this dossier documents ChatGPT's native path for parity.
