# Bookmarks

Strings: G-bookmarks in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## Purpose
Save individual messages for later, with an optional note and color, then find them again in the current chat or across all chats.

## Per-site storage
| Site | Storage | Notes |
|---|---|---|
| ChatGPT | AIT server (`/favourite/add-favourite` with `conversation_id`, `message_id` and an optional text `snippet`; `/remove-favourite`; `/update-meta` with a `meta` object for note and color; `/get` per conversation; `/get-all` paged with `page`, `limit`) | Responses carry the conversation's `messages_ids`; errors `max`, `max_free`, `max_per_conversation`. |
| Claude | Local chrome.storage, one record per conversation under a key built from a prefix + organization ID + conversation ID: `{_id, user (org), conversation_id, messages_ids[], createdAt, updatedAt}` | Max 200 bookmarked messages per conversation, 1,000 in total. |
| Gemini, Grok | AIT server (same `/favourite/*` API) | Bookmarks there also carry a color "label" (red, orange, green, blue, purple, pink, gray) that can be cleared. |

**Artifact: all local**, one schema for every site.

## UI surfaces
- Per message: a bookmark toggle in each message's action bar. Anchors: ChatGPT turn `section[data-testid^="conversation-turn"]` / `[data-message-id]` near the copy button; Claude `[data-cds="MessageActions"]` or the toolbar holding `[data-testid="action-bar-copy"]` (also `[role="toolbar"]`, `[role="group"]`, `[data-message-action-bar]`); Gemini `message-actions` / `.buttons-container-v2` next to `copy-button` or `[data-test-id="copy-button"]`; Grok `.action-buttons` next to `button[aria-label=a copy action]` (assistant messages `[data-testid="assistant-message"]`, response containers `[id^="response-"]`). The toggle reflects whether the message is bookmarked; success/failure toasts.
- Bookmarks panel (modal or side list) with two tabs: a current-chat scope and an all-chats filter. Header counts ("n bookmarks in this conversation", "n bookmarks across m conversations"). Search box over the snippet/note text. Each row: preview text (or a missing-preview placeholder), relative time (just now / minutes / hours / days), color dot, note, actions (add/edit note, color, remove, jump).
- Notes: free text, max 200 characters, edited through a small prompt dialog.
- Colors (ChatGPT): blue, green, red, yellow, purple, gray; uncolored rows group under "uncategorized".

## Jump to a bookmarked message
- In the current chat: find the message element by ID, scroll it to center and play a highlight animation once (1.5 s). The jump waits for lazy rendering (ChatGPT renders long chats progressively) by observing the DOM and giving up after a timeout.
- In another chat: navigate to the chat URL with the message ID as a query parameter (`?mid=<messageId>` on ChatGPT and Claude), then the page-load handler performs the in-chat jump.
- If the message cannot be reached (deleted, other branch) a toast says so.

## Edge cases
- Bookmarking an already bookmarked message is a no-op.
- Account change on Claude switches the organization prefix so each org has its own bookmarks.
- The cache is wiped with other per-site data when the signed-in site account changes.

## Premium (do not port)
Free: 2 bookmarks (limits per plan enforced by server or the feature table).
