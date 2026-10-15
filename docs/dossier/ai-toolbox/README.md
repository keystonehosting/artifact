# AI Toolbox 5.0.54: dossier overview

Clean-room analyst output. Facts and behavior only, written from the closed build without reproducing its code, UI text, icons, sounds, styles or prompt content. Strings are referenced by hashed ID (see [strings.md](strings.md)). Every site endpoint, RPC ID and selector in this dossier is **observed in AIT 5.0.54, unconfirmed live**; the build must confirm each one live (SPEC §0.3) before relying on it.

Hardcoded model names, context windows and plan caps quoted anywhere in this dossier are **AIT hardcoded values, unverified**. They are recorded so the build knows what AIT shows, not as facts about the sites.

## 1. What the build ships

Manifest V3, version 5.0.54, default locale English, 12 UI languages (ar, de, en, es, fr, he, hi, it, ja, ko, pt, zh). One background service worker, one content script per site, two MAIN-world page hooks, a popup, a standalone a cross-site search action page, per-site CSS, 11 notification sounds, a prompt-category JSON map and icons.

### Sites

| Site | How it is enabled | Content script | Notes |
|---|---|---|---|
| ChatGPT (`chatgpt.com`) | Static content script in the manifest; can be soft-disabled from the popup (a stored on/off flag, the script still loads and checks it) | `scripts/chatgptContent.js` + 4 CSS files, `document_end` | The most complete integration (30+ features). Also a MAIN-world script `shareAttribution.js` at `document_start`. |
| Claude (`claude.ai`) | Optional host permission (plus optional `webNavigation`), granted from the popup; the background then registers content scripts dynamically | `scripts/claudeContent.js` + `styles/claude.css`, and MAIN-world `scripts/claudePageHook.js` at `document_start` | |
| Gemini (`gemini.google.com`) | Optional host permission | `scripts/geminiContent.js` + `styles/gemini.css`, and MAIN-world `scripts/geminiPageHook.js` at `document_start` | Multi-account paths `/u/<n>/...` are handled. |
| Grok on `grok.com`, and on `x.com` / `twitter.com` (the `/i/grok` page) | Optional host permissions for all three origins (plus optional `webNavigation`) | `scripts/grokContent.js` + `styles/grok.css` registered for each origin | Two back ends: grok.com REST and X GraphQL. |

**Not supported by AIT 5.0.54:** Google AI Studio, Perplexity, DeepSeek, Mistral, Kimi, Poe, Copilot, Google AI Mode. There is no AI Studio code path, selector or RPC in the build. Everything the dossier says about AI Studio is "absent in AIT".

When an optional host permission is granted, the background re-registers scripts and reloads matching open tabs (at most once per tab per 3 s). On update from a version below 5, it sets a "NEW" action badge and a pending-banner flag, and for each open supported tab it injects a tiny function that reloads the tab only if no visible textarea or contenteditable holds text (so a draft is never lost).

### Entrypoints and what each does

