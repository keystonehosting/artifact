# History sync and indexing

Strings: G-sync in [strings.md](strings.md). Observed in AIT 5.0.54; endpoints unconfirmed live. This is the engine behind search, folders, tags, the context meter, handoff, @@ and export.

## Common behavior
- Each site keeps its own IndexedDB of conversations (see [README](README.md) §3). Records hold id, title, update time, create time where known, account/org scope, archived flag (ChatGPT), Gem id (Gemini), and `messages` = the active branch as a list of {id, role, content (plain text), raw content (markdown), create time, optional file pointer}.
- After each sync batch, if the cross-platform switch is on, flattened records are pushed to the unified index in the background.
- A sync status chip in AIT's panels shows: fetching history, syncing a/b, synced (with a relative-time label / "n ago"), partially synced (n chats could not be loaded), failed (refresh page), retrying, rate limited.
- Account isolation: every site records the owner (ChatGPT e-mail + account ID, Claude org, Gemini/Grok account key). When the signed-in account changes, the local DB, caches and per-site storage keys are wiped (theme preferences survive) and a full sync starts.
- Pages excluded: login/auth pages, temporary/incognito chats.

## ChatGPT
- Auth: uses the bearer token and `chatgpt-account-id` the page itself sends (captured by the background); every AIT request adds the header `X-Extension-Request: 1` so the background can ignore AIT's own traffic, and list/detail URLs carry `s=true` for the same purpose.
- Personal vs workspace: `GET /backend-api/accounts/check/v4-2023-04-27` (fallback `/backend-api/accounts/check/`) maps account IDs to `structure` (personal/workspace) and gives `plan_type`; personal account IDs are remembered (last 20) so the account header is omitted for them.
- Listing: `GET /backend-api/conversations?offset=<n>&limit=100&order=updated&is_archived=<false|true>&s=true`, both for active and archived chats, until a page returns fewer than 100 items or 10,000 items are collected. In incremental mode it stops after 2 consecutive pages whose items are all unchanged (same `update_time` and title as the local copy). Plus project chats: `GET /backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=20&s=true[&cursor=]` for project IDs, then `GET /backend-api/gizmos/<projectId>/conversations?cursor=<n>&s=true` per project (same early stop). Items are de-duplicated by `id`.
- Fields read from list items: `id`, `title`, `update_time`, `create_time`, `is_archived`.
- Detail: `POST /backend-api/conversations/batch` with `conversation_ids` (10 per request); single fallback `GET /backend-api/conversation/<id>?s=true` (3 retries, 1 s initial delay). Fields read: `title`, `create_time`, `update_time`, `default_model_slug`, `is_archived`, `mapping`, `current_node`.
- Active branch: walk from `current_node` up through each node's `parent` and reverse. Keep only `author.role` user/assistant. Text from `content.parts[0]` (string or `.text`) when `content_type` is `text` and (user, or `recipient` absent or `all`); for `multimodal_text` the first non-empty string part, and for assistant messages also the image `asset_pointer` (kept as a file pointer). Time from `create_time`.
- What gets fetched: new chats and chats whose `update_time` changed; up to 25 extra per run for records that predate a schema fix; title/archive changes are written without refetching.
- Pruning: after a complete full listing, local chats absent from the server list are removed, guarded: skip if at least 50 deletions or more than 20% of the local set would be removed (prune guard).
- Full sweep: at most once every 7 days (otherwise incremental), skipped in reduced mode; a one-time forced sweep migration capped at 250 chats.
- Pacing: one request at a time per tab, 900 ms gap, plus the background token bucket (burst 6, 1.2/s) shared across tabs. On 429: honor `Retry-After` (seconds) or back off 60 s; minimum 500 ms. While the user is chatting (the page itself calls the conversation endpoints) background work pauses 5 s. One tab holds a 60 s sync lease (renewed every 20 s); others wait; cooldown 30 s between syncs.
- Sync modes (setting a background indexing toggle): normal (index as you browse), reduced (at most every 10 minutes, no weekly full sweep; suggested if ChatGPT reports too many requests), paused (no background indexing; search still works on what is indexed).
- Triggers: page load (after the hydration beacon), new message sent, conversation patched, batch actions, a background nudge.
- Manual: settings a manual resync action (re-download the list, keep local data) and "clear cache and re-sync" (two-click confirm; erases local chats first, warns that chats the server no longer lists cannot be recovered).

