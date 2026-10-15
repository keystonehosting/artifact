# Sidebar panels and the floating dock

Strings: G-sbf in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## Purpose
AIT injects several panels into each site's own sidebar. Any of them can be detached into one shared floating window, and if the site's sidebar layout changes so a panel can no longer be docked, the panel floats automatically instead of disappearing.

## Panels per site
- ChatGPT: pinned folders, pinned chats, Smart Tags (an injected tab strip right after the new-chat area), plus the folder tree.
- Claude, Gemini, Grok: the folder tree (and the Smart Tags strip where present).

## Behavior
- Each panel has a placement preference: in the sidebar (default) or floating. Stored per site namespace and panel.
- The resolver runs on every sidebar refresh and decides a mode per panel: docked (anchor found), floating (user preference, or fallback because no anchor was found while the sidebar is present), hold (keep the current position briefly while the site re-renders), hidden (panel disabled, or the user chose a temporary-hide option for a broken sidebar while in fallback). The anchor lookup is cached and re-resolved when the cached container disconnects or ages out.
- All floating panels share one window (one per site), which can be moved and resized; each panel inside has a a restore-to-sidebar option control; the window has "put all back". When any panel floats only because of fallback, the window shows a notice that the site's sidebar changed and that panels return on their own; the close-all action then becomes a temporary-hide option for a broken sidebar.
- Panels inside the sidebar get a head with a detach toggle. The tab strip keeps a fixed order (pinned folders, pinned chats, Smart Tags) by inserting each panel before the next existing one.
- When the sidebar is collapsed (narrow rail or toggled closed), docked panels are not shown; nothing is moved to floating unless the user asked for it.

## Settings
a panel position setting: per panel, a two-choice radio (in the sidebar / floating panel), with help text explaining automatic floating on layout changes.

## Dependencies
Sidebar anchors listed in [folders.md](folders.md) section 2 and in [../endpoints.md](../endpoints.md). No server dependency. Not premium.
