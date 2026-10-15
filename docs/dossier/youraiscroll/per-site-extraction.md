# YourAIScroll 1.9.9 — per-site extraction

Observed in YourAIScroll 1.9.9, unconfirmed live. Endpoint details (method, params, headers, response fields) are tabulated in [../endpoints-youraiscroll.md](../endpoints-youraiscroll.md); this file explains the logic around them.

## Common model

Every site adapter produces the same minimal shape: a title, an optional conversation time, and an ordered list of messages with a role (`user` / `assistant`, occasionally another string) and a Markdown string. There is no notion of parts, attachments, branches, models or tool calls in the output. Some adapters additionally run the Markdown through a Markdown lexer to collect "meta" (code blocks with language, image links, table count, link count) but that meta is never used by any exporter.

**DOM-to-Markdown converter (shared).** When an adapter reads the page instead of an API, it clones the message element, removes noise (buttons, `[role="button"]`, copy buttons, toolbars, plus a site-specific remove list), and converts the HTML to Markdown with Turndown configured for ATX headings, fenced code, `-` bullets, `*` emphasis and `**` strong. Extra rules:

- `<pre><code class="language-xxx">` becomes a fenced block tagged `xxx`.
- `span.math-inline[data-math]` becomes `$…$` (this is Gemini's inline math attribute).
- Tables become pipe tables. Cell text has newlines collapsed to spaces and `|` escaped; a header separator row is added when the first row has `<th>` or the table has a `<thead>`. Inline-math spans inside cells also become `$…$`.
- Sites can add their own rules (code-block wrappers with a language label, KaTeX annotations, inline code).

**Conversation time.** A shared helper looks for a timestamp near the first message: elements matching `time[datetime]`, `relative-time[datetime]`, `local-time[datetime]`, `[data-message-timestamp]`, `[data-message-created-at]`, `[data-created-at]`, `[data-create-time]`, `[data-timestamp]`, `[data-timestamp-ms]` inside the message or its closest `article`, `li`, `[data-testid*='message']` or `[class*='ChatMessage']` ancestor. Numeric values below 1e10 are treated as seconds, otherwise milliseconds; strings are parsed as dates.

**Title.** Per site, from the document title with the site suffix stripped (" - Claude", " - Grok", " - Poe", " - Kimi", " - Google Gemini", " · GitHub Copilot", " - DeepSeek"/" · DeepSeek"), or from an API field. Fallback is a generic placeholder. The download base name is `<Prefix>-<title with whitespace replaced by _>`, prefixes: `ChatGPT`, `Claude`, `Gemini`, `GoogleAIStudio`, `Perplexity`, `Poe`, `DeepSeek`, `Grok`, `Kimi`, `Mistral`, `Copilot`, `GitHubCopilot`, `GoogleAI`.

**Fallback pattern.** Most sites try the API first and fall back to DOM scraping if the API call throws or returns nothing usable. Poe and Google AI Mode are DOM-only. AI Studio is API-only.

---

## ChatGPT (chatgpt.com)

**Data source:** backend API, called from the background worker (the content script sends it the token and IDs). DOM only for temporary chats and share pages.

**Conversation ID:** `/c/<id>` in the path (hex and dashes). Project chats under `/g/<project>/c/<id>` match the same pattern.

**Auth:** the content script GETs the session endpoint to get an access token, prefixes it with `Bearer `, caches it in extension storage, and falls back to the cached token if the session call fails. Account ID comes from the `_account` cookie and device ID from the `oai-did` cookie; both are passed along as headers when present.

**Fetching one conversation:** up to 6 attempts. On HTTP 401 the cached token is discarded once and refetched. Status 429, 500, 502, 503, 504 and 529, and network errors, are retried with exponential backoff (1 s × 2^attempt plus up to 1 s jitter, capped at 30 s), honouring a `Retry-After` header (seconds or HTTP date) when present.

**Message assembly (no branch handling):**

- Takes **every** node in `mapping` and sorts them by `message.create_time`. It does not follow `current_node` / `parent`, so all edits and regenerations from every branch end up interleaved in time order. This is the biggest correctness gap; Artifact must walk `current_node` back through `parent`.
- Keeps nodes whose `author.role` is `user` or `assistant` and whose `content.parts` is an array. System, tool and hidden messages are dropped (so browsing/tool output, code-interpreter output and "thoughts" are lost).
- Each part is joined with newlines. String parts that happen to be JSON are parsed: a part whose `type` starts with `code/` becomes a fenced block tagged with the suffix (e.g. `code/python`), otherwise its `content` field is used. Non-string parts (image asset pointers, file references) are not handled and would serialise as an object placeholder.
- Consecutive assistant messages are merged into one (blank line between), keeping the first timestamp. Empty assistant messages are skipped.
- `create_time` (seconds) becomes an ISO timestamp per message; the conversation's `create_time` becomes the conversation time.

**Citations:** builds a map from every node's `metadata.search_result_groups[].entries[]` keyed by `turn<turn_index><ref_type><ref_index>` (from the entry's `ref_id`) to URL, title and attribution. In assistant text (outside fenced code) it replaces the citation markers ChatGPT emits — the "【cite†turn0search1】"-style bracketed form, the bare `cite turn…` form, and bare `turnNsearchM` tokens, including comma-separated lists — with Markdown footnote references `[^n]`, numbering sources in order of first use and reusing numbers for repeats. Private-use Unicode characters (U+E000–U+F8FF) are stripped, lines containing `navlist` are dropped, empty `【】` pairs removed. If any citation was used, a "Sources:" block is appended with one footnote definition per source: `[^n]: [title](url) (attribution)`.

