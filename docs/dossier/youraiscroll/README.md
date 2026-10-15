# YourAIScroll 1.9.9 — overview (clean-room dossier)

Source: closed-source Chrome build of YourAIScroll 1.9.9 (MV3, built with Plasmo/Parcel, React popup and options page). Everything here is behavior and interoperability facts observed in that build. Nothing here was confirmed against the live sites; treat every endpoint, selector and payload field as **"observed in YourAIScroll 1.9.9, unconfirmed live"** (SPEC §0.3).

Related files:

| File | Contents |
|---|---|
| [per-site-extraction.md](per-site-extraction.md) | One section per site: data source, endpoints, paging, branches, attachments, artifacts, code, math, citations, edge cases |
| [export-formats.md](export-formats.md) | MD, TXT, JSON, HTML, PDF, DOCX, copy, batch ZIP: layout, metadata, filenames, image handling |
| [share-links.md](share-links.md) | Which share / temporary / private URLs are handled and how |
| [ai-studio-reader.md](ai-studio-reader.md) | The Google AI Studio reader (MakerSuiteService RPC) |
| [ui-and-flows.md](ui-and-flows.md) | Popup states, single export flow, batch flow, progress, messaging protocol |
| [settings.md](settings.md) | Options page, storage keys, AI summary and Notion integrations |
| [../endpoints-youraiscroll.md](../endpoints-youraiscroll.md) | Per-site endpoint / RPC table and DOM selectors |

## What the product does

A popup-driven exporter. The user opens a chat on a supported site, opens the toolbar popup and either copies the chat as Markdown or downloads it in one of six formats. On most sites a "batch" mode lists the account's conversations (paged) and downloads a selected set as one ZIP. Optional extras: an AI-generated summary of the user's own messages injected at the top of an export (user's own API key, many providers), and a Notion export action (user's own Notion integration token).

There is **no in-page UI** at all: no buttons injected into the AI sites, no sidebar, no context menu. All interaction is through the toolbar popup and the options page. Content scripts only answer messages from the popup.

## Supported sites and URL match patterns

The manifest registers one content script per site. The popup recognises the same set by substring of the active tab URL.

| # | Site (popup name) | Content-script match pattern (manifest) | Popup URL substring | Internal platform key | Batch list? |
|---|---|---|---|---|---|
| 1 | ChatGPT | `https://*.chatgpt.com/*`, `https://chatgpt.com/*` | `chatgpt.com` | `openai` | yes |
| 2 | Claude | `https://*.claude.ai/*` | `claude.ai` | `anthropic` | yes |
| 3 | Gemini | `https://*.gemini.google.com/*` | `gemini.google.com` | `google` | yes |
| 4 | Google AI Studio | `https://*.aistudio.google.com/*` | `aistudio.google.com` | `googleaistudio` | yes (single page, no paging) |
| 5 | Perplexity | `https://*.perplexity.ai/*` | `perplexity.ai` | `perplexity` | yes |
| 6 | Poe | `https://*.poe.com/*` | `poe.com` | (none) | no |
| 7 | DeepSeek | `https://*.chat.deepseek.com/*` | `chat.deepseek.com` | `deepseek` | yes |
| 8 | Grok | `https://*.grok.com/*` | `grok.com` | `grok` | yes |
| 9 | Kimi | `https://*.kimi.com/*` | `kimi.com` | `kimi` | yes |
| 10 | Mistral Le Chat | `https://*.chat.mistral.ai/*` | `chat.mistral.ai` | `mistral` | yes |
| 11 | Microsoft Copilot | `https://copilot.microsoft.com/*` | `copilot.microsoft.com` | `copilot` | yes |
| 12 | GitHub Copilot chat | `https://github.com/copilot*` | `github.com/copilot` | `github-copilot` | yes (single page, no paging) |
| 13 | Google AI Mode / AI Overview | `https://www.google.com/search*` | `google.com/search` | (none) | no |

Note on the "12 sites" seed fact: the build actually ships **13** content scripts and 13 popup platform entries. The 13th is Google Search (AI Mode conversations and the AI Overview box), which the product presents as "Google AI". The 12 chat sites plus Google AI Mode match SPEC §2's Tier 1 + Tier 2 list exactly.

Caveat for the build: the `*.chat.deepseek.com`, `*.chat.mistral.ai`, `*.gemini.google.com` and `*.aistudio.google.com` patterns in Chrome match the bare host too (the `*.` wildcard includes the host itself). `*.grok.com` and `*.kimi.com` likewise.

## Entrypoints

