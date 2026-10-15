# Site endpoints and DOM selectors used by YourAIScroll 1.9.9

**Status: observed in YourAIScroll 1.9.9, unconfirmed live.** Per SPEC §0.3 none of these may ship until confirmed by live observation and recorded in `docs/provider-notes.md`. Header *names* are listed; values only where they are fixed constants (no secrets appear here). "Cookies" means the request relies on the site's own session cookies (`credentials: include`, same-origin from a content script unless noted).

Narrative context for each site is in [youraiscroll/per-site-extraction.md](youraiscroll/per-site-extraction.md).

## ChatGPT — host `chatgpt.com`

| Purpose | Method | Path | Request params | Response fields read | Auth / headers | Pagination |
|---|---|---|---|---|---|---|
| Access token | GET | `/api/auth/session` | — | `accessToken` | cookies; `Accept: application/json`, `Cache-Control: no-cache` | — |
| Read conversation | GET | `/backend-api/conversation/<id>` | — | `title`, `create_time`, `mapping{}` → `message.author.role`, `message.content.parts[]`, `message.create_time`, `message.metadata.search_result_groups[].entries[]` (`ref_id.turn_index`, `ref_id.ref_type`, `ref_id.ref_index`, `url`, `title`, `attribution`) | `Authorization: Bearer <accessToken>`, `chatgpt-account-id` (cookie `_account`), `oai-device-id` (cookie `oai-did`); sent from the background worker with cookies | — (retries: 6 attempts, backoff 1 s·2ⁿ + jitter ≤ 30 s, honours `Retry-After`; retryable 429/500/502/503/504/529; one token refresh on 401) |
| List conversations | GET | `/backend-api/conversations` | `offset`, `limit` (default 60), `order=updated`, `is_archived=false` | `items[]` (`id`, `title`, `create_time`, `update_time`, `is_starred`), `total` | as above, from the background worker | offset; has-more = offset + items < total |
| Share metadata | GET | `/backend-api/share/<shareId>` | — | `create_time` | cookies; `Accept: application/json` | — |

Timestamps: `create_time` numbers are Unix seconds (values < 1e10 treated as seconds).

### ChatGPT DOM selectors (temporary chats, share pages)

| Purpose | Selector |
|---|---|
| Message element (role attribute) | `[data-message-author-role]` (values `user`, `assistant`); id from `data-message-id` |
| Message content | `.markdown`, `[class*='prose']` |
| Turn container | `article`, `[data-testid^='conversation-turn-']` |
| Time element | `time[datetime]`, `[data-message-timestamp]`, `[data-created-at]`, `[data-create-time]` |
| Removed | `button`, `[role="button"]`, `[data-testid*="copy"]`, `[aria-label*="Copy"]`, `.copy-button`, `.toolbar`, `.action-buttons`, `[class*="button"]` |

URL patterns: chat `/c/<id>`; share `/share/<id>`; temporary `?temporary-chat=true`.

## Claude — host `claude.ai`

| Purpose | Method | Path | Request params | Response fields read | Auth / headers | Pagination |
|---|---|---|---|---|---|---|
| Read conversation | GET | `/api/organizations/<orgId>/chat_conversations/<id>` | `tree=True`, `rendering_mode=messages`, `render_all_tools=true`, `consistency=eventual` | `name`, `created_at`, `chat_messages[]` (`index`, `sender`, `created_at`, `content[]` with `type` `text` → `text`; `tool_use` → `name`, `input.command`, `input.content`, `input.new_str`, `input.language`, `input.type`; `tool_result` → `content[]` text items) | cookies; `Accept: */*`, `Anthropic-Client-Platform: web_claude_ai`, `Anthropic-Client-Version: 1.0.0`, optional `Anthropic-Anonymous-Id` (cookie `ajs_anonymous_id`), `Anthropic-Device-Id` (cookie `anthropic-device-id`), `Anthropic-Client-Sha` (hash from `/_next/static/<hash>/` script URL) | — |
| List conversations | GET | `/api/organizations/<orgId>/chat_conversations_v2` | `limit` (default 60), `offset`, `consistency=eventual` | `data[]` (`uuid`, `name`, `created_at`, `updated_at`, `is_starred`), `has_more` | same headers | offset; next offset = offset + items returned while `has_more` |

