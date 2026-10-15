# Context meter

Strings: groups G-ctx-meter (meter UI) and part of G-handoff in [strings.md](strings.md). Observed in AIT 5.0.54; sizes and model names are AIT hardcoded values, unverified.

## Purpose
Shows how full the current chat's context window is, warns as it fills, forecasts how many more messages fit, and offers a one-click a continue-in-new-chat action (handoff) here or on another site.

## UI surface and placement
- One shared component on all four sites. A fixed-position pill at the bottom-right of the page (not inside the composer): a ring (conic progress) with the percent in the middle and a short label next to it. It sits 92 px above the bottom and 24 px from the right, and 218 px from the bottom on viewports narrower than 1,400 px, so it stays just above the floating launcher button. On ChatGPT, while the launcher's fan of quick slots is open, the pill moves further up (170 px, or 296 px on narrow viewports) so the two never overlap.
- Pinned to the right in both LTR and RTL; the card always opens leftward. The root carries the site theme (light/dark) and the site accent color.
- The pill is hidden while the chat has zero counted tokens (empty new chat).
- Clicking the pill opens a card (268 px wide) above it: title, close button, "used of total tokens" line, an optional warning row, an explanatory tip that says the limit is the site's own memory limit and does not limit AIT's search/export, a meta row (model label plus window size, or the window size alone when the model is unknown) and a plan selector, then the handoff block.
- Card closes on outside click or Escape (focus returns to the pill). A screen-reader live region announces when the meter crosses 80% (a mid-level warning) and 95% (a high-level warning), once per crossing.

## Thresholds and colors
- Ring tier: ok below 70%, warn at 70% to 94%, critical at 95% and up. (Artifact's spec uses 50/75/90 and editable thresholds; AIT's are fixed.)
- Card warning row: a soft warning from 80%, a critical warning from 95%.
- Percent = round(used / window × 100), clamped 0 to 100. Used = max(stored-conversation tokens, live DOM tokens) + current draft tokens.

## Token counting
- Default estimator on ChatGPT, Gemini and Grok: characters ÷ 4 plus CJK characters ÷ 1.5, rounded up, where "CJK" means code points U+3000–U+9FFF, U+AC00–U+D7AF and U+FF00–U+FFEF. Message totals add each message's estimate. Empty or whitespace text counts as 0.
- Claude uses a different, per-character-class weighted estimator. Each character is classified (ASCII letter, digit, whitespace, ASCII punctuation, Latin extended, Cyrillic/Greek, RTL and Indic scripts, Han, kana, Hangul, CJK punctuation/fullwidth, emoji, other) and multiplied by a weight; if at least 0.5% of letters are Latin-extended, ASCII letters use a higher "foreign" weight. Two weight sets exist, chosen by the detected model: "legacy" for Opus/Sonnet 1–4.6 and Haiku 1–4, "current" otherwise. Weights (AIT hardcoded values, unverified):
  - current: letter 0.355 (foreign 0.452), digit 1.299, space 0.034, punctuation 1.042, Latin-ext 0.415, Cyrillic/Greek 0.423, RTL/Indic 0.809, Han 1.138, kana 0.749, Hangul 1.351, CJK punct 1.863, emoji 3.5, other 1.
  - legacy: letter 0.225 (foreign 0.288), digit 1.089, space 0.046, punctuation 1.021, Latin-ext 1.087, Cyrillic/Greek 0.43, RTL/Indic 0.812, Han 1.115, kana 0.723, Hangul 1.351, CJK punct 2.302, emoji 3.5, other 1.
  - Claude message content counted: text blocks, tool-use inputs (values joined), tool-result text, and attachment extracted text prefixed by its file name; thinking and redacted-thinking blocks count 0. Images in `files`/`files_v2` add ceil(w/28) × ceil(h/28) patches capped at 4,784 (+3 overhead) for current models or 1,568 (+4) for legacy. When the live Claude conversation is fetched, the meter walks the active branch from `current_leaf_message_uuid` through `parent_message_uuid`.
- Draft tokens are recomputed on every composer mutation (one recount per animation frame).

