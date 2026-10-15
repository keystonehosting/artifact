# Provider notes

Every site fact Artifact relies on: URL patterns, endpoints, payload fields, RPC IDs and selectors, each with its source and its status.

**Status values**
- **confirmed live (date)**: observed on the live site by a test session.
- **fixture**: present in a page capture under `tests/fixtures/sites` (captured by ACE; capture dates unknown).
- **unconfirmed live**: taken from open-source code (Loominary MIT, Claude Counter MIT, ACE MPL) or from the clean-room dossier (`docs/dossier/`). Not yet seen live by this project.

No fact in this file has been confirmed live yet (see D5 in `docs/decisions.md`). Each structured read is validated by a Zod schema in `src/core/schema/payloads/`, and a mismatch reports Degraded health with the reason.

## ChatGPT (`chatgpt.com`, `chat.openai.com`)

| Fact | Value | Source | Status |
|---|---|---|---|
| Chat URL | `/c/<uuid>`, also `/g/<gizmo>/c/<uuid>` | Loominary; dossier | unconfirmed live |
| Turn element | `[data-message-author-role]` with `data-message-id` | ACE capture | fixture |
| Model per turn | `data-message-model-slug` on assistant turns | ACE capture | fixture |
| User content | `.whitespace-pre-wrap` inside the turn | ACE capture | fixture |
| Assistant content | `.markdown` inside the turn | ACE capture | fixture |
| Model picker | `[data-testid="model-switcher-dropdown-button"]` | ACE capture | fixture |
| Composer | `#prompt-textarea[contenteditable]` (ProseMirror) | ACE `platform-inputs.js` | unconfirmed live |
| Send / stop | `button[data-testid="send-button"]` / `button[data-testid="stop-button"]` | common knowledge of the page | unconfirmed live |
| Access token | `GET /api/auth/session` → `accessToken` | Loominary | unconfirmed live |
| Conversation | `GET /backend-api/conversation/<id>` with `Authorization: Bearer`, `oai-device-id` (cookie `oai-did`) → `mapping{id:{message,parent,children}}`, `current_node`, `title`, `create_time`, `update_time`, `default_model_slug` | Loominary; dossier | unconfirmed live |
| Message fields | `author.role`, `content.content_type`, `content.parts[]`, `create_time` (epoch s), `metadata.model_slug`, `metadata.attachments[]`, `metadata.is_visually_hidden_from_conversation`, `recipient` | Loominary | unconfirmed live |
| List | `GET /backend-api/conversations?offset&limit=100&order=updated&is_archived=true|false` → `items[]` | Loominary; dossier | unconfirmed live |
| Archive / delete | `PATCH /backend-api/conversation/<id>` with `{"is_archived": bool}` / `{"is_visible": false}` | dossier | unconfirmed live |
| Rename | `PATCH /backend-api/conversation/<id>` with `{"title"}` | the page's own rename request (not in the dossier) | unconfirmed live |
| Plan | `GET /backend-api/accounts/check/v4-2023-04-27` → `accounts{…}.account.plan_type` | dossier | unconfirmed live |
| Files | `GET /backend-api/files/<id>/download` → `download_url`; `sediment://` pointers: `GET /backend-api/conversation/<id>/attachment/<pointer>/download` | dossier; Loominary | unconfirmed live |
| Projects | `GET /backend-api/gizmos/snorlax/sidebar?owned_only=true&cursor` | dossier | unconfirmed live |
| Canvas | assistant message with `recipient` `canmore.create_textdoc` / `canmore.update_textdoc` and JSON `{name,type,content}` / `{updates:[{pattern,replacement,multiple}]}`; tool reply `metadata.canvas.textdoc_id` | the page's payload as commonly documented; not in either dossier | unconfirmed live |
| Page hook | the page's own `GET /backend-api/conversation/<id>` response is copied; its `Authorization` header is reused for Artifact's reads | live-page behavior assumed | unconfirmed live |

## Claude (`claude.ai`)