## Claude
- Org ID as described in [usage-limits.md](usage-limits.md).
- Listing: `GET /api/organizations/<org>/chat_conversations_v2?limit=100&offset=<n>&consistency=eventual`, up to 200 pages; the array may be top-level or under `conversations`, `items`, `data`, `results` or `chat_conversations`; continue while `has_more` is true (or a full page when the flag is absent). Fields read: `uuid`, `name`, `updated_at`, `project_uuid` / `project.uuid` / `project.name` (for the artifact vault's project filter).
- Detail: `GET /api/organizations/<org>/chat_conversations/<uuid>?tree=True&rendering_mode=messages&render_all_tools=true`, 6 in parallel per batch, 3 retries with doubling delay from 1 s (5xx aborts). Messages from `chat_messages[]` following `current_leaf_message_uuid` → `parent_message_uuid` (fallback: array order); role from `sender` (human/assistant); content from `content[]` blocks (text) or `text`. The same pass extracts artifacts (see [vault-and-gallery.md](vault-and-gallery.md)).
- Frequency: the background asks the tab to sync when it sees Claude XHR traffic, at most every 5 minutes; also on load.
- Deletion tracking: background watches DELETE on a conversation and POST `delete_many` (`conversation_uuids` in the body) and removes them locally.
- Ownership check for cleanup: a stored chat that 404s across all orgs the user belongs to is considered gone (429 stops the check).

## Gemini
- Page tokens: parsed from the app page HTML: `SNlM0e` (sent as `at`), `FdrFJe` (sent as `f.sid`), `cfb2h` (sent as `bl`). Without them the user is treated as signed out.
- RPC transport: `POST https://gemini.google.com[/u/<n>]/_/BardChatUi/data/batchexecute?rpcids=<id>&source-path=<path>&bl=<bl>&f.sid=<sid>&hl=en&_reqid=<counter>&rt=c` with form body `f.req=<JSON>&at=<token>`, headers `Content-Type: application/x-www-form-urlencoded;charset=UTF-8` and `X-Same-Domain: 1`, credentials included. `f.req` wraps one call as [[[rpcId, payloadJSONString, null, "generic"]]]. Response: strip the anti-JSON prefix, read lines, find the array entry whose first element is `wrb.fr` and second is the RPC ID; its third element is the payload JSON string.
- List chats: RPC `MaZiqc`, page size 20, payload [20, cursor, [0, null, 1]] (first page: empty array), source path `/search` by default; response position 2 = list of chats (each: position 0 id, 1 title, 5 = timestamp pair [seconds, nanos]); next cursor at position 1 (or the first long string ≥ 40 chars). 250 ms between pages, up to 1,000 pages.
- Gems: RPC `CNgdBe`, payload [2, ["en"], 0], source path `/gems/view`; position 2 = gems (position 0 id, position 1[0] name). Then each Gem's chats via `MaZiqc` with payload [20, cursor, [null, null, 1, gemId]] and source path `/gem/<gemId>`; chats are tagged with the Gem id and name.
- Read chat: RPC `hNvQHb`, payload [chatId (without `c_` prefix), 100000, cursor, 1, [0], [4], null, 1], source path `/app/<id>` or `/gem/<gemId>/<id>`; pages backwards (older turns first), up to 200 pages, 250 ms apart, stop when the cursor repeats. Each turn: user text at turn[2][0][0] (or turn[2][0]), model text at turn[3][0][0][1] (string or array), times from the timestamp pairs; turn IDs at turn[0][1].
- Concurrency 3 with 300 ms stagger, 3 retries, backoff up to 15 s, stop after 6 consecutive failures. Cooldown 30 s.
- Delete: RPC `GzXR5e` payload [chatId with `c_`], then RPC `qWymEb` payload [chatId, [1, null, 0, 1]] to also delete activity (failure ignored).
- RPC `unqWSc` is declared as "search" in AIT's table but never called.
- The page hook reports the site's own deletes (see [README](README.md)).

## Grok
- Surface detection: hostname grok.com → REST; otherwise X.
- grok.com list: `GET https://grok.com/rest/app-chat/conversations?pageSize=100[&pageToken=]` → `conversations[]` (`conversationId`, `title`, `modifyTime`, `createTime`, `starred`), `nextPageToken`; up to 1,000 pages.
- grok.com read: `GET /rest/app-chat/conversations/<id>/response-node` → collect `responseNodes[].responseId` (fallback: any `responseId` within 6 levels), then `POST /rest/app-chat/conversations/<id>/load-responses` with `responseIds` → responses (top-level array or under `responses`, `result.responses`, `loadedResponses`, `result`): `message`, `sender` (human/user → user, else assistant), `responseId`, `createTime`, skipping `isControl`. Sorted by time.
- X list: GraphQL GET `https://x.com/i/api/graphql/<queryId>/GrokHistory?variables={"cursor":…}` → `data.grok_conversation_history.items[]` (`grokConversation.rest_id`, `title`, `created_at_ms`, `is_pinned`), `cursor`; 350 ms between pages, up to 200 pages.
- X read: GraphQL GET `…/GrokConversationItemsByRestId?variables={"restId":…,"cursor":…}&features=<flags JSON>` → `data.grok_conversation_items_by_rest_id.items[]` (`chat_item_id`, `sender_type` Agent → assistant, `message`, `created_at_ms`), `cursor`.
- X auth headers (names only): `authorization`, `x-csrf-token` (from the `ct0` cookie), `x-twitter-active-user`, `x-twitter-auth-type`, `x-twitter-client-language`; the authorization value is captured from the page's own GraphQL calls by the background, with a fallback to the public web-client bearer.
- Manual a history refresh action in the Grok launcher panel.

## AI Studio
Not supported.
