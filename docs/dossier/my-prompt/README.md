# My Prompt (userscript) — mechanisms only

Source: the "My Prompt" Tampermonkey userscript, version 26.4.0, licensed CC-BY-NC-ND-4.0. **Ideas only** (SPEC §1): nothing below is code, UI text or prompt content from it. Its prompt library content is not described at all. The exported user data file that came with it (`My Prompt.storage.json`) contains **no prompts**: it holds 4 keys only (a list of 2 dismissed notification IDs, a font cache with 2 entries, the message-navigator settings object, and a numeric usage counter). Its schema is covered under "Storage" below.

Site DOM selectors listed here are interoperability facts observed in the script, **unconfirmed live**.

## Shape of the product

- Runs as a userscript at `document-end` on ~37 hosts (all Artifact Tier 1 and Tier 2 sites plus many Chinese and image-generation sites), top frame only. It needs these userscript grants: persistent values, cross-origin requests (`GM_xmlhttpRequest`, with a wildcard connect list), bundled resources (CSS and a translations JSON), and a menu command.
- Injects a small button group next to each site's composer: **enhance**, **paste** (clipboard text and clipboard files/images), and **prompts** (opens the prompt menu). It finds the insertion point per site from stable anchors (e.g. ChatGPT's composer "plus" button by test-id, Claude's attach button by test-id, Gemini's mic or send `mat-icon`, Copilot's composer create button test-id, DeepSeek/Kimi/Mistral/Poe/Grok/Perplexity by matching the send button's SVG path prefix) and re-runs on DOM changes (debounced 500 ms).
- Everything is stored in userscript storage (per browser profile), plus one IndexedDB database for chat pins.

## Prompt record (data model)

Prompts are stored as one object keyed by prompt ID (IDs are timestamp-based strings: date-time to the millisecond plus sub-millisecond and random digits, so lexical order = creation order). Older array-shaped data is migrated on read. Per prompt:

| Field | Meaning |
|---|---|
| `title`, `text` | name and body |
| `color` | optional accent colour |
| `usePlaceholders` | whether the body is parsed for variables (otherwise inserted verbatim) |
| `autoExecute` | send automatically after inserting |
| `isFixed` | pinned to the top section of the list |
| `activeFileIds` | IDs of files from the global file library to attach every time |
| `shortcut` | optional per-prompt key combination |
| `tags` | tag names (tags have their own colour/style config and an active-filter list) |
| `usageCount` | incremented on each use |
| `position` | manual order (normalised to 1..n after every change) |
| `isShared`, `sharedUrl`, `updateInterval` (days, default 7), `lastUpdateCheck`, `version`, `author`, `summary`, `changelogText` | external ("shared") prompt subscription |

Ordering: a newly added prompt goes to the top of the non-pinned section; **every time a non-pinned prompt is used it moves to the top of the non-pinned section** (most-recently-used ordering). Sort modes for the list: manual, A–Z, Z–A, most used, least used, newest, oldest (by ID), and by tags.

## Dynamic prompts: variable syntax and types (mechanism)

When `usePlaceholders` is on, the body is parsed before insertion and the user gets a form (one field per variable, in order). Constructs, described in prose:

1. **Text field.** A label in square brackets becomes a multi-line text input labelled with that text. An optional **default value** follows the label after a double-colon separator. An optional **comment / help text** can follow the closing bracket in parentheses. Empty answers remove the placeholder, and if it was alone on its line the whole line is removed.
2. **Named (reusable) variable.** Inside the brackets, `label = $name` binds the field to a variable name; after the form is submitted every occurrence of `$name` anywhere in the prompt (including inside quoted literal blocks) is replaced with the answer. Defaults and comments work as above.
3. **Hidden value.** The same named form written with **curly braces** instead of square brackets creates a field whose answer is **not printed at that position**; it only sets the `$name` variable used elsewhere. This is how one answer feeds several places without appearing where it was asked.
4. **Option list (dropdown / checklist).** A block delimited by start and end marker lines (marker character repeated any number of times so blocks can be nested/escaped by count) defines a group of checkbox options. Inside:
   - **header lines** (marker + text, optional parenthesised comment) group options under a sub-title;
   - **option lines** consist of a prefix and a bracketed label, plus an optional parenthesised comment. The prefix sets the selection rule:
     - `+` = **multi**: freely combinable with other options;
     - `-` = **exclusive ("sovereign")**: selecting it clears every other option in the group, and selecting any other option clears it;
     - a **number** = **ID group**: options sharing the same number are mutually exclusive with each other but combine with others (each ID gets a colour stripe);
     - a special bracketed marker = **"Other"**: shows a free-text box; its text becomes the value.
   - A label ending in a double-colon followed by `x` marks that option **checked by default**.
   - An option can have a **separate value** (the text inserted when chosen) given as a quoted string on the following line(s); that value may itself contain bracketed sub-fields (with defaults), which appear as extra text boxes under the option when it is checked.
   - **Inline vs block**: if the whole block is on one line, chosen values are joined with spaces; otherwise with newlines, and the block's indentation is preserved.
   - If nothing is chosen, the placeholder (and its line if alone) is removed.
