# Settings, data and storage, backup, onboarding, popup

Strings: G-settings, G-data, G-xplatform-switch, G-onboarding, G-store-listing in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## Settings modal
Opened from the launcher, palette or sidebar. Sections and controls (defaults in brackets):
- **General**: language (12 languages; initial value = browser language if supported, else English); operating system for shortcut labels [auto]; default export format [TXT].
- **Theme**: accent color [blue]; font size [default]; chat width [default] (ChatGPT; see [chat-experience.md](chat-experience.md)).
- **Notifications** (ChatGPT): notify when the reply is ready [off]; sound [first]; volume [80%].
- **Usage & analytics** (ChatGPT): usage dashboard [on]; writing analytics [on].
- **Folders**: folder tree in sidebar [on]; hide chats already in a folder [off]; panel placement [in sidebar].
- **Smart Tags**: show panel in sidebar [on]; wrap tags into rows [off]; tag colors [on]; built-in category toggles [all on].
- **Prompts**: prompt tools [on]; keep prompt library on this device [off] (see [prompts.md](prompts.md)).
- **Context meter**: show [on].
- **Cross-platform features**: one switch [off] covering all-platforms search, Smart Tags, folders and the shared prompt library. Turning it on backfills each site's local history into the unified index (once per site per backfill version); turning it off deletes the whole unified index and all backfill flags at once.
- **Achievements**: show streak unlock popups [on].
- **Keyboard shortcuts**: list and link to the browser's shortcut page ([command-palette-and-shortcuts.md](command-palette-and-shortcuts.md)).
- **Data & storage**: see below.
- **Background indexing** (ChatGPT): normal / reduced / paused [normal] ([sync-and-indexing.md](sync-and-indexing.md)).
- **Privacy** (leaderboard opt-in, handle, reroll): skip.
- A a settings progress indicator checklist with a progress bar: set language, choose OS, set export format, enable notifications, pick a sound, adjust volume, choose accent color, set font size, set chat width. Each task links to its control.
- Preferences are stored in local storage and, on ChatGPT, mirrored to the AIT server user profile (language, OS, default export format, theme, sound). **Artifact: local only.**

## Data & storage
- Cached chats count and last sync time (relative).
- a troubleshooting prompt about missing chats in search → **re-sync now**: re-downloads the chat list; keeps everything already saved.
- **Clear cache & re-sync**: erases the local chat cache first (two-step confirm button: first click arms, second click confirms), then re-syncs; warns that chats the site no longer lists are lost.
- **Deep import** (ChatGPT; [search.md](search.md)) with a "recommended" marker when the probe found hidden chats.
- "Where your data lives": AIT says folders, prompts, chains and tags are backed up to the user's AIT account; cached conversations, recent searches and view preferences are only on the device. (Artifact: everything is local.)
- **Export backup** → `ai-toolbox-backup-YYYY-MM-DD-HH-MM-SS.json` (from the ISO time with `:` and `T` replaced by `-`). Shape: `app`, `type` (a fixed backup type marker), `version` 1, `exportedAt`, `platform`, `cloud` {folders, prompts, chains, chatTags} (fetched from the server), `local` {localStorage (AIT's own keys), extensionStorage (AIT's chrome.storage keys)}.
- **Import backup**: file picker for `.json`; rejects files that are not this backup type. Dialog: "adds items that are not already here; nothing is overwritten or deleted", plus an opt-in checkbox to also restore app preferences (theme, sounds, view options). Result: counts of imported folders, prompts and chains; "everything already here"; preferences-restored note; a plan-limit note (skip).
- Grok has a smaller "data" section with a history refresh action.

## Account and cache ownership
Each site's cache is bound to the signed-in site account (ChatGPT e-mail, Claude org, Gemini/Grok account key). On a change, AIT wipes that site's cached chats and per-site storage (keeping theme) and resyncs. Temporary/incognito chats are ignored.

## Onboarding
- **Tour** (ChatGPT, first run, replayable from the palette): 3 steps with skip / next / done: (1) what the toolbox does (search, bulk delete/export, folders); (2) the launcher button opens the command palette, which also opens with Cmd/Ctrl+K, and typical commands; (3) hovering the launcher shows five shortcut slots that can be changed by right-click or filled with "+". Spotlights the launcher; shown once (flag stored).
- **First-use banner** on Claude, Gemini and Grok: says AIT is active there and points to the bottom-right launcher and the context meter.
- **Platforms-off nudge** (ChatGPT): if none of Claude/Gemini/Grok is enabled in this browser, a card offers to turn them on (opens the extension popup via `chrome.action.openPopup`, or the popup page in a tab as fallback; manual instruction if both fail). The extension icon shows a green "NEW" badge until the user opens the popup or grants a site.
- **Update banner** after upgrading from a version below 5.
- **Guides / tutorials**: a guides list with one card per feature and links to AIT's website tutorials (replace with Artifact's own docs).
- **Extension updated**: if the content script loses its extension context after an update, a banner asks to refresh the page.

## Popup
Per-site cards (ChatGPT, Claude, Gemini, Grok) with status (active/off), feature summary and a toggle:
- ChatGPT: a stored on/off flag (soft disable); toggling reloads open ChatGPT tabs.
- Others: request or remove the optional host permissions (Claude and Grok also request `webNavigation`); on grant, the background registers scripts and reloads matching tabs. If the permission prompt closes with the popup, the user can reopen the popup as a tab ("open in a tab instead") where the prompt stays visible; a hint mentions enterprise policies when no prompt appears at all.
- A warning when the browser blocks site access although the extension is enabled (Edge, Opera, Vivaldi and Chrome each get the right extension-details URL to fix site access).
- Footer: local-only data statement, tutorials link.
- Store-listing name and short description come from `_locales` (rewrite in Artifact's own words).

## Install / uninstall
On install AIT opens its website's install-success page; on uninstall it opens an uninstall survey URL carrying a token. Skip both.
