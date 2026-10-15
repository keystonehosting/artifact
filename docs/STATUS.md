# Status

**Current milestone:** M0 Foundation (target `v0.1.0`)

## Done
- Private references unpacked to `keystonehosting/TEMP` under `artifact/` (ai-toolbox, youraiscroll, ace-build, userscripts).
- `docs/SPEC.md`, `AGENTS.md`, `CLAUDE.md`, this file.
- Leak check `scripts/leak-check.mjs` with pre-push hook installer `scripts/install-hooks.sh`; verified it blocks a planted 200-character slice of a closed file and a planted closed-reference hostname.

## In progress
- Analyst pass (isolated subagent) writing `docs/dossier/`.

## Next exact step
- Run the analyst pass, then start M0: import ACE source from a pinned commit.

## Blockers
- The Claude desktop app's built-in browser is not available to this build session. Every live test is pending and must run in a separate session or through the user's Self-test reports.

## Live tests pending
- All of SPEC §10's live matrix, on every Tier 1 site. Nothing has been tested live.