**Images / files / canvas / code interpreter:** not exported. Canvas (textdoc) content is only captured if it appears as a code-typed JSON part.

**Temporary chats** (`?temporary-chat=true`) and **share pages** (`/share/<id>`): DOM extraction from `[data-message-author-role]` elements (user / assistant only), content from `.markdown` or `[class*='prose']` inside them, with copy buttons and toolbars removed. For share pages the title comes from the document title and the conversation time is fetched from the share API (`create_time` only; message content still comes from the DOM). For temporary chats the conversation time falls back to a time element near the first user turn, then to the page's `performance.timeOrigin`.

**Conversation list (batch):** offset paging with page size from settings (default 60), ordered by update time, non-archived only. Response fields read: `items[].id`, `title`, `create_time`, `update_time`, `is_starred`, and `total` (used to compute a more-available flag). Project conversations are not listed separately (only what the main list endpoint returns).

**Batch specifics:** 750 ms pause between conversations; failures are collected per conversation with the stage that failed (fetch / extract / format / archive) and written as a JSON failure report inside the ZIP; filenames are de-duplicated (see export-formats.md).

**Edge cases:** the background fetch spoofs a desktop Chrome user-agent header; a conversation with zero extractable messages counts as a failure in batch mode.

---

## Claude (claude.ai)

**Data source:** internal web API (same-origin fetch with cookies). DOM for incognito and share pages, and as fallback when the API fails.

**Conversation ID:** `/chat/<uuid>` in the path. **Organization ID:** `/organization/<uuid>` in the path if present, otherwise the `lastActiveOrg` cookie. Missing org ID is an error ("not logged in").

**Headers:** `Accept: */*`, `Anthropic-Client-Platform: web_claude_ai`, `Anthropic-Client-Version: 1.0.0`, plus `Anthropic-Anonymous-Id` (from the `ajs_anonymous_id` cookie), `Anthropic-Device-Id` (from the `anthropic-device-id` cookie) and `Anthropic-Client-Sha` (the build hash parsed from any `script[src*='/_next/static/']` URL), each only if found.

**Firefox path:** on Firefox it first tries the request from the page's own JavaScript world. It injects a small inline script once that listens for `window.postMessage` requests, performs the fetch with the page's credentials, and posts back status and JSON; the content script waits up to 8 s, then falls back to its own fetch. (Reason: Firefox content-script fetches do not carry the same cookies/origin.)

**Message assembly (no branch handling):**

