# Decisions

Each entry: what was decided, why, and what it affects. Newest last.

## D1 — ACE's parsers are not reused (AGPL)
ACE 1.22.0 keeps its site extraction (the "API-first extraction with DOM fallback" in SPEC §1) in the npm package `decant-core`, licensed **AGPL-3.0-only** (checked 2026-10-15, `decant-core@1.16.0` package.json and LICENSE). Bundling it would put the extension under AGPL, so it is treated like GPL code in SPEC §0.2: not used, ideas only. Artifact's adapters and DOM readers are written from scratch. They draw on facts from Loominary and Claude Counter (MIT), the dossier and ACE's MPL code. ACE's own MPL code (formatters, filename patterns, composer injection, i18n, page captures) is reused with notices.

## D2 — Gemini Voyager is GPL-3.0, ideas only
SPEC §1 listed Gemini Voyager as "MIT (confirm)". Its LICENSE file at `e7e470a` is GPL-3.0, and package.json says `GPL-3.0`. Timeline navigation, Mermaid rendering, formula copy and AI Studio folders are therefore built from scratch.

## D3 — context-window-meter and chatgpt-limit-tracker not located
No public repositories with these names could be found (web search, 2026-10-15). Nothing is lifted from them. The ChatGPT active-branch walk (`mapping` / `current_node`) is a short parent-pointer walk implemented in `src/core/model/tree.ts`.

