# Prompts (saved prompts, variables, `//` insertion, categories, Prompt Library, prompt of the day)

Strings: G-prompts, G-prompt-library in [strings.md](strings.md). Chains are in [chains.md](chains.md). Observed in AIT 5.0.54, unconfirmed live.

## 1. Saved prompts

### Data
Prompt: id, name (≤ 100 characters), content (≤ 10,000 characters; Claude's older constant says name ≤ 40), category, use count, created/updated times, last-used time (kept locally for "used n minutes ago"). On Claude/Gemini/Grok up to 500 stored prompts. Team (organization) prompts are a separate read-only list (server-only, skip).

### Storage
- Default: AIT server (`/prompt/create`, `/prompt/update` with `promptId` and `updatedFields`, `/prompt/delete`, `/prompt/get`, `/prompt/use`). Claude/Gemini/Grok cache them locally.
- a local-only prompt storage toggle (setting, default off): copies all prompts and chains to chrome.storage, verifies the copy, then deletes them from the server; can be switched back (re-uploads, may hit plan limits; partial-upload message). Errors are reported without data loss.
- When the cross-platform switch is on (or device-only is on), prompts and chains are mirrored into one shared local list (with tombstones for deletions) so the same library appears on every site; each site merges the shared list with its own copy.
- **Artifact: local only, one library for all sites.**

### Managing (modal the prompt-management entry)
- Tabs: prompts | chains (view-mode toggle), search box, category filter, sort: newest, most used, A–Z, Z–A, recent (last used), manual (with move up / move down). Stats line: prompts saved, total uses, prompts used.
- Each row: name, category color dot, variable count (a variable count), use count, last used; actions: use, edit, duplicate, delete. Bulk delete via a select mode with select-all and a confirm.
- Create/edit form: name, content (with a tip about double-curly-brace variables), category select (general, work, creative, coding, writing, personal, marketing, education; each with a fixed color) or a custom label (≤ 24 characters, free text). Validation: name and content required, length limits.
- Recently used list: last 5 prompts, shown at the top of the `//` list and the modal.

### Variables
- Syntax: `{{name}}` anywhere in the content (a prompt "has variables" if it contains at least one `{{…}}`). Names are free text between the braces.
- On use, a a variable-filling dialog dialog lists each distinct variable (label shortened to 22 characters for display) with an input; Enter submits; values replace every occurrence; leaving a field blank keeps the placeholder text as is.
- AIT has no dropdown variables, hidden values, defaults or auto-attached files (Artifact's spec adds those from My Prompt ideas).

### `//` inline insertion
- In the site composer, typing `//` at the start of the text or after whitespace, followed by optional non-space characters (and no further slash), opens a floating list anchored above the composer, filtered by the characters typed after `//` (name match). Pasted text that starts with `//`, `..` or `@@` does not open the list.
- Keyboard: ArrowUp/ArrowDown move (wrapping), Enter or Space or Tab inserts the highlighted item, Escape closes. Mouse click also inserts. An empty-list row offers an empty-state call to create a prompt.
- Insertion replaces everything from the `//` onward with the prompt content (text before the `//` is kept), or opens the variables dialog first. The prompt is not sent. A toast confirms. The prompt's use count and last-used time are updated.
- Composer write technique (for the build to replicate on each site): focus the editor, select the range, dispatch a synthetic paste event carrying plain text; if the editor did not accept it, fall back to `document.execCommand("insertText")`; for plain textareas use the native value setter plus an `input` event. On ChatGPT the ProseMirror view is preferred when reachable.
- Composer elements: ChatGPT `#prompt-textarea` (ProseMirror inside `form[data-type="unified-composer"]`); Claude `[data-testid="chat-input"]` contenteditable; Gemini `rich-textarea` → `.ql-editor[contenteditable="true"]`; Grok `.ProseMirror` / `.tiptap` / `[role="textbox"]` contenteditable, or `textarea` on x.com.
- The composer placeholder on each site is replaced with a hint that lists the three triggers (`//` prompts, `..` chains, `@@` context).
- Setting the prompt tools menu (default on): turning it off hides `//`, chains and the library from every menu and stops their background work (stored per site, Grok has its own key).

## 2. Prompt Library (catalog)
- Server-hosted catalog (AIT server `/prompts-library`, query parameters `page`, `query`, `category` (default `marketing`), `sort` (`newest` or `popular`)), 15 per page with infinite scroll; response `data[]` items have `prompt_key`, `category`, `use_count`, `is_favorited`, `created_at`, text; plus an optional `featured` item.
- 12 categories: marketing, personal development, sales, customer service, SEO, engineering, coding, education, finance, creative, writing, business (each with a fixed color).
- Item card: category, title, text trimmed to 168 characters, use count (1,000+ shown as "1.2k"), favorite toggle; actions use (insert into composer), copy, save to my prompts (confirm dialog, limited by the saved-prompt cap).
- Recently used library items: last 5.
- **Prompt of the Day** = the server's `featured` item, shown pinned at the top of the first page when no search is active. It is not drawn from the user's own library.
- **Artifact:** no server catalog may be used and AIT's prompt texts must not be copied. Prompt of the Day must come from the user's own library (SPEC §6D) or a CC0/public-domain starter pack.

## Premium (do not port)
Free: 2 saved prompts, 5 library prompts, 5 categories, limited favorites.