Org ID: path `/organization/<uuid>` else cookie `lastActiveOrg`. On Firefox the same requests are first attempted from the page world through an injected `postMessage` bridge (8 s timeout).

### Claude DOM selectors (incognito, share pages, API fallback)

| Purpose | Selector |
|---|---|
| Turn container | `[data-test-render-count]` |
| User message | `[data-testid="user-message"]` |
| Assistant message | `.font-claude-response`, `[data-is-streaming]` |
| Assistant Markdown | `.standard-markdown`, `.progressive-markdown` |
| Removed | `button`, `[role="button"]`, `.absolute`, `[class*="pointer-events"]`, `svg`, `[class*="toolbar"]` |

URL patterns: chat `/chat/<uuid>`; share `/share/<id>`; incognito `?incognito`.

## Gemini — host `gemini.google.com`

All RPCs: POST `/_/BardChatUi/data/batchexecute`.

| Purpose | RPC ID | `f.req` args (JSON string) | Response fields read (positional, inside the `wrb.fr` payload) | Pagination |
|---|---|---|---|---|
| Read conversation | `hNvQHb` | `[<c_id>, 1000, null, 1, [1], [4], null, 1]` | `[0]` turns (newest first); per turn user text `[2][0][0]`; candidates `[3][0][]` with text strings at `[1]`; IDs `[0][0]`, `[0][1]`, `[1][2]` | none (1000-turn cap in args) |
| List conversations | `MaZiqc` | `[pageSize, cursor\|null, [pinnedOnly 0/1, null, 1]]`; fallbacks `[pageSize, cursor]`, `[pageSize]`; `source-path=/app` | entries with `[0]` id (`c_…`), `[1]` title, `[2]` pinned (true), `[5]` `[seconds, nanos]`; next cursor at `[1]` of the containing array (object variants `conversations`/`items`/`chats`, `nextCursor`/`nextPageToken`/`cursor` also accepted) | cursor |

Request details:

| Item | Value |
|---|---|
| Query parameters | `rpcids`, `source-path` (current path), `hl`, `_reqid` (random 100000–999999), `rt=c`, `bl`, `f.sid` |
| Form body | `at=<XSRF token>`, `f.req=[[[<rpcid>, <args>, null, "generic"]]]` |
| Headers | `Accept: */*`, `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`, `X-Same-Domain: 1`, `x-goog-ext-525001261-jspb: [1,null,null,null,null,null,null,null,[4]]`, `x-goog-ext-73010989-jspb: [0]` |
| Page tokens (from page HTML or a GET of `/app`) | `SNlM0e` → `at`; `cfb2h` → `bl`; `FdrFJe` → `f.sid`; `TuX5cc` → `hl` |
| Response framing | text containing `[[…]]` arrays; entries `["wrb.fr", rpcid, "<json>"]` |

### Gemini DOM selectors (share pages, API fallback)

| Purpose | Selector |
|---|---|
| User turn | `user-query-content`, text in `.query-text` |
| Assistant turn | `message-content.model-response-text`, `.model-response-text message-content`, `model-response message-content` |
| Share page marker / turns | `share-viewer`; `share-turn-viewer message-content`, `.share-viewer_chat-container message-content` |
| Assistant Markdown | `.markdown` |
| Inline math | `span.math-inline[data-math]` |
| Hidden text removed | `.cdk-visually-hidden`, `.sr-only`, `.visually-hidden`, `[class*='visually-hidden']`, `[aria-hidden='true']` |
| Removed | `mat-icon`, `svg`, `[class*="icon"]`, `[class*="action-button"]`, `[class*="copy-button"]`, `[aria-label*="Copy"]`, `[mattooltip]`, `.code-block-decoration`, `.buttons`, `inline-copy-button`, `.katex-html` |

