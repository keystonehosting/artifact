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

## D13 — Tier 2 switches hidden until their adapters ship
Tier 2 sites appear in Settings when their adapters ship in M4. Until then, offering the switch would request a permission that does nothing.

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
