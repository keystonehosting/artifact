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
| List | `GET /backend-api/conversations?offset&limit&order=updated` → `items[]` | Loominary; dossier | unconfirmed live |

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
| Usage | `GET /api/organizations/<org>/usage` → `five_hour`, `seven_day` with `utilization`, `resets_at` | Claude Counter | unconfirmed live |

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
| List RPC | `MaZiqc` | dossier (both tools) | unconfirmed live |

## Google AI Studio (`aistudio.google.com`)

| Fact | Value | Source | Status |
|---|---|---|---|
| Chat URL | `/prompts/<id>`; `/prompts/new_chat` is a new chat | dossier | unconfirmed live |
| Turn element | `ms-chat-turn`, role on `.chat-turn-container.user/.model` or `[data-turn-role]`, content `.turn-content` | page structure as described by Loominary's DOM handling | unconfirmed live (synthetic fixture only) |
| Title | `ms-toolbar h1`, `.toolbar-left h1` | dossier | unconfirmed live |
| Read RPC | `POST https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/ResolveDriveResource`, body `["<promptId>"]`, `content-type: application/json+protobuf`, `authorization: SAPISIDHASH`; title `[0][4][0]`, chunks `[0][13][0][]` (text `[0]`, role `[8]`, thought `[19]`) | dossier; Loominary intercepts the same response | unconfirmed live |
| List RPC | `ListPrompts`, body `[]` | dossier | unconfirmed live |

## Grok (`grok.com`)

| Fact | Value | Source | Status |
|---|---|---|---|
| Chat URL | `/c/<uuid>`, `/project/<pid>?chat=<id>` | dossier | unconfirmed live |
| Turns | `[data-testid="user-message"]`, `[data-testid="assistant-message"]` inside `[id^="response-"]` | ACE capture | fixture |
| Model picker | `#model-select-trigger` | ACE capture | fixture |
| Response tree | `GET /rest/app-chat/conversations/<id>/response-node?includeThreads=true` → `responseNodes[]` (`responseId`, `parentResponseId`, `sender`) | Loominary | unconfirmed live |
| Responses | `POST /rest/app-chat/conversations/<id>/load-responses` `{responseIds}` → `responses[]` (`message`, `sender`, `createTime`, `model`, `thinkingTrace`, `generatedImageUrls`, `imageAttachments`, `fileAttachments`, `webSearchResults`) | Loominary | unconfirmed live |
| List | `GET /rest/app-chat/conversations?pageSize&pageToken` → `conversations[]`, `nextPageToken` | Loominary; dossier | unconfirmed live |