URL patterns: `/app/<id>`, `/gem/<gemId>/<id>`, `/share/<id>`; IDs normalised to `c_<id>`.

## Google AI Studio — host `alkalimakersuite-pa.clients6.google.com`

Service path prefix: `/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/`

| Purpose | Method | RPC method | Body | Response fields read | Auth / headers | Pagination |
|---|---|---|---|---|---|---|
| Read one chat | POST | `ResolveDriveResource` | `["<promptId>"]` | title `[0][4][0]`; chunks `[0][13][0][]` with text `[0]`, role `[8]` (`user`/`model`), thought flag `[19]` (1) | cookies; `authorization: SAPISIDHASH <ts>_<sha1(ts SAPISID origin)>`, `content-type: application/json+protobuf`, `x-goog-authuser: 0`, `x-user-agent: grpc-web-javascript/0.1`, optional `x-goog-api-key` (page JSON key `WIu0Nc`) | — |
| List chats | POST | `ListPrompts` | `[]` | `[0][]` entries: name `[0]` (`prompts/<id>`), title `[4][0]`, time `[4][4][0]` `[seconds, nanos]` | same | none implemented |

SAPISID cookie sources, in order: `SAPISID`, `__Secure-3PAPISID`, `__Secure-1PAPISID`. Origin string in the hash: `https://aistudio.google.com`. Page URL pattern: `/prompts/<id>`.

AI Studio title selectors: `ms-toolbar h1`, `ms-chunk-editor h1`, `.toolbar-left h1`.

## Grok — host `grok.com`

| Purpose | Method | Path | Params | Response fields read | Headers | Pagination |
|---|---|---|---|---|---|---|
| Read conversation | GET | `/rest/app-chat/conversations/<id>/responses` | — | `responses[]` (`sender` `human`/`ASSISTANT`, `message`, `createTime`, `cardAttachmentsJson[]` → `id`, `url`, `cardType` = `citation_card`) | cookies; JSON accept/content-type | — |
| Read share | GET | `/rest/app-chat/share_links/<shareId>` | — | `conversation.title`, `responses[]` as above | cookies | — |
| List conversations | GET | `/rest/app-chat/conversations` | `pageSize` (default 60; 100 for title lookup), `pageToken`; also `workspaceId` variant | `conversations[]` (`conversationId`, `title`, `createTime`, `modifyTime`, `starred`), `nextPageToken`, `textSearchMatches` | cookies | page token |
| List projects | GET | `/rest/workspaces` | `pageSize=100`, `orderBy=ORDER_BY_LAST_USE_TIME` | `workspaces[]`/`projects[]` (also under `data`): `workspaceId`/`projectId`/`id`, `name`/`title` | cookies | none |
| Project chats (tried in order) | GET | `/rest/workspaces/<wid>`; `/rest/workspaces/<wid>/conversations?pageSize=100`; `/rest/app-chat/conversations?workspaceId=<wid>&pageSize=100` | — | any nested objects with `conversationId` (+ `title`/`name`, `createTime`/`createdAt`, `modifyTime`/`updatedAt`/`lastUseTime`, `starred`/`isStarred`) or `conversationIds[]`, found under `conversations`, `conversationSummaries`, `recentConversations`, `items`, `data` (depth ≤ 6) | cookies | none; 3 workspaces in parallel |

Citation markup in `message`: `<grok:render … card_id="…">…<argument name="citation_id">N</argument>…</grok:render>`.

On Firefox, requests first go through an injected page-world bridge (`postMessage`, 6 s timeout) that returns response text.

### Grok DOM selectors

