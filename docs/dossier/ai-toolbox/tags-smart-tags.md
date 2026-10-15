# Tags and Smart Tags

Strings: G-chat-tags (manual tags), G-smart-tags, G-xtags in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

AIT has two independent tag systems:
1. **Manual chat tags** (ChatGPT only): user-named tags assigned to chats. Server-stored.
2. **Smart Tags** (all four sites): automatic topic tags computed locally from keyword rules, plus user-defined keyword rules.

## 1. Manual chat tags (ChatGPT)

### Surfaces
- "Tag" item injected into ChatGPT's per-chat options menu (same injection as pin, see [pins-favorites.md](pins-favorites.md)) and a a bulk-tag action action in bulk selection and search results.
- Tag picker dialog (modal, keyboard accessible, Escape closes, focus trapped):
  - Lists the tag list with their colors, filter-as-you-type, suggestions.
  - Create new tag(s): one name or several separated by commas (comma, Arabic comma, ideographic comma and fullwidth comma are all accepted). Names longer than 24 characters are rejected with a "trimmed to 24" hint; an existing name (case-insensitive) is reused instead of duplicated.
  - Optional color per tag (setting "use colors for tags", default on; when off, tags render as plain labels but stored colors are kept).
  - Multi-chat state: for the selected chats each tag is "all" (on every chat), "some" (on some, shown with a dashed outline and left untouched unless clicked) or none.
  - Footer: "assign (n)", "remove (n)" or "add n, remove m" with one save; warns when removing a tag from its last chat makes it disappear from the list.
  - Edit mode: pick a tag to rename or recolor it globally (applies to every chat that uses it); delete a tag from all chats with a confirm.
- Tag chips appear on chat rows in AIT lists and in search results; a tag filter (include/exclude, match any/all) appears in search and manage-chats. Search also accepts typed filters `tag:<name>` and `-tag:<name>`; unknown names show a "no tag named …" note.

### Data and server
- Server calls (AIT server): get-all (returns per-conversation `tags`), bulk-assign (`conversation_ids`, `tags`), bulk-remove (`conversation_ids`, `tag_ids`), update (`tag_id`, name, color), remove (`conversation_id`, `tag_id`), delete (`tag_id`). Errors "max" (global tag limit) and "max_free".
- Local cache of conversation → tags in chrome.storage, refreshed from the server; cleared on account change.
- **Artifact: local only.** Some chats can hit a per-chat tag limit in AIT (message exists; numeric limit not found in the client).

## 2. Smart Tags (automatic)

### Built-in categories
Five categories: coding, writing, research, math & science, business (each with a fixed color). Each category has: strong title patterns (one match in the title is enough), weak title patterns, content patterns run on raw text, content patterns run on accent-folded lowercase text, and user-intent patterns run only on user messages. AIT's patterns are multilingual keyword lists plus a few structural regexes (fenced code blocks, common programming tokens, SQL keywords, package-manager commands, simple arithmetic). **The build must author its own keyword lists**; do not copy AIT's.

Keyword pattern construction: each keyword is accent-folded; a word boundary is added at a word-character edge, and keywords of 4+ letters also accept common plural/inflection suffixes (s/es, n/en, nen, i) before the closing boundary.

### Scoring (per conversation)
- Input: the title and the first 10 messages (role, raw text, folded text).
- For each enabled built-in category, in order, until 3 tags are assigned:
  - strong title match → tag;
  - else count messages that hit any content/intent pattern ("hits") and the number of distinct patterns hit;
  - if a weak title pattern matches: tag when hits ≥ min(2, messages) (at least 1);
  - otherwise: tag when hits ≥ min(3, messages) (at least 1) and distinct patterns ≥ 2.
- Then custom rules, until the 3-tag cap: title match → tag; else tag when at least min(2, messages) messages match a keyword.
- Max 3 tags per conversation. AIT also defines a minimum score threshold of 2 and a cap of 5 categories for free users (constants).

### Custom rules
- Form: rule name (≤ 30 chars, must be unique among rules), keywords (comma-separated, ≤ 500 chars), color. Up to 50 rules. Rules can be edited and deleted; a matched-count is shown per rule.
- Shared across sites: custom rules created on any site are mirrored into a cross-platform shared rule list in chrome.storage (with deletion tombstones), so a rule created once applies everywhere.
- Built-in categories can be switched off individually; a hidden category is removed from all chats.
- Server: ChatGPT paid users' rules are also synced to `/smart-tags/rules/*` on the AIT server. **Artifact: local.**

### Running and storage
- Results are cached per site in chrome.storage as conversation ID → list of `{ruleId, label, color, isCustom}`, with a last-run timestamp. Tagging runs as chats are synced into the local index (see [sync-and-indexing.md](sync-and-indexing.md)).
- AIT free plan: only the 50 most recent conversations are tagged (skip).

### Surfaces
- Smart Tags panel in the site sidebar tab strip (ChatGPT) or launcher panel: tag chips with counts; clicking a tag filters to its chats. Settings: show the panel in the sidebar (default on; off removes it entirely, still reachable from palette/launcher) and wrap tags into rows (default off: one horizontally scrolling row).
- Smart Tags modal: summary stats (conversations with at least one tag, categories, total tag assignments), filter by tag, list of tagged chats with their chips, built-in toggles, custom rules section.

## 3. Smart Tags on all platforms
A cross view (needs the cross-platform switch): the background reads each site's Smart Tags cache, joins it with the unified index, and returns per-platform groups (up to 20 hits each), the total tagged count and per-tag counts (label, color, custom flag), optionally filtered by one tag or by title text. Each hit links to the chat on its site.

## Premium (do not port)
Free: tags on the 50 newest chats, 2 custom rules; cross view and rule sync paid.
