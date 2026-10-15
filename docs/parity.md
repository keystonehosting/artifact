# Parity with AI Toolbox 5.0.54

Every user-visible string in AI Toolbox maps here to a built Artifact feature or a recorded skip (SPEC §1, §7). The source is `docs/dossier/ai-toolbox/strings.md`: **1,965 entries**, 1,963 in-app plus 2 store-listing strings. The full list of hashed string IDs per group is in that file; this table tracks each group's status.

Status values:
- **built (vX)**: shipped in that release.
- **planned (M#)**: assigned to a later milestone.
- **skip (D#)**: deliberately not built, with the reason in `docs/decisions.md`.

| Group | Strings | What it covers | Artifact | Status |
|---|---:|---|---|---|
| G-store-listing | 2 | Extension name and store summary | Own name and description in `_locales` | built (v0.1.0) |
| G-announce | 14 | Release notes and announcements hub | CHANGELOG and GitHub releases | skip (D14) |
| G-producthunt | 9 | Launch-day voting prompt | — | skip (D14) |
| G-review-ask | 15 | Review requests, community links | — | skip (D14) |
| G-survey | 24 | Discount-for-feedback survey | — | skip (D14) |
| G-teams | 11 | Team plan, shared prompts | — | skip (D14) |
| G-leaderboard | 34 | Public leaderboard and ranks | — | skip (D14) |
| G-payments | 29 | Plans and payments | — | skip (D14) |
| G-upsell-compare | 110 | Free vs premium table | — | skip (D14) |
| G-upsell-modals | 236 | Premium-required modals | — | skip (D14) |
| G-teasers | 15 | Blurred upsell placeholders | — | skip (D14) |
| G-ctx-meter | 23 | Context meter and card | Meter pill, breakdown, warnings, exchanges left | built (v0.2.0); handoff action built (v0.4.0) |
| G-usage-limits | 42 | Plan usage, ChatGPT rate-limit widget | Claude and Gemini usage bars, ChatGPT caps widget, heatmap | built (v0.2.0) |
| G-handoff | 18 | Carry chat forward | Handoff (local, current chat, API) | built (v0.4.0) local and current chat; API mode planned (M5) |
| G-mentions | 9 | `@@` context mentions | `@@` mentions | built (v0.4.0); AI summaries of long chats planned (M5) |
| G-xsearch | 15 | All-platforms search | Cross-site full-text search | built (v0.3.0) |
| G-xplatform-switch | 7 | Cross-platform switch | Per-site and per-feature switches | built (v0.2.0) |
| G-xsearch-export | 26 | Export search results | Search findings report | built (v0.3.0) |
| G-adv-search | 20 | Must-include / exclude, any/all | Search filters | built (v0.3.0) |
| G-search | 43 | History search modal | Search tab and palette | built (v0.3.0); palette entry planned (M6) |
| G-find | 11 | Find in this chat | Find-in-chat bar | built (v0.3.0) |
| G-findings | 7 | Export matching parts only | Findings export | built (v0.3.0) |
| G-deep-import | 17 | Find chats missing from history | Deep scan (M2), Deep Import of official exports (M4) | built (v0.3.0, v0.5.0) |
| G-sync | 22 | Background history sync status | Deep scan status | built (v0.3.0) |
| G-data | 35 | Data, cache, backup and restore | Data settings, backup, restore | built (v0.5.0) |
| G-xfolders | 32 | Folders on all platforms, import site folders | Cross-site folders, import projects/Gems | built (v0.3.0) |
| G-sbf | 12 | Detachable sidebar panels | Detachable floating panels | planned (M6) |
| G-sidebar-folders | 10 | Folder tree in the site sidebar | Sidebar folder tree | built (v0.3.0) |
| G-gpts-projects | 20 | GPTs and projects in folders | Favourite assistants | built (v0.3.0) |
| G-pins-favs | 25 | Pinned chats and folders, favourite GPTs | Pins and favourites | built (v0.3.0) |
| G-folders | 106 | Folder management | Nested folders | built (v0.3.0) |
| G-xtags | 6 | Smart Tags cross-site view | Tag view | built (v0.3.0) |
| G-chat-tags | 51 | Manual chat tags | Tags | built (v0.3.0) |
| G-smart-tags | 41 | Automatic Smart Tags | Smart Tags and rules | built (v0.3.0); AI tagging planned (M5) |
| G-labels | 27 | Message labels | Message labels and dashboard | built (v0.3.0) |
| G-bookmarks | 45 | Message bookmarks | Bookmarks library | built (v0.3.0) |
| G-chains | 39 | Prompt chains | Chains | built (v0.4.0) |
| G-prompt-library | 36 | Bundled prompt catalogue | Starter pack from CC0/public-domain sources | built (v0.4.0) |
| G-prompts | 95 | Saved prompts | Prompt library | built (v0.4.0) |
| G-export | 57 | Single and bulk export | Single-chat export in every format with real files (v0.2.0); folder, project and bulk export (M4) | built (v0.2.0, v0.5.0) |
| G-bulk | 50 | Manage chats in bulk | Bulk actions with guardrails | built (v0.5.0) |
| G-artifacts | 37 | Artifact vault | Artifact Vault | built (v0.5.0) |
| G-media | 38 | Media gallery | Media Gallery | built (v0.5.0) |
| G-voice | 24 | Read-aloud audio download | Read-aloud audio export | planned (M5) |
| G-stats | 115 | Usage dashboard and recap | Stats and recap | planned (M6) |
| G-achievements | 68 | Streaks and badges | Streaks and milestone badges | planned (M6) |
| G-chat-exp | 44 | Collapse, RTL, sounds, counters | Chat experience module | built (v0.4.0, v0.5.0) |
| G-theme | 20 | Accent, font size, chat width | Theme setting (v0.2.0), wide mode (M3), customization (M6) | built (v0.2.0, v0.4.0); customization planned (M6) |
| G-palette | 38 | Command palette and launcher | Command palette | planned (M6) |
| G-hotkeys | 16 | Hotkeys | Browser commands (v0.2.0), customizable slots (M6) | built (v0.2.0), rest planned (M6) |
| G-onboarding | 64 | Tour and guides | Onboarding tour | planned (M6) |
| G-settings | 24 | Settings shell, language | Settings page and side-panel tab | built (v0.2.0); language list planned (M6) |
| G-common | 31 | Shared buttons and states | Shared controls | built (v0.2.0) |

**Totals:** 1,965 strings in 53 groups. Recorded skips: 497 strings in 10 groups. Built or partly built: 37 groups (1,147 strings). Planned: the rest.
