# YourAIScroll 1.9.9 — UI and flows

Observed in YourAIScroll 1.9.9. All visible text below is paraphrased.

## Surfaces

Only two: the toolbar **popup** (fixed 350 px wide card) and the **options page** (opens in a tab). Nothing is injected into the AI sites' pages.

## Popup states

1. **Unsupported tab.** If the active tab URL matches none of the 13 platform substrings: a short product description and a 2-column grid of platform buttons (site icon + name) that open each site in a new tab.
2. **Content script not reachable.** For a supported site the popup pings the content script up to 4 times (immediately, then after 200, 500 and 1000 ms). If none answer, the page shows an info notice asking the user to refresh the page, and actions are disabled. A content script may also announce itself with a "ready" message (only Grok does), which flips the state to ready.
3. **Main view** (supported, ready):
   - Header: product logo (opens the vendor homepage), product name, and either a sign-in button (opens the vendor login page) or a plan button that reads as paid or "upgrade" and opens the options page.
   - "General" section: version label (click → changelog, with a red dot when unseen), `<Platform> - <chat title>` (title obtained via a title request to the content script), the site icon and the bare origin of the tab.
   - "Operate" section:
     - checkbox: include an AI summary at the top; sub-text shows the configured provider and model, or a link to the options page when unconfigured; an inline "summarising" indicator while the summary call runs;
     - **Copy as Markdown** button (free);
     - format dropdown (Markdown, JSON, Text, HTML, PDF, Word) + **Download** button with a "Premium" corner badge for non-paid users;
     - destination dropdown (only Notion) + **Save** button (badge);
     - **Batch Download** button (badge) — shown only for platforms with list support and only when the content script is ready.
   - Error and success alerts below (red / green), e.g. per-format success messages; PDF's success message says the print dialog was opened.
4. **Batch view** (after pressing Batch Download): see below.
5. **Upgrade modal**: lock icon, a "paid feature" title and explanation, cancel and upgrade (opens pricing page) buttons. Shown whenever a gated action is attempted while not paid.

The popup is a React app. Its dropdowns use a custom select component (its module name indicates it exists for Firefox compatibility, where native select popups inside extension popups are unreliable).

## Messaging protocol (popup ↔ content script)

All via `tabs.sendMessage` to the active tab; every content script implements the same message types:

| Message | Request fields | Response |
|---|---|---|
| `PING` | — | `{success: true}` |
| `GET_TITLE` | — | `{title}` |
| `GET_CONTENT` | `format` (always `md` when used by the popup) | `{success, content}` — the Markdown text, without triggering a download |
| `START_DOWNLOAD` | `format`, optional `summary` | `{success, content?}` or `{error}`; the content script triggers the file download itself (or opens print for PDF); for `copy` it returns the Markdown for the popup to put on the clipboard |
| `GET_CONVERSATION_LIST` | optional `offset` or `cursor` | `{success, conversations[], hasMore, total?, nextOffset?, nextCursor?}`; each conversation `{conversationId, title, createTime, modifyTime, isStarred?, projectName?}` |
| `BATCH_DOWNLOAD` | `format`, `conversationIds[]`, `conversationTitles{id: title}`, `conversationCreateTimes{id: time}` | `{success, downloadedIds[], failedIds?[], skippedIds?[]}` or `{error, downloadedIds}` |

Content script → background (runtime messages): ChatGPT list/conversation fetch, GitHub Copilot threads/messages fetch, and auth/plan messages from the popup and options page (`CHECK_AUTH_STATE`, `LOGOUT`, `CHECK_SUBSCRIPTION`, `GET_CACHED_SUBSCRIPTION`, `INVALIDATE_SUBSCRIPTION_CACHE`) and the broadcast `AUTH_STATE_CHANGED`.

## Single-chat flow

1. User clicks Copy or Download.
2. Popup checks the plan (Download/Save only); blocks with the upgrade modal if not paid.
3. If the summary toggle is on: popup requests `GET_CONTENT` (Markdown), extracts user messages, calls the AI provider from the popup, gets summary text. Missing key/model → error alert asking to configure options.
4. Popup sends `START_DOWNLOAD` with the format and summary.
5. Content script reads the chat (API or DOM per site), formats it, and either triggers the download or returns text.
6. Popup shows a success alert; for copy it writes the text to the clipboard.

