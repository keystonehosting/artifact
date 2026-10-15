# Export

Strings: G-export, G-findings, G-xsearch-export in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## Formats
TXT, Markdown, JSON, PDF. Nothing else (no HTML, DOCX, PNG). Default format setting (txt by default) pre-selects the choice in every export dialog.

### Common header facts
- Title: the chat title, or today's date string when empty.
- Times: created and updated rendered in US-English long form with hour and minute ("Month D, YYYY, hh:mm AM"); "updated" only when it differs from "created"; "exported" always. ISO 8601 versions are used in machine formats.
- Size line: characters · words · messages, with thousands separators and singular/plural. Characters count a surrogate pair as one. Words count each CJK/kana/Hangul character as one word plus whitespace-separated tokens of the rest.
- Source link to the original chat (ChatGPT `https://chatgpt.com/c/<id>`, Claude `https://claude.ai/chat/<id>`, Gemini `https://gemini.google.com[/u/<n>]/app/<id>` or `/gem/<gemId>/<id>`, Grok `https://grok.com/c/<id>` or `https://x.com/i/grok?conversation=<id>`).
- AIT appends a promotional attribution footer to every export and a separate one to social shares. **Do not port** (Artifact's credit line is optional and off by default per SPEC §6F).

### TXT
Header block (title, URL, created/updated/exported, size) then a line of 40 `=` characters. Each message: a bracketed uppercase role tag (user tag; assistant tag uses the site name, e.g. ChatGPT, Claude, Gemini, Grok) optionally followed by the message time in parentheses, a colon, newline, then the text with Markdown flattened: images become "alt (url)", links "text (url)" (just the URL when text equals URL), bold/italic/strikethrough/inline-code markers removed, heading hashes removed, horizontal rules removed, `*`/`+` bullets become `-`, three or more newlines collapse to two. Messages separated by a blank line.

### Markdown
YAML front matter: `title` (quoted, backslashes and quotes escaped), `date` (YYYY-MM-DD of creation), `created`, `updated`, `exported` (ISO), `model` (quoted `default_model_slug`, ChatGPT), `url`, `source`. Then an H1 title, the URL, an italic meta line (created · updated · exported · size), a rule. Each message: an H3 with the bold role name and optional " · time", a blank line, the raw Markdown content. Messages separated by `---`. LaTeX is left as written by the site.

### JSON
Object: `title`, `url`, `created_at`, `updated_at`, `exported_at` (ISO or null), `size` {characters, words, messages}, `conversation` [ {id, role, content, createTime, filePointer when present} ], `exported_by` {name, url}. Roles as stored (user/assistant; Gemini user/model).

### PDF
- Primary path on every site: the AIT server renders the PDF (`/export/pdf`, body: title, messages, attribution, locale, createdAt, updatedAt, sizeLine, url). For chats whose message text exceeds 300,000 characters an async job API is used (create job → poll status every 1–2 s up to 12 minutes, abort after 5 unrecognized answers → download file). **Artifact must render PDFs locally (SPEC §6F).**
- Fallback (and the only path the build should copy): local rendering with jsPDF, A4 portrait, page numbers, math via KaTeX (inline `$…$`, display `$$…$$`, `\(…\)`, `\[…\]`). Refuses chats over 2,000,000 characters or over 200 rendered pages with a "too long to build as a PDF in your browser, use Markdown or TXT" message.
- PDF request pacing: a client-side sliding window of 50 PDF requests per 60 s (a a throttling notice notice when the wait is ≥ 3 s), at least 1.1 s between bulk PDF jobs, 429 handling with Retry-After or exponential backoff from 2 s capped at 60 s, up to 5 attempts.

## Scopes and flows

### Single chat
From the chat header / launcher / palette (a single-chat export action): ChatGPT header anchors `#conversation-header-actions`, `[data-testid="thread-header-right-actions"]`, `#page-header`; on other sites the launcher panel. A dialog with the four formats (radio list with file extension); export runs immediately and downloads `<title>.<ext>` (title used as-is for single files). Data comes from the local index; if it is missing or (for MD/PDF) lacks raw Markdown, the conversation is fetched live (ChatGPT detail endpoint with 3 retries, 1 s initial delay; active branch only).

### Selected chats (bulk) and whole site
From search results or manage chats: choose format, then a ZIP:
- File name: ChatGPT `bulk_conversations_<date>.zip`; Claude `claude_conversations_<date>.zip`; Gemini `gemini_conversations_<date>.zip`; Grok `grok_conversations_<date>.zip`, where `<date>` is the browser's short date string (for example "Wed Oct 15 2026").
- Inside: a top folder (default `conversations`, or a caller-supplied name) and optionally a subfolder per project/group; one file per chat named from the sanitized title (see below), or `chat_<first 8 chars of id>` when the title is empty; a name collision appends `_<first 8 chars of id>`.
- Grok adds `_not-exported.txt` listing each failed chat with its ID and reason (with a note that unavailable chats can often be picked up on a re-run). Claude's artifact export adds `_not-included.txt` (see [vault-and-gallery.md](vault-and-gallery.md)).
- Concurrency: 4 parallel for PDF, 1 otherwise. Progress overlay "exporting <format>, i of n", a keep-this-tab-open hint, wait notices ("paused about n s because the site is limiting reads" / "slowing down about n s"), and a stop-and-keep-partial action (finishes the current file, then closes the ZIP so it contains everything completed). If every chat fails the ZIP is discarded and an error shown; partial failures show a partial-failure notice.
- ChatGPT reads chats through the shared rate limiter (see [sync-and-indexing.md](sync-and-indexing.md)), so a large export slows down rather than failing on 429.

### Folder export
Exports every chat in a folder and its subfolders; ZIP named `<folder>_<date>.zip`; inside, one directory per folder path, mirroring the nesting. Empty folder: an empty-folder message.

### Project export (ChatGPT)
Exports all chats of a ChatGPT project (listed via `GET /backend-api/gizmos/<projectId>/conversations?cursor=<n>&s=true`); fails with "couldn't find this project, reload" if the project is unknown.

### ZIP writer and big jobs
- AIT's own streaming ZIP writer (deflate-raw via CompressionStream when compressing text, store for binaries; ZIP64 aware; CRC-32).
- When the job is large (≥ 150 chats, or ≥ 20 for PDF) and the browser supports `showSaveFilePicker`, the user picks a destination file and the ZIP streams straight to disk; cancelling the picker cancels the export.
- Otherwise the ZIP is built in memory and split: when the next file would push it past 512 MiB, the current part is downloaded and a new part starts ("<name> - part2.zip", …).

### File-name sanitizer
Replace `\ / : * ? " < > |` and control characters with spaces, collapse whitespace, trim, cut to 60 characters, strip trailing dots/spaces, prefix `_` to Windows reserved names (con, prn, aux, nul, com1–9, lpt1–9).

## Export only the matching parts ("findings")
Option in the per-site search export: instead of whole chats, a single document headed "results for <query>" with a summary line (matches, chats); for each matching chat its title, then each matching message labeled you / assistant together with the reply to it. Output is one file, `results-<search terms joined by dashes, sanitized>.txt` when TXT was chosen and `.md` for every other choice (JSON and PDF are not produced for findings). an empty-results message toast if nothing matches.

## All-platforms search export
- From the cross-site search: format menu (Markdown, plain text, JSON, PDF), scope "n selected chats" or "all n matching chats" (capped at the newest 2,000 matches; records fetched 200 at a time from the background).
- ZIP named `all-platforms-<search terms joined by dashes, sanitized, ≤ 60>-<format>.zip`.
- Layout: one folder per platform; one file per chat named after the title (sanitized ≤ 60, collisions get `_<id8>` then `_2`, `_3`…). Each file: title, platform, updated date, link to the original chat, the matching passages (an in-chat match count, or a note that the chat matched on its title), then the full chat text. The unified index stores text without message boundaries, so there are no speaker labels in this export (stated in the readme).
- Root file: `README.md`, `README.txt` or `index.json` (by format) describing the export (search terms, exported time, platforms, list of chats with relative paths and match counts), the cap note when 2,000 was reached, and a list of chats saved as Markdown because their PDF could not be created.

## Server dependency
PDF rendering only. Everything else is local.

## Premium (do not port)
Free: TXT only, one chat at a time; bulk, folder, project and findings exports paid; a select-all control paid.
