# YourAIScroll 1.9.9 — settings, storage and integrations

Observed in YourAIScroll 1.9.9. Visible text paraphrased.

## Options page

Opens in a tab. Header with logo, product name and links to the vendor's homepage, changelog, roadmap and dashboard. A tab row with three tabs: **Account**, **Notion**, **AI Summaries**. Signed-out users see a sign-in prompt instead of settings; an authentication-error state offers a reset-and-sign-in action.

### Account tab

- Greeting with the signed-in email, sign-out button (clears token, user info and all subscription caches, broadcasts an auth-changed message).
- Current plan label (free / paid), with a refresh icon when not paid (forces a server re-check).
- **Batch settings:** a range slider for "conversations per page" in the batch list: min 20, max 200, step 10, default 60. Reset-to-default and save buttons; a transient "saved" confirmation (2.5 s). Stored as `batchConfig.listPageSize` and clamped to [20, 200] on read.

### Notion tab (paid only)

- Free users see an upsell card (with a hint to sign out and back in after upgrading).
- Paid users: a link to the vendor's own guide on getting a Notion key and database ID, a password field for the Notion integration token and a text field for the database ID, and a save button.
- Validation: token required and must be printable ASCII without spaces; database ID required. Errors from the Notion client about invalid header bytes are translated into an a bad-key error message.
- Stored as `notionConfig = {auth, databaseId}` in plain text.

### AI Summaries tab

- Explains that the user's own key is used to summarise the user's messages and the summary is put at the top of each export; keys are stored locally.
- Fields: provider (select), API key (password), model (text, with the provider's default model as placeholder and a link to the provider's model list), base URL (optional; required for the OpenAI-compatible provider), save button.
- Stored as `aiProviderConfig = {provider, apiKey, model, baseURL}` in plain text. Default `{provider: "openai", apiKey: "", model: "", baseURL: ""}`.

Providers (via the Vercel AI SDK; default models are **hardcoded in reference, unverified**):

| Provider key | Display | Default model | Notes |
|---|---|---|---|
| `openai` | OpenAI | `gpt-4o-mini` | optional base URL |
| `anthropic` | Anthropic | `claude-haiku-4-5` | sends the browser-direct-access opt-in header |
| `google` | Google Gemini | `gemini-2.5-flash` | |
| `mistral` | Mistral | `mistral-small-latest` | |
| `groq` | Groq | `llama-3.3-70b-versatile` | |
| `xai` | xAI Grok | `grok-3-mini` | |
| `deepseek` | DeepSeek | `deepseek-chat` | |
| `moonshotai` | Moonshot (Kimi) | `kimi-k2.5` | |
| `openrouter` | OpenRouter | `openai/gpt-4o-mini` | chat-completions model |
| `cohere` | Cohere | `command-r-08-2024` | |
| `togetherai` | Together.ai | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | |
| `fireworks` | Fireworks | `accounts/fireworks/models/deepseek-v3` | |
| `cerebras` | Cerebras | `gpt-oss-120b` | |
| `openai-compatible` | OpenAI-Compatible | (none) | base URL required |

Call: a single non-streaming text generation with one prompt (no system message) built from the numbered user messages; the trimmed text is the summary. One key per provider, no rotation, no retry, no PII redaction, no confirmation of what is sent. The call is made from the popup.

## Popup-level setting

- **Include AI summary** checkbox → `summaryEnabled` (boolean) in `storage.local`.
- **Last format** → `downloadFormat`.

## Full storage inventory

| Key | Area | Shape | Purpose |
|---|---|---|---|
| `downloadFormat` | local | `"md" \| "json" \| "txt" \| "html" \| "pdf" \| "docx"` | last chosen format |
| `summaryEnabled` | local | boolean | summary toggle |
| `aiProviderConfig` | local | `{provider, apiKey, model, baseURL}` | summary provider |
| `notionConfig` | local | `{auth, databaseId}` | Notion |
| `batchConfig` | local | `{listPageSize}` | batch page size |
| `batchDownloadStatus` | local | `{platform, phase, current, total, startedAt, endedAt?, lastTitle?, errorMessage?}` | live batch progress (auto-removed 4 s after end) |
| `downloadProgress` | local | `{[platform]: {lastDownloadedAt, totalDownloaded, downloadedIds[≤5000], lastConversationId}}` | already-exported tracking |
| `lastSeenChangelogVersion` | Plasmo storage | string | changelog dot |
| `openai_token` | Plasmo storage | `"Bearer …"` | cached ChatGPT access token |
| `authToken`, `userInfo` | Plasmo storage | JWT string; decoded JWT payload | vendor login (not needed by Artifact) |
| `subscriptionCache_<email>` | Plasmo storage | `{plan, email, timestamp}` | vendor plan cache, 5-minute TTL (not needed by Artifact) |

No settings export/import, no sync, no per-site toggles, no theme option (the popup's styles include dark-mode variants).

## Notion integration details (behavior)

- Uses the official Notion JS client from the popup with the user's token.
- Reads the database schema once (cached) to find: the title property (named `title` or the first title-type property), a `Created` date property, a `Platform` rich-text property, and a URL property (named `URL` or the first URL-type property). Missing optional properties are skipped.
- Page properties: title (truncated to 2,000 chars), Created = now, Platform = site display name, URL = tab URL (only if ≤ 2,000 chars).
- If a URL property was filled, the leading header lines (URL / conversation time / export time) are removed from the body.
- Body: a line-based Markdown → Notion block converter:
  - role marker lines get an emoji prefix (question mark for user, robot for assistant);
  - fenced code → `code` blocks (language validated against Notion's language list, else "plain text"); code over 2,000 chars is split into 1,900-char blocks with an italic note;
  - pipe tables → `table` blocks with `table_row` children (header detection by the separator row); split into parts if over 100 rows or ~450 KB, with "continued" notes; tables that cannot fit fall back to text paragraphs;
  - `$$…$$` and `\[…\]` blocks → `equation` blocks (expressions over 1,000 chars become plain-text code blocks); inline `$…$`, `\(…\)`, `\[…\]` → inline equations; `**bold**`, `*italic*`/`_italic_`, `` `code` `` → annotations;
  - bullet / numbered lists with nesting by 2-space indent;
  - long paragraphs (> 1,900 chars) split at sentence punctuation (including CJK punctuation) or spaces, with an italic note;
  - rich-text arrays split into chunks of at most 100 items.
- Blocks are sent in batches of ≤ 100 children and ≤ 450,000 bytes of JSON: the first batch with page creation, the rest with append-children calls.

Artifact deliberately has no Notion integration in SPEC; recorded for completeness (SPEC §6I covers Obsidian and Markdown clipboard instead).
