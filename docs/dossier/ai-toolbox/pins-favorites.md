# Pins and favorites

Strings: G-pins-favs in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live. ChatGPT only unless stated.

## Pinned chats
- Entry point: AIT adds a a pin action / "unpin" item to the site's own per-chat options menu (the menu that opens from the chat row's options trigger, `button[data-conversation-options-trigger]`, rendered as `[role="menu"]` inside `div[data-radix-popper-content-wrapper]`). The item is inserted by cloning the menu's styling; injection retries every 250 ms up to 20 times while the menu renders. The same menu also receives "tag" and an add-to-folder action items (see [tags-smart-tags.md](tags-smart-tags.md), [folders.md](folders.md)).
- Display: a the pinned-chats section panel in AIT's sidebar tab strip (see [sidebar-panels.md](sidebar-panels.md)). Each row shows the title, highlights the open chat, and shows a relative "last accessed" time computed from the chat's `update_time` in the local index (just now, minutes, hours, days). A small per-row menu offers unpin. Empty state tip when none.
- Expanded/collapsed state of the panel is remembered in localStorage.
- Limit: 50 pinned chats (server message). Order: as returned by the server.
- Server dependency: `/pinned/get`, `/pinned/pin`, `/pinned/unpin` on the AIT server. **Artifact: local.**

## Pinned folders
- From the folder actions menu (pin/unpin folder). Shown in a the pinned-folders section accordion in the same tab strip, with a count badge and an eye control to show/hide contents. Limit 50.
- Server: `/folder/pinned`, `/folder/update-pinned`.

## Favorite GPTs (the user's GPT list)
- AIT adds a favorite toggle to GPT entries in ChatGPT's sidebar (`a[data-sidebar-item="true"][href^="/g/"]`, including inside the expandable sidebar section) and lists favorites in a the user's GPT list section with one-click open (`https://chatgpt.com/g/<short_url>`). An "add favorite GPTs" picker reuses the GPT search described in [folders.md](folders.md).
- Each favorite stores the GPT short URL, name and avatar image URL (read from the sidebar entry's `img`).
- When ChatGPT hides a GPT from its sidebar (background sees POST `/backend-api/gizmos/<g-…>/sidebar`), AIT removes it from favorites.
- Optional a GPT grouping option behavior: collapses the site's GPT list into one expandable group (the expand state is remembered).
- Limit 50. Server: `/gpt-favorites/get`, `/add`, `/remove`.

## Other sites
- Claude, Gemini, Grok: no pinned chats or favorite assistants in AIT. Grok records the site's own pin state (`is_pinned` from X history, `starred` from grok.com) in the index; rename on grok.com preserves the starred flag. X GraphQL operations for pin/unpin exist in the build's ID table but are not wired to UI.

## Premium (do not port)
Free: 2 pinned chats, 2 favorite GPTs; pinned-folder count shares the folder quota.
