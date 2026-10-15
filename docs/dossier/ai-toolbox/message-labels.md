# Message labels

Strings: G-labels in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## Scope
ChatGPT only for message labels proper. On Grok and Gemini the "label" concept is a color label on a bookmark (see [bookmarks.md](bookmarks.md)); the Grok feature table lists labels with a free limit of 5 but they share the bookmark storage.

## Purpose
Attach short colored text labels to individual messages (for example "decision", "bug") and browse them across chats in a dashboard.

## UI surfaces
- Per message: a label control added to each conversation turn's action bar on ChatGPT (turns are `section[data-testid^="conversation-turn"]`, the message element carries `data-message-id`; the action bar is located next to `[data-testid="copy-turn-action-button"]`). Clicking opens a small inline editor: text input (max 30 characters), color choice from blue, green, red, yellow, purple, gray, and "add". Existing labels on the message render as colored chips with a remove control.
- Escape closes the editor and returns focus to the trigger; Enter adds.
- Dashboard modal (the labels feature): search box, filter chips by label (with "all"), list of labeled messages grouped across conversations with counts ("n labels across m conversations"), each row jumps to the message.

## Rules and limits
- Max 3 labels per message. A per-chat limit exists (server message). A global limit exists (500 for paid users per the comparison table). Labels are unique per message by text.

## Data and server
- AIT server: add-label (`conversation_id`, `message_id`, `text`, `color`), remove-label (`conversation_id`, `message_id`, `text`), get (by `conversation_id`), get-all (paged, `page`, `limit`), count, distinct (list of distinct label texts for suggestions).
- **Artifact: store locally** keyed by site + conversation + message ID, extend to every Tier 1 site.

## Jump to message
Navigates to the chat if needed, waits for the turn to render, scrolls it into view and plays a short highlight; if the message cannot be found (deleted or on another branch) shows a a message-not-found error toast.

## Premium (do not port)
Free: 5 labels total.
