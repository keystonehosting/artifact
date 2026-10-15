# Folders (per-site, cross-site, sidebar tree, imports)

Strings: G-folders, G-sidebar-folders, G-gpts-projects, G-xfolders in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

AIT has two folder systems:
1. **Per-site folders**: one tree per site and per site account, stored on the AIT server (local cache on Claude/Gemini/Grok). On ChatGPT they can hold chats, GPTs and projects.
2. **Folders on all platforms** ("cross folders"): one local tree in chrome.storage holding chats from every site, kept in two-way sync with each site's per-site folders.

AIT does **not** read the sites' own native folders: it never imports ChatGPT projects' membership as folders, Claude projects as folders, or Gemini Gems as folders. "Add <site> folders" in the cross view means "link this site's AIT per-site folders". ChatGPT projects and GPTs can be added into AIT folders as items. Artifact's "import each site's existing folders, projects and Gems" is therefore new work, not parity.

## 1. Per-site folders

### Data model (as used by the UI)
Folder: server id, name (trimmed, max 40 characters), optional color, parent (or top level), list of chat IDs, list of GPTs (name, short URL), list of projects (gizmo ID, name, emoji), favorite flag, manual order index, pinned flag (ChatGPT). Any depth of nesting. Children are returned with the parent on most server responses.

### Surfaces
- **Manage folders modal** (palette "folders", launcher slot, sidebar header button, browser command an open-folders action): breadcrumb from the root, search box (matches names, shows the full path joined with a chevron), list of subfolders (a favorites group on top, the rest ordered by the chosen sort), folder summary line (chats, GPTs, projects, subfolders counts), sort selector Recent / Manual (stored per site), add folder, add subfolder, select mode for bulk delete.
- **Folder detail**: chats in this folder (titles from the local index; chats not in the index fall back to the sidebar link text or a generic label; deleted chats are marked and can be removed), subfolders, GPTs, projects; actions add chats, add GPTs, add projects, move, rename, color, favorite, pin, export folder, delete.
- **Add chats picker**: lists indexed chats with a search box; chats already in another folder show "already in <path>"; selection count on the confirm button.
- **Move picker** (for folders and for selected chats): a tree of destinations. Rules: a folder cannot move into itself or any descendant; its current location is shown but disabled; a move-to-root action is available. A chat move has two modes: an add-to action (keeps existing memberships) and a move action (removes from all other folders).
- **Delete**: confirm dialog; deleting a folder deletes its subfolders but never the chats. Removing a chat from a folder never deletes the chat.
- **Duplicate names**: a sibling with the same name (case- and accent-insensitive) is rejected.
- **Limits** (ChatGPT strings): 50 folders, 50 pinned folders. Server-enforced.

### ChatGPT-specific items
- GPT picker searches `GET /backend-api/gizmos/search?q=<text>[&cursor=]` (items[].gizmo: id, display.name, author.display_name, display.profile_picture_url, display.description, vanity_metrics.num_conversations_str, short_url, updated_at) and lists the user's own/shared GPTs from `GET /backend-api/gizmos/bootstrap` (`gizmos[].resource.gizmo`, excluding `share_recipient = marketplace`; cached 10 min, 1 min on error). Description shown trimmed to 77 characters.
- Project picker lists owned projects from `GET /backend-api/gizmos/snorlax/sidebar?owned_only=true[&cursor=]` (`items[].gizmo.id`, `display.name`, `display.emoji`, `display.theme`), at most 10 pages when interactive.
- When the site deletes a project (DELETE under `/backend-api/gizmos/g-p-…` succeeds) or hides a GPT from the sidebar (POST `/backend-api/gizmos/<g-…>/sidebar`), AIT removes it from folders.

### Server dependency
All CRUD goes to the AIT server `/folder/*` (see [README](README.md)). On Claude/Gemini/Grok the server copy is cached locally under a per-site key and per-account key; a a folder-restore progress notice state shows while the cache fills; a failure shows a "could not load, your folders are safe on your account" state. **Artifact: local only (IndexedDB), no server.**

## 2. Folder tree inside the site sidebar

