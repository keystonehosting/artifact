# Changelog

## [0.1.0] - Foundation

- New TypeScript, WXT and Preact codebase, restructured from ACE 1.22.0 into a site-agnostic core plus one adapter per site.
- Artifact archive schema v1 (`schemas/artifact-archive-v1.json`): conversation, branch tree, messages, parts, attachments and artifacts. ACE export-v1 compatible fields are included.
- Zod schemas for ChatGPT, Claude, Grok and Google batchexecute payloads.
- Tier 1 adapters (ChatGPT, Claude, Gemini, AI Studio, Grok) that read the open chat from the page.
- Export the open chat as Markdown, text or JSON from the popup or the right-click menu, and copy it as Markdown.
- Per-site health with reasons, Self-test and a diagnostics report.
- CI (typecheck, lint, unit, end-to-end, three browser builds) and a release pipeline for Chrome, Edge and Firefox.