| Purpose | Selector |
|---|---|
| Message bubble | `.message-bubble` |
| Turn container | `[id^="response-"]`; user if it has class `items-end` or bubble has `bg-purple-100` / `bg-purple-800` |
| Bubble content | `.relative` |
| Sidebar chat link (title) | `a[href*='chat=']` with `aria-label` or text |
| Removed | `.action-buttons`, `.order-first`, `[class*="thinking-container"]`, `.inline-media-container`, `.auth-notification`, `svg`, `[class*="toolbar"]` |

URL patterns: `/c/<id>`; `/project/<pid>?chat=<id>`; share `/share/<id>`; private chat at `/c` or `/`.

## DeepSeek — host `chat.deepseek.com`

| Purpose | Method | Path | Params | Response fields read | Headers | Pagination |
|---|---|---|---|---|---|---|
| Read conversation | GET | `/api/v0/chat/history_messages` | `chat_session_id` | `data.biz_code` (0 = ok), `data.biz_data.chat_session` (`title`, `current_message_id`, `inserted_at`, `created_at`, `updated_at`), `data.biz_data.chat_messages[]` (`message_id`, `parent_id`, `role`, `inserted_at`, `fragments[]` → `type`, `content`) | `Authorization: Bearer <localStorage userToken>`, `x-client-bundle-id: com.deepseek.chat`, `x-client-locale`, `x-client-platform: web`, `x-client-timezone-offset`, `x-client-version` (hardcoded `2.2.0` in reference, unverified) | — |
| List sessions | GET | `/api/v0/chat_session/fetch_page` | `count`, `lte_cursor.pinned`, `lte_cursor.updated_at` | `data.biz_code`, `data.biz_data.chat_sessions[]` (`id`, `title`, `updated_at`, `pinned`), `data.biz_data.has_more` | same | cursor = last item's pinned + updated_at |

Fragment types: user `REQUEST`; assistant `RESPONSE`, `TEMPLATE_RESPONSE`; excluded `THINK`, `SEARCH`, `TIP`.

### DeepSeek DOM selectors (hashed classes, brittle)

| Purpose | Selector |
|---|---|
| Virtual list item | `[data-virtual-list-item-key]` |
| User message | `.fbb737a4` |
| Assistant Markdown | `.ds-message > .ds-markdown` |
| Code block wrapper / language label | `.md-code-block` / `.d813de27` |
| Removed | `.ds-markdown-code-copy-button`, `.ds-markdown-cite`, `.md-code-block-banner-wrap`, `svg`, `[class*="icon"]`, `[class*="toolbar"]` |

URL pattern: `/chat/s/<id>` (canonical link written as `/a/chat/s/<id>`).

## Kimi — host `kimi.com` (`www.kimi.com`)

| Purpose | Method | Path | Body | Response fields read | Headers | Pagination |
|---|---|---|---|---|---|---|
| Read messages | POST | `/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages` or `/apiv2/kimi.chat.v1.ChatService/ListMessages` (gateway first for 36-char IDs) | `{chat_id, page_size: 100, page_token?}` | `messages[]` (`id`, `parentId`/`parent_id`, `role`, `blocks[].text.content`, `createTime`/`create_time`), `nextPageToken`/`next_page_token` | `Authorization: Bearer <localStorage access_token>`, `Connect-Protocol-Version: 1`, `Content-Type: application/json`, `X-Language`, `x-msh-platform: web` | page token, ≤ 100 pages |
| List chats | POST | `/apiv2/kimi.chat.v1.ChatService/ListChats` | `{page_size, page_token}` or first page `{page_size, include_pinned: true}` | `pinnedChats`/`pinned_chats[]`, `chats[]` (`id`, `name`, `createTime`/`updateTime` as ISO or `{seconds, nanos}`), `nextPageToken` | same | page token |

### Kimi DOM selectors

