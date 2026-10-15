# YourAIScroll 1.9.9 — share links, temporary and private chats

Observed in YourAIScroll 1.9.9, unconfirmed live. "Share-link handling" in YourAIScroll means: when the user is *viewing* a public share page (or an ephemeral chat that has no server-side ID), the exporter detects it from the URL and switches to a reader that works for that page. It never creates, lists, revokes or opens share links, and it does not handle share URLs in batch mode.

## Per site

| Site | URL form detected | Detection | How it is read | Title | Conversation time |
|---|---|---|---|---|---|
| ChatGPT | `/share/<id>` (hex + dashes, case-insensitive) | path regex | **DOM** of the share page (`[data-message-author-role]`, `.markdown` / prose) | document title, site suffix stripped | `create_time` from GET `/backend-api/share/<id>` (credentials included, JSON accept); falls back to a time element in the DOM |
| ChatGPT | temporary chat `?temporary-chat=true` | query parameter | DOM, same selectors | fixed "temporary chat" label | time element near the first user turn, else page load time (`performance.timeOrigin`) |
| Claude | `/share/<id>` | path regex | **DOM** (`[data-test-render-count]` turns, `[data-testid="user-message"]`, `.font-claude-response` / `[data-is-streaming]`) | document title | none (export time only; DOM extractor stamps "now" internally but the text header does not use it) |
| Claude | incognito chat `?incognito` (empty or `true`) | query parameter | DOM, same selectors | fixed "incognito chat" label | none |
| Grok | `/share/<id>` | path regex | **API**: GET `https://grok.com/rest/app-chat/share_links/<id>` (credentials), cached per page load; same message parser as normal chats (`responses[]`, citation cards) | `conversation.title` from the share payload, else document title | first message `createTime` |
| Grok | private chat: path `/c` exactly, or `/` with message bubbles on screen | path + DOM probe | DOM (`.message-bubble` inside `[id^="response-"]`) | fixed a private-chat state label | none |
| Gemini | `/share/<id>` | no conversation ID can be derived from the path, so the API path is skipped | DOM; adds share-viewer selectors (`share-turn-viewer message-content`, `.share-viewer_chat-container message-content`) when `share-viewer` is present | document title without the " - Google Gemini" suffix | none |
| Perplexity | `/search/<slug>` (own or shared thread) | path regex | API `rest/thread/<slug>` first (works for public threads the API serves), DOM fallback | first entry's `thread_title` | first entry time |
| Copilot | `/chats/<id>`; `/chats/new` and `/chats/temporary` are excluded | path regex | API when an ID exists; otherwise DOM | API `title` or header `h1` or a generated "Copilot Chat <first 8 chars>" label | API `createdAt` or earliest message |
| Others (DeepSeek, Kimi, Mistral, Poe, AI Studio, GitHub Copilot, Google AI) | no share-specific handling | — | normal path; a share URL without a recognisable chat ID falls through to DOM (where a DOM reader exists) or fails | — | — |

## Behavior details worth keeping

- **ChatGPT share time trick:** the share page's content is read from the DOM but the share API is still called just for `create_time`, so the export header can show when the shared conversation was created.
- **Grok share cache:** the share payload is cached in memory per page, so the title lookup and the export do not fetch twice.
- **Ephemeral chats are labelled explicitly** (temporary / incognito / private) because their document titles are generic.
- In DOM mode, nothing outside the visible rendered transcript is captured (no artifacts side panel, no hidden branches, no attachments). Gemini and DeepSeek virtualise or lazy-load long transcripts, so DOM exports of long share pages can be incomplete; only Poe and Google AI Mode actively scroll to load everything.

## Gaps Artifact should cover

- Claude share pages are read from the DOM only. Whether a JSON endpoint serves share snapshots is not observable from this build; check live before relying on one.
- Gemini share pages: no API path. DOM only.
- No handling of DeepSeek, Kimi, Mistral or Poe share URLs.
- No "import from a share URL into my archive" from another page; the user must open the share page itself.