## Data sources and refresh
- Ticks once per second while the tab is visible. On conversation change it resets and reloads.
- Source 1: the local IndexedDB copy of the conversation (from history sync).
- Source 2: the site's own conversation endpoint ("live read"), used when the conversation has not been read live yet, or when at least 20 s have passed and the DOM now has more turns than at the last live read. ChatGPT walks `mapping` from `current_node`; Claude uses the conversation tree endpoint; Gemini re-reads via RPC `hNvQHb`; Grok via its conversation endpoints.
- Source 3: DOM text of the rendered messages (ChatGPT `[data-message-author-role]`, Claude `div[data-test-render-count]`, Gemini `user-query, model-response`, Grok its message containers). The DOM count of message elements also triggers a reload when it grows.
- The stored count only ever ratchets up within a conversation (max of old and new).

## Model and window resolution (AIT hardcoded values, unverified)
The meter re-detects the model at most every 4 s, from the last `data-message-model-slug` attribute on ChatGPT, or by scanning visible buttons/menus (text ≤ 48 chars, skipping menu items on the first pass) for a model-name pattern.
- ChatGPT: plan from the account-check endpoint `plan_type` (enterprise → treated as pro; business/team → plus; pro; plus; go; free) or from the user override. Reasoning models (names containing thinking, "Sol", reasoning, `o1`/`o3`, or a `-pro` suffix, or the active branch containing reasoning/thoughts content) count as paid-only. Window: Pro 400,000 for reasoning models else 128,000; Plus/Go 256,000 for reasoning else 54,000 (sic); Free 27,000. For paid plans the model label is refined by fetching the conversation (throttled to once per 15 s per assistant-turn count) and reading `resolved_model_slug` / `model_slug` on the active branch.
- Claude: model regex over Opus/Sonnet/Haiku/Fable with a version; Opus and Fable count as paid-only. Window 1,000,000 for Opus/Sonnet 5 or 5.5, Fable 5.1, Haiku 5.5; 500,000 for Opus 4.6–4.8, Sonnet 4.6 and any other Fable; otherwise 200,000. On the free plan always 200,000.
- Gemini: model pattern "<n.n> Flash-Lite/Flash/Pro"; window 1,000,000 when paid, 32,000 when free.
- Grok: "Grok <n> [Mini|Heavy|Fast]"; 256,000 if the label contains Heavy or the plan is paid, else 128,000.
- The plan selector in the card offers Auto, Free and Paid (ChatGPT: Auto, Free, Plus, Pro); a non-Auto choice is stored per site in localStorage. In Auto on ChatGPT the detected plan name is shown next to "Auto".
- If no window can be resolved the default is 200,000 (there is no "unknown" state; Artifact must show unknown instead, per SPEC §0.3).

## Forecast ("about N messages left")
remaining = window − used; average = 2 × round(conversation tokens / turns) with a floor of 220 tokens per message (also used when there are no turns yet); forecast = floor(remaining / average). Only shown when the handoff block is unlocked and below 100%.

## Handoff from the card
- a continue-in-new-chat action button plus one button per other site. Disabled while one handoff is running; a second click shows a busy toast.
- Flow, same site: load the conversation (cached copy, or live fetch if the cache is empty), summarize it (AIT server endpoint, see [handoff-and-context-mentions.md](handoff-and-context-mentions.md); local excerpt fallback), store the seed in sessionStorage, navigate to the new-chat URL; on load the new page inserts the seed into the composer. On ChatGPT the same-site handoff instead uses the cross-tab path (new tab).
- Flow, other site: summary stored as a pending handoff in chrome.storage (target, seed, timestamp), background opens a new tab next to the current one on the target's new-chat URL (ChatGPT root, Claude `/new`, Gemini `/app`, Grok root); the target tab consumes the seed if it is younger than 180 s and for the right target.
- Insertion retries for up to 15 s (observer + 400 ms poll); if it never lands, a fallback dialog lets the user copy the summary.
- Errors map to three messages: chat has no messages, chat still being indexed (no conversation ID or no cached copy), generic failure.
- Server dependency: summarization (AIT server). Premium: the whole handoff block is paid-only; free users see a locked card with an upgrade link. Do not port the lock.

## Settings
- One switch (default on) to show the meter on every site; stored in chrome.storage and applied live to all tabs. A menu entry also hides it.
- The meter never mounts on login/auth pages or in temporary/incognito chats (ChatGPT `?temporary-chat`, Claude `?incognito`), and only on chat-like paths per site.

## Edge cases
- New chats show nothing until there is content.
- Tokenizer change (Claude model family switch) forces a fresh live read.
- Failure to fetch anything leaves the previous value (never decreases mid-chat).