| Purpose | Selector |
|---|---|
| List / item | `.chat-content-list`, `.chat-content-item` |
| User text | `.segment-user .user-content` |
| Assistant Markdown | `.segment-assistant`, `.markdown-container > .markdown` |
| Code block / language / content / inline code | `.segment-code`, `.segment-code-lang`, `.segment-code-content pre code`, `code.segment-code-inline` |
| Removed | `.simple-button`, `.icon-button`, `.segment-code-header`, `.table-actions`, `.toolcall-container`, `.container-block`, `.okc-cards-container`, `.segment-assistant-actions`, `.segment-user-actions`, `[class*="iconify"]` |

URL pattern: `/chat/<id>`.

## Mistral Le Chat — host `chat.mistral.ai`

All calls: GET `/api/trpc/<procedures comma-separated>?batch=1&input=<URL-encoded JSON {"0":{"json":…},"1":{"json":…}}>`, cookies, `Accept: application/json`. Result data at `result.data.json`.

| Purpose | Procedure(s) | Input | Response fields read | Pagination |
|---|---|---|---|---|
| Read chat | `chat.byId` + `message.all` | `{id}`, `{chatId}` | chat: `userTitle`, `generatedTitle`, `title`, `createdAt`, `updatedAt`; messages `items[]`: `id`, `role`, `content`, `contentChunks[]` (`type`, `text`, `markdown`, `content`), `createdAt` | — |
| Title only | `chat.byId` | `{id}` | as above | — |
| List chats | `chat.last` (+ a second `chat.last` for pinned on page 1) | input fields: `productType` = `chat`, `chatVisibility` = `private`, `chatPermission` = `write`, `includeProjectChats` = false, `direction` = `forward`, optional `cursor`. Pinned call: same `productType`, `chatVisibility`, `chatPermission` and `includeProjectChats`, plus `pinned` = true and `limit` = 1000 | `items[]` (`id`, title fields, `createdAt`, `updatedAt`), `nextCursor` | cursor |

### Mistral DOM selectors

| Purpose | Selector |
|---|---|
| Message | `[data-message-author-role]` |
| User text | `.select-text` |
| Assistant answer | `[data-message-part-type="answer"]` |
| Rich table HTML | `[data-rich-table-inner-html]` attribute |
| Code block / language | `pre` containing `div.relative.m-0.rounded-md` / `.text-xs.capitalize` |
| Removed | `[data-exclude-copy="true"]`, `svg`, `.lucide` |

## Microsoft Copilot — host `copilot.microsoft.com`

| Purpose | Method | Path | Params | Response fields read | Auth | Pagination |
|---|---|---|---|---|---|---|
| Read history | GET | `/c/api/conversations/<id>/history` | `api-version=2` | `results[]` (newest first): `id`, `author` (string or `.type`, `ai`), `createdAt`, `content[]` (`type` `text`/`error`/`image`/`document`/`textFile`; `text`, `url`, `prompt`, `fileName`, `content`) | cookies first; then `Authorization: Bearer <secret>` from localStorage keys containing `accesstoken` (JSON `secret`, `expiresOn`, `target` with `chatai.readwrite` preferred) | — |
| Read metadata | GET | `/c/api/conversations/<id>` | — | `title`, `createdAt`, `updatedAt` | same | — |
| List | GET | `/c/api/conversations` | `cursor` | `results[]` (`id`, `title`, `updatedAt`, `isPinned`), `next` | same | cursor |

### Copilot DOM selectors

| Purpose | Selector |
|---|---|
| Conversation | `div[data-content="conversation"]` |
| User / AI message | `div[data-content="user-message"]` / `div[data-content="ai-message"]` |
| User text | `.font-ligatures-none.relative.h-fit` |
| AI message item | `.group\/ai-message-item` |
| Title | `header h1` |
| Removed | `[data-copy="false"]`, `[data-testid*="button"]`, `[data-testid="message-item-reactions"]`, `[data-testid="citation-cards-row"]`, `[data-testid="citation-overflow-button"]`, feedback/share/copy aria-labelled buttons, `.lucide` |

URL pattern: `/chats/<id>` (not `new` / `temporary`).

## GitHub Copilot chat — hosts `github.com` and `*.githubcopilot.com`