- Requests the conversation with `tree=True` and `rendering_mode=messages`, then sorts **all** `chat_messages` by `index` and keeps every one that has `content` and `sender`. With `tree=True` the response includes every branch, so edits and retries are all interleaved. Artifact should walk the active branch via the leaf/parent message pointers instead (YourAIScroll reads no such fields, so their names must be confirmed live).
- `sender` `human` → user, anything else → assistant.
- Content blocks:
  - `text` blocks are appended. Legacy inline `<antArtifact …>…</antArtifact>` tags inside text are replaced by a fenced code block whose language is the last segment of the artifact's `type` attribute (after `/`, `.` and `+`), e.g. `application/vnd.ant.code` → `code`, `text/html` → `html`, `image/svg+xml` → `xml`.
  - `tool_use` blocks named `artifacts` become fenced code: for a create, the `input.content` with language from `input.language` or the last segment of `input.type`; for an `update` command only `input.new_str` is emitted (the old string and the resulting full artifact are not reconstructed).
  - `tool_result` blocks contribute the concatenated text of their text items, except items whose text is exactly `OK`.
  - Everything else is ignored: `thinking` blocks, other tools (web search, analysis/REPL), images, attachments (`attachments[]` with extracted text) and uploaded `files[]`.
- Conversation title from `name`, conversation time from `created_at`, per-message `created_at` as timestamp.

**Incognito** (`?incognito` present or `=true`) and **share pages** (`/share/<id>`): DOM extraction. Iterates `[data-test-render-count]` turn containers; a turn with `[data-testid="user-message"]` is a user message; otherwise a `.font-claude-response` or `[data-is-streaming]` element is the assistant message, taking `.standard-markdown` or `.progressive-markdown` inside it. Removes buttons, `.absolute` overlays, pointer-events helpers, SVGs and toolbars. Artifacts open in the side panel are not captured from the DOM.

**Conversation list (batch):** `chat_conversations_v2` with `limit` (page size from settings, default 60) and `offset`; response `data[]` with `uuid`, `name`, `created_at`, `updated_at`, `is_starred`, and `has_more`. The next offset is the current offset plus the number of items returned.

**Batch specifics:** no pacing delay; one failed conversation aborts the whole batch (error returned with the IDs done so far, no ZIP).

---

## Gemini (gemini.google.com)

**Data source:** the `batchexecute` RPC endpoint of the Gemini web app (`BardChatUi`), with DOM fallback.

**Conversation ID:** taken from the path after `app` (`/app/<id>`) or, for Gems, the segment two places after `gem` (`/gem/<gemId>/<id>`, else the last segment). `new` is rejected. IDs are normalised to start with `c_` (a bare ID of 8+ URL-safe characters gets `c_` prefixed). Share URLs (`/share/<id>`) produce no ID and go straight to DOM.

**Session tokens:** read from the current page HTML (inline JSON page data, matched as `"key":"value"` pairs) by key: `SNlM0e` → `at` form field (XSRF token), `cfb2h` → `bl` query parameter (build label), `FdrFJe` → `f.sid` query parameter, `TuX5cc` → `hl` (language). Both plain and backslash-escaped JSON forms are searched. If the token is not in the page, it fetches `/app` and parses the returned HTML.

**RPC call shape:** POST `…/_/BardChatUi/data/batchexecute` with query `rpcids=<id>`, `source-path=<current path or /app>`, `hl`, `_reqid` (random 6-digit), `rt=c`, `bl`, `f.sid`; form body `at=<token>` and `f.req=[[[<rpcid>, <json-string args>, null, "generic"]]]`. Headers include `X-Same-Domain: 1` and two `x-goog-ext-…-jspb` headers (values in the endpoints file). The response is the length-prefixed chunked format; the parser scans for top-level `[[…]]` arrays, JSON-parses each, and collects entries `["wrb.fr", <rpcid>, "<json string>"]`, parsing the third element.

**Read conversation — RPC `hNvQHb`:** args `[<c_id>, 1000, null, 1, [1], [4], null, 1]` (1000 = max turns). Parsing: in the payload, element `[0]` is the list of turns, **newest first**, so it is reversed. Per turn:

- user text at `[2][0][0]`;
- assistant text: `[3][0]` is the list of response candidates; the first candidate whose `[1]` holds non-empty strings is used (strings joined with blank lines). Only one candidate is exported (the first non-empty, not necessarily the one the user picked); other drafts are ignored;
- IDs: conversation `[0][0]`, response `[0][1]`, candidate `[1][2]`.

