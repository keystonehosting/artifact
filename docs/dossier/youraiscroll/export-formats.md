# YourAIScroll 1.9.9 — export formats

Observed in YourAIScroll 1.9.9. All generation happens in the content script of the AI site's tab; the file is delivered by creating an object URL and clicking a temporary `<a download>` element (no `downloads` permission, so no "save as" folder choice and no subfolders).

## Formats offered

| Format key | Popup label (paraphrased) | Single chat | Batch ZIP | Gate |
|---|---|---|---|---|
| `copy` | Copy as Markdown (button) | yes (to clipboard) | (maps to `md`) | free |
| `md` | Markdown | yes | yes | paid |
| `json` | JSON | yes | yes | paid |
| `txt` | Text | yes | yes | paid |
| `html` | HTML | yes | yes | paid |
| `pdf` | PDF | yes (print dialog) | no (falls back to `md`) | paid |
| `docx` | Word | yes | yes | paid |

The last chosen format is remembered (`downloadFormat` in storage). In batch mode PDF and copy are not selectable; if they were the remembered choice the batch uses Markdown.

There is no option panel: no toggles for dates, images, numbering, TOC, metadata, filename patterns or message selection. The only modifier is the optional AI summary (see below).

## Shared header (MD, TXT, copy, DOCX)

Text-based exports start with up to three header lines, then a blank line:

1. `Original URL: <url>` — the tab URL for single export, or the canonical chat URL in batch mode.
2. `Conversation Time: <local date-time>` — only when the adapter found a conversation time.
3. `Export Time: <local date-time>` — always.

Dates are rendered with the browser's `toLocaleString()` (locale- and timezone-dependent, not ISO). The **title is not included** in MD/TXT output (only in the filename, the HTML/PDF heading and the DOCX title paragraph).

## Markdown (`md`) and copy

- Header (above), then the messages joined by a separator line: blank line, `---`, blank line.
- Each message: a role marker line, a blank line, then the message Markdown. Role markers are `**[USER]**` and `**[ASSISTANT]**` (bold, square brackets). Exceptions: Poe uses the upper-cased bot name for assistant turns; AI Overview uses `**[QUERY]**` / `**[AI OVERVIEW]**`.
- Claude collapses runs of 3+ newlines to 2 inside messages.
- No YAML frontmatter, no per-message timestamps, no model names, no message numbering.
- Copy writes the same Markdown to the clipboard via a hidden textarea and the legacy copy command, from the popup.

## Text (`txt`)

Same as Markdown but role markers are plain `[USER]` / `[ASSISTANT]` and messages are separated by a single blank line (no `---`). Message bodies are still Markdown source (no stripping). Grok's TXT variant puts a colon after the role marker and is otherwise identical.

## JSON (`json`)

Pretty-printed with 2-space indentation. The structure is **not** uniform across sites:

| Site | Top-level fields | Message fields |
|---|---|---|
| ChatGPT | `title`, `timestamp` (export time ISO), `conversationTime`, `messages`, `url` | `role`, `content`, `timestamp` |
| Claude | `title`, `url`, `timestamp`, `messages` | `role`, `content`, `timestamp` |
| Gemini | adapter object (`platform`, `url`, `title`, `messages`, optional `createdAt`) plus `conversationTime`, `timestamp` | `id`, `role`, `markdown`, `tokens` (Markdown lexer tokens), `meta` (code blocks, images, counts) |
| AI Studio | `title`, `url`, `timestamp`, `messages` | `role`, `content` |
| Grok | `title`, `timestamp`, `messages`, `url` | `role`, `content`, `timestamp` |
| DeepSeek, Kimi | `title`, `url`, `conversationTime`, `timestamp`, `messages` | DeepSeek: `role`, `content`; Kimi: `role`, `content`, `timestamp` |
| Mistral | `title`, `url`, `conversationTime`, `timestamp`, `messages` | `role`, `content` |
| Copilot | adapter object (`platform`, `url`, `title`, `createdAt`, `updatedAt`, `messages`) plus `conversationTime`, `timestamp` | `id`, `role`, `markdown`, `tokens`, `meta` |
| GitHub Copilot | `title`, `timestamp`, `conversationTime`, `messages`, `url` | `role`, `content` |
| Perplexity | `title`, `url`, `timestamp`, `messages` | `role`, `content`, optional `timestamp` on the first |
| Poe | `title`, `url`, `conversationTime`, `timestamp`, `messages` | `role` (user or bot name), `content` |
| Google AI | `title`, `url`, `timestamp`, `messages` | `role`, `content` |

