# Artifact vault (Claude) and media gallery (ChatGPT)

Strings: G-artifacts, G-media in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

AIT has **no** ChatGPT canvas vault and **no** Gemini canvas/media support. The vault is Claude-only; the gallery is ChatGPT-only.

## 1. Claude artifact vault (the artifact list)

### Capture
Runs inside Claude history sync ([sync-and-indexing.md](sync-and-indexing.md)) over each fetched conversation's `chat_messages`, three extractors per message:
1. **Tool-use artifacts**: content blocks whose `name` or `type` contains "artifact", or any block whose `input` has string `content` plus at least one of title, type, language, id, identifier, command. Taken: `input.content`, `input.title`, `input.type`, `input.language`, id from `input.id` or `input.identifier` (else a synthetic id from conversation, title and type).
2. **Inline legacy artifacts**: `<antArtifact …>…</antArtifact>` tags inside message text; attributes `title`, `type`, `language`, `identifier`.
3. **Created files**: `tool_result` blocks named `present_files` (not errors) whose `content[]` entries of type `local_resource` carry `file_path`, `uuid`, `mime_type`. Stored as type "file" with no content (downloaded on demand).
- Type mapping from the MIME/type string: contains react → React; mermaid → diagram; svg → SVG; html → web; markdown → doc; code (or any `application/vnd.ant…` with a language) → code; else other.
- Records: id, conversation id and title, title (default a default artifact title), type, language, content, captured time, plus file path/uuid/MIME for files. Up to 2,000 artifacts, up to 5 versions per artifact (a new version is kept when content changes), a cap of half the available storage quota for the vault, a scan-version flag that forces a full rescan when the extractor changes.
- The conversation → project map (from the conversation list's `project_uuid` / `project.name`) is stored for filtering.

### UI
- Modal from the launcher/palette: search box, type filter chips (all, code, doc, web, SVG, React, diagram, file, other), project filter (all projects, no project, named projects), chat filter, favorites filter, counts ("n artifacts", "n versions" per item).
- Item: title, type badge, chat title, version count, favorite toggle, actions: open in chat (navigates to `/chat/<id>`, then finds the artifact block `.group/artifact-block` whose button label is "View <title>" or whose `.line-clamp-1` text equals the title, scrolls to it and highlights it, watching the DOM up to 15 s), copy, download.
- Selection with a select-visible control, clear, an export-selection action.

### Export selected (ZIP)
- File `claude-artifacts-YYYY-MM-DD.zip`; root folder of the same name.
- If any selected artifact belongs to a project: first level = project name (or a no-project bucket); next level = chat title; then the artifact files. Without projects: chat folders directly under the root. Names are sanitized (see [export.md](export.md)) and de-duplicated with " (2)", " (3)".
- Extensions by type: code → by language (javascript js, typescript ts, python py, java, csharp cs, cpp, c, go, rust rs, ruby rb, php, swift, kotlin kt, sql, bash/shell sh, json, yaml, html, css; unknown → txt), doc → md, web → html, svg → svg, react → jsx, diagram → mmd, other → txt; files keep their own extension (1–8 alphanumerics) else `bin`.
- Created files are downloaded from `GET https://claude.ai/api/organizations/<org>/conversations/<conversationId>/wiggle/download-file?path=<file_path>` (credentials included); an empty or failed response counts as missing.
- Results: "files in the zip: n"; if some created files could not be downloaded, a `_not-included.txt` at the root lists each as "<file> (from <chat>)" with a note that old chats' files expire; if nothing could be exported, a message saying so.
- Progress "exporting i of n".

## 2. ChatGPT media gallery

### Data
- `GET https://chatgpt.com/backend-api/my/recent/image_gen?limit=16[&after=<cursor>]` → `items[]` (fields used: `id`, `url`, `prompt`, `created_at`, `conversation_id`, `seed`, generation id) and `cursor` for the next page. Cached in IndexedDB store `images` (max 1,000 records).
- Image URLs are signed; the `se` query parameter is the expiry. If an URL is within 60 s of expiring (or a download returns 401/403/404), the list is re-fetched (once per 5 minutes) to get fresh URLs.

### UI
- Grid of images grouped by date (month name and day), tabs "images" / "charts", filter all / favorites, search by prompt text, total count.
- Detail pane: large preview, prompt (copy), seed (copy), generation id, date, a jump-to-chat link (link to `https://chatgpt.com/c/<conversation_id>`), download, favorite toggle.
- Download one: fetches the blob and saves `<id>.<ext from Content-Type>`.
- Download all (selection or everything): ZIP `chatgpt-images.zip` (streamed to disk via save-file picker at ≥ 150 images), 6 downloads in parallel, one folder per conversation named after the chat title (sanitized; "Uncategorized" when unknown; collisions get the conversation id prefix), files `<image id>.<ext>` with " (2)" de-duplication. Images that fail are skipped and reported ("some images could not be fetched").
- Favorites are stored on the AIT server (`/media-favourite/get`, `/toggle` with `media_id` and action). **Artifact: local.**

## Premium (do not port)
Free: 5 artifacts visible, 5 images visible, 2 image favorites, no batch download.