Text is normalised: CRLF to LF, spaces between CJK characters removed, spaces before CJK punctuation removed, spaces after CJK opening brackets removed, trailing spaces before newlines removed. Images, generated images, uploaded files, code-execution output, thinking and canvas ("immersive") content are not extracted; citations inside the text stay as Gemini wrote them.

**Conversation time:** not in the read RPC. It is found by paging through the conversation list (below) until the conversation's ID appears, then using its timestamp. On big accounts this can mean many list calls per export.

**List conversations — RPC `MaZiqc`:** args `[pageSize, cursor|null, [pinnedFlag, null, 1]]`, where pinnedFlag 1 asks for pinned chats only. If that returns nothing, it retries with `[pageSize, cursor]` and `[pageSize]`. On the first page it also pages through the pinned-only list completely and puts pinned chats first (marked as starred), de-duplicated. The parser is defensive: it walks the payload looking for an array of entries whose `[0]` is a string starting with `c_`; title at `[1]`, pinned flag `[2] === true`, timestamp at `[5]` as `[seconds, nanos]`; next-page cursor at `[1]` of the containing array. It also accepts object-shaped variants (`conversations`/`items`/`chats`, `nextCursor`/`nextPageToken`/`cursor`).

**DOM fallback / share pages:** user turns from `user-query-content` (text from `.query-text`, with visually hidden elements removed and a leading screen-reader "You said" prefix stripped). Assistant turns from `message-content.model-response-text`, `.model-response-text message-content`, `model-response message-content`, and on share pages (`share-viewer` present) also `share-turn-viewer message-content` and `.share-viewer_chat-container message-content`; content from the `.markdown` child. Elements are put in document order. Removed before conversion: icons, action/copy buttons, tooltips, code-block decoration, inline copy buttons and `.katex-html` (so KaTeX keeps only its source annotation / Gemini's `data-math`).

**Batch specifics:** canonical link written into files is `https://gemini.google.com/app/<id without c_>`; one failure aborts the batch.

---

## Google AI Studio (aistudio.google.com)

See [ai-studio-reader.md](ai-studio-reader.md) for the full reader. Summary: API only (no DOM fallback), via MakerSuiteService JSON+protobuf RPCs `ResolveDriveResource` (read one prompt) and `ListPrompts` (list), authenticated with a SAPISIDHASH header computed from Google cookies. Thought chunks are skipped, consecutive model chunks are merged, attachments and images are ignored, there is no conversation time.

---

## Grok (grok.com)

**Data source:** Grok's REST API (same-origin fetch with cookies). DOM for private chats.

**Conversation ID:** `/c/<id>`; or, on a project page `/project/<projectId>` with `?chat=<id>`.

**Firefox path:** like Claude, it first tries a page-world fetch bridge (6 s timeout). The bridge builds the request inside the page and returns the raw response text, which the content script parses (to avoid cross-realm object problems).

**Headers used on the direct fetch:** JSON accept/content-type and a fixed `Accept-Language` of Chinese-then-English (a leftover; Artifact should not copy it).

**Message assembly (no branch handling):** GET `…/conversations/<id>/responses` returns `responses[]`. All responses are sorted by `createTime` and kept if `sender` maps to user (`human`) or assistant (`ASSISTANT`); content is `message`. Since every regeneration and edit is a response, all branches are interleaved. Images (generated or uploaded), file attachments, web search results, X posts and thinking are not exported.

**Citations:** the assistant text contains `<grok:render …>` elements. The response's `cardAttachmentsJson` (array of JSON strings or objects) is parsed for cards with `cardType` `citation_card`, `id` and `url`. A render tag whose `card_id` matches and which carries an `<argument name="citation_id">N</argument>` is replaced by a Markdown link `[[N]](url)`; unmatched render tags are removed. If there are no citation cards at all, every render tag is stripped.

**Title:** the sidebar link whose `?chat=` equals the ID (its `aria-label` or text), else the cached title from the list API (it will page the list, 100 at a time, until found), else the document title.

**Private chats:** path exactly `/c`, or `/` with `.message-bubble` elements present. DOM: each `.message-bubble` inside a `[id^="response-"]` container; user if the container has class `items-end` or the bubble has a purple background class, else assistant; content from the bubble's `.relative` child. Thinking containers, inline media and auth notices are removed.

**Share pages:** `/share/<id>` → share API (see share-links.md).

**Conversation list (batch):** `pageSize` + `pageToken` paging; response `conversations[]` (`conversationId`, `title`, `createTime`, `modifyTime`, `starred`) and `nextPageToken`. On the first page it also loads **project (workspace) conversations**: lists workspaces (100, ordered by last use), and for each workspace (3 in parallel) tries in order the workspace object, the workspace's conversations endpoint, and the main list filtered by `workspaceId`, recursively harvesting any objects with a `conversationId` (or `conversationIds` arrays). Results are de-duplicated and tagged with the project name, which the popup shows next to the date.

**Batch specifics:** canonical link `https://grok.com/c/<id>`; no pacing; one failure aborts.

---

## DeepSeek (chat.deepseek.com)

**Data source:** DeepSeek's `api/v0` (same-origin fetch, bearer token). DOM fallback.

**Conversation ID:** `/chat/s/<id>` in the path (the app also serves it under `/a/chat/s/<id>`, which the batch writes as the canonical link).

**Auth:** `localStorage.userToken`; if it is JSON, the token is the first string found under `value`, `token`, `accessToken` or `access_token` (recursively). Headers: `Authorization: Bearer …`, `x-client-bundle-id: com.deepseek.chat`, `x-client-locale` (document/browser language with `-` → `_`), `x-client-platform: web`, `x-client-timezone-offset` (seconds east of UTC), `x-client-version` (hardcoded `2.2.0` in the reference, unverified).

**Message assembly (branch-aware):** GET `history_messages?chat_session_id=<id>`; success requires `data.biz_code === 0`; payload `data.biz_data` has `chat_session` and `chat_messages`. It walks from `chat_session.current_message_id` (or the last message) back via `parent_id`, then reverses — this exports only the active branch. Per message: role from `role` (`ASSISTANT` → assistant, otherwise user); text from `fragments[]` of type `RESPONSE`/`TEMPLATE_RESPONSE` (assistant) or `REQUEST` (user); if none of those exist it falls back to all fragments except `THINK`, `SEARCH` and `TIP`. So reasoning ("deep think") and search results are dropped. Files and images are not exported.

Times: conversation time from `chat_session.inserted_at`/`created_at` else the earliest message `inserted_at`; numeric values are seconds.

**DOM fallback:** items `[data-virtual-list-item-key]`; a user message is the element with hashed class `.fbb737a4`; an assistant message is `.ds-message > .ds-markdown`. A custom rule turns `.md-code-block` wrappers into fenced code using the language label in hashed class `.d813de27`. Removes copy buttons, `.ds-markdown-cite` citation chips and code banners. Because the list is virtualised, long chats may be incomplete in DOM mode. Title fallback uses a hashed-class selector path; all hashed classes are brittle.

**Conversation list (batch):** `chat_session/fetch_page` with `count` and a cursor made of `lte_cursor.pinned` (bool) and `lte_cursor.updated_at` (from the last item). Response `biz_data.chat_sessions[]` (`id`, `title`, `updated_at`, `pinned`) and `has_more`. Pinned sessions are marked starred.

**Batch specifics:** a failed conversation is skipped and reported (not fatal unless all fail); duplicate filenames get an 8-character ID suffix.

---

## Kimi (kimi.com)

**Data source:** Kimi's Connect-protocol JSON API under `/apiv2` (POST, bearer token). DOM fallback.

**Conversation ID:** `/chat/<id>`.

**Auth:** `localStorage.access_token`. Headers: `Authorization: Bearer …`, `Connect-Protocol-Version: 1`, JSON content type, `X-Language`, `x-msh-platform: web`.

**Read messages:** `ListMessages` with body `{chat_id, page_size: 100, page_token?}`. Two service paths exist (`kimi.gateway.chat.v1.ChatService` and `kimi.chat.v1.ChatService`); for 36-character (UUID) IDs the gateway path is tried first, otherwise the other one first. Pages are fetched until no `nextPageToken`/`next_page_token` (max 100 pages, loop-protected), de-duplicating by message `id`.

**Branch handling:** starts at the first message ID seen in the first page (the API returns newest first) and walks `parentId`/`parent_id` back until an empty or all-zero UUID, then reverses. If no chain can be built it sorts by creation time. Per message: role must be `user` or `assistant`; text is the trimmed `blocks[].text.content` joined with blank lines. Tool calls, search cards, images and files are dropped.

**DOM fallback:** `.chat-content-list .chat-content-item`; user text from `.segment-user .user-content` (plain text); assistant from `.segment-assistant .markdown-container > .markdown` (multiple segments joined). Assistant segments before the first user message are ignored. Custom rules convert `.segment-code` blocks (language from `.segment-code-lang`) and `code.segment-code-inline`. Removes tool-call containers, cards and action bars.

**Conversation list (batch):** `ListChats` with `{page_size, page_token}` or, on the first page, `{page_size, include_pinned: true}`. Response `pinnedChats`/`pinned_chats` (marked starred) and `chats` with `id`, `name`, `createTime`/`updateTime` (either ISO strings or `{seconds, nanos}`), plus `nextPageToken`.

**Batch specifics:** per-conversation failures are skipped and reported; canonical link `<origin>/chat/<id>`.

---

## Mistral Le Chat (chat.mistral.ai)

**Data source:** the app's tRPC endpoint (GET, cookies). DOM fallback.

**Conversation ID:** `/chat/<id>`.

**tRPC call shape:** GET `/api/trpc/<proc1>,<proc2>?batch=1&input=<url-encoded JSON>` where the input is an object keyed `"0"`, `"1"`, … each holding `{ "json": <args> }`. Results are an array; each result's data is `result.data.json` (or `result.data`).

**Read conversation:** batched `chat.byId` `{id}` and `message.all` `{chatId}`. Chat title is `userTitle`, else `generatedTitle`, else `title`. Messages from `items[]` in returned order (no branch logic): text is `content`, else the joined `contentChunks[]` whose `type` is missing or one of `text`, `markdown`, `answer` (taking `text`, `markdown` or `content`). Roles: `user`, `system` (kept as "system" in data but rendered under the assistant label), anything else assistant. Tool/web-search chunks, images, documents and canvases are dropped.

**Conversation list (batch):** `chat.last` with input fields `productType` = `chat`, `chatVisibility` = `private`, `chatPermission` = `write`, `includeProjectChats` = false, `direction` = `forward`, and an optional `cursor`. On the first page a second `chat.last` call with `pinned: true, limit: 1000` (no direction) fetches pinned chats, which are listed first and marked starred. The next cursor is the response's `nextCursor`, JSON-stringified for the popup and parsed back.

**DOM fallback:** `[data-message-author-role]`; user text from `.select-text`; assistant content from `[data-message-part-type="answer"]`. Rich tables stored in `data-rich-table-inner-html` attributes are re-hydrated into real `<table>` elements before conversion. A custom rule handles code blocks rendered as `pre` containing `div.relative.m-0.rounded-md` with the language in `.text-xs.capitalize`. Removes `[data-exclude-copy="true"]` and Lucide icons.

**Batch specifics:** per-conversation failures skipped; duplicate filenames get an ID suffix.

---

## Microsoft Copilot (copilot.microsoft.com)

**Data source:** the consumer Copilot web API under `/c/api` (same-origin), DOM fallback.

**Conversation ID:** `/chats/<id>`; `new` and `temporary` are rejected.

**Auth:** first tries with cookies only (no Authorization header). If that fails, it scans `localStorage` for keys containing `accesstoken` (case-insensitive) whose JSON value has a `secret` and a non-expired `expiresOn` (seconds), preferring entries whose `target` scope contains `chatai.readwrite`, and retries with `Authorization: Bearer <secret>` for each candidate.

**Read conversation:** `…/conversations/<id>/history?api-version=2` returns `results[]` newest first (reversed), and `…/conversations/<id>` gives `title`, `createdAt`, `updatedAt`. Per message: author is a string or `author.type`; `ai` → assistant, else user. Content parts:

- `text` and `error` → their `text`;
- `image` → a Markdown image link to the part's `url` with alt text from `prompt` or `fileName` (generated images are **linked**, not downloaded);
- `document` → the file name with a file marker (content not exported);
- `textFile` → a fenced block tagged with the file extension containing the part's `content`;
- anything else ignored.

No branch handling needed (linear history).

**DOM fallback:** `div[data-content="conversation"]` container; `div[data-content="user-message"]` (text from `.font-ligatures-none.relative.h-fit` or the element) and `div[data-content="ai-message"]` (each `.group/ai-message-item` converted separately). Removes reaction bar, share/copy/feedback buttons, citation card rows and overflow buttons.

**Conversation list (batch):** `…/conversations?cursor=<cursor>`; `results[]` (`id`, `title`, `updatedAt`, `isPinned` → starred) and `next` cursor.

---

## GitHub Copilot chat (github.com/copilot)

**Data source:** GitHub's Copilot chat API on a `*.githubcopilot.com` host, called **from the background worker** (cross-origin). DOM fallback.

**Conversation ID:** `/copilot/c/<id>` (hex and dashes); other GitHub Copilot pages are rejected as "not a conversation".

**Auth bootstrap (content script):**

1. POST `/github-copilot/chat/token` on github.com with headers `GitHub-Verified-Fetch: true`, `X-Requested-With: XMLHttpRequest`, `X-GitHub-Client-Version` (from `meta[name="release"]`) and `X-Fetch-Nonce` (from `meta[name="fetch-nonce"]`); response field `token`.
2. API base URL and version from the JSON in `script[data-target='react-app.embeddedData']`, fields `appPayload.apiURL` and `appPayload.apiVersion`.

The background worker only accepts an API origin of `githubcopilot.com` or a subdomain over https, and sends `Authorization: GitHub-Bearer <token>`, `copilot-integration-id: copilot-chat`, and `X-GitHub-Api-Version: <apiVersion>`.

**Read messages:** `…/github/chat/threads/<id>/messages`; `messages[]` with `id`, `role`, `content`, `parentMessageID`, `createdAt`, `mediaContent[]`; and `thread` (`name`/`title`, `createdAt`, `updatedAt`). **Branch-aware:** walks from the last message back through `parentMessageID`. Media items become Markdown image links (if `type` is `image` or the URL ends in an image extension) or plain links, with labels from `alt`, `fileName`, `name` or `attachment.name`; URL from `url` or `attachment.url`. Role `user` → user, else assistant.

**DOM fallback:** inside `div[class*="conversation"]`, `main` or `[role="main"]`, message areas are elements whose class contains `messageArea` (the CSS-module class `ChatMessage-module__messageArea…`). Role is decided from the screen-reader label (`.sr-only` text starting with "you said" vs "copilot said") or the presence of `.markdown-body` / `[data-copilot-markdown='true']`. User text is the area without the Markdown body; assistant text is the Markdown body. Lines with the screen-reader prefixes and an "edit message" label are stripped. Duplicates (same role and normalised text) and assistant echoes of the previous user text are removed.

**Conversation list (batch):** `…/github/chat/threads` → `threads[]` (`id`, `name`/`title`, `createdAt`, `updatedAt`); no paging.

---

## Perplexity (perplexity.ai)

**Data source:** Perplexity's `rest/thread` API (same-origin). DOM fallback.

**Thread ID:** `/search/<slug>` (the slug in the URL is passed straight to the API).

**Read thread:** GET `rest/thread/<slug>` with `with_parent_info=true`, `with_schematized_response=true`, `version=2.18`, `source=default`, `limit=100`, `offset=0`, `from_first=true`. Only the first 100 entries are fetched (no further paging), so very long threads are truncated. Entries are sorted by `entry_created_datetime`; entries with a `step_type` other than `FINAL` are skipped. Per entry:

- user message = `query_str`;
- assistant message = the block whose `intended_usage` is `ask_text_0_markdown`: its `markdown_block.answer`, else `markdown_block.chunks` joined;
- sources = the block whose `intended_usage` is `sources_answer_mode`: `sources_mode_block.web_results[]` (`name`, `url`), appended under a bold heading (the heading text is hardcoded in Chinese, a quirk) as a numbered list `- [n] [name](url)`.
- title from the first entry's `thread_title`; conversation time from the first entry time.

Images, attachments, Pages, Labs/asset outputs and follow-up suggestions are not exported. Inline citation markers stay as Perplexity wrote them.

**DOM fallback:** each `.max-w-threadContentWidth` section; the query from the first matching of several heading selectors (`h1.group/query`, `.group/query`, `h1`, `.whitespace-pre-line.text-pretty`, `.font-display.text-lg.font-medium`, `[data-testid='search-bar-input']`), ignoring "Related" sections; answers from `div[id^='markdown-content-']` (inner `.prose`). Removes inline images, citations, `aside` and `sup`. De-duplicates identical user and assistant texts.

**Conversation list (batch):** POST `rest/thread/list_ask_threads?version=2.18&source=default` with JSON `{limit, ascending: false, offset, search_term: "", exclude_asi: false, include_assets: true}`. Accepts an array or an object with `threads`/`results`/`data`, and optional `total`/`total_count`/`count`, `has_more`/`hasMore`, `next_offset`/`nextOffset`. Item fields: `uuid`, `title`, `link`, `status`, `last_query_datetime`. When the response gives no paging hints it probes with a 1-item request at the next offset to decide whether more exist.

**Batch specifics:** the batch writes HTML with a small regex Markdown converter (not the full Markdown renderer used elsewhere), so batch HTML for Perplexity is lower quality than single export. One failure aborts.

---

## Poe (poe.com)

**Data source:** DOM only. No list, no batch.

**Loading the full history:** before reading, it scrolls the chat to the top repeatedly to trigger infinite scroll: it finds the scroll container (`ChatMessagesScrollWrapper_scrollableContainerWrapper`, `…_overflowHiddenWrapper`, `ChatPageMainColumn_scrollSectionOverflow`, else the document), scrolls the `InfiniteScroll_pagingTrigger` element into view (or sets scrollTop to 0), waits up to 2.5 s for the count of `[id^="message-"]` elements to grow, and repeats up to 100 times until no growth. It then restores the scroll position.

**Message extraction:** each `[id^="message-"]`; content from `[class*="Markdown_markdownContainer"]` or `[class*="messageTextContainer"]`. Role: user if the message contains a right-side bubble/row/wrapper class; otherwise the **bot's display name** from `[class*="BotHeader_title"] p` (falls back to assistant). So exports label assistant turns with the bot name in upper case (e.g. `[GPT-4O]`), and multi-bot chats keep each bot's name. Custom rules: `MarkdownCodeBlock_container` → fenced code with the language from `MarkdownCodeBlock_languageName` (or the `language-` class, ignoring `text`/`unknown`); KaTeX (`katex` / `katex-display`) → `$…$` / `$$…$$` from the TeX annotation. Removes expand buttons, code footers and message metadata.

**Conversation time:** the shared time helper on the first message, else a search through the `__NEXT_DATA__` JSON for an object whose `messageId` equals the first message's numeric ID and reading its `creationTime` (microseconds when ≥ 1e14).

**Attachments/images:** not exported (images only if they end up as Markdown image links from the DOM).

---

## Google AI Mode and AI Overview (google.com/search)

**Data source:** DOM only. No list, no batch.

**Detection:** AI Mode if `[data-xid="aim-mars-turn-root"]` exists. Otherwise an AI Overview box: `#eKIzJc`, or an `h2` whose text is the overview heading (closest `[data-mcpr]`), or `div.Fzsovc` with that text (closest `.YzCcne` / `[data-mcpr]`). Neither → error. (AI Mode pages are the `udm=50` search pages.)

**AI Mode extraction:** first scrolls the last turn into view and then scrolls to the bottom up to 5 times until height and turn count stabilise (to render lazy turns), restoring scroll afterwards. Turns are `.CKgc1d[data-scope-id="turn"]` inside the root. User query text from `span.VndcI` in the turn (or its `.tonYlb` ancestor); answer from `[data-container-id="main-col"]`. If there is no user turn, the `q` URL parameter is used as the first user message. Consecutive duplicate user queries are suppressed.

**AI Overview extraction:** user message = `q` parameter; answer = main column (`[data-container-id="main-col"]`, `div.LT6XE`, `div.pOOWX` or `section`).

**Cleaning:** a long remove list of Google's obfuscated classes (source chips, "show more" controls, feedback, hidden elements, images, `[data-crb-el]`), plus a second list for AI Mode (source carousels, link cards, follow-up chips). Animation wrappers and `display: contents` wrappers are unwrapped.

**Labels:** AI Mode exports use USER / ASSISTANT; AI Overview exports use QUERY / AI OVERVIEW. Title is the search query, else the document title without the Google suffix. No conversation time.