| Purpose | Method | Host / path | Body / params | Response fields read | Headers | Pagination |
|---|---|---|---|---|---|---|
| Chat token | POST | `github.com` `/github-copilot/chat/token` | — | `token` | cookies; `Accept`/`Content-Type: application/json`, `GitHub-Verified-Fetch: true`, `X-Requested-With: XMLHttpRequest`, `X-GitHub-Client-Version` (meta `release`), `X-Fetch-Nonce` (meta `fetch-nonce`) | — |
| List threads | GET | `<apiURL origin>` `/github/chat/threads` | — | `threads[]` (`id`, `name`/`title`, `createdAt`, `updatedAt`) | `Authorization: GitHub-Bearer <token>`, `copilot-integration-id: copilot-chat`, `X-GitHub-Api-Version: <apiVersion>`, `Accept: application/json`; from background worker | none |
| Read messages | GET | `<apiURL origin>` `/github/chat/threads/<id>/messages` | — | `messages[]` (`id`, `role`, `content`, `parentMessageID`, `createdAt`, `mediaContent[]` → `type`, `url`, `alt`, `fileName`, `name`, `attachment.url`, `attachment.name`), `thread` (`name`, `title`, `createdAt`, `updatedAt`) | same | none |

`apiURL` and `apiVersion` come from `script[data-target='react-app.embeddedData']` → `appPayload.apiURL`, `appPayload.apiVersion`. The worker rejects any API origin that is not https `githubcopilot.com` or a subdomain.

### GitHub Copilot DOM selectors

| Purpose | Selector |
|---|---|
| Container | `div[class*="conversation"]`, `main`, `[role="main"]` |
| Message area | `[class*="ChatMessage-module__messageArea"]`, `[class*="messageArea"]` |
| Role hint | `.sr-only` text |
| Assistant Markdown | `.markdown-body`, `[data-copilot-markdown='true']` |
| Removed | `[class*="ChatMessage-module__actions"]`, `[class*="action"]`, `[class*="label"]`, `[class*="badge"]`, `.sr-only`, `.lucide`, copy/share/feedback buttons |

URL pattern: `/copilot/c/<id>`.

## Perplexity — host `www.perplexity.ai`

| Purpose | Method | Path | Params / body | Response fields read | Headers | Pagination |
|---|---|---|---|---|---|---|
| Read thread | GET | `/rest/thread/<slug>` | `with_parent_info=true`, `with_schematized_response=true`, `version=2.18`, `source=default`, `limit=100`, `offset=0`, `from_first=true` | `entries[]`: `entry_created_datetime`, `step_type` (`FINAL`), `thread_title`, `query_str`, `blocks[]` → `intended_usage` (`ask_text_0_markdown` → `markdown_block.answer` / `.chunks[]`; `sources_answer_mode` → `sources_mode_block.web_results[]` `name`, `url`) | cookies; `Accept: application/json` | first 100 entries only |
| List threads | POST | `/rest/thread/list_ask_threads` | query `version=2.18`, `source=default`; JSON `{limit, ascending: false, offset, search_term: "", exclude_asi: false, include_assets: true}` | array or `threads`/`results`/`data`; items `uuid`, `title`, `link`, `status`, `last_query_datetime`; `total`/`total_count`/`count`, `has_more`/`hasMore`, `next_offset`/`nextOffset` | cookies; JSON | offset; probes next offset with limit 1 when no hints |

### Perplexity DOM selectors

| Purpose | Selector |
|---|---|
| Section | `.max-w-threadContentWidth` |
| Query (first match) | `h1.group\/query`, `.group\/query`, `h1`, `.whitespace-pre-line.text-pretty`, `.font-display.text-lg.font-medium`, `[class*='font-display'][class*='text-lg']`, `[data-testid='search-bar-input']` |
| Answer | `div[id^='markdown-content-']` → `.prose` |
| Related (ignored) | `[data-testid*='related']`, `[aria-label*='related']`, `[id*='related']`, `[class*='related']` |
| Removed | `[class*='toolbar']`, `[class*='copy']`, `[data-inline-type='image']`, `[class*='citation']`, `aside`, `sup` |

