# Search (history search, advanced filters, find in chat, deep import, all-platforms search)

Strings: G-search, G-adv-search, G-find, G-deep-import, G-xsearch in [strings.md](strings.md); exports of results are in [export.md](export.md). Observed in AIT 5.0.54, unconfirmed live.

## 1. Chat-history search (per site)

### Data
Searches the site's local IndexedDB copy built by background sync ([sync-and-indexing.md](sync-and-indexing.md)): title plus every message of the active branch with role and time. Nothing is sent anywhere to search.

### UI
- Opened from the launcher/palette, the browser command an open-search action, and on ChatGPT with Cmd/Ctrl+Shift+F. Modal with a search input, recent searches (last 5, as clickable pills), filter pills, a stats line ("N messages in M conversations · t s"), results list, and selection checkboxes for bulk actions (see [bulk-actions.md](bulk-actions.md)) and export.
- While the first sync is still running, a a syncing-in-progress state note shows; if nothing has been indexed for this account, an empty state points to settings → data → re-sync.
- Results: grouped by conversation (title, date, match count), each matching message shown as a snippet with the match highlighted. Snippet = about 60 characters either side of the first match (58 on Gemini/Grok), with ellipses. Results render in batches (5 per batch on Gemini/Grok, lazy as you scroll).
- Clicking a result opens the chat and scrolls to the message (ChatGPT/Claude via a `mid` URL parameter or a stored "reveal" hint; same jump logic as bookmarks).

### Matching
- Text normalization for matching: lowercase, Unicode NFD with combining marks removed, and a handful of letters mapped to ASCII (ø→o, ł→l, đ/ð→d, ı→i, ħ→h, ŧ→t, ĸ→k, ŀ→l).
- Default: substring match over title + message text.
- Exact match: whole-word match (word boundaries added only on the sides of the term that start/end with a word character).
- Role filter: all / questions (user) / answers (assistant; "model" on Gemini).
- Time filter: any time / past week / past month / past year = update time within the last 7 / 30 / 365 days.
- Tag filter: chips from manual tags (ChatGPT) with include/exclude and match any/all, plus typed `tag:<name>` / `-tag:<name>` tokens in the query.

### Advanced search panel
- Toggle reveals two chip inputs: a required-terms field and "exclude" (words or phrases, de-duplicated after normalization).
- Include mode: all (default) or any. Exclude mode: any (default; hide a chat that contains any excluded term) or all (hide only if it contains all of them).
- Titles only: match conversation titles, not message text (role pills are disabled in this mode).
- Date range: from / to dates (either side optional; the "to" date is inclusive to 23:59:59.999 local; reversed dates are swapped).
- Semantics: a chat matches if its title or any message (respecting the role filter) satisfies the include/exclude logic; per-message hit indices are kept for highlighting the include terms.

### Limits
- AIT free plan: 5 results (skip). No other cap on result count in the client except the per-platform caps of the cross search below.

## 2. Find in this chat
- Opened by the browser command "find in chat" (Alt/Option+Shift+F) or the palette. A small bar with input, a position counter position, previous/next, close.
- Searches the whole conversation, including parts the site has not rendered yet: it takes the stored copy (or a live fetch) of the conversation, finds all matches (cap 10,000; shown as "10000+"), and for the current match scrolls to the owning message (by message ID), waits for it to render, then highlights the match in the DOM. If the message cannot be reached a toast says so. If no chat is open: a hint to open a chat before searching it.
- Input is debounced; Enter/Shift+Enter go next/previous; Escape closes.

## 3. Deep Import (ChatGPT only; not the official data export)
Purpose: ChatGPT's history listing stops returning very old chats on large accounts; Deep Import recovers them into the local index.
- A probe after a full sync runs one search-API page for the first query token and counts IDs unknown to the local index; if at least 3 are unknown, a banner suggests recovering (a found-older-chats notice), dismissible.
- Scan phase: for each query token in a fixed list of very common letters/digits/words across scripts (a, e, i, o, 1, a Cyrillic letter, a common Chinese character, a Hebrew prefix, an Arabic article), walk `GET /backend-api/global/search?query=<token>&limit=40&sources=conversation&entrypoint=global_search[&cursor=]` page by page (max 500 pages per token, 900 ms extra gap between pages), collecting `items[].payload.conversation_id` (or `items[].conversation_id`) not already known. Pagination continues while `cursor` is present and some `source_statuses[].has_more` is true (or the list is empty). Stops after at least 2 tokens when a walk yields fewer new IDs than max(10, 1% of known+found).
- Fetch phase: batches of 10 IDs via `POST /backend-api/conversations/batch` (body `conversation_ids`), each conversation flattened to its active branch and saved to the index, retried up to 3 times on 429.
- State is persisted (version, status scanning/fetching/done/error, query index, cursor, pages, pending IDs, recovered count, heartbeat) every 10 pages and every 5 fetch batches, so it resumes after a reload; a run whose heartbeat is older than 20 s is considered dead and can be resumed. Confirmation dialog warns it can take 30–45 minutes on very large accounts and runs in the background. Progress: "scanning (n pages)", "recovering a/b", "recovered n", "nothing hidden".
- Server dependency: none (site endpoints only).

## 4. Search all platforms
- Requires the single cross-platform switch (off by default). When on, each site pushes one record per chat into the background's unified IndexedDB (`<platform>:<id>`, title, plain text of all messages concatenated without speaker labels, optional raw text, url, updateTime). Deletions and account switches remove records.
- Surfaces: a modal on every site, and a standalone extension page (opened by Ctrl/Cmd+Shift+Period from any tab, or by an open-search action outside AI sites; an existing tab is focused instead of opening a second one).
- Query: same normalization and include/exclude/titles-only/date logic as above (the background reimplements it). Scans newest first by update time. Up to 30 hits per platform are returned (all platform totals are still counted); groups ordered ChatGPT, Claude, Gemini, Grok. Each hit: title, snippet (±60 chars), url, update time. With an empty query the view shows per-platform indexed counts, and platforms with no records show a not-yet-indexed state or "off".
- Selection of individual chats or an all-visible option; scope for export is "n selected chats" or "all n matching chats".
- AIT free plan only sees the 5 newest hits across platforms (skip).
