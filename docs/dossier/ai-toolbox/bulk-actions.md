# Bulk actions (manage chats)

Strings: G-bulk in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## Surfaces
- the chat-management entry modal (launcher, palette, sidebar): search by title, tabs "active" and "archived" (ChatGPT only; other sites have one list), a stats bar "<active> active · <archived> archived" (plus an indexing-in-progress state while sync runs, and "n selected"), rows with checkbox, title, relative age (today, yesterday, n d / w / mo / y ago), tag chips and tag filter, and a a hide-filed-chats filter toggle. Empty states for no chats / no archived chats.
- The same selection bar appears in search results (the bulk-actions entry with select-all, clear, count).
- Actions: ChatGPT delete, archive, unarchive, export, move/add to folder, tag; Claude and Gemini delete, export, folder; Grok delete, rename (single chat), export, folder.

## Confirmation and progress
- Delete asks for confirmation in a modal stating the count; a second wording warns that deletion is permanent. Archive has its own confirmation title. **No typed confirmation, no preview list, no pause, no downloadable log** (Artifact must add these per SPEC §0.5).
- Progress "i/n" with deleting… / archiving… / unarchiving… / exporting… labels; success toasts (chats deleted/archived/unarchived); failure toasts (delete failed, archive failed).

## Per-site execution and pacing
### ChatGPT
- One `PATCH https://chatgpt.com/backend-api/conversation/<id>` per chat, body `{"is_archived": true}` (archive), `{"is_archived": false}` (unarchive) or `{"is_visible": false}` (delete). Delete uses the URL suffix `?content_action=delete&s=true`. Headers: `Authorization` (captured bearer), `Chatgpt-Account-Id`, `Content-Type: application/json`, `X-Extension-Request`.
- Chats are processed in groups of 10 started together, each request still going through the per-tab queue (one at a time, 900 ms gap) and the global token bucket (burst 6, 1.2/s). A 429 pauses the queue for `Retry-After` seconds (default 60 s) and the request is reported failed for that pass. A 404 on delete counts as success.
- Progress is reported after each group of 10; failed IDs are collected and returned.
- After deletion: removes the chats from AIT folders, refreshes pinned chats and the local index; archived flags are updated locally with a short-lived "archive intent" so a concurrent sync does not flip them back.
- The background also notices the site's own bulk "archive all/delete all" PATCH on `/backend-api/conversations` and refreshes.

### Claude
- One `POST https://claude.ai/api/organizations/<org>/chat_conversations/delete_many` with body `{"conversation_uuids": [...]}` (credentials included). On 403/404 the org list is re-read and the call retried once. Response `deleted` and `failed` arrays are used when present; otherwise all are assumed deleted.
- No archive on Claude.

### Gemini
- Sequential: RPC `GzXR5e` then `qWymEb` per chat (see [sync-and-indexing.md](sync-and-indexing.md)), 150 ms between chats; local index cleaned after.

### Grok
- Sequential, 120 ms between chats: grok.com `DELETE https://grok.com/rest/app-chat/conversations/soft/<id>`; X GraphQL POST `…/<queryId>/ConversationItem_DeleteConversationMutation` with variables `{conversationId}` and the `queryId` in the body.
- Rename: grok.com reads `GET /rest/app-chat/conversations/<id>` to keep its `starred` flag, then `PUT /rest/app-chat/conversations/<id>` with `{title, starred}`; X GraphQL POST `…/ConversationItem_RenameConversationMutation` with `{conversationId, title}`.

## Limits
- AIT free plan: 5 chats per action on ChatGPT; bulk actions paid-only on Claude, Gemini, Grok; select-all paid (skip all of this).

## Not in AIT
Auto-archive rules, move to another site, bulk tag outside ChatGPT, undo.