| Fact | Value | Source | Status |
|---|---|---|---|
| Chat URL | `/chat/<uuid>` | Loominary | unconfirmed live |
| User turn | `[data-testid="user-message"]` | ACE capture | fixture |
| Assistant turn | `.font-claude-response`, Markdown in `.standard-markdown` | ACE capture | fixture |
| Model picker | `[data-testid="model-selector-dropdown"]` | ACE capture | fixture |
| Composer | `div[data-testid="chat-input"][contenteditable]`, `div.tiptap.ProseMirror` | ACE `platform-inputs.js` | unconfirmed live |
| Organizations | `GET /api/organizations` → `[{uuid}]` | Loominary | unconfirmed live |
| Conversation | `GET /api/organizations/<org>/chat_conversations/<id>?tree=True&rendering_mode=messages&render_all_tools=true` → `chat_messages[]` (`uuid`, `sender`, `content[]`, `parent_message_uuid`, `attachments[]`, `files_v2[]`), `current_leaf_message_uuid`, `name`, `model`, `project_uuid` | Loominary; Claude Counter | unconfirmed live |
| Artifacts | `content[]` items `type: "tool_use"`, `name: "artifacts"`, `input.{id,type,title,command,content,language,old_str,new_str}` | Loominary | unconfirmed live |
| List | `GET /api/organizations/<org>/chat_conversations`; v2 paged by `limit`/`offset` with `has_more` | Loominary; dossier (YourAIScroll) | unconfirmed live |
| Projects | `GET /api/organizations/<org>/projects`, `/projects/<id>`, `/projects/<id>/docs` | Loominary | unconfirmed live |
| Memory | `GET /api/organizations/<org>/memory` | Loominary | unconfirmed live |
| Usage | `GET /api/organizations/<org>/usage` → `five_hour`, `seven_day` with `utilization` (0–100), `resets_at`; or `limits[]` (`kind`, `percent`, `resets_at`, `is_active`) | Claude Counter; dossier | unconfirmed live |
| Live usage | completion stream `data:` frame `{"type":"message_limit","message_limit":{"windows":{"5h"|"7d":{"utilization":0–1,"resets_at":epoch s}}}}` | Claude Counter; dossier | unconfirmed live |
| Plan | `GET /api/account` → `memberships[].organization.rate_limit_tier` (`default_claude_ai` = Free) | dossier | unconfirmed live |
| Created files | `GET /api/organizations/<org>/conversations/<id>/wiggle/download-file?path=` | dossier | unconfirmed live |
| File tools | `tool_use` names `create_file` (`path`, `file_text`), `str_replace` (`path`, `old_str`, `new_str`), `present_files` (`filepaths[]`) | the page's payload as commonly documented | unconfirmed live |
| Delete | `DELETE /api/organizations/<org>/chat_conversations/<id>` (page's own) | dossier | unconfirmed live |
| Org | cookie `lastActiveOrg`, else `/api/organizations` | Claude Counter; Loominary | unconfirmed live |

## Gemini (`gemini.google.com`)

| Fact | Value | Source | Status |
|---|---|---|---|
| Chat URL | `/app/<id>`, `/gem/<gemId>/<id>`; RPCs use the `c_<id>` form | dossier (YourAIScroll) | unconfirmed live |
| Turns | `user-query` / `model-response`; user text `.query-text`; reply `message-content .markdown` | ACE capture; dossier | fixture |
| Math | `span.math-inline[data-math]`, `.math-block[data-math]` | dossier | unconfirmed live |
| Composer | `rich-textarea div.ql-editor[contenteditable]` | ACE `platform-inputs.js` | unconfirmed live |
| Send | `button.send-button`, `aria-label="Send message"` | ACE capture | fixture |
| Model picker | `[data-test-id="bard-mode-menu-button"]` | ACE capture | fixture |
| Sidebar | `[data-test-id="chat-history-container"]` | ACE capture | fixture |
| batchexecute | `POST /_/BardChatUi/data/batchexecute?rpcids&source-path&hl&_reqid&rt=c&bl&f.sid`, body `f.req`, `at`; page tokens `SNlM0e` (at), `cfb2h` (bl), `FdrFJe` (f.sid) | dossier | unconfirmed live |
| Read RPC | `hNvQHb`, args `[<c_id>, 1000, null, 1, [1], [4], null, 1]`; turns newest first; user text `[2][0][0]`; candidates `[3][0][]` | dossier; ACE capture of a response | fixture (shape), unconfirmed live (args) |
| List RPC | `MaZiqc`, first page `[]`, next `[20, cursor, [0, null, 1]]`; rows `[2]`: `[0]` id, `[1]` title, `[2]` pinned, `[5]` `[s, ns]`; cursor `[1]` | dossier (both tools) | unconfirmed live |
| Gems | `CNgdBe` `[2, ["en"], 0]` → `[2]` rows: `[0]` id, `[1][0]` name | dossier | unconfirmed live |
| Delete | `GzXR5e` `[c_id]` | dossier | unconfirmed live |
| Usage | `jSf9Qc` `[]` → `[1]` rows: `[1]` fraction, `[2]` kind (1 current, 2 weekly), `[3]` reset `[s, ns]` | dossier | unconfirmed live |
| Reply drafts | `turn[3][0][]` drafts `[rcId, [text], …]`; chosen draft id `turn[3][3]`; model label `turn[3][21]`; turn time `turn[4]` `[s, ns]` | ACE capture | fixture |

## Google AI Studio (`aistudio.google.com`)

| Fact | Value | Source | Status |
|---|---|---|---|
| Chat URL | `/prompts/<id>`; `/prompts/new_chat` is a new chat | dossier | unconfirmed live |
| Turn element | `ms-chat-turn`, role on `.chat-turn-container.user/.model` or `[data-turn-role]`, content `.turn-content` | page structure as described by Loominary's DOM handling | unconfirmed live (synthetic fixture only) |
| Title | `ms-toolbar h1`, `.toolbar-left h1` | dossier | unconfirmed live |
| Read RPC | `POST https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/ResolveDriveResource`, body `["<promptId>"]`, `content-type: application/json+protobuf`, `authorization: SAPISIDHASH`; title `[0][4][0]`, chunks `[0][13][0][]` (text `[0]`, role `[8]`, thought `[19]`) | dossier; Loominary intercepts the same response | unconfirmed live |
| List RPC | `ListPrompts`, body `[]`; rows `[0][]`: `[0]` `prompts/<id>`, `[4][0]` title, `[4][4][0]` seconds | dossier | unconfirmed live |
| Token count | the page's own "used / limit" token counter, found by its text pattern next to a "Token" label (no class names relied on) | page behavior | unconfirmed live |
| Inline images | data URLs or `[mimeType, base64]` pairs inside a chunk | heuristic | unconfirmed live |

## Grok (`grok.com`)

| Fact | Value | Source | Status |
|---|---|---|---|
| Chat URL | `/c/<uuid>`, `/project/<pid>?chat=<id>` | dossier | unconfirmed live |
| Turns | `[data-testid="user-message"]`, `[data-testid="assistant-message"]` inside `[id^="response-"]` | ACE capture | fixture |
| Model picker | `#model-select-trigger` | ACE capture | fixture |
| Response tree | `GET /rest/app-chat/conversations/<id>/response-node?includeThreads=true` → `responseNodes[]` (`responseId`, `parentResponseId`, `sender`) | Loominary | unconfirmed live |
| Responses | `POST /rest/app-chat/conversations/<id>/load-responses` `{responseIds}` → `responses[]` (`message`, `sender`, `createTime`, `model`, `thinkingTrace`, `generatedImageUrls`, `imageAttachments`, `fileAttachments`, `webSearchResults`) | Loominary | unconfirmed live |
| List | `GET /rest/app-chat/conversations?pageSize&pageToken` → `conversations[]`, `nextPageToken` | Loominary; dossier | unconfirmed live |
| Rename | `PUT /rest/app-chat/conversations/<id>` `{title, starred}` | dossier | unconfirmed live |
| Delete | `DELETE /rest/app-chat/conversations/soft/<id>` | dossier | unconfirmed live |
| Generated images | `generatedImageUrls[]` paths on `https://assets.grok.com/` | Loominary | unconfirmed live |

## Library features (v0.3.0)

Facts the folder tree, deep scan and project import rely on. All are unconfirmed live.

| Fact | Value | Source | Status |
|---|---|---|---|
| Sidebar mount point | first child of the site's sidebar element: ChatGPT `nav[aria-label="Chat history"], #history, nav`; Claude `nav[aria-label="Sidebar"], nav`; Gemini `[data-test-id="chat-history-container"], bard-sidenav, side-navigation-v2`; Grok `[data-sidebar="sidebar"], nav` (`src/adapters/selectors.ts`) | ACE captures (Gemini); page structure as commonly seen (others) | fixture (Gemini), unconfirmed live (others) |
| Sidebar chat links | each chat in the site's list is an `<a href>` to the chat URL, so dragging it gives the URL in `text/uri-list` | browser default for links | unconfirmed live |
| Chat in a project | ChatGPT list item `gizmo_id`; Claude list item `project_uuid` → `projectId`, matched against the project list ids on import | dossier; Loominary | unconfirmed live |
| Deep scan listing | each adapter's `listChats` pages (ChatGPT 100 per page; others as in the sections above), compared by `updatedAt` to find changed chats | as above | unconfirmed live |

## Chat experience and cross-AI (v0.4.0)

| Fact | Value | Source | Status |
|---|---|---|---|
| New-chat URLs | ChatGPT `https://chatgpt.com/`, Claude `https://claude.ai/new`, Gemini `https://gemini.google.com/app`, AI Studio `https://aistudio.google.com/prompts/new_chat`, Grok `https://grok.com/` (`src/core/sites/sites.ts`) | dossier (handoff targets); ACE | unconfirmed live |
| Send detection | composer empties within 400 ms of Enter or a click on the site's send button | Artifact's own approach (D23) | fixture |
| Continue button | visible button labelled "Continue" or "Continue generating" | common page wording | unconfirmed live |
| Session expiry | a same-origin response with status 401 to the page's own request | HTTP semantics | unconfirmed live |
| KaTeX source | `.katex annotation[encoding="application/x-tex"]` | KaTeX's MathML output | unconfirmed live per site |

## Official data exports (Deep Import, v0.5.0)

| Fact | Value | Source | Status |
|---|---|---|---|
| ChatGPT export | `conversations.json`: an array of conversations with `title`, `create_time`, `mapping` (node tree), `current_node`, `conversation_id` | OpenAI community forum and third-party guides; no official schema | unconfirmed live |
| Claude export | `conversations.json`: an array with `uuid`, `name`, `chat_messages[]` (`sender` human/assistant, `text`, `created_at`) | third-party guides; no official schema | unconfirmed live |
| Gemini (Takeout) | My Activity › Gemini Apps › `MyActivity.json` (JSON when chosen under "Multiple formats"); records with `header`, `title`, `time`, `subtitles`, `attachedFiles` | Google data-portability My Activity schema reference (fields); third-party guides (path) | fields documented; Gemini specifics unconfirmed live |

## Tier 2 page selectors (v0.5.0)

All from `docs/dossier/my-prompt/README.md`; none confirmed live. Message text selectors are inside each message element.

| Site | User message / text | Assistant message / text | Composer | Send |
|---|---|---|---|---|
| Perplexity | `div.group\/user-bubble` / `div.bg-subtle span.whitespace-pre-line` | `div[data-workflow-final-text]` / `div.prose[data-renderer="lm"]` | `#ask-input` | `button.bg-button-bg` |
| DeepSeek | `.ds-message:not(:has(.ds-markdown)) > div:first-child` | `.ds-message:has(.ds-markdown)` / `.ds-markdown` | `textarea.ds-scroll-area` | Enter |
| Le Chat | `div[data-message-author-role="user"] .rounded-3xl` / `.select-text span` | `div:has(>[data-testid="text-message-part"])` / `[data-testid="text-message-part"]` | `div.ProseMirror[contenteditable="true"]` | Enter |
| Kimi | `.chat-content-item-user .segment-content` / `.user-content` | `.segment-assistant .segment-content-box` / `.markdown` | `div.chat-input-editor[contenteditable="true"]` | Enter |
| Poe | `.Message_rightSideMessageBubble__ioa_i` / `.Message_selectableText__SQ8WH` | `.Message_leftSideMessageBubble__VPdk6` / same | `textarea[class*="GrowingTextArea_textArea"]` | `button[data-button-send="true"]` |
| Microsoft Copilot | `div:has(> div[data-content="user-message"])` / `div[data-content="user-message"]` | `div[data-testid="ai-message"]` / `div[id*="-content-"]` | `#userInput`, `textarea[data-testid="composer-input"]` | `button[data-testid="submit-button"]` |
| GitHub Copilot | none known (D25) | none known | generic contenteditable or textarea | Enter |
| Google AI Mode | none known (D25) | none known | `textarea.ITIRGe` | `button[data-xid="input-plate-send-button"]` |
