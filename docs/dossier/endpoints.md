# Site endpoints, RPCs and DOM selectors used by AI Toolbox 5.0.54

**Status of everything in this file: observed in AIT 5.0.54, unconfirmed live.** The build must confirm each endpoint, payload shape and selector live and record the result in `docs/provider-notes.md` before relying on it (SPEC §0.3). Header and cookie **names** are listed; values never are. Paths are relative to the site origin unless a full URL is shown. AIT's own server endpoints are not listed here (see `ai-toolbox/README.md`, "What lives on the AIT server"); the build never calls them.

Conventions AIT uses on every site: requests the extension makes itself carry `X-Extension-Request: 1` (and on ChatGPT the query flag `s=true`) so its own `webRequest` listeners can tell them apart from the page's traffic. Artifact may adopt a similar marker.

## ChatGPT (`https://chatgpt.com`)

Auth for all `backend-api` calls: `Authorization` (the page's bearer token, captured from the page's own requests, e.g. on `GET /backend-api/settings/user`) and `Chatgpt-Account-Id` (captured from page requests; omitted for personal accounts). Content-Type JSON for bodies.

| Method | Path | Purpose | Request parameters / body | Response fields read | Pagination |
|---|---|---|---|---|---|
| GET | `/backend-api/conversations` | List chats (active and archived) | `offset`, `limit=100`, `order=updated`, `is_archived=true|false` | `items[]`: `id`, `title`, `update_time`, `create_time`, `is_archived` | offset += 100 until a page has < 100 items (cap 10,000) |
| PATCH | `/backend-api/conversations` | (page's own "archive all / delete all") only observed by the background to trigger refresh | — | — | — |
| GET | `/backend-api/conversation/<id>` | Read one chat | `s=true` (AIT marker) | `title`, `create_time`, `update_time`, `default_model_slug`, `is_archived`, `mapping{node: {message, parent}}`, `current_node`; message: `id`, `author.role`, `create_time`, `recipient`, `content.content_type` (`text`, `multimodal_text`, `thoughts`, `reasoning_recap`), `content.parts[]` (strings or objects with `text` / `asset_pointer`), `metadata.model_slug`, `metadata.resolved_model_slug`, `metadata.is_visually_hidden_from_conversation`, `metadata.is_thinking_preamble_message`, `metadata.reasoning_title` | — |
| POST | `/backend-api/conversations/batch` | Read up to 10 chats at once | `{"conversation_ids": [...]}` | array of conversation objects as above | caller batches 10 |
| PATCH | `/backend-api/conversation/<id>` | Archive / unarchive / delete | `{"is_archived": bool}` or `{"is_visible": false}`; delete adds `?content_action=delete&s=true` | status only (404 on delete = already gone) | — |
| POST | `/backend-api/conversation` and `/backend-api/f/conversation` | The page's own send; **observed only** (message sent, stream finished via `onCompleted`) | — | — | — |
| POST | `/backend-api/stop_conversation` | Page's stop; **observed only** (ends chains) | — | — | — |
| GET | `/backend-api/accounts/check/v4-2023-04-27` (fallback `/backend-api/accounts/check/`) | Accounts, workspace vs personal, plan | credentials included | `accounts{key: {account: {account_id, structure, plan_type}}}`, `accounts.default` | — |
| GET | `/backend-api/global/search` | Deep import ID discovery | `query`, `limit=40`, `sources=conversation`, `entrypoint=global_search`, `cursor` | `items[].payload.conversation_id` or `items[].conversation_id`, `cursor`, `source_statuses[].has_more` | cursor |
| GET | `/backend-api/gizmos/snorlax/sidebar` | Projects (and their chats) | `owned_only=true` or `conversations_per_gizmo=20`, `cursor`, `s=true` | `items[].gizmo.gizmo.id` / `items[].gizmo.id`, `display.name`, `display.emoji`, `display.theme`, `cursor` | cursor |
| GET | `/backend-api/gizmos/<gizmoId>/conversations` | Chats in a project | `cursor` (0 first), `s=true` | `items[]` (as list items), `cursor` | cursor |
| GET | `/backend-api/gizmos/bootstrap` | User's GPTs | — | `gizmos[].resource.gizmo`: `id`, `display.name`, `display.description`, `display.profile_picture_url`, `author.display_name`, `vanity_metrics.num_conversations_str`, `short_url`, `updated_at`, `share_recipient` | — |
| GET | `/backend-api/gizmos/search` | GPT search | `q`, `cursor` | `items[].gizmo` (same fields), `cursor` | cursor |
| DELETE | `/backend-api/gizmos/<g-p-…>` | Page deleting a project; **observed only** | — | — | — |
| POST | `/backend-api/gizmos/<g-…>/sidebar` | Page hiding a GPT from sidebar; **observed only** | — | — | — |
| GET | `/backend-api/my/recent/image_gen` | Media gallery | `limit` (16), `after` | `items[]`: `id`, `url` (signed; `se` = expiry), `prompt`, `created_at`, `conversation_id`, seed / generation id; `cursor` | cursor |
| GET | `/backend-api/synthesize` | Read-aloud audio | `message_id`, `conversation_id`, `voice`, `format=aac` | streamed audio body | — |
| GET | `/backend-api/conversation/<id>/attachment/<filePointer>/download` | Download a stored audio/file attachment | — | `status`, `download_url` | — |
| GET | `/backend-api/settings/user` | Page request **observed** by the background to capture the bearer token | — | — | — |

Rate behavior AIT relies on: 429 with `Retry-After` (seconds); AIT backs off 60 s without it.

## Claude (`https://claude.ai`)

Auth: browser session cookies (credentials included). AIT checks for the `sessionKey` cookie name. Organization ID taken from page request URLs or the org list.

| Method | Path | Purpose | Request | Response fields read | Pagination |
|---|---|---|---|---|---|
| GET | `/api/organizations` | List orgs | — | `[]`: `uuid`, `capabilities[]` (contains `chat`) | — |
| GET | `/api/account` | User e-mail and plan tier | — | `email_address` / `email`, `memberships[].organization.uuid`, `memberships[].organization.rate_limit_tier` (`default_claude_ai` = free) | — |
| GET | `/api/organizations/<org>/chat_conversations_v2` | List chats | `limit=100`, `offset`, `consistency=eventual` | array (top level or under `conversations`/`items`/`data`/`results`/`chat_conversations`): `uuid`, `name`, `updated_at`, `project_uuid`, `project.uuid`, `project.name`; `has_more` | offset += 100, ≤ 200 pages |
| GET | `/api/organizations/<org>/chat_conversations/<uuid>` | Read one chat (full tree) | `tree=True`, `rendering_mode=messages`, `render_all_tools=true` | `name`, `chat_messages[]`: `uuid`, `parent_message_uuid`, `sender`, `text`, `content[]` (`type` text / tool_use / tool_result / thinking / redacted_thinking; `text`, `name`, `input`, `content`, `is_error`), `attachments[]` (`file_name`, `extracted_content`), `files[]`/`files_v2[]` (`file_kind`, `preview_asset`/`thumbnail_asset` with `image_width`, `image_height`); `current_leaf_message_uuid` | — |
| GET (HEAD-like) | same path | Ownership probe (status only; body cancelled) | — | status 200 / 404 / 429 | — |
| POST | `/api/organizations/<org>/chat_conversations/delete_many` | Bulk delete | `{"conversation_uuids": [...]}` | `deleted[]`, `failed[]` | — |
| DELETE | `/api/organizations/<org>/chat_conversations/<uuid>` | Page's own delete; **observed only** | — | — | — |
| GET | `/api/organizations/<org>/usage` | Plan usage | — | `limits[]` (`kind`, `percent`, `resets_at`, `severity`, `is_active`, `scope.model.display_name`) or `five_hour` / `seven_day` (`utilization`, `resets_at`) | — |
| POST | `/api/organizations/<org>/chat_conversations/<uuid>/<…>completion` | Page's own send; **observed** (usage counter) and **stream read** by the MAIN-world hook | — | SSE `data:` lines; `message_limit.windows["5h"|"7d"]` (`utilization` 0..1, `resets_at` epoch s, `status`) | — |
| GET | `/api/organizations/<org>/conversations/<uuid>/wiggle/download-file` | Download a file Claude created | `path=<file_path>` | binary | — |

Links: chat `https://claude.ai/chat/<uuid>`, new chat `https://claude.ai/new`, usage settings `https://claude.ai/settings/usage`.

## Gemini (`https://gemini.google.com`, optional `/u/<n>` account prefix)

Transport: `POST /_/BardChatUi/data/batchexecute` (with the `/u/<n>` prefix when present). Query: `rpcids=<id>`, `source-path=<path>`, `bl=<cfb2h>`, `f.sid=<FdrFJe>`, `hl=en`, `_reqid=<incrementing>`, `rt=c`. Body (form): `f.req=<JSON [[[rpcId, payloadJSONString, null, "generic"]]]>&at=<SNlM0e>`. Headers: `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`, `X-Same-Domain: 1`; cookies. Tokens `SNlM0e`, `FdrFJe`, `cfb2h` are regex-read from the app page HTML. Response: strip the `)]}'` prefix, find the `wrb.fr` entry for the RPC, JSON-parse its third element.

| RPC ID | Purpose | Source path | Payload (positions) | Response fields (positions) | Pagination |
|---|---|---|---|---|---|
| `MaZiqc` | List chats | `/search` (or `/gem/<gemId>` for a Gem's chats) | first page: empty array; next: [20, cursor, [0, null, 1]]; Gem: [20, cursor, [null, null, 1, gemId]] | [2] = chats: [0] id (`c_…`), [1] title, [5] = [seconds, nanos]; next cursor at [1] (or first string ≥ 40 chars) | cursor, page size 20 |
| `hNvQHb` | Read a chat | `/app/<id>` or `/gem/<gemId>/<id>` | [id without `c_`, 100000, cursor, 1, [0], [4], null, 1] | [0] = turns (newest first): turn[0][1] turn id; turn[2][0][0] user text; turn[3][0][0][1] model text; turn time = timestamp pair at turn[4]; reply time = timestamp pair in the turn[3][2] entry whose position 3 equals the reply id; [1] = older-page cursor | cursor backwards, ≤ 200 pages |
| `CNgdBe` | List Gems | `/gems/view` | [2, ["en"], 0] | [2] = gems: [0] id, [1][0] name | — |
| `GzXR5e` | Delete chat | `/app` | [`c_<id>`] | — | — |
| `qWymEb` | Delete the chat's activity | `/app` | [`c_<id>`, [1, null, 0, 1]] | — | — |
| `jSf9Qc` | Usage / quota | `/app` | [] | [1] = entries: [1] used fraction, [2] kind (1 current, 2 weekly), [3] reset timestamp pair | — |
| `unqWSc` | "Search" (declared, never called) | — | — | — | — |

The MAIN-world hook also watches page `fetch`/XHR `batchexecute` calls whose `rpcids` include `GzXR5e` to learn about deletions.

Links: `https://gemini.google.com[/u/<n>]/app/<id>`, `…/gem/<gemId>/<id>`, new chat `/app`.

## Grok

### grok.com (`https://grok.com/rest`), cookies
| Method | Path | Purpose | Request | Response fields | Pagination |
|---|---|---|---|---|---|
| GET | `/rest/app-chat/conversations` | List | `pageSize=100`, `pageToken` | `conversations[]`: `conversationId`, `title`, `createTime`, `modifyTime`, `starred`; `nextPageToken` | token, ≤ 1,000 pages |
| GET | `/rest/app-chat/conversations/<id>/response-node` | Response IDs of a chat | — | `responseNodes[].responseId` (or nested `response.responseId`) | — |
| POST | `/rest/app-chat/conversations/<id>/load-responses` | Load messages | `{"responseIds": [...]}` | array or `responses`/`result.responses`/`loadedResponses`/`result`: `responseId`, `message`, `sender`, `createTime`, `isControl` | — |
| GET | `/rest/app-chat/conversations/<id>` | Read metadata (to keep `starred` on rename) | — | `starred` | — |
| PUT | `/rest/app-chat/conversations/<id>` | Rename | `{"title", "starred"}` | — | — |
| DELETE | `/rest/app-chat/conversations/soft/<id>` | Delete | — | — | — |
| POST | `/rest/app-chat/conversations/new`, `/rest/app-chat/conversations/<id>/responses` | Create / send (present in code, **not wired to any feature**) | — | `result.conversation.conversationId` | — |

### x.com / twitter.com (`https://x.com/i/api/graphql/<queryId>/<OperationName>`)
Headers (names): `authorization`, `x-csrf-token` (value from cookie `ct0`), `x-twitter-active-user`, `x-twitter-auth-type`, `x-twitter-client-language`; cookies. GET carries `variables` (and `features`) as query JSON; POST carries `{variables, queryId}`.

| Operation (query ID as hardcoded in AIT) | Method | Purpose | Variables | Response fields | Pagination |
|---|---|---|---|---|---|
| GrokHistory (`9Hyh5D4-WXLnExZkONSkZg`) | GET | List | `cursor` | `data.grok_conversation_history.items[]`: `grokConversation.rest_id`, `title`, `created_at_ms`, `is_pinned`; `cursor` | cursor, ≤ 200 pages, 350 ms apart |
| GrokConversationItemsByRestId (`DGPZeGl8lC0Nvps4afRHHQ`) | GET (+ `features`) | Read | `restId`, `cursor` | `data.grok_conversation_items_by_rest_id.items[]`: `chat_item_id`, `sender_type`, `message`, `created_at_ms`; `cursor` | cursor |
| RenameConversation (`bGjN_WgGMm3ugR5LI9MyAA`), path name `ConversationItem_RenameConversationMutation` | POST | Rename | `conversationId`, `title` | — | — |
| DeleteConversation (`TlKHSWVMVeaa-i7dqQqFQA`), path name `ConversationItem_DeleteConversationMutation` | POST | Delete | `conversationId` | — | — |
| GrokPinnedConversations (`BHKxYTkc5SCupV7oqJBr0g`), GrokPinConversation (`_6czUDKiWzcvBUKMoDZ19w`), GrokUnpinConversation (`-5e798p4EVbuhGGFFuw3Tg`), CreateGrokConversation (`vvC5uy7pWWHXS2aDi1FZeA`) | — | Declared; only Create is called by dead code | — | `data.create_grok_conversation.conversation_id` | — |
| `https://grok.x.com/2/grok/add_response.json` | POST | Send (dead code) | — | — | — |

GraphQL query IDs rotate when X redeploys; treat them as configuration.

Links: `https://grok.com/c/<id>`, `https://x.com/i/grok?conversation=<id>`, new chat `https://grok.com/`.

## Google AI Studio and Tier 2 sites
AIT 5.0.54 has no content script, endpoint, RPC or selector for AI Studio, Perplexity, DeepSeek, Mistral, Kimi, Poe, Microsoft Copilot, GitHub Copilot chat or Google AI Mode. The build must discover these live.

---

## DOM selectors by site

Grouped by purpose. AIT's own injected elements (ids/classes it creates) are omitted.

### ChatGPT
| Purpose | Selectors |
|---|---|
| Sidebar / history nav | `nav[aria-label="Chat history"]`; a `nav` containing `[data-testid="create-new-chat-button"]`; legacy `aside a[data-testid="create-new-chat-button"]` → closest `aside`; `#history`; collapsed rail `#stage-sidebar-tiny-bar`, `[data-testid="open-sidebar-button"]`, `[data-testid="sidebar-toggle-button"]` |
| Sidebar insertion points | `a[data-sidebar-item="true"][href="/codex/cloud"]`, chat links `a[href^="/c/"]`, project links `a[href^="/g/g-p-"]`, `a[href^="/project"]`, `[data-sidebar-item="true"]`, GPT links `a[data-sidebar-item="true"][href^="/g/"]`, expandable section class `group/sidebar-expando-section`, `.trailing`, `button[data-trailing-button]` |
| Chat row options menu (pin / tag / folder items) | `button[data-conversation-options-trigger]`, `div[data-radix-popper-content-wrapper]`, `[role="menu"]`, `[role="menuitem"]`, `[data-testid="share-chat-menu-item"]` |
| Conversation header | `#conversation-header-actions` (with `button[data-testid="conversation-options-button"]` or a menu button), `[data-testid="thread-header-right-actions"]`, `#page-header`, `button[name="project-title"]`, `[data-testid="project-modal-trigger"]`, `[class*="project-unfurl-row"]` |
| Turns and messages | `section[data-testid^="conversation-turn"]`, `[data-message-id]`, `[data-message-author-role]` (`user` / `assistant`), `[data-message-model-slug]`, `div[data-turn-id-container]`, `.markdown.prose`, `.markdown`, `div.whitespace-pre-wrap`, streaming marker `.result-streaming` |
| Message action bar | `[data-testid="copy-turn-action-button"]`, `[data-testid="bad-response-turn-action-button"]`, `[data-testid="voice-play-turn-action-button"]` |
| Composer | `#prompt-textarea` (ProseMirror; `.ProseMirror`, `div#prosemirror-editor-container`, placeholder `div#prompt-textarea p.placeholder`), `form[data-type="unified-composer"]`, `.composer-parent`, send `button[data-testid="send-button"]`, stop `[data-testid="stop-button"]` / `button[aria-label="Stop"]` |
| Main column | `main#main`, `main`, `div.h-full > section > main`, `div.h-full > section > section`, `div[role="presentation"]`, `.sticky.bg-token-main-surface-primary` |
| Model / plan detection | `[data-testid="model-switcher"]`, `button[aria-haspopup="menu"][class*="model"]`, `button[aria-label*="Model"]`, `[role="menuitemradio"][aria-checked="true"]`, upgrade signals `a[href*="upgrade"]`, `button[data-testid="upgrade-button"]`, `[class*="upgrade"]`, `[class*="plan"]`, `[class*="badge"]`; generic scan of visible buttons/menu items/`[data-testid*="model" i]` |
| Math (export / RTL) | `span.katex`, `.katex-display`, `.katex-html`, `annotation[encoding="application/x-tex"]`, `math[display="block"]` |
| React hydration hosts | history nav, a `nav` that has the new-chat button, `header`, `main` |

### Claude
| Purpose | Selectors |
|---|---|
| Sidebar | `nav[aria-label="Sidebar"]`, `aside.dframe-sidebar`, `aside[aria-label="Sidebar"]`, scroller `.dframe-nav-scroll` or `[class*="overflow-y-auto"]`, group label `h2` / `[data-sidebar-group-label]`, compact trigger `[aria-controls="frame-peek-popover"]`, `.df-compact-trigger`, `#frame-peek-popover` |
| Chat rows and their menu | `[data-row-key^="chat:"]` (key `chat:<uuid>`), menu `[role="menuitem"]`, rename item `[data-testid="rename-chat-trigger"]`, danger items have a `menu-danger` class, label `.min-w-0.flex-1.truncate`, icon spans `span[data-cds='Icon']`, portal `[data-base-ui-portal]` |
| Messages | `div[data-test-render-count]`, `[role="article"][aria-posinset]`, action bar `[data-cds="MessageActions"]`, `button[data-testid="action-bar-copy"]`, `[role="toolbar"]`, `[role="group"]`, `[data-message-action-bar]`, design-system buttons `button[data-cds="Button"]` |
| Header | share button `div button[data-testid="wiggle-controls-actions-share"]` (AIT inserts export / bookmarks / move-to-folder buttons beside it) |
| Composer | `[data-testid="chat-input"][contenteditable="true"]` (closest `fieldset` / `form`), send `button[aria-label="Send message" i]`, stop `button[aria-label="Stop response" i]` (or label containing stop) |
| Artifacts in chat | `.group/artifact-block`, its `button[aria-label]` ("View <title>"), `.line-clamp-1` |

### Gemini
| Purpose | Selectors |
|---|---|
| Sidebar | `bard-sidenav`, `expandable-section[data-test-id="chats-expandable-section"]`, `expandable-section[data-test-id="notebooks-expandable-section"]`, chat links `a[href^="/app/"]` / `a[href*="/app/"]`, `gem-nav-list-item` |
| Chat menu (carry forward) | `[data-test-id="share-button"]`, `[data-test-id="pin-button"]`, `gem-menu`, `gem-menu-item`, `button.mat-mdc-menu-item`, `gem-menu-item-content`, labels `.label` / `.gem-menu-item-label`, `[data-test-id="rename-button"]`, `[data-test-id="actions-menu-button"]`, `[data-test-id="more-menu-button"]` |
| Header | `top-bar-actions .right-section`, `conversation-actions-icon`, `[data-test-id="temp-chat-button-container"]`, `[data-test-id="conversation-title"]` |
| Messages | `user-query`, `model-response`, `.conversation-container` / `conversation-container`, action bar `message-actions`, `.buttons-container-v2`, `copy-button`, `[data-test-id="copy-button"]`, `[jslog]` |
| Composer | `rich-textarea`, `.ql-editor[contenteditable="true"]`, `.ql-container`, `.ql-clipboard`, `input-container`, `.input-area-container`, `.text-input-field`, `[data-test-id="clear-button"]`, send `button.send-button` / button with `mat-icon[fonticon='send']`, stop `button.stop-button` / `mat-icon[fonticon='stop']` |
| Theme | `.dark-theme`, `.light-theme` on the document |

### Grok
| Purpose | Selectors |
|---|---|
| Sidebar | `[data-sidebar="sidebar"]`, `[data-sidebar="content"]`, rows `li` / `[data-sidebar="menu-item"]`, chat links `a[href^="/c/"]`; on x.com `button[aria-label="Chat history"]` |
| Messages | `[id^="response-"]`, `[data-testid="assistant-message"]`, `.message-bubble`, `main div[dir]`, `[role="main"] div[dir]`, action bar `.action-buttons`, `button[aria-label=a copy action]`, `button[aria-label="Like"]`, `button[aria-label="Dislike"]`, reasoning toggles (`summary`, `[aria-expanded]`, test IDs or classes containing reason/thought/think) |
| Header area | `div.absolute.inset-x-0.top-0` and its first-level `div.shrink-0.flex-row.items-center` |
| Composer | `.ProseMirror[contenteditable="true"]`, `.tiptap[contenteditable="true"]`, `[role="textbox"][contenteditable="true"]`, `textarea` (x.com), `.query-bar`; send `button[data-testid="grokSendButton"]` (fallbacks: test IDs or aria-labels containing send/submit, `button[type="submit"]`), stop `button[data-testid="grokStopButton"]` (fallbacks containing stop/cancel) |

### Page-load guards used on every site
Not mounted on paths starting with `/login`, `/logout`, `/signup`, `/auth`, `/oauth`, `/magic-link`, `/code`, nor with `?incognito` (Claude) or `?temporary-chat` (ChatGPT). Chat-like paths: ChatGPT `/`, `/c/<id>`, `/g/g-…`, `/g/g-…/project`, `/g/g-…/c/<id>`; Claude `/`, `/new`, `/chat/<id>`, `/artifacts…`; Gemini `/`, `/app`, `/app/<id>`, `/gem/<id>`, `/gem/<id>/<chat>`, `/gems…` (after stripping `/u/<n>`); grok.com `/`, `/c/<id>`, `/project/<id>`; x.com `/i/grok`.