With an AI summary, a `summary` string field is inserted as the **first** key. There is no schema version, no site identifier in most variants, and no attachment data. Artifact's archive schema (SPEC §4) supersedes all of these.

## HTML (`html`)

A single self-contained file:

- `<!DOCTYPE html>`, UTF-8 meta, `<title>` = chat title, one inline `<style>` block (system font stack including CJK fonts, 720 px centred column, 16 px base, user messages in a light rounded panel, tables with bottom borders, rounded images, monospace code blocks with light background). No external resources, no scripts, no dark mode.
- Body: a header block with an `<h1>` title, then "source" lines: original URL (as a link, opening in a new tab), conversation time (if known), export time (all labelled as in the text header).
- Then a conversation container with one block per message: a wrapper classed `user-message` or `assistant-message`, a small upper-case role label `[USER]` / `[ASSISTANT]` (or bot name / QUERY / AI OVERVIEW), and a content block with the message rendered from Markdown by the `marked` library.
- Math is not rendered (left as `$…$` source); code is not highlighted; Mermaid not rendered.
- **Security note:** rendered Markdown is inserted without sanitising. Message text containing raw HTML is passed through as HTML. Artifact must sanitise (DOMPurify, SPEC §4).
- With an AI summary, a summary panel (label plus paragraphs, HTML-escaped) is inserted before the conversation container.
- Perplexity batch HTML uses a crude regex converter instead of `marked` (code fences, inline code, bold, italic, links, `-` lists, paragraphs only).

## PDF (`pdf`)

Not a file generator. It builds the same HTML document, swaps in a print stylesheet, writes it into a hidden zero-size iframe, waits (800 ms in Chromium; on Firefox it loads a blob URL and waits for load plus 500 ms), sets the iframe document title to the download base name, and calls the browser's `print()`. The user must choose "Save as PDF" in the print dialog. The iframe is removed after 1 s.

Print stylesheet facts: A4 page, margins 18 mm / 18 mm / 17 mm; 12.8 pt body (12.3 pt in print media), 186 mm content width; user messages light grey rounded boxes kept unbroken across pages; assistant messages bordered boxes allowed to break; code blocks wrap (`pre-wrap`); tables fixed layout, unbroken, zebra rows; headings avoid page breaks after; exact colour printing enabled. Before printing, a pass forces assistant messages and `pre` blocks to allow page breaks, sets orphans/widows to 2, and removes max-height/overflow on code blocks.

PDF is single-chat only and never part of a batch.

## Word (`docx`)

Generated in-browser as a hand-built OOXML package zipped with JSZip (no docx library). Input is the same Markdown as the MD export (header lines, role markers, separators). The Markdown is tokenised with `marked` and mapped to Word paragraphs and runs:

- Package parts: content types, package relationships, `word/document.xml`, `word/styles.xml`, `word/numbering.xml`, `word/_rels/document.xml.rels`, and `word/media/imageN.<ext>` for embedded images.
- First paragraph: the chat title in the `Title` style.
- Headings → `Heading1`–`Heading3` (deeper levels clamp to 3).
- Paragraphs starting with a role marker (`**[USER]**`, `**[ASSISTANT]**`, `**[SUMMARY]**`, `**[QUERY]**`, `**[AI OVERVIEW]**`) get a `ConversationRole` paragraph style.
- Fenced code → optional caption paragraph (`CodeCaption`, bold grey language name) followed by one `CodeBlock` paragraph per source line.
- A paragraph that is entirely `$$…$$` → one `MathBlock` paragraph (monospace source, no equation object). Inline `$…$` → a run in the `InlineCode` character style.
- Footnote references `[^n]` → blue superscript `[n]`. A paragraph containing footnote definitions (`[^n]: …`) or a "Sources:" line → a `Sources` heading (Heading3) followed by a numbered list where each item starts with a bold blue `[n]`. This is how ChatGPT citations survive into Word.
- Bullet and numbered lists with up to 3 nesting levels (two abstract numberings: bullets with alternating glyphs, decimals `1.`); task-list items get `[x]` / `[ ]` prefixes.
- Block quotes → `Quote` style; horizontal rules → paragraph with a light bottom border.
- Tables → fixed-layout table 9360 twips wide split evenly across columns, light grey borders, bold shaded header row, per-cell alignment from Markdown.
- Links → external hyperlinks (blue, underlined). Bold, italic, strikethrough supported. Raw inline HTML is stripped to text (`<br>` becomes a line break).
- **Images:** a Markdown image is fetched (or decoded from a `data:` URL) and embedded if it is at most 1 MiB (checked by `Content-Length` and by blob size); type from the response (jpg/gif/webp/png, defaulting to png). It is placed inline at a fixed size of 5,303,520 × 3,182,112 EMU (about 14.7 × 8.8 cm) regardless of aspect ratio. Failed or oversized images fall back to their alt text. Fetches run from the AI site's page, so cross-origin images without CORS fail.