| File | Role |
|---|---|
| `scripts/background.js` | Service worker. (1) Global token-bucket rate limiter shared by all ChatGPT tabs (burst 6, refill 1.2 tokens/s, 60 s backoff after a 429, user-activity yield of 5 s) and a cross-tab "sync lease" so only one tab syncs history at a time (lease 60 s, renewed every 20 s, 30 s cooldown). (2) Captures the ChatGPT bearer token and `chatgpt-account-id` header from the page's own requests via `webRequest.onBeforeSendHeaders` (names only: `authorization`, `chatgpt-account-id`), and relays authenticated requests for content scripts (`API_REQUEST`, `API_BINARY_REQUEST`) with a host allow-list. (3) Watches ChatGPT network events to notify tabs: message sent (POST to the conversation endpoint), stream finished (`webRequest.onCompleted` of that POST, used for the sound alert and for advancing chains), stop pressed, PATCH on a conversation (rename/archive/delete), DELETE on a project, GPT hidden from sidebar. (4) Claude: captures the organization UUID from request URLs, counts completion POSTs into a 7-day local usage-event list (cap 20,000 timestamps), watches `delete_many` and single deletes to keep caches in step. (5) Grok on X: captures `authorization` and `x-csrf-token` header values from the page's GraphQL calls. (6) Owns the cross-platform IndexedDB index and answers cross-search, cross-tag and cross-folder queries from all tabs. (7) Handles keyboard commands, opens the standalone search page, opens a new tab on another site for cross-site handoff. (8) Account/session plumbing for the AIT server, premium checks, team sessions, uninstall URL, install-success page, 30-minute alarm for usage sync. |
| `scripts/chatgptContent.js` | Everything on ChatGPT: sidebar tabs and folder tree, floating launcher and command palette, all modals (search, manage chats, folders, prompts, chains, export, media gallery, usage dashboard, Smart Tags, labels, bookmarks, settings, achievements), composer triggers (`//`, `..`, `@@`), per-message buttons, context meter, voice download, history sync into IndexedDB, deep import. |
| `scripts/claudeContent.js` | Claude equivalents: launcher panel, search, folders, prompts/chains, Smart Tags, bookmarks, artifact vault, plan-usage badge and panel, context meter, handoff, cross-platform views, history sync. |
| `scripts/geminiContent.js` | Gemini equivalents via the `batchexecute` RPC endpoint: search, folders, prompts/chains, Smart Tags, bookmarks (server), usage badge, context meter, handoff, Gems import into the index. |
| `scripts/grokContent.js` | Grok equivalents for grok.com and x.com: search, folders, prompts/chains, Smart Tags, bookmarks and labels (server), rename/delete, context meter, handoff. |
| `scripts/claudePageHook.js` | MAIN world. Wraps `window.fetch`; when a Claude completion stream (`/chat_conversations/<id>/<…>completion`) returns, it reads the SSE lines until one carries a `message_limit` object, posts it to the content script with `window.postMessage`, and cancels its cloned reader. Source of live 5-hour / 7-day utilization. |
| `scripts/geminiPageHook.js` | MAIN world. Wraps `fetch` and `XMLHttpRequest`; when a `batchexecute` call with RPC `GzXR5e` (delete conversation) succeeds, it extracts the deleted conversation IDs from `f.req` and posts them to the content script so the local index drops them. |
| `scripts/shareAttribution.js` | MAIN world on ChatGPT. (a) Wraps `window.open` and appends an AIT promotional line to X/Twitter, LinkedIn and Reddit share intents (an upsell behavior; do not port). (b) A hydration beacon: waits (up to 15 s) until the page's React roots under the history nav, header and main are hydrated, then posts a "host hydrated" message so the content script injects UI only after React has settled. |
| `scripts/popup.js` + `popup.html` | Per-site on/off cards (ChatGPT soft flag; Claude, Gemini, Grok via `chrome.permissions.request/remove`), a warning when the browser blocks site access (with a link to the browser's extension details page, Edge/Opera/Vivaldi aware), "open in a tab" fallback when the permission prompt closes with the popup, tutorials link. Highlights the card of the site in the active tab. |
| `scripts/xsearch.js` + `xsearch.html` | Standalone a cross-site search action page opened by the global shortcut on any non-AI tab. Queries the background index; exports results. |
| `locales/*.json` | In-app strings, loaded by content scripts via the background (`GT_GET_TRANSLATIONS`/`GK_GET_TRANSLATIONS`/`changeLanguage`). Two test files ship by mistake (`limitMessages.test.ts`, `placeholders.test.ts`). |
| `assets/data/promptCategories.json` | Maps 12 prompt-library category slugs to locale keys. |
| `assets/sounds/alert*.mp3` | 11 completion sounds (web-accessible on ChatGPT only). |

Bundling: each content script is a webpack bundle with numbered modules; third-party libraries bundled include jsPDF (Claude/Gemini/Grok/xsearch), JSZip-like ZIP code, KaTeX (for rendering math in PDF), and the `jose` JWT library (background, Claude). The ZIP writer used for big exports is AIT's own streaming writer (see [export.md](export.md)).

## 2. Permissions and what they are used for

| Permission | Used for |
|---|---|
| `storage` | `chrome.storage.local` for settings, caches, local feature data, session tokens. |
| `webRequest` | Reading request headers and events on the AI sites: capture ChatGPT bearer token and account ID, Claude org ID, X auth headers; detect message sent / stream finished / deletes / renames to update caches, alerts, chains and usage counters. Non-blocking only. |
| `activeTab` | Popup knows which site is active. |
| `alarms` | One 30-minute alarm that tells ChatGPT tabs to sync usage stats to the AIT server. |
| `scripting` | Dynamic registration of Claude/Gemini/Grok content scripts after the optional permission is granted; the draft-safe reload function on update. |
| Host `https://chatgpt.com/*` | Required host. |
| Host on the AIT server | All server-backed features (below). |
| Optional hosts `claude.ai`, `gemini.google.com`, `x.com`, `twitter.com`, `grok.com` | Per-site enablement. |
| Optional `webNavigation` | Claude and Grok: re-inject translations and side tabs when the SPA navigates. |
| `commands` (5) | Find in chat (default Alt+Shift+F), search all platforms (Ctrl/Cmd+Shift+Period, works in any tab), open folders, open prompts, open search (no defaults for the last three). |
| `externally_connectable` (AIT marketing site) | The website hands the extension a team session (access + refresh token), signs it out, or checks it. Server-only; skip. |

## 3. Storage model

### chrome.storage.local (per browser profile)
- Language, OS preference for shortcut display, accent/font/width, sound choice and volume, onboarding flags, launcher position, floating-launcher slot pins, context-meter on/off, cross-platform on/off, prompt-tools on/off, tag-colors on/off, disabled built-in Smart Tags, achievements popup on/off.
- Session material: the captured ChatGPT bearer token and account IDs, the user's ChatGPT e-mail, a self-signed token for the AIT server, an AIT access/refresh session, team tokens, cached premium flags per site (stored under an obfuscated field name).
- Local feature data: Smart Tags cache per site and custom rules per site, cross-platform shared tag rules (with tombstones), cross-platform folders (`chatKeys` of the form `<platform>:<chatId>`, max 200 folders, tombstones kept 45 days, max 500), shared prompts/chains copy for cross-site use, Claude artifact vault (max 2,000, 5 versions each), Claude bookmarks (per conversation key), Claude conversation-to-project map, Claude 7-day completion timestamps, Claude live usage snapshot, ChatGPT usage tracker (events and daily summaries), streak state, deep-import state, pending handoff seed, sync timestamps and leases.

### window.localStorage (per site origin)
View preferences: collapsed messages, alert-on-finish flag, sound/volume copy, sort orders, recent searches (5), recent prompts/chains/mentions (5 each), sidebar folder tree expanded state, default export format, theme, OS preference, context-meter plan override, onboarding shown, deep-import banner dismissed.

### IndexedDB
| Database (origin) | Version | Stores and indexes | Content |
|---|---|---|---|
| `ChatHistoryDB` (chatgpt.com) | 10 | `conversations` keyed by `id`, indexes on title, `is_archived`, `update_time`, `account_id`; `images` keyed by `id`, index `createTime` (max 1,000 records); `conversationMeta` keyed by `id`, index `update_time` | Full message text of the active branch for every synced chat, plus metadata, per ChatGPT account. |
| `ClaudeHistoryDB` (claude.ai) | 3 | `conversations` with title and update-time indexes | Same idea for Claude. |
| `GeminiToolboxDB` (gemini.google.com) | 2 | `conversations` | Keys `c_<id>`; carries `gemId` when the chat belongs to a Gem. |
| `GrokToolboxDB` (grok/x origins) | 1 | `conversations` | |
| `AIToolboxUnifiedSearch` (extension origin, background) | 3 | `records` keyed by `<platform>:<id>`, indexes `platform`, `updateTime` | One flattened record per chat from every site (title, plain text, optional raw text, url, updateTime). Feeds cross-site search, tags and folders. Cleared entirely when the cross-platform switch is turned off. |

### What lives on the AIT server
Depends on the AIT server `api.infi-dev.com` (all paths below are under its `/ai-toolbox` prefix). **The build replaces every one of these with a local implementation or skips it; never call this server.**

| Data / function | Server paths | Sites |
|---|---|---|
| Folders (per site) incl. chats, GPTs, projects, color, favorite, order, pinned folders | `/folder/*` (get, get-all, get-by-id, get-subfolders, create, update-name, update, update-favorite, delete, inner-chats-delete, inner-projects-delete, move, move-items, reorder, pinned, update-pinned) | all four (Claude/Gemini/Grok keep a local cache) |
| Cross-platform folders backup | `/cross-folders/get`, `/cross-folders/save` | saved from ChatGPT tabs (primary copy is local) |
| Prompts, chains, team prompts | `/prompt/*`, `/chains/*`, `/prompt/org/*` | all four, unless "keep prompt library on this device" is on |
| Prompt Library catalog, featured "prompt of the day", favorites, use counts | `/prompts-library`, `/prompts-library/use`, `/prompts-library/favorite` | all four |
| Manual chat tags | `/chat-tags/*` | ChatGPT |
| Smart Tags custom rules (paid sync) | `/smart-tags/rules/*` | ChatGPT |
| Message labels | `/label/*` | ChatGPT |
| Message bookmarks | `/favourite/*` | ChatGPT, Gemini, Grok (Claude keeps them locally) |
| Pinned chats | `/pinned/*` | ChatGPT |
| GPT favorites | `/gpt-favorites/*` | ChatGPT |
| Media favorites | `/media-favourite/*` | ChatGPT |
| @@ / handoff summaries | `/context-mentions/summarize`, `/status`, `/use` (daily quota) | all four |
| PDF rendering for ChatGPT, and very long chats on every site | `/export/pdf`, `/export/pdf/jobs` | all four + standalone page |
| Voice download quota | `/voice-downloads/status`, `/use` | ChatGPT |
| Usage stats, recap | `/usage/sync`, `/usage/stats`, `/usage/wrapped` | ChatGPT |
| Achievements, leaderboard | `/achievements/<platform>`, `/leaderboard*` | all four |
| User prefs | `/user/language`, `/user/os-preference`, `/user/default-export-format`, `/user/theme-customization`, `/user/sound-notification`, `/user/cancel-deletion` | ChatGPT |
| Auth, payments, teams, announcements, analytics, giveaway | `/auth/*`, `/payments/*`, `/teams/*`, `/announcements`, `/analytics/track`, `/giveaway/image`, `/grok/link` | all |

Also external: a third-party billing API base URL and a media CDN for upgrade screenshots and badge art (skip both).

## 4. Premium gating (never port)
Every feature checks a per-site "is paid" flag (obtained from the AIT payments endpoint, keyed by the user's site e-mail or X user ID) and applies limits. On Claude/Gemini/Grok a feature table declares each feature as free, limited (with a free limit) or paid-only; ChatGPT uses scattered constants. Free limits seen: search shows 5 results; export TXT only and one chat at a time; 2 folders, 2 prompts, 2 chains, 2 bookmarks, 2 pins, 2 GPT favorites, 2 custom tag rules, 2 accent colors, 1 sound, 1 voice and 3 voice downloads/day, 3 @@ per day, 5 labels, 5 media images, 5 artifacts, 5 prompt-library prompts, Smart Tags on the 50 most recent chats, bulk actions 5 chats per action (ChatGPT) or paid-only (others), handoff paid-only, cross-site search preview of 5 newest hits. Artifact has no tiers; the build ignores all of this.

## 5. Feature list

| Area | File |
|---|---|
| Context meter and handoff entry point | [context-meter.md](context-meter.md) |
| Plan usage per site | [usage-limits.md](usage-limits.md) |
| Folders, cross-site folders, sidebar tree, site imports | [folders.md](folders.md) |
| Floating/docked sidebar panels | [sidebar-panels.md](sidebar-panels.md) |
| Pins and favorites | [pins-favorites.md](pins-favorites.md) |
| Manual tags and Smart Tags | [tags-smart-tags.md](tags-smart-tags.md) |
| Message labels | [message-labels.md](message-labels.md) |
| Bookmarks | [bookmarks.md](bookmarks.md) |
| Search, find in chat, deep import, cross-site search | [search.md](search.md) |
| History sync and indexing | [sync-and-indexing.md](sync-and-indexing.md) |
| Prompts, variables, `//`, library, prompt of the day | [prompts.md](prompts.md) |
| Chains (`..`) | [chains.md](chains.md) |
| Handoff and `@@` context mentions | [handoff-and-context-mentions.md](handoff-and-context-mentions.md) |
| Export (all formats, ZIP layout, pacing) | [export.md](export.md) |
| Bulk actions | [bulk-actions.md](bulk-actions.md) |
| Artifact vault and media gallery | [vault-and-gallery.md](vault-and-gallery.md) |
| Voice (read-aloud) download | [voice-download.md](voice-download.md) |
| Usage dashboard, streaks, badges, recap | [stats-and-achievements.md](stats-and-achievements.md) |
| Chat experience (width, RTL, collapse, counter, alerts, theme) | [chat-experience.md](chat-experience.md) |
| Command palette, launcher, shortcuts | [command-palette-and-shortcuts.md](command-palette-and-shortcuts.md) |
| Settings, data & storage, backup, onboarding, popup | [settings-and-onboarding.md](settings-and-onboarding.md) |
| String parity table | [strings.md](strings.md) |
| Site endpoints, RPCs, selectors | [../endpoints.md](../endpoints.md) |

### Not present in AIT 5.0.54 (so no parity obligation)
Privacy blur, highlights, chat notes, reminders, branch tree/diff, auto-continue, keep-alive, model switch, Mermaid rendering, timeline rail, semantic search, any AI-API layer of the user's own keys, auto-backup to a folder, official data-export ZIP import (AIT's "Deep Import" is something else: see [search.md](search.md)), DOCX/HTML/PNG export, AI Studio and all Tier 2 sites. Desktop notifications are not real OS notifications (see [chat-experience.md](chat-experience.md)).
