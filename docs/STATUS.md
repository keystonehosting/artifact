# Status

**Current milestone:** M0 Foundation (target `v0.1.0`). Package version `0.1.0-dev` (development versions are never released).

## Done
- Private references in `keystonehosting/TEMP` under `artifact/`.
- `docs/SPEC.md`, `AGENTS.md`, `CLAUDE.md`, leak-check pre-push hook (`scripts/leak-check.mjs`, `scripts/install-hooks.sh`).
- Analyst pass, part 1: YourAIScroll and My Prompt dossier (`docs/dossier/youraiscroll/`, `docs/dossier/my-prompt/`, `docs/dossier/endpoints-youraiscroll.md`).
- ACE 1.22.0 imported at `671dfc8` (commit "Import ACE 1.22.0 source"), then restructured into `src/core` + `src/adapters` (TypeScript, WXT, Preact).
- Archive schema v1 (Zod + `schemas/artifact-archive-v1.json`, kept in sync by a test).
- Zod payload schemas: ChatGPT, Claude, Grok, batchexecute envelope.
- Tier 1 adapters with DOM fallback reading, composer fill, streaming and navigation detection, health and Self-test.
- Popup: export Markdown / text / JSON, copy Markdown, Self-test report. Right-click "export as Markdown".
- CI (`.github/workflows/ci.yml`) and the release pipeline (`release.yml`).
- Docs: README, PRIVACY, SECURITY, CONTRIBUTING, CHANGELOG, THIRD_PARTY_NOTICES, architecture, adding-a-site, decisions (D1–D9), provider-notes, permissions.

## In progress
- Analyst pass, part 2: AI Toolbox dossier (`docs/dossier/ai-toolbox/`, `docs/dossier/endpoints.md`), running as an isolated subagent.

## Next exact step
- When the AI Toolbox dossier lands: run the leak check, commit it, write `docs/reports/M0.md`, set the version to `0.1.0` and push, so CI cuts the `v0.1.0` pre-release. Then start M1 with structured reads (ChatGPT `backend-api`, Claude `chat_conversations`, Grok `load-responses`, Gemini `hNvQHb`, AI Studio `ResolveDriveResource`).

## Blockers
- No browser available to the build session. All live tests are pending (D5).

## Live checks for a separate session (M0)
Run on each Tier 1 site, in an `ARTIFACT test` chat only. Load `.output/chrome-mv3` unpacked.
1. Open an existing `ARTIFACT test` chat. Popup shows the site, a message count and a health dot.
2. Export Markdown, text and JSON. Files open, contain every visible turn in order, and have the right roles.
3. Run Self-test and copy the report. Check that `dom.turns`, `<site>.composer` and `<site>.sidebar` pass. Paste the report into `docs/reports/M0.md`.
4. Right-click on the page → "Artifact: export this chat as Markdown" saves a file.