## AI summary injection (all formats)

If the popup's an AI-summary toggle toggle is on and a provider/key/model is configured, the popup first asks the content script for the chat as Markdown, extracts only the **user** messages, sends them to the configured provider, and passes the returned text along with the export request. Placement:

- MD / copy / DOCX: a `## Summary` section followed by `---`, inserted after the header block (before the first message).
- TXT: an upper-case bracketed summary label, the text, and a dashed rule, after the header.
- JSON: a `summary` key first.
- HTML / PDF: a styled summary panel before the conversation.

The summary request prompt asks for 3–6 bullets or 2–4 sentences describing the user's questions and topics, in the user's language, with no heading, and forbids inventing facts. Only user messages are sent (assistant replies never leave the browser). See settings.md for providers.

## Filenames

- Single export: `<Prefix>-<title>.<ext>` where the title has only whitespace replaced by `_`. Illegal filename characters are **not** replaced (the browser then sanitises or rejects them). ChatGPT uses the API title; others the extracted title. PDF uses the same base name as the print document title.
- Batch entries: `<Prefix>-<title>.<ext>` with whitespace → `_` and `/ \ ? % * : | " < >` → `_`. Titles come from the list (falling back to the API title, then `Conversation_<id>`).
- Duplicate handling: ChatGPT appends `-<first 8 chars of id>` and then `-2`, `-3`, …; DeepSeek, Mistral, Copilot and GitHub Copilot append `-<first 8 chars of id>` once; Claude, Gemini, AI Studio, Grok, Kimi and Perplexity do not de-duplicate (a later chat with the same title overwrites the earlier one inside the ZIP).
- Batch ZIP name: `<Prefix>-Batch-<YYYY-MM-DD>.zip` (UTC date from ISO string). Prefixes in batch: `ChatGPT`, `Claude`, `Gemini`, `AIStudio`, `Grok`, `DeepSeek`, `Kimi`, `Mistral`, `Copilot`, `GitHubCopilot`, `Perplexity`. ChatGPT uses `ChatGPT-Batch-Failures-<date>.zip` when every selected chat failed.

## ZIP layout

Flat: one file per conversation at the ZIP root, no folders, no index, no attachments or media folder, no manifest. ChatGPT batches add a failure report JSON at the root when any conversation failed, with `generatedAt`, `selectedCount`, `preparedCount`, `failedCount` and `failures[]` (`conversationId`, `title`, `stage`, `error`). DOCX entries inside a batch are nested DOCX blobs.

## Image and file handling summary

| Content | Handling |
|---|---|
| Uploaded user files / attachments | never exported (Copilot shows a document file name; Copilot text files become a fenced block) |
| Generated images | Copilot: Markdown image link to the remote URL; GitHub Copilot: image link; elsewhere dropped |
| Claude artifacts | fenced code blocks inline in the message (create content; for updates only the replacement fragment) |
| ChatGPT canvas / code-interpreter files | dropped (only code-typed JSON parts become fenced code) |
| Images in DOCX | embedded only when the Markdown already has an image link, ≤ 1 MiB, CORS-fetchable |

Artifact's "real files" requirement (SPEC §6F) has no counterpart here; YourAIScroll is a text exporter.