| Entrypoint | Role |
|---|---|
| Background service worker | (1) Captures a login token from the vendor's own website via `webRequest` (see "Server dependencies"). (2) Answers subscription-check messages (calls the vendor server, caches 5 minutes). (3) Proxies three cross-origin fetches the content scripts cannot do themselves: the ChatGPT conversation list, a single ChatGPT conversation, and the GitHub Copilot thread list / thread messages. |
| 13 content scripts (one per site) | Each listens for `runtime.onMessage` requests from the popup: read the title, read the current chat, export it, list conversations, batch-export. They do the site API calls (same-origin, with the user's cookies) and all file generation, then trigger the download from the page with a temporary `<a download>` link. |
| Popup (`action.default_popup`) | The whole UI: platform detection, copy, single download, Notion save, AI-summary toggle, batch mode with list, selection and progress. |
| Options page (opens in a tab) | Account (sign in/out, plan display, batch page size), Notion credentials, AI-summary provider configuration. |

There are no keyboard commands, context menus, side panel, offscreen document or alarms.

## Permissions and their use

| Permission | Used for |
|---|---|
| `storage` | `storage.local` for settings, progress, batch status; Plasmo storage wrapper for the auth token, user info and subscription cache. |
| `tabs` | `tabs.query` (active tab URL and id), `tabs.sendMessage` to the content script, `tabs.create` for opening the options page, changelog and pricing pages. |
| `webRequest` | `onBeforeRequest` on the vendor's own website to pull a login token out of a redirect URL. Not used on any AI site. |
| host `<all_urls>` | Background `fetch` to `chatgpt.com` and to `*.githubcopilot.com` (CORS-free from the worker); content-script `fetch` of images when building DOCX; AI-provider calls for summaries; Notion API calls. |

Artifact should not need `webRequest` or `<all_urls>`: the ChatGPT fetches work same-origin from the content script on chatgpt.com (YourAIScroll routes them through the background mainly to set extra headers), and GitHub Copilot's API host can be a single host permission.

## Storage (summary; full list in settings.md)

All local to the browser. Keys: batch page size, last chosen download format, AI summary on/off and provider config (including the API key in plain text), Notion token and database ID (plain text), batch status (live progress record), per-platform download progress (set of already-exported conversation IDs, capped at 5,000 per platform), changelog-seen version, ChatGPT bearer token cache, vendor auth token, decoded user info, and a per-email subscription cache. No conversation content is ever stored.

## Free vs paid (described only; never port)

The gating is enforced **only in the popup** by asking the background worker for the user's plan. The plan comes from the vendor's server (looked up by the signed-in email, cached 5 minutes). If the server is unreachable the plan is treated as free.

| Feature | Free | Paid ("Premium") |
|---|---|---|
| Copy current chat as Markdown to the clipboard | yes | yes |
| AI summary toggle (works with copy) | yes (own API key) | yes |
| Download current chat as MD / JSON / TXT / HTML / PDF / Word | no | yes |
| Save current chat to Notion | no | yes |
| Batch mode: list conversations | yes (list loads) | yes |
| Batch mode: download selected as ZIP | no | yes |
| Notion settings tab in options | hidden behind an upsell | yes |

How the gate works (behavior only): before any non-copy action the popup re-checks the plan (forcing a server refresh if the cached plan is not paid) and shows a blocking upgrade dialog if it is still free or the user is not signed in. Content scripts do not check the plan; the gate is purely client-side UI. Artifact has no plan concept: every one of these features is free and local.

## Server dependencies (the build never calls these)

The vendor's own server (`youraiscroll.com`) is used only for:

- **Login:** the popup opens the vendor's login page; after login the vendor redirects to a URL on its own domain carrying a JWT in the query string, which the background worker captures with `webRequest`, stores, and decodes (email) without verifying it.
- **Subscription / license check:** a GET to the vendor API with the email and a static API key header; result cached 5 minutes per email.
- **Links:** homepage, changelog (a red dot appears on the version label when the installed version differs from the last version whose changelog was opened), roadmap, dashboard and pricing pages.

Nothing else depends on the vendor server. All extraction and file generation is local. Third-party services contacted only on user action: the AI provider the user configured (summaries) and the Notion API (save to Notion).

## Logging

A logger module replaces `console.log`, `console.debug` and `console.info` with no-ops in every context; only warnings and errors remain visible.

## Notable weaknesses Artifact should beat

- ChatGPT, Claude, Grok and Mistral exports flatten **all branches** (every edit and regeneration) into one linear list ordered by time or index; only DeepSeek, Kimi and GitHub Copilot walk the active branch.
- No real file or image export anywhere: uploaded files, generated images, Claude artifacts and canvases become inline text at best (Claude artifacts as fenced code), and images are dropped on most sites. DOCX is the only format that embeds images, and only if the Markdown already contains an image link.
- HTML export inserts site-rendered Markdown without sanitising.
- PDF is the browser print dialog, not a file.
- Batch mode has no pause/stop, no pacing (except a fixed 750 ms delay on ChatGPT), and on most sites one failure aborts the whole ZIP.
- Single-chat filenames only replace whitespace, so titles with `/`, `:` or `?` can produce invalid download names.