5. **File slot.** A file token (optionally with a parenthesised title) becomes a drop zone / file picker in the form; files given there are attached to the message at insertion. Repeated tokens with the same title share one slot.
6. **Date and time tokens.** Expand at insertion to the current local date (day/month/two-digit year) and/or time (hours:minutes:seconds); suffix modifiers drop individual components; a date and a time can be combined in one token.
7. **Literal / escape mechanisms.** A backslash escapes the syntax characters; a region between ignore/end marker lines is inserted verbatim (no parsing, no variable substitution); a region wrapped in two or more single quotes is inserted literally but **does** get `$name` substitution.

Form UX: each text box has paste and enhance buttons; Enter submits (Shift/Ctrl/Alt/Meta+Enter inserts a newline, configurable); the first field is focused. The editor for prompt bodies offers syntax highlighting, auto-closing of brackets and quotes, wrapping a selection in a token, and autocompletion of tokens, tags and already-declared `$variables`.

Artifact mapping (SPEC §6D): use Artifact's own `{{variable}}` syntax but keep the same **types**: text with default and help text, reusable named variables, hidden (non-printing) variables, option groups with multi / exclusive / ID-group / other / default-checked, per-option inserted value with sub-fields, file slots, date/time tokens, and an escape/literal mechanism.

## Auto-attached files

- **Global file library:** files the user uploads in settings are stored as data URLs with `id`, `name`, `size` (and type in the data URL) in one stored list; adding a file with the same name and size as an existing one is a no-op. A prompt references files by ID (`activeFileIds`).
- **Per-run files:** file slots in the variable form, and the paste button's clipboard files (non-text clipboard items become `clipboard-<timestamp>.<ext>` files).
- **Attaching to the site** (all files are put into one `DataTransfer`):
  - Gemini and Perplexity: a synthetic `paste` event on the composer (Chromium); on Firefox, synthetic `dragenter` / `dragover` / `drop` events on the drop target (`[data-filedrop-id]`, `.chat-window-input-container`, or the composer).
  - Grok, Mistral, Google AI Studio, Kimi, Google AI Mode (and several non-Artifact sites): synthetic drag events on `.chat-input-container`, the nearest `form`, or the composer.
  - Everyone else: set `files` on the first `input[type="file"]` and dispatch `change` and `input`; if there is no file input, synthetic drag events on the composer.
- Text is inserted 100 ms after the files.
- **Auto-send with files:** instead of clicking immediately, it polls every 800 ms (up to 120 s) and clicks the send button as soon as it is enabled (not `disabled`, not `aria-disabled`, cursor not `not-allowed`, opacity ≥ 0.5, visible); it stops if the composer becomes empty (message sent).

## Inserting into each site's composer

