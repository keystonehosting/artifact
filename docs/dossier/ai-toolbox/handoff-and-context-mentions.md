# Handoff (a carry-forward action) and `@@` context mentions

Strings: G-handoff, G-mentions, and the handoff parts of G-ctx-meter in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## 1. Handoff / carry forward

### Entry points
- The context meter card ([context-meter.md](context-meter.md)): a continue-in-new-chat action (same site) and one button per other site.
- a carry-forward action item injected into each site's per-chat menu: Claude clones the rename item of the chat-row menu (rows `[data-row-key^="chat:"]`, menu items `[role="menuitem"]`, label span `.min-w-0.flex-1.truncate`); Gemini clones the share / pin item of the conversation actions menu (`[data-test-id="share-button"]`, `[data-test-id="pin-button"]`, or a `gem-menu-item` / `button.mat-mdc-menu-item`); ChatGPT and Grok have equivalent entries. Opens a dialog with targets an open-new-chat-on-this-site option or "into a new chat in <site>", a short explanation (a summary goes into a new chat; the current chat is not changed or deleted), and progress states.

### Flow
1. Load the conversation: local index copy; if it has no messages, a live fetch from the site.
2. Normalize roles (model → assistant, human → user), trim, drop empty messages.
3. Summarize via the AIT server endpoint `/context-mentions/summarize` (body: `messages` [{role, content}], `title`). Before sending, the oldest messages are dropped until the total is ≤ 480,000 characters (at least one kept). **Artifact replaces this with Local / Current-chat / API modes (SPEC §6I).**
4. If the server returns nothing, a local excerpt is built instead (budget 7,000 characters): if the whole role-labeled transcript fits, use it; otherwise a note line saying this is an automatic excerpt, then the opening user request (trimmed to 1,500 characters by keeping the first 60% and the last 40% with a gap marker), an a marker that older turns were left out marker, then as many of the most recent turns as fit (each trimmed to 1,200 characters the same way); if none fit, the last turn trimmed to the remaining budget (minimum 200). Single-message chats: the note plus that message trimmed to fit.
5. Build the seed: a header line saying the context is carried over from the chat "<title>" (mentioning the source site when crossing sites; generic wording when the title is empty), a blank line, the summary, then a horizontal-rule separator and a blank line so the user can type below.
6. Deliver:
   - Same site (Claude, Gemini, Grok): put the seed in sessionStorage and navigate the current tab to the site's new-chat URL; the content script on the new page consumes it once.
   - ChatGPT same-site and any cross-site target: store a pending handoff in chrome.storage (target site, seed, timestamp) and ask the background to open a new tab right after the current one (same window, opener set) on the target's new-chat URL: ChatGPT `https://chatgpt.com/`, Claude `https://claude.ai/new`, Gemini `https://gemini.google.com/app`, Grok `https://grok.com/`. The target tab takes the seed only if it is for that site and younger than 180 s, then removes it.
7. Insert the seed into the composer (never sent). Retries on DOM mutations and every 400 ms for up to 15 s; if it still fails, a fallback dialog shows the summary with a copy button (if the clipboard is blocked, the text is pre-selected for manual copy).

### Errors and states
"Summarizing…", "opening a new tab…", "sent to <site>", and three failures: chat has no messages, chat still being indexed (try again shortly), generic failure. A second request while one runs shows a busy notice.

### Premium (do not port)
Handoff is paid-only on every site.

## 2. `@@` context mentions

### Trigger
In the composer, typing `@@` opens a picker while the text after the last `@@` is shorter than 50 characters (that text filters by title). Zero-width characters between the two `@` signs are tolerated when removing the trigger. Keyboard as for `//` (arrows wrap, Enter/Space/Tab select, Escape closes). Pasted text starting with `@@` does not open it.

### Picker
Lists conversations from the local index (most recent first) with relative dates (today, yesterday, n days / weeks / months ago) and message counts; recently mentioned chats (last 5) first. If the index is still syncing: a retry-later message.

### Inserting the reference
1. Load the chosen conversation from the local index.
2. Size check: sum of (message length + 15) over all messages.
   - Below 15,000: inline block = a header line naming the chat title, then the first 20 messages as "User: …" / "<Site name>: …" lines, cut off at 30,000 characters total (the message that crosses the cap is truncated with an ellipsis if more than 20 characters of room remain), then a separator.
   - Otherwise: show a "summarizing" overlay above the composer, call the AIT summarize endpoint; on success a block headed "summary of <title>"; on failure a truncated block: all messages if there are ≤ 8, else the first 2 and the last 6, same 30,000 cap, headed as truncated.
3. The text from the last `@@` onward is replaced by the block (earlier composer text is kept, a newline added); the composer scrolls to the end. Not sent.
4. Batch size constant 8 (summarizer chunking, server side).

### Limits
AIT allows only one context reference per message for free users and 3 per day (server-tracked `/context-mentions/status`, `/use`). Paid users can add more. Artifact: no quotas.

## Server dependency summary
Both features depend on the AIT server only for summarization. Everything else (loading, excerpting, delivering, inserting) is local and portable.