The popup must stay open during a single export (the summary call and the response wait run in the popup). Closing it mid-way abandons the summary but the content script continues an already-sent download request.

## Notion save flow

Paid-only. Popup gets the chat as Markdown (`GET_CONTENT`), optionally prepends the summary, and calls the Notion API directly from the popup: creates a page in the configured database with the chat title, a creation date (if the database has a date property named for that), the platform name (if a text property for it exists) and the source URL (into the first URL-type property). The Markdown body is converted to Notion blocks (see settings.md). Missing configuration opens the options page.

## Batch flow

1. **Open batch view:** clears selection; loads the per-platform download progress from storage; sends `GET_CONVERSATION_LIST` (first page). Page size is the user's setting (20–200, default 60) on sites that honour it (ChatGPT, Claude, Gemini, Grok, DeepSeek, Kimi, Perplexity).
2. **List UI:**
   - top bar: back arrow, title, `selected / selectable` counter;
   - a a last-backup timestamp strip when previous batch downloads exist: relative time (hours ago under 1 day, days ago under 7 days, else a date) and total count, with a reset link that forgets the progress for this platform;
   - format dropdown (MD, JSON, TXT, HTML, DOCX) and Download button (paid badge; disabled while running or with nothing selected);
   - live progress block (see below);
   - "select all not yet downloaded" checkbox;
   - filter chips: a **starred** filter with count (only on ChatGPT, Claude, Grok, Gemini, Kimi, Mistral, DeepSeek, Copilot) and a **show/hide downloaded** toggle with count (downloaded chats are hidden by default);
   - list rows: checkbox (disabled and checked for already-downloaded chats, which carry a "downloaded" pill), star icon if starred, title, and a sub-line with the project name (Grok) and the creation (else modification) date;
   - empty states for no chats / no starred chats on loaded pages / all loaded chats already downloaded;
   - a "load more (N loaded)" button while the platform reports more pages; new items are de-duplicated by ID.
3. **Download:** plan check; sends `BATCH_DOWNLOAD` with selected IDs and the titles/create-times from the list. The content script processes IDs **sequentially**, writes progress to storage after each item, builds the ZIP in memory, triggers the download, records the downloaded IDs, and returns.
4. **Result message:** total downloaded, plus how many failed or were skipped (with a hint to reopen batch mode to retry; ChatGPT mentions the failure report in the ZIP).

### Progress record

Stored in `storage.local` under one key, shared by all platforms: `platform`, `phase` (`running` / `completed` / `failed`), `current`, `total`, `startedAt`, `endedAt`, `lastTitle`, `errorMessage`. The popup subscribes to storage changes, so the progress bar survives closing and reopening the popup ("downloads continue in the site tab"). The bar shows `downloading x/y`, `downloaded x/y` or `stopped at x/y`, a percentage, the last title while running, and the error text on failure. The record self-deletes 4 s after finishing. A second batch cannot start on the same platform while one is running (button disabled).

### Download progress ("don't re-download")

Per platform: `lastDownloadedAt`, `totalDownloaded` (cumulative count of newly-seen IDs), `downloadedIds` (array, capped at the most recent 5,000), `lastConversationId`. Used to hide/disable already exported chats and to power "select all not yet downloaded" — an incremental backup without timestamps (a chat changed after export is still treated as downloaded).

### Failure policies by site

| Policy | Sites |
|---|---|
| Any error aborts the whole batch (no ZIP) | Claude, Gemini, AI Studio, Grok, Perplexity |
| Failed chats skipped, others zipped; error only if all fail | DeepSeek, Kimi, Mistral, Copilot, GitHub Copilot |
| Failed chats skipped with a per-chat failure report JSON inside the ZIP; retries with backoff per request | ChatGPT |

No pause, stop or resume; no rate limiting except ChatGPT's fixed 750 ms gap and its retry/backoff.

## What Artifact should do differently (from SPEC)

- Put the export entry points in the page and side panel, not only a popup.
- Batch work should run in the background worker with pause/cancel, pacing, retries for every site, and partial ZIPs (SPEC §6F, §0.5).
- "Downloaded" tracking should compare update times so changed chats are re-exported.