- ChatGPT: a collapsible the folder list section injected into the sidebar (an element with id ending in `sidebar-folders`), under the injected tab strip (pinned folders, pinned chats, Smart Tags). Expand state per folder id kept in localStorage; a whole-section collapse flag; an enable switch in settings (default on). Shows folders, subfolders and their chats; clicking a chat navigates; plain clicks are SPA navigations, modified clicks (Ctrl/Cmd/Shift/Alt or middle button) are left to the browser.
- Claude, Gemini, Grok: an equivalent tree in each site's sidebar with per-site keys (`<site>:sbf-enabled`, collapsed, expanded). A a folder-source filter switch flips between this site's folders and an every-site option (cross folders, where chats from other sites show "opens in <site>" and open in a new tab).
- Sidebar anchor resolution (ChatGPT, in order): `nav[aria-label="Chat history"]`; a `nav` that contains `[data-testid="create-new-chat-button"]` and either chat links or `#history` (ignoring the collapsed rail `#stage-sidebar-tiny-bar` or anything narrower than 120 px); AIT's own tab-strip marker; the `aside` around the new-chat link (legacy); finally a heuristic: the scrollable ancestor (overflow auto/scroll, within 40 px of a screen edge, 160–520 px wide, at least 40% of the viewport tall) that contains the most chat links (`a[href^="/c/"]`, `a[href^="/g/g-p-"]`, `a[href^="/project"]`, sampling 60). Insertion point: right after the Codex link (`a[data-sidebar-item="true"][href="/codex/cloud"]`) if present, else after the block that holds the new-chat button, else before the first chat link block. Sidebar state is classified visible / collapsed (narrower than 160 px) / absent and cached 200 ms.
- Claude anchors: `nav[aria-label="Sidebar"]`, `aside.dframe-sidebar`, `aside[aria-label="Sidebar"]`, scroll area `.dframe-nav-scroll` or a class containing `overflow-y-auto`, group headings `h2` / `[data-sidebar-group-label]`; chat rows `[data-row-key^="chat:"]`.
- Gemini anchors: `bard-sidenav`; insert before `expandable-section[data-test-id="chats-expandable-section"]` (or the notebooks section), chat links `a[href^="/app/"]`, gem rows `gem-nav-list-item`.
- Grok anchors: `[data-sidebar="sidebar"]` / `[data-sidebar="content"]`, rows `li, [data-sidebar="menu-item"]`, chat links `a[href^="/c/"]`; on x.com a "chat history" button.
- If the sidebar cannot be found the panel floats instead (see [sidebar-panels.md](sidebar-panels.md)).

### Hide chats that are already in a folder
Setting (default off) on all four sites: removes from the site's own history list every chat that is in any folder, except the chat currently open. Nothing is deleted; search still finds them. ChatGPT rows are matched through their links / option trigger buttons (`button[data-conversation-options-trigger]`). Also offered as a toggle in the manage-chats list.

## 3. Folders on all platforms (cross folders)

### Model and storage
Local list in chrome.storage: id (generated, prefix `xf_`), name (≤ 40), parent, favorite, createdAt, updatedAt, `chatKeys` (each `<platform>:<chatId>`). Max 200 folders. Deleted folder ids go to a tombstone map (kept 45 days, newest 500) so sync does not resurrect them. All writes are serialized through one promise chain. The background resolves `chatKeys` against the unified index to show titles, URLs and update times.

Sorting: favorites first, then `order`, then most recently updated. Same duplicate-name and cycle rules as per-site folders (errors: invalid, exists, missing, cycle, max).

### Surfaces
A modal on every site (launcher, palette) listing the tree; add chats from any platform (searchable list from the unified index, up to 200 rows, filter by platform); remove chat from folder; delete folder (also removes the linked per-site folder, never chats). Requires the single cross-platform switch (see [settings-and-onboarding.md](settings-and-onboarding.md)); when off, the view shows an enable card.

### Linking each site's folders ("add <site> folders")
- Done from each site (a site's folders can only be read on that site). The panel lists the four sites as a synced status or a not-yet-added state, with an "open <site>" link for the others.
- First import: walks the site's folder tree breadth-first, merges into an existing cross folder with the same name and parent (merge count) or creates one (until the 200 cap, then reports truncation), and adds each chat as `<site>:<chatId>`. Result line: new folders and new chats.
- After that, a **two-way sync** runs per site (at most every 20 s, debounced 2 s after changes, 3 s after its own writes): it keeps a link map (cross id → site folder id) and a base snapshot per link (names, parents, chats). It creates missing counterparts in either direction, propagates renames, moves, chat additions and removals using three-way comparison against the base, and deletes a site folder when its cross counterpart was deliberately deleted (tombstoned). Mass-deletion guard: if more than max(3, 25%) of linked folders vanished on one side at once, removals are not propagated. On an account switch, chats that belong to the previous account are marked foreign and left alone.
- Only runs when the cross-platform switch is on (and, in AIT, when paid).
- Server: ChatGPT tabs also back the cross tree up to the AIT server (`/cross-folders/save`, `/get`). **Artifact: local only.**

## Settings and defaults
- Show folder tree in sidebar: on. Hide organized chats: off. Folder sort: recent. Panel placement: in sidebar (alternative floating).

## Edge cases and errors
- Chat no longer exists on the site: shown as unavailable with a a remove-from-folder action confirm.
- Server failure on create/rename/move: toast; local state is not changed.
- Moving a folder with drag in the tree uses the same cycle rules.

## Premium (do not port)
Free: 2 top-level folders (unlimited subfolders on ChatGPT per the guide text); cross folders paid; site-folder linking paid.
