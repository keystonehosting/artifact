# Stats and achievements (usage tracker, heatmaps, streaks, badges, recap)

Strings: G-stats, G-achievements in [strings.md](strings.md); the leaderboard, percentile and share-card strings are recorded skips (G-leaderboard). Observed in AIT 5.0.54, unconfirmed live.

## 1. Usage tracker and dashboard (ChatGPT only)

### Capture (local)
See [usage-limits.md](usage-limits.md) for event capture. Each event: id, timestamp, input characters, output characters, mode (thinking / instant / auto / pro). Privacy: only timestamps, counts and modes are stored, never message text. Events older than 7 days are folded into daily summaries: date, total messages, thinking/instant/auto counts, input and output characters, session count and total session minutes (a gap over 30 minutes starts a new session), peak hour and a 24-slot hourly histogram. Summaries older than 1 year are dropped.

### Dashboard (modal, palette the usage dashboard)
- Period selector: today, this week, this month, this year, all time (labels like "today (date)", "week of date", "month/year").
- Headline tiles: messages sent, time spent, thinking messages today, current messaging streak (consecutive days with ≥ 1 message, counting back from today; today counts if it has a message), best streak.
- Rate-limit status block ([usage-limits.md](usage-limits.md)).
- Message history chart: daily or weekly bars.
- Activity heatmap: hour of day × day of week.
- Statistics: total messages (all time, this month, this week), days active, total sessions, current and longest streak, average messages per day, average session length (minutes), most active weekday, most active hour, total input and output characters.
- Message mode breakdown: thinking / instant / auto counts with one-line explanations.
- Estimated API equivalent cost for this month (AIT hardcoded values, unverified): tokens = characters ÷ 4; the split assumes 60% of tokens are "instant" and 40% "thinking" whenever such messages exist; prices per token: instant input 1.75e-6, instant output 7e-6, thinking input 12e-6, thinking output 48e-6. Shown with a disclaimer. (Artifact: either drop or cite official pricing.)
- a CSV export button of the daily summaries; a manual sync action with last-synced time (server sync, see below); a a tracking-paused state banner when capture broke.
- Setting the usage dashboard (default on): off stops tracking and hides it from all menus.

### Recap card ("Wrapped")
- Generates a shareable image in two formats: story 1080×1920 and card 1200×675; actions download PNG and copy to clipboard. Content: messages sent this period, hours spent, thinking-mode uses, busiest day, peak hour (with a time-of-day persona: early bird / afternoon / evening / night owl), words written (compared to a short essay / novella / novel / multiple novels), API-equivalent cost, and (server) a percentile versus other AIT users.
- The numbers come from the AIT server (`/usage/stats?period=…`, `/usage/wrapped?period=…`) after the 30-minute sync (`/usage/sync`). **Artifact computes everything locally**, renders the image locally, and drops the percentile.

## 2. Daily streak and badges (all sites)

### Streak state (local, chrome.storage, shared by all sites)
current, longest, last active local date (YYYY-MM-DD in the user's time zone), freezes available, unlocked badges (threshold → date), self-reported review flag, days since last freeze grant, platforms used, per-year "season" completion dates, per-year day counts, comeback date, perfect-run date, freezes used this run, previous peak. A one-time seeding from the usage tracker history can backfill the streak.

### Daily update (once per local day, when AIT is used on a supported site)
- Same day: only season bookkeeping.
- Next day: current + 1.
- Missed exactly one day and a freeze is available: current + 1, consume a freeze.
- Otherwise: remember the previous peak, reset to 1, reset freezes-used-this-run.
- Every 14 days a freeze is granted, holding at most 2.
- Badges unlock when current reaches a threshold; newly unlocked badges are queued for a celebration popup (setting a streak-popup toggle, default on; off still records them).
- Platforms: the site is added to "platforms used" on first use.

### Milestone badges (thresholds → rarity)
3 common, 7 common, 14 uncommon, 30 uncommon, 60 rare, 100 rare, 150 epic, 200 epic, 300 legendary, 365 mythic. (AIT uses 7, 30 and 100 as moments to ask for a store review: skip.)

### Tiers (status)
Bronze at 3 days, Silver 14, Gold 30, Platinum 100, Legend 365 (by streak). Status tab shows the tier, days to the next tier, "unranked" before Bronze.

### Special badges
- Member <year>: the year the user joined (one per year, cannot be earned later).
- <year> season: had a 7-day run within that calendar year.
- All four: used AIT on ChatGPT, Claude, Gemini and Grok (a hint lists the missing sites).
- Comeback: after losing a streak of ≥ 30, built a new one back to ≥ 30.
- Perfect run: reached 100 days without using a freeze.
- All-access owner and leaderboard champion badges are payment/leaderboard based: skip.

### UI
Achievements page (palette and launcher): streak counter, "n days to your next badge", grid of badges with state (unlocked with date, in progress "a of b days", locked with a hint), rarity labels, status tab. Badge artwork is fetched from AIT's CDN (do not reuse; draw own).

### Server dependency
Achievements are mirrored to the AIT server per site (`/achievements/<site>`), and a leaderboard with opt-in handles exists (`/leaderboard*`). **Artifact: local only; leaderboard, percentile and share-to-social are recorded skips.** Stats are off by default in Artifact (SPEC §6K) whereas AIT turns them on by default.
