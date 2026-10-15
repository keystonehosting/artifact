# Usage limits (per site)

Strings: G-usage-limits (and the quota wording that sits in G-upsell-modals) in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live. All caps and plan names are AIT hardcoded values, unverified.

## Claude: plan-usage badge and panel

### Sources, in priority order
1. **Site usage endpoint**: `GET https://claude.ai/api/organizations/<orgId>/usage` (credentials included, header `X-Extension-Request` set by AIT to mark its own calls). Fields read:
   - Newer shape: `limits[]`, each with `kind` (seen values: `session`, `weekly_all`, `weekly_scoped`, `current_usage`), `percent` (0–100), `resets_at` (ISO string), `severity` (string), `is_active` (bool), and `scope.model.display_name` for model-scoped weekly limits.
   - Older shape (fallback): `five_hour.utilization` / `five_hour.resets_at` and `seven_day.utilization` / `seven_day.resets_at`.
2. **Completion stream** (when the endpoint returns nothing usable): the MAIN-world hook reads the SSE stream of the completion POST and picks the first `data:` line containing `message_limit`. From it: `windows["5h"]` and `windows["7d"]`, each with `utilization` (0..1, capped at 1), `resets_at` (epoch seconds) and `status` (`exceeded_limit` → critical, `approaching_limit` → warning). Stored as a snapshot with its capture time. A window whose reset time has passed is shown as 0%.
3. **Local count** (when neither is available, free plan): the background records a timestamp for every Claude completion POST (URL path ending in `completion` or `_completion` under `chat_conversations`), keeps the last 7 days, max 20,000. The panel shows messages in the current 5-hour session window (with how much of the 5 h has elapsed, or an empty-window message) and messages in the last 7 days, with a disclaimer that this counts sends, not remaining quota. Paid users with no data see a link to the site's own usage settings page (`/settings/usage`).

### Badge
- Injected inside the Claude composer container: the visible `[data-testid="chat-input"][contenteditable="true"]` element's closest `fieldset` (else `form`, else parent). Only on chat paths, not on auth pages or incognito chats.
- Refreshes data at most every 60 s. Picks the single most important limit: highest percent; ties broken by active flag, then priority weekly-all > weekly-scoped > session = current-usage. Model-scoped weekly limits are only considered when their model name matches the currently selected model (substring match either way).
- Shows a thin bar plus "<percent>% · <limit name> · resets <time>" where the reset is a local time (hh:mm) if today, else a short date. Tone: severity from the site, else critical at ≥ 90%, warning at ≥ 75%, else calm. Accessible label repeats the same.
- Removed when there is no data after a refresh.

### Plan detection
`GET https://claude.ai/api/account` → `memberships[]` → the membership whose `organization.uuid` matches the active org → `organization.rate_limit_tier`; `default_claude_ai` means free, anything else paid, missing means unknown. Cached 5 minutes.

### Organization ID
Taken from the first `/organizations/<uuid>/` seen in the page's own XHR URLs (background, `onBeforeSendHeaders`), else `GET /api/organizations` and the first entry whose `capabilities` includes `chat`. On 403/404 the org list is re-read (at most every 15 s) and the call retried once.

## Gemini: usage badge
- RPC `jSf9Qc` on `/_/BardChatUi/data/batchexecute`, payload an empty JSON array, source path `/app`. Response position 1 is a list of entries; per entry, position 1 is the used fraction (0..1, shown ×100), position 2 a numeric kind (1 = current usage, 2 = weekly; others shown generically), position 3 holds a timestamp pair for the reset.
- Badge placed in the composer area: closest `.input-area-container`, else `.text-input-field`, else `form`, around the composer editor. Same selection, tone and text rules as Claude. Refresh every 60 s.
- No plan detection; the context meter's Auto plan is treated as free unless the user picks Paid.

## ChatGPT: local rate-limit widget and plan picker
ChatGPT exposes no usage numbers, so AIT counts locally.
- On every message sent (background sees a POST to `/backend-api/conversation` or `/backend-api/f/conversation`) a usage event is appended: timestamp, input characters (last user message text), mode. Output characters are filled in as the last assistant message grows (MutationObserver on `div[role="presentation"]` or `main`, paused while a stop button is visible).
- Mode: from `data-message-model-slug` (contains `-t-` or ends with `-t`, or `o1`/`o3` → thinking; contains `pro` → pro) or a "thought for" button in the turn; otherwise instant/auto.
- Rate-limit state: messages in the current window, window start, window length, window limit, thinking messages this week (week starts Monday 00:00 UTC), weekly thinking limit.
- Plan presets (code): free and go → no window, unlimited; plus (and unknown default) → 160 messages per 3 hours, 3,000 thinking messages per week; pro and business → unlimited. The plan picker's descriptive text claims free = 10 messages per 5 hours then a mini model and Go = 160 per 3 h, which disagrees with the code presets. Both are AIT hardcoded values, unverified; Artifact must use user-entered caps.
- Plan auto-detect (3 s after load): an upgrade link/button without a model switcher → free; otherwise class names containing plan/badge with "pro"/"plus"/"business"/"enterprise" text, or a menu item mentioning "pro". The user can override in the widget ("select your plan").
- Shows "messages used / limit", time to reset, weekly thinking count, a limit-reached state, and how many times the limit was hit this week. A paused state appears if ChatGPT changes break capture.
- Events older than 7 days are folded into daily summaries (kept 1 year); events list capped at 500. Compaction runs 5 s after load and hourly.
- Settings stored with the tracker: show widget (default on), position (default top-right), track usage (on), sync to cloud (on), show dashboard (on), show writing analytics (on).
- Server: the tracker syncs to the AIT server every 30 minutes (`/usage/sync`); the build keeps it local.

## Grok
No usage source in AIT. Only the context meter.

## AI Studio
Not supported by AIT.

## Premium / server notes
- Claude and Gemini badges are free features. The ChatGPT dashboard's charts are paid; the summary line is free (skip the split).
- Nothing here needs the AIT server except the ChatGPT cloud sync.
