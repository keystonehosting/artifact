# Status

**Current milestone:** M4 Export, backup and lifecycle (target `v0.5.0`). `v0.1.0` to `v0.4.0` released.

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
- M3: prompt library with templates, chains, queue, history, right-click prompts, enhancer (current chat), profile, starter pack; wide and speed modes, timeline, collapse, RTL, code and formula copy, auto-continue, drafts and keep-alive, finish alerts; branch map and diff; handoff, `@@` mentions, broadcast and compare (`docs/reports/M3.md`).
- M2: local library, full-text search with filters and findings report, deep scan, cross-site folders (side panel and site sidebar), pins, favorites, tags and Smart Tags, labels, bookmarks, highlights, notes, reminders, find in chat, privacy blur (`docs/reports/M2.md`).

## In progress
- Nothing yet in M4.

## Next exact step
- Start M4:
  1. set the version to `0.5.0-dev`;
  2. bulk export of many chats (every format) with streaming ZIP, pacing, retries, stop-and-keep-partial; folder and project export mirroring the tree;
  3. auto-backup to a chosen folder (File System Access API), Deep Import of the official ChatGPT, Claude and Gemini exports, restore of Artifact archives and settings;
  4. Artifact Vault (sandboxed previews, Mermaid), Media Gallery, Snippet Vault; bulk actions with guardrails and auto-archive rules; Tier 2 adapters and their Settings switches.

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

### M2 (per Tier 1 site unless noted)
1. **Stored on open.** Open two `ARTIFACT test` chats. Side panel → Search → Library index shows them as Known and Searchable. Search a word from an edited (inactive) branch; the chat is found.
2. **Deep scan.** Search tab → Scan full history. Progress moves, typing in the composer pauses it, Stop then Resume continues without re-fetching. A second scan after it finishes fetches 0 unless a chat changed. Note the site's listing page size in `docs/provider-notes.md`.
3. **Sidebar tree** (ChatGPT, Claude, Gemini, Grok). The Folders block sits at the top of the site's sidebar, doesn't hide site controls, survives a chat switch and a sidebar collapse/expand, and follows the site's theme. Drag a chat from the site's own list onto a folder: it appears under that folder. If nothing happens, record what the drag carries (`docs/provider-notes.md`, "Sidebar chat links").
4. **Folders in the side panel.** Create nested folders, drag one into another, try dropping a parent into its child (refused with a message), change color and sort, pin and star, delete a middle folder (its chats and subfolders move up).
5. **Import projects** (ChatGPT, Claude, Gemini Gems if listed). Folders tab → List projects → Import as folders. Each project becomes a folder under the site's folder, holding the stored chats from that project. Running it twice creates nothing new.
6. **Message toolbar.** Hover a reply: bookmark and label buttons appear in the left margin without covering the site's own message actions. Add a yellow bookmark and a red and blue label; they show in Library → Bookmarks / Labels and jump back to the message.
7. **Highlights.** Select text in a reply, pick green. It is painted, survives a reload and a chat switch away and back, and shows in Library → Highlights with a working jump. Firefox below 140: saved but not painted (D16).
8. **Find in chat.** Ctrl/Cmd+Shift+F opens the bar; matches are highlighted and Enter / Shift+Enter step through them; Escape closes. The browser command (set a key in the browser's shortcuts page) toggles it too.
9. **Privacy blur.** Alt+Shift+B blurs the chat list and messages; the Artifact meter and side panel stay readable. Press again to clear.
10. **Notes and reminders.** Dashboard → This chat: write a note, set a reminder two minutes ahead. The notification arrives and clicking it opens the chat.
11. **Search filters and report.** Try role, site, date, folder, tag, exact phrase and exclude. Save findings: the Markdown file lists each chat with bolded matches.

### M3 (per Tier 1 site unless noted)
1. **`//` prompts.** Save a prompt with `{{topic}}` and a `{{tone|formal|*casual}}` choice. In an `ARTIFACT test` chat type `//` and its first letters: the list opens above the composer without covering site controls; Enter opens the form; the result appears in the composer and is not sent. Pasting `//x` does not open the list.
2. **Chains.** A two-step chain (`..`): step 2 goes out only after reply 1 finishes. Pause, resume, stop. Note any site where the send or the "reply finished" detection misfires. (Uses 2 messages per run.)
3. **Queue and history.** While a reply streams, type a second prompt and press Ctrl/Cmd+Shift+Enter; it sends after the reply. In an empty composer, Up brings back the last prompt.
4. **Composer bar.** The bar above the meter shows prompts, chains, enhance and (on a new chat with a profile set) the profile button, without covering the site's own composer buttons. Word count updates while typing.
5. **Enhancer.** Type a rough prompt, pick a preset, send the request in the test chat; when the reply finishes the before/after view opens and "Use enhanced" fills the composer.
6. **Drafts and keep-alive.** Type without sending, reload: the draft returns. Turn the network off in DevTools: the offline notice shows; back online restores the draft if the composer emptied.
7. **Right-click prompts.** Select text on any web page → "Run an Artifact prompt…" → a prompt: a new chat opens on the chosen site with the prompt and selection in the composer, not sent.
8. **Wide, speed, timeline, collapse, RTL.** Wide mode widens the conversation and composer and turns off cleanly; the timeline rail sits at the right edge without covering the scrollbar or site buttons; collapse and Alt+Shift+E work; RTL flips message text but keeps code and math left-to-right.
9. **Copy.** The code copy button sits at the bottom-right of code blocks and does not cover the site's own copy button; double-clicking a rendered formula copies LaTeX.
10. **Auto-continue** (if a site shows a Continue button): turn it on and ask for a reply long enough to stop early; it continues once, at most the set number of times.
11. **Finish alert.** Turn it on, start a long reply, switch tabs: a notification arrives (and a chime if on); clicking it returns to the tab.
12. **Branch map and diff.** Regenerate a reply twice; the Dashboard shows the forks; ticking two replies shows the word diff; clicking a message on the visible branch scrolls to it.
13. **Handoff, all three sites pairs you use.** From a test chat: Local summary → open in another site; the text waits, not sent. Current-chat mode: ask, send, use the reply. From the meter's warning: "Continue in a new chat". Check Cross-AI → Recent handoffs.
14. **`@@`.** In a test chat, `@@` and part of another stored test chat's title inserts its context block.
15. **Broadcast.** Two sites, auto-send off: both tabs open with the prompt waiting; send in each; the compare page fills both columns.