Composer selectors (for Artifact's sites):

| Site | Composer selector | Send button (first match of) |
|---|---|---|
| ChatGPT | `#prompt-textarea` | `[data-testid="send-button"]`, `#composer-submit-button`, `button.composer-submit-btn` with a core-sprite SVG |
| Claude | `div.ProseMirror[contenteditable="true"]` | a button whose SVG path starts `M208.49,120.49`; `button[type="button"]` with a 256×256 viewBox SVG; a nested `div.shrink-0` button |
| Gemini | `div.ql-editor[contenteditable="true"]` | `button.send-button.submit`, a button containing `mat-icon[data-mat-icon-name="send"]`, `.send-button-container button` |
| Google AI Studio | `textarea` | `ms-run-button button[type="submit"]`, `ms-run-button button.ms-button-primary` |
| Grok | `div.tiptap.ProseMirror[contenteditable="true"]`, `textarea` | `button[type="submit"]` whose SVG path starts `M6 11L12 5` (or `M6 11`), any submit button with SVG |
| Perplexity | `#ask-input` | a button using an `arrow-right` SVG symbol, `button.bg-button-bg` with SVG |
| DeepSeek | `textarea.ds-scroll-area` | `div[role="button"]` whose SVG path starts `M8.3125 0.98…`, `.ds-icon-button` |
| Mistral | `div.ProseMirror[contenteditable="true"]` (and its `p`) | `button[type="submit"]` containing a path starting `M12 18v4h4v-4h-4`, else first submit button |
| Kimi | `div.chat-input-editor[contenteditable="true"]` | `.send-button-container` with a send SVG (path prefix `M705.536` or `svg[name="Send"]`) |
| Poe | `textarea[class*="GrowingTextArea_textArea"]` | `button[data-button-send="true"]`, a button whose path starts `M11.293 4.293` |
| Copilot | `#userInput`, `textarea[data-testid="composer-input"]` | `button[data-testid="submit-button"]`, a button whose path starts `M4.20889 10.7327` |
| Google AI Mode (`udm=50`) | `textarea.ITIRGe` | `button[data-xid="input-plate-send-button"]`, a button whose path starts `M440-160v-487` |

Insertion strategies (the composer is focused first; caret moved to the end afterwards unless inserting at a saved inline-trigger position):

- **Claude, Grok** (contenteditable): build one `<p>` per line (`<p><br></p>` for blank lines) and insert with the editing command for HTML; if that is refused, dispatch a synthetic `paste` with both `text/html` and `text/plain`; then fire `input`. For a textarea variant: splice at the selection using the native value setter and fire `input`.
- **Gemini:** the insert-text editing command (fallback: append a text node); on Firefox, append to the first paragraph. Fire `input` (composed).
- **Firefox only, Kimi and Perplexity:** clear an empty editor, append one `<p>` per line, fire `input`, move caret to end.
- **Firefox only, ChatGPT and Mistral:** the insert-text editing command.
- **Default (everyone else, incl. ChatGPT/Mistral/Kimi/Perplexity on Chromium, DeepSeek, Poe, Copilot, AI Studio):** dispatch a synthetic `paste` `ClipboardEvent` with `text/plain`; if the element has a `value` that still does not contain the text (plain textareas ignore synthetic paste), splice the text in with the native `HTMLTextAreaElement` value setter and fire a bubbling `input` event.
- Some editors (Slate-based) get a `beforeinput` `insertText` event plus a synthetic paste.

**Clearing the composer** (used by enhance-in-place): select-all + delete editing commands, then if text remains: native value setter to empty (textarea) or reset inner HTML (Quill editors to an empty paragraph), fire `input` and `change`, put the caret at the start.

**Auto-execute** (when `autoExecute` and not inserted from the inline trigger): after 150 ms click the send button if found and enabled, otherwise dispatch an Enter `keydown` on the composer. For Grok and Perplexity (and some others) it repeatedly dispatches Enter every 800 ms until the composer is empty (max 120 s). With files: the upload wait described above.

Artifact rules apply on top (SPEC §6D/§0.6): pre-fill by default, auto-send opt-in.

## Inline trigger

Typing `#` followed by text (at the start or after whitespace) in the composer opens an inline menu with up to 8 prompts whose titles contain the typed text (hyphens match spaces). Arrow keys move, Enter/Tab accept (the key event is swallowed so the site does not send), Escape closes. Accepting deletes the trigger text and inserts the prompt at that caret position, or opens the variable form and remembers the caret for when the form is submitted. (Artifact uses `//` for this, SPEC §6D.)

## Keyboard shortcuts (defaults, all rebindable)

New prompt, open prompt list, save-and-send (Ctrl+Enter in forms), save in editor, line break in forms (Shift+Enter), enhance (Alt+E), expanded prompt manager. Each prompt can also have its own shortcut that inserts it directly.

## The enhancer

**Triggers / modes:**

1. **Composer button** (or shortcut): takes the current composer text, sends it to the configured API, shows a comparison, and on accept clears the composer and inserts the improved text.
2. **Form / editor fields:** an enhance button on each variable text box and in the prompt editor improves just that field's text.

There is **no "current chat" mode** in this version: enhancement always goes through the user's own API key. (SPEC §6D's "current chat" mode is an Artifact addition.)

