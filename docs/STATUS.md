# Status

**Current milestone:** M0 Foundation complete, released as `v0.1.0` by CI. Next: M1.

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

## In progress
- Nothing.

## Next exact step
- Start M1: set the version to `0.2.0-dev`, then add structured reads (ChatGPT `backend-api`, Claude `chat_conversations`, Grok `load-responses`, Gemini `hNvQHb`, AI Studio `ResolveDriveResource`) behind a page-world fetch hook.

## Blockers
- No browser available to the build session. All live tests are pending (D5).

## Live checks for a separate session (M0)
Run on each Tier 1 site, in an `ARTIFACT test` chat only. Load `.output/chrome-mv3` unpacked.
1. Open an existing `ARTIFACT test` chat. Popup shows the site, a message count and a health dot.
2. Export Markdown, text and JSON. Files open, contain every visible turn in order, and have the right roles.
3. Run Self-test and copy the report. Check that `dom.turns`, `<site>.composer` and `<site>.sidebar` pass. Paste the report into `docs/reports/M0.md`.
4. Right-click on the page → "Artifact: export this chat as Markdown" saves a file.
