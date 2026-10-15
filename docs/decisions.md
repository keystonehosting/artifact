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
