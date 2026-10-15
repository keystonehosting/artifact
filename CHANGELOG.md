# Changelog

## [0.4.0] - Prompts, chat experience and cross-AI

- **Prompt library** with `{{variables}}`: text with defaults and hints, single and multiple choice with an "Other" box, hidden and fixed values, file slots, date, time and selection (`docs/prompts.md`). Categories, favorites, pins, use counts, prompt of the day from your own library, import and export, and files attached to a prompt every time it is used.
- **`//` prompts, `..` chains and `@@` mentions** in every Tier 1 composer, with keyboard navigation. Pasted text never triggers them.
- **Chains** with per-step "continue when the reply ends" or "wait for me", pause, stop and retry; a **send queue** (Ctrl/Cmd+Shift+Enter or the side panel); **prompt history** on Up and Down; **right-click prompts** on selected text on any page.
- **Enhancer** in "current chat" mode with editable presets and a before/after word diff.
- **44 starter prompts** from a CC0 collection, with the source and commit recorded.
- **Universal profile** inserted into a new chat with one click.
- **Chat experience:** wide mode with adjustable width, speed mode for long chats, a timeline rail, collapsible messages (Alt+Shift+E for all), right-to-left text, a word and character counter, copy buttons on code blocks, double-click to copy a formula's LaTeX, auto-continue (off by default), draft autosave per chat, offline and expired-session notices, and an alert when a long reply finishes in a background tab.
- **Branch map and diff** of every edit and regeneration on the Dashboard.
- **Handoff** to a new chat on any site, from a Local summary (goal, constraints, decisions, recent code, latest exchanges, within a token budget) or a summary the current chat writes; also from the meter's warning. The text waits in the new chat's composer; sending automatically is opt-in. The last 20 handoffs are kept.
- **Broadcast** one prompt to several sites, with a side-by-side compare page.
- Fixes: the first read of a chat waits briefly for the page's own request instead of fetching it again; settings changed while a page is loading are no longer missed.

## [0.3.0] - Organize and search

- **Local library.** Every chat you open is stored and indexed in this browser (IndexedDB), with every branch. A page-text read never replaces a fuller copy from the site's own data.
- **Deep scan** of a site's full history from the side panel: incremental, resumable, paced by the site rate limiter, and paused while you type or a reply streams.
- **Full-text search** across all sites, grouped by site with highlighted matches. Filters for site, role, model, date range, folder, tag, exact phrase and titles only, plus a must-include / exclude panel with all/any. Results jump to the message. Findings save as a Markdown report.
- **Find in chat** (Ctrl/Cmd+Shift+F or the browser command) highlights every match and steps through them.
- **Folders:** nested to any depth, holding chats from every site, with colors, counts, sorting (recent, A–Z, Z–A, manual), pins, stars, breadcrumbs and drag and drop. The tree also sits at the top of each site's own sidebar, where chat links dragged from the site's list are filed. Projects import as folders in one click.
- **Pinned chats** and **favorite assistants** (GPTs, Gems, projects).
- **Tags and Smart Tags:** manual tags, built-in keyword rules, custom rules, and a cross-site tag view.
- **Message labels and bookmarks** from a margin toolbar on every message, **highlights** on selected reply text (drawn without changing the page), **chat notes**, and **continue-later reminders** with a browser notification.
- **Privacy blur** (Alt+Shift+B or the browser command) blurs chat titles and content for screen sharing.
- **Side panel:** Folders, Search and Library tabs, and a "This chat" card on the Dashboard.

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