## D4 — One branch, releases cut by CI
The build session may push only to its designated branch, and the session's git proxy rejects tag pushes (HTTP 403, 2026-10-15). So:
- all milestone work lands on the designated branch (the repository's default branch, since the repository was empty), not on one PR per milestone;
- `.github/workflows/release.yml` creates the `v<version>` tag and the GitHub pre-release when a push to the default branch carries a `package.json` version that has no release yet. It still handles a pushed `v*` tag the usual way.

## D5 — Live tests pending
The Claude desktop app's built-in browser is not available to the build session (confirmed by the user, 2026-10-15). Every live test in SPEC §10 is listed as pending in `docs/STATUS.md`. None is marked passed. Facts that need live confirmation (endpoints, payload fields, selectors) are labelled "unconfirmed live" in `docs/provider-notes.md`, and every structured read is guarded by a Zod schema, so a wrong guess shows up as Degraded health, not wrong data.

## D6 — Leak-check scope
- Closed files: everything under `TEMP/artifact/ai-toolbox` and `TEMP/artifact/youraiscroll`, and `TEMP/artifact/userscripts/My Prompt*`. ACE, Loominary and Claude Counter are open source and are not hashed.
- The closed builds bundle open material: DOMPurify, Turndown, CSS frameworks, and the AI sites' own icons and markup. So the check subtracts windows found in the ACE import, in runtime dependencies and in license texts before matching.
- Server hostnames of the closed tools are checked in non-Markdown files only. Docs such as SPEC.md must name them in order to forbid them.
- `docs/parity.md` identifies AI Toolbox strings by hashed ID, never by key or text.

## D7 — Older userscripts not in the upload
`1.zip`'s `tampermonkey_scripts.zip` contains Loominary, My Prompt and Claude Counter only. Auto-Continue, Auto Refresh, KeepChatGPT, Infinity, Widescreen, Model Switcher and chatGPT tools Plus were not included. SPEC lists them as ideas only, so their features are built from SPEC §6E's descriptions.

## D8 — MPL headers on ACE-derived files
ACE's source files carry no per-file MPL header. Artifact adds the MPL Exhibit A header, with a line naming the ACE origin, to every file derived from ACE, and lists them in `THIRD_PARTY_NOTICES.md`.

## D9 — i18n key naming
New message keys use `snake_case` with a module prefix (`export_markdown`, `meter_tooltip`...). This keeps them distinct from ACE's camelCase keys and from AI Toolbox's locale keys, which the leak check blocks.

## D10 — Claude prompt-cache timer not shipped
SPEC §6A allows the cache timer "only if verified live". Claude Counter's timer (MIT, `CACHE_WINDOW_MS`) is a fixed five-minute window counted from the last reply. It is a heuristic, not something the site reports, and no live session is available to check it against. It is not shipped. If a later live session finds a cache-expiry signal in Claude's own payloads, it can be added as an adapter `UsageReport.cacheExpiresAt`.

## D11 — DOCX math stays as TeX
Word's equation format (OMML) has no lossless TeX mapping. DOCX exports keep math as TeX source in a dedicated character style (Cambria Math, italic), so nothing is lost or silently mangled. HTML exports render math as MathML; Markdown keeps `$…$` / `$$…$$`.

## D12 — PDF through the browser's print engine
PDF is rendered locally by opening the chat in Artifact's preview tab and printing it ("Save as PDF"). This gives selectable, vector text and needs no PDF library or server. Exporting many chats to PDF at once (M4) is handled in D15 when that milestone lands.

## D13 — Tier 2 switches appear with their adapters
Tier 2 sites appeared in Settings when their adapters shipped in v0.5.0; before that, a switch would have requested a permission that did nothing. Turning one on requests that site's host access, then registers Artifact's content script there (`scripting.registerContentScripts`); turning it off or revoking access unregisters it.

## D14 — Server-dependent AI Toolbox features skipped
Announcements, launch-site prompts, review requests, discount surveys, team plans, the public leaderboard, payments and every upsell surface (497 of AI Toolbox's 1,965 strings, `docs/parity.md`) need a vendor server or exist to sell a premium plan. Artifact has no server and no paid plan (SPEC §6 "Deliberate skips").

## D16 — Highlights and find paint with the CSS Custom Highlight API
Saved highlights and find-in-chat matches are drawn with `CSS.highlights`, which never edits the site's DOM, so the site's own rendering and React state are untouched. MDN lists the API as Baseline since June 2025 (https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API, checked 2026-10-15). On older browsers in Artifact's range (Firefox 128–139), highlights and matches are still saved, listed and stepped through, but not painted on the page.

## D17 — Deep scan runs in the site tab
The scan calls the site with the user's session, which only the site's own page can do without extra permissions. It runs in the content script, so the tab must stay open; the state is stored after every step (`scan:<site>` in the library), so closing the tab only pauses it and the side panel offers Resume. Chats already stored and unchanged in the site's list are never re-fetched.

## D18 — One search index for every site
MiniSearch holds one document per message (all branches), serialized into the library database after changes. The background is the only writer, so the side panel, popup and content scripts never hold diverging copies. "Rebuild search index" in the Search tab recreates it from stored chats.

## D19 — AI Studio has no sidebar folder tree yet
The AI Studio adapter has no confirmed place in the page for a chat-list sidebar: its sidebar selector (`ms-navbar, nav`) is from the fixture only and unconfirmed live. Mounting there could cover site controls, so `sidebarFolders` stays off for AI Studio until a live session confirms a spot. Its chats appear in folders, search and the library in the side panel. The site sidebar tree runs on ChatGPT, Claude, Gemini and Grok.

## D20 — Features that call an AI API arrive with the AI layer (M5)
The enhancer's API mode with key rotation, the API handoff mode, AI summaries for long `@@` mentions, and "second opinion" all need the provider layer, its first-send disclosure and PII redaction (SPEC §0.4, §6J), which M5 builds. Until then the enhancer works in "current chat" mode, handoffs use Local or current-chat summaries, and long mentions insert a local excerpt (the opening and the latest turns). Nothing in the UI offers an API mode before it works.

## D21 — Mermaid rendering ships with the sandboxed preview (M4)
Rendering Mermaid needs the Mermaid library (several hundred KB) and must not run on the site's page. M4 builds sandboxed iframes for the Artifact Vault; Mermaid diagrams (artifacts, and `mermaid` code blocks in the Snippet Vault) render there, which keeps the content script under its 400 KB budget (SPEC §7).

## D22 — Quick model switch lives in the command palette (M6)
SPEC §6E puts the quick model switch in the command palette, which M6 builds. Model selectors per site are unconfirmed live, so the action ships with the palette and its live checks.

## D23 — Composer actions avoid site class names
Sending is detected by the composer emptying shortly after Enter or a click on the site's send button, not by watching the site's network requests, so it works the same on every site. Auto-continue looks for a visible button labelled "Continue" or "Continue generating" outside Artifact's own UI (English labels only; unconfirmed live). Wide mode lifts the pixel max-width of the containers around the messages and composer instead of targeting class names.

## D24 — End-to-end tests block DNS
Tabs the extension opens can start loading before Playwright's routing attaches to them. The test browser now resolves no host names (`--host-resolver-rules`), so an escaped request fails instead of reaching a real site, and the tests reload such a tab once routing is in place. One test run before this change loaded `https://claude.ai/new` from the network without credentials; nothing was sent.

## D15 — Bulk export offers HTML instead of PDF and PNG
PDF and PNG are made by the browser's print and capture of the preview tab (D12), which needs one dialog per chat. Bulk export writes Markdown, HTML, DOCX, text or JSON; HTML prints to PDF from any browser. Single chats still export to PDF and PNG from the Export tab.

## D25 — Tier 2 sites without confirmed message selectors
The dossier gives message selectors for Perplexity, DeepSeek, Le Chat, Kimi, Poe and Microsoft Copilot (unconfirmed live). It gives none for GitHub Copilot or Google AI Mode, so on those two Artifact inserts prompts, runs the palette and copies, but does not read messages: health says so instead of guessing at the page. Tier 2 chat ids are the page path, which is stable per chat without assuming each site's id format; Google AI Mode has no per-chat URL.

## D26 — What Firefox does differently in M4
Firefox has no extension sandbox pages and no File System Access API. The Artifact Vault there shows HTML and SVG artifacts in a script-less sandboxed frame and Mermaid as source; backups go to Downloads/Artifact Backup only.

## D27 — Deep Import formats come from documented fields only
Google documents the My Activity fields (header, title, time, subtitles, attached files) at https://developers.google.com/data-portability/schema-reference/my_activity (checked 2026-10-15) but not where a Gemini reply's text is kept, so a reply is read only when a record carries a list of HTML items, and each record is imported as one exchange. OpenAI and Anthropic don't publish their export schemas; the importers reuse the ChatGPT and Claude payload schemas (validated with Zod), and Claude messages listed without parent links are chained in order. All three are unconfirmed live and listed in `docs/provider-notes.md`.

## D28 — Scheduled backups to a folder notify instead of writing silently
A folder chosen with the File System Access API can only be written from a page, and the browser may ask again for permission. Scheduled backups to Downloads run in the background; backups to a chosen folder show a notification that opens the backup page and runs it. The offscreen document is not used for this, so it keeps to the purposes it declares.