URL pattern: `/search/<slug>`.

## Poe — host `poe.com` (DOM only)

| Purpose | Selector |
|---|---|
| Message | `[id^="message-"]` (numeric id after the prefix) |
| Content | `[class*="Markdown_markdownContainer"]`, `[class*="messageTextContainer"]` |
| User marker | `[class*="rightSideMessageWrapper"]`, `[class*="rightSideMessageRow"]`, `[class*="rightSideMessageBubble"]` |
| Bot name | `[class*="BotHeader_title"] p` |
| Code block / language | class prefix `MarkdownCodeBlock_container` / `[class*="MarkdownCodeBlock_languageName"]` |
| Math | class prefix `katex` / `katex-display`; `annotation[encoding="application/x-tex"]` |
| Scroll containers | `[class*="ChatMessagesScrollWrapper_scrollableContainerWrapper"]`, `[class*="ChatMessagesScrollWrapper_overflowHiddenWrapper"]`, `[class*="ChatPageMainColumn_scrollSectionOverflow"]` |
| Infinite-scroll trigger | `[class*="InfiniteScroll_pagingTrigger"]` |
| Time source | `#__NEXT_DATA__` JSON: object with `messageId` and `creationTime` (µs when ≥ 1e14) |
| Removed | `[class*="expandButton"]`, `[class*="codeFooter"]`, `[class*="codeActionButton"]`, `[class*="messageMetadataContainer"]` |

## Google AI Mode / AI Overview — host `www.google.com` `/search` (DOM only)

| Purpose | Selector |
|---|---|
| AI Mode root | `[data-xid="aim-mars-turn-root"]` |
| AI Mode turn | `.CKgc1d[data-scope-id="turn"]` |
| User query in turn | `span.VndcI` (or within ancestor `.tonYlb`) |
| Answer column | `[data-container-id="main-col"]`; fallbacks `div.LT6XE`, `div.pOOWX`, `section` |
| AI Overview box | `#eKIzJc`; or `h2` with the overview heading → closest `[data-mcpr]`; or `div.Fzsovc` → `.YzCcne` / `[data-mcpr]` |
| Unwrapped | `div[data-animation-atomic]`, `div.Mat90e`, `[style*="display: contents"]` |
| Removed (both modes) | `span.uJ19be.notranslate`, `span.txxDge.notranslate`, `button.rBl3me`, `div.RDmXvc`, `div.zNsLfb`, `div.Jzkafd`, `[data-crb-el]`, `div.OZ9ddf`, `[jsname="lGsj1"]`, `[jsname="L1sC6e"]`, hidden-style elements, `div.PwvzCf`, `div.WEeWWe`, `img`, `div.OS7YA`, `div.F0OfWd`, `div.lACQkd` |
| Removed (AI Mode extra) | `ul.EJw9bc`, `div.Fsg96`, `div.jV2boc`, `div.xXnAhe`, `[data-async-elrc]`, `a.NoAaxc`, `div.JuoeAb`, `a.H23r4e`, `[data-xid="Gd7Hsc"]`, `div.DBd2Wb`, `div.MFrAxb` |

Query: `q` URL parameter. AI Mode pages carry `udm=50`.

## Third-party APIs (user-configured, not AI sites)

| Service | Used for | Notes |
|---|---|---|
| Notion API (official JS client) | save chat to a database page | `databases.retrieve`, `pages.create`, `blocks.children.append`; user's integration token |
| AI providers via Vercel AI SDK | summary of user messages | OpenAI, Anthropic, Google Gemini, Mistral, Groq, xAI, DeepSeek, Moonshot, OpenRouter, Cohere, Together, Fireworks, Cerebras, any OpenAI-compatible base URL; endpoints are the SDK defaults for each provider unless a base URL is set |