**Editable system prompt:** settings hold one free-text system prompt (a short default instruction to rewrite the user's prompt more clearly in the same language and return only the result). The user can replace it. If the text contains **two or more presets** written as a list of entries — each with a title, an optional parenthesised comment and a body wrapped in double braces — the enhancer shows a searchable preset picker (type to filter by title/comment, arrow keys, Enter) before each run, and the chosen preset's body becomes the system prompt for that call. With fewer than two such entries the whole text is used as-is.

**Result review:** a modal shows original vs enhanced side by side with a line diff (synchronised scrolling); a toggle switches the enhanced side into an editable textarea; buttons keep the original or use the enhanced text. A loading overlay (or a spinner on the field's button) runs during the call. A missing key opens a dialog that jumps to the AI settings tab.

**Provider calls** (all via the userscript cross-origin request, non-streaming):

| Provider | Endpoint | Request shape | Response read |
|---|---|---|---|
| Gemini | `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<key>` | `contents[0].parts[0].text` = user text; `systemInstruction.parts[0].text` = system prompt | `candidates[0].content.parts[0].text`; error from `error.message` |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | OpenAI chat: `model`, `messages` [system, user], `temperature: 0.7`; `Authorization: Bearer <key>` | `choices[0].message.content` |
| Hugging Face router | `https://router.huggingface.co/v1/chat/completions` | same | same |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | same, plus `HTTP-Referer: <site origin>` | same |
| NVIDIA | `https://integrate.api.nvidia.com/v1/chat/completions` | same | same |
| Custom | user's endpoint URL + user's model name | same | same |

The selected model is stored as `<providerNumber>|<modelId>` (1 Gemini, 2 Groq, 3 Hugging Face, 4 OpenRouter, 5 NVIDIA, 6 custom); default Gemini. The model menu is a hardcoded list (**hardcoded in reference, unverified**): about 15 Gemini/Gemma IDs (e.g. `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-flash-latest`, `gemini-pro-latest`, plus several newer preview names), about 11 Groq IDs (e.g. `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, `qwen/qwen3-32b`, `groq/compound`), about 15 Hugging Face IDs (DeepSeek, Qwen, GLM, Gemma, gpt-oss families), and a list of OpenRouter `:free` models plus `openrouter/free`. Artifact must source model names from official docs (SPEC §0.3), not from this list.

**Key rotation:** each provider's key field accepts **several keys separated by commas, spaces or newlines**. Every call takes the key at the provider's stored index and immediately advances the index (round-robin, wrapping, persisted in settings), regardless of whether the call succeeds. There is **no failover**: a failing key produces an error for that call; the next call simply uses the next key. No per-key cooldown, no rate-limit tracking.

**Queueing / rate handling:** none for the API (one request at a time because the UI blocks on it; no retry, no backoff, no 429 handling). The only waiting logic is the upload/send polling above (800 ms interval, 120 s cap). No prompt queue, no chains.

Artifact improvements (SPEC §6D/§6J): rotation that skips keys after 429/401, a visible activity log, PII redaction and the first-send disclosure before any call.

## External ("shared") prompts with auto-update

- A shared prompt is subscribed to by URL of a small JSON metadata file. Comments and trailing commas in that JSON are tolerated. Required fields: `title`, `version`, `prompt` (URL); optional: `summary`, `author`, `changelog` (URL), `usePlaceholders`, `autoExecute`.
- The prompt body and changelog URLs must end in `.txt` or `.md` and be on an allow-listed host: `raw.githubusercontent.com`, `gist.githubusercontent.com`, `cdn.jsdelivr.net`, `gitlab.com`. Fetches bypass caches (cache-busting query parameter and no-cache headers). Title is truncated to 50 characters and summary to 200, both HTML-escaped.
- On load, each shared prompt whose `updateInterval` days have passed since `lastUpdateCheck` is re-fetched; if the remote dotted version is higher, a confirmation modal shows the rendered changelog and lets the user accept (body, title and flags replaced) or skip; either way the check time is updated. Interval 0 disables checks.
- There is also a GitHub Gist integration (buttons on gist pages to import a prompt file or export into the gist editor).

## Import / export

- Export: selected prompts as one JSON array file or as one file per prompt, each item having `title`, `text`, `usePlaceholders`, `autoExecute`; filename suffix `.mp.prompt.json`. Multi-file export asks for confirmation and spaces downloads 200 ms apart.
- Import: JSON as above, or a plain text/Markdown file. A text file whose first line is a double-brace header holding semicolon-separated `key: value` pairs (`title`, `usePlaceholders`, `autoExecute`) can contain several prompts, each starting with such a header; otherwise the whole file is one prompt titled from the filename.
- A backup manager exports/imports all settings and data.

## Message navigator (related idea for Artifact's timeline, SPEC §6E)

- Scans the page for user and assistant messages with per-site selectors, lists them (filter tabs: all / user / assistant, plus a pinned-list mode), jumps to and highlights a message, and lets the user **pin** messages. Pins are stored in IndexedDB database `MyPrompt`, object store `chatPins`, keyed by `chatId` = path + query + hash. Pinned messages show in a draggable, rotatable "carousel" bar.
- Message selectors (for Artifact's sites):

| Site | User message item / text | Assistant item / text |
|---|---|---|
| ChatGPT | `div[class*="user-message-bubble"]` / `div[data-message-author-role="user"] .whitespace-pre-wrap` | `div[data-message-author-role="assistant"]` / `.markdown` |
| Claude | `div[data-cds="UserMessage"] > div.rounded-card` / `[data-testid="user-message"]` | `.font-claude-response:has(.standard-markdown)` / `.standard-markdown` |
| Gemini | `span[class^="user-query-bubble"]` / `.horizontal-container .query-text p` | `div[class^="markdown markdown-main-panel"]` / `p` |
| AI Studio | `div[data-turn-role="User"] .turn-content` / `ms-prompt-chunk ms-text-chunk .user-chunk` | model turns are `div[data-turn-role="Model"]`; their `ms-prompt-chunk` children, skipping any chunk that contains an `ms-thought-chunk`; text in `ms-text-chunk` |
| Grok | `.message-bubble.bg-surface-l1` / `.break-words` | `.items-start .response-content-markdown` / `p.break-words` |
| Perplexity | `div.group\/user-bubble` / `div.bg-subtle span.whitespace-pre-line` | `div[data-workflow-final-text]` / `div.prose[data-renderer="lm"]` |
| DeepSeek | `.ds-message:not(:has(.ds-markdown)) > div:first-child` | `.ds-message:has(.ds-markdown)` / `.ds-markdown` |
| Kimi | `.chat-content-item-user .segment-content` / `.user-content` | `.segment-assistant .segment-content-box` / `.markdown` |
| Mistral | `div[data-message-author-role="user"] .rounded-3xl` / `.select-text span` | `div:has(>[data-testid="text-message-part"])` / `[data-testid="text-message-part"]` |
| Poe | `.Message_rightSideMessageBubble__ioa_i` / `.Message_selectableText__SQ8WH p` | `.Message_leftSideMessageBubble__VPdk6` / same text selector |
| Copilot | `div:has(> div[data-content="user-message"])` / `div[data-content="user-message"]` | `div[data-testid="ai-message"]` / `div[id*="-content-"]` |

The navigator is disabled on Google AI Mode and image-generation sites.

## Storage (keys and shapes)

| Key | Shape |
|---|---|
| `Prompts` | object `{<id>: prompt record}` |
| `GlobalFiles` | array of `{id, name, size, data (data URL)}` |
| `PromptTags` | `{tags: {}, activeFilters: [], sortMode}` |
| `AISettings` | one key string per provider (`apiKeyGemini`, `apiKeyNvidia`, `apiKeyGroq`, `apiKeyOpenRouter`, `apiKeyHuggingFace`, `apiKeyCustom`), matching rotation indexes (`keyIndex…`), `customEndpoint`, `customModel`, `model`, `systemPrompt` |
| `ShortcutsConfig` | JSON string of `{action: {keys}}` |
| `Prediction` | `{enabled}` (editor autocompletion) |
| `NavConfig` | `{enabled, settings: {filterMode, showCarousel, carouselPosition {left, top}, carouselOrientation, carouselActionsSide, keepListOpen}}` |
| `Theme` and imported themes, syntax-highlight config, preview-prompt config, a do-not-show-again option flags, `UserScriptLang`, `DismissedNotifications`, `ScriptUsageCount`, a font cache | UI state |
| IndexedDB `MyPrompt` / `chatPins` | `{chatId, …pins}` |

API keys are stored in plain text in userscript storage.

## External network use not to port

The script also fetches: a notifications gist from its author, web fonts and translations from a CDN, and a donation-page integration. Artifact ships its own strings and fonts and makes no such calls (SPEC §0.4).
