# Changelog

## [0.2.0] - Tier 1 adapters, meter, side panel, export

- **Structured reads.** A page-world hook copies the conversation the page loads. ChatGPT, Claude, Gemini, AI Studio and Grok adapters normalize it into the archive model, with every branch, attachment, artifact and canvas. Site endpoints and then page text are the fallbacks.
- **Zod guards** on every payload. A changed payload turns health Degraded with the reason.
- **Context meter:**
  - the pill above the composer, the hover breakdown, top-10 heaviest messages, and a growth sparkline;
  - per-message token badges, draft tokens, `≈ exchanges left`;
  - warnings at 75% and 90% with snooze and mute;
  - the `o200k` tokenizer in a worker, with calibration where the site reports its own count.
- **Cited context limits** in `limits.json`, with plan detection for ChatGPT and Claude and user overrides. Unknown limits show as unknown.
- **Usage:** Claude 5-hour and weekly bars, Gemini usage, and the ChatGPT local caps widget with an hourly heatmap.
- **Export:** HTML (MathML, sanitized), DOCX, PDF (print), PNG (1× and 2×) and ZIP bundles with the real files, artifacts (all versions), canvases, and Claude project files. Missing files are reported. Also selected messages, all branches, numbering, a table of contents, Obsidian, a preview tab, and keyboard shortcuts.
- **Side panel** (Dashboard, Export, Settings), an options page, and settings for sites, features, thresholds, plans, limits and export defaults.

## [0.1.0] - Foundation

- New TypeScript, WXT and Preact codebase, restructured from ACE 1.22.0 into a site-agnostic core plus one adapter per site.
- Artifact archive schema v1 (`schemas/artifact-archive-v1.json`): conversation, branch tree, messages, parts, attachments and artifacts. ACE export-v1 compatible fields are included.
- Zod schemas for ChatGPT, Claude, Grok and Google batchexecute payloads.
- Tier 1 adapters (ChatGPT, Claude, Gemini, AI Studio, Grok) that read the open chat from the page.
- Export the open chat as Markdown, text or JSON from the popup or the right-click menu, and copy it as Markdown.
- Per-site health with reasons, Self-test and a diagnostics report.
- CI (typecheck, lint, unit, end-to-end, three browser builds) and a release pipeline for Chrome, Edge and Firefox.
