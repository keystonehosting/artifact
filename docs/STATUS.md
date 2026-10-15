# Status

**Current milestone:** M2 Organize and search (target `v0.3.0`). `v0.1.0` and `v0.2.0` released.

## Done
- Private references in `keystonehosting/TEMP` under `artifact/`.
- `docs/SPEC.md`, `AGENTS.md`, `CLAUDE.md`, leak-check pre-push hook (`scripts/leak-check.mjs`, `scripts/install-hooks.sh`).
- Analyst pass: AI Toolbox, YourAIScroll and My Prompt dossier in `docs/dossier/` (leak-checked; verbatim UI phrases paraphrased).
- ACE 1.22.0 imported at `671dfc8` (commit "Import ACE 1.22.0 source"), then restructured into `src/core` + `src/adapters` (TypeScript, WXT, Preact).
- Archive schema v1 (Zod + `schemas/artifact-archive-v1.json`, kept in sync by a test).
- Zod payload schemas: ChatGPT, Claude, Grok, batchexecute envelope.
- Tier 1 adapters with DOM fallback reading, composer fill, streaming and navigation detection, health and Self-test.
- Popup: export Markdown / text / JSON, copy Markdown, Self-test report. Right-click "export as Markdown".
- CI (`.github/workflows/ci.yml`) and the release pipeline (`release.yml`).
- Docs: README, PRIVACY, SECURITY, CONTRIBUTING, CHANGELOG, THIRD_PARTY_NOTICES, architecture, adding-a-site, decisions (D1–D9), provider-notes, permissions.

- M1: Tier 1 structured adapters, health, meter and usage, export in every format with real files, side panel, settings (`docs/reports/M1.md`).

## In progress
- Nothing yet in M2.

## Next exact step
- Start M2:
  1. set the version to `0.3.0-dev`;
  2. add the Dexie database (`src/core/db`) for conversations, folders, tags, labels, bookmarks, highlights and notes;
  3. index each conversation the user opens (from the content script, through the background);
  4. add MiniSearch full-text search with the deep scan.

## Blockers
- No browser available to the build session. All live tests are pending (D5).

## Live checks for a separate session

Run in an `ARTIFACT test` chat only, at most 15 messages per site per milestone. Load the unpacked build from `.output/chrome-mv3` (`pnpm build`). Record results and Self-test reports in `docs/reports/M#.md`, and every confirmed fact in `docs/provider-notes.md`.

### M0
1. Open an existing `ARTIFACT test` chat. The popup shows the site, a message count and a health dot.
2. Export Markdown, text and JSON. The files contain every visible turn, in order, with the right roles.
3. Run Self-test and copy the report. Check that `dom.turns`, `<site>.composer` and `<site>.sidebar` pass.
4. Right-click on the page → "Artifact: export this chat as Markdown" saves a file.

### M1 (per Tier 1 site)
1. **Data source.** Open an `ARTIFACT test` chat. The side panel Dashboard's data source reads "page data" (or "site API"), not "page text". If it says page text, copy the Self-test report: the failing check names the payload field that changed.
2. **Branches.** Edit one prompt and regenerate one reply, then reload. Dashboard → Branches is greater than 1. Export with "All branches" contains both versions.
3. **Meter.**
   - The pill sits above the composer and doesn't cover any site control.
   - The hover card shows the breakdown, the model and the limit with its source link.
   - Typing changes the draft count.
   - On a 20+ exchange chat, the meter appears within one second of the page settling.
4. **Plan and limit.**
   - ChatGPT and Claude: check `chatgpt.plan` / `claude.plan` in Self-test and that the limit matches `limits.json`.
   - Gemini: pick the plan in Settings.
   - AI Studio: the limit reads "reported by the site", and after a few replies the `≈` calibration factor is stored (`chrome.storage.local` → `calibration.google`).
5. **Usage.** Claude: the 5-hour and weekly bars match claude.ai/settings/usage. Gemini: usage shows, or `gemini.usage` fails with a reason. ChatGPT: add a cap; sending one message increments it.
6. **Files and artifacts (must pass).** In the test chat, upload a small PDF and ask for:
   - one artifact (Claude), one canvas (ChatGPT) or one image (Gemini, Grok);
   - one created file (Claude).

   Export Markdown. The ZIP contains `files/<your PDF>` byte-identical to the upload, the artifact or canvas under `artifacts/` with older versions under `artifacts/versions/`, and the generated image under `files/`. Note anything listed in `MISSING_FILES.txt` and why.
7. **Formats.** HTML opens offline with math rendered. DOCX opens in Word or LibreOffice with headings, code and images. PDF prints from the preview. PNG 2× saves.
8. **Streaming.** While a reply streams, the meter doesn't flicker. It updates within about 2 s after the reply ends.
9. **Chat switching.** Switching chats in the sidebar updates the meter and Dashboard without a reload.
10. **Health degradation.** In DevTools, block the request URL `*backend-api/conversation*` (or the site's equivalent) and reload. Health turns Degraded with the reason, and export still works from page text, labelled approximate.
11. **Shortcuts.** Alt+Shift+C copies Markdown; Alt+Shift+P opens the preview.
