# Command palette, floating launcher and shortcuts

Strings: G-palette, G-hotkeys in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## Floating launcher
- ChatGPT: a round button fixed at the bottom-right (lifted on viewports narrower than 1,400 px to clear the composer's send button). Hovering fans out **5 quick-access slots** along an arc ("satellites"); clicking the main button opens the command palette. Each slot launches a feature; right-click a slot opens a picker to choose another feature or clear it; empty slots show a "+" that opens the picker. The picker marks features already pinned elsewhere (choosing one swaps the two slots) and has "clear this slot" and a reset-all-slots action.
  - Pinnable features: search history, manage chats, manage folders, manage prompts, Smart Tags, media gallery, usage dashboard, info & updates (skip), settings. Default slots: search history, manage chats, manage folders, manage prompts, media gallery.
  - Slot pins are stored in localStorage and mirrored to chrome.storage (so they survive a site-data wipe); a legacy 4-slot "quick rail" setting is migrated.
- Claude, Gemini, Grok: a single launcher button that opens a modal panel listing all features (no satellites). On Grok the panel is titled with the product name and includes a history refresh action.
- The launcher can be dragged to another position (vertical offset remembered in localStorage per site); a drag hint appears on hover.
- The context meter pill sits right above the launcher ([context-meter.md](context-meter.md)).

## Command palette (ChatGPT)
- Opens with Cmd+K (macOS) / Ctrl+K (others), the launcher button, or the palette entry in menus. The OS used for shortcut display follows a setting (auto, mac, windows; auto = platform sniffing).
- Modal with a search input, results grouped by category (organize, productivity, insights, settings), keyboard navigation (arrows, Enter, Escape) and a footer legend. Result count "1 result / n results"; no-results state suggests typical words.
- Each command has an id, title, one-line description, category, icon and a hidden keyword list used for fuzzy matching. Commands: search history, find in this chat, export this chat, manage chats, manage folders, manage prompts, Smart Tags, media gallery, achievements, usage dashboard, info & updates (skip), tutorials (opens web docs, skip or replace), replay the onboarding tour, settings.
- a suggestion to try an unused feature and upsell tiles appear inside the palette for free users (skip).

## Keyboard shortcuts
### In-page (ChatGPT)
| Keys (mac / others) | Action |
|---|---|
| Cmd+K / Ctrl+K | Command palette |
| Cmd+Shift+F / Ctrl+Shift+F | Chat-history search |
| Cmd+Shift+E / Ctrl+Shift+E | Collapse or expand all messages |
| Cmd+Shift+L / Ctrl+Shift+L | Generate and play the last reply as audio |
| `//`, `..`, `@@` typed in the composer | Prompts, chains, context mention |

Matching rule: on mac the Meta key is required and Ctrl must be up; elsewhere Ctrl is required and Meta must be up; Shift/Alt must match exactly; letters also match by physical key code. The voice shortcut is ignored while focus is in an input, textarea or contenteditable.

### Browser-level (manifest `commands`, editable at the browser's shortcuts page; AIT links there)
| Command | Default | Behavior |
|---|---|---|
| find-in-chat | Alt+Shift+F (mac: Option+Shift+F) | Find bar on AI sites |
| open-cross-search | Ctrl+Shift+Period (mac: Cmd+Shift+Period) | Search all platforms; works in any tab (opens/focuses the standalone page when not on an AI site) |
| open-folders | none | Folders on AI sites |
| open-prompt-library | none | Prompts on AI sites |
| open-search | none | Chat-history search on AI sites; the standalone all-platforms page elsewhere |

The background forwards the command to the active tab if its host is one of the supported sites; if the tab does not handle it (or is not an AI site) and the command is a search command, it opens or focuses the standalone search page.

### Hotkey help
Settings contain a the shortcuts list section that lists the above with OS-specific labels and a link to the browser's extension shortcuts page.

## Not in AIT
Customizable in-page shortcut slots, palette on Claude/Gemini/Grok (they use the launcher panel), model switching from the palette.
