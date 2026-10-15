// Context meter math (SPEC §6A): usage, thresholds, exchanges left.
export interface Thresholds {
  amber: number;
  orange: number;
  red: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { amber: 50, orange: 75, red: 90 };

export type Level = 'neutral' | 'amber' | 'orange' | 'red' | 'unknown';

export function levelFor(percent: number | null, t: Thresholds = DEFAULT_THRESHOLDS): Level {
  if (percent === null || !Number.isFinite(percent)) return 'unknown';
  if (percent >= t.red) return 'red';
  if (percent >= t.orange) return 'orange';
  if (percent >= t.amber) return 'amber';
  return 'neutral';
}

export interface Exchange {
  user: number;
  assistant: number;
}

/** Groups a token list by role into user→assistant exchanges. */
export function toExchanges(msgs: Array<{ role: string; tokens: number }>): Exchange[] {
  const out: Exchange[] = [];
  let cur: Exchange | null = null;
  for (const m of msgs) {
    if (m.role === 'user') {
      if (cur) out.push(cur);
      cur = { user: m.tokens, assistant: 0 };
    } else if (m.role === 'assistant' || m.role === 'tool') {
      cur ??= { user: 0, assistant: 0 };
      cur.assistant += m.tokens;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Exchanges that still fit: remaining tokens divided by the average size of
 * the last `window` complete exchanges. Null when there is no limit or no history.
 */
export function exchangesLeft(used: number, limit: number | null, exchanges: Exchange[], window = 5): number | null {
  if (limit === null || limit <= 0) return null;
  const done = exchanges.filter((e) => e.assistant > 0).slice(-window);
  if (!done.length) return null;
  const avg = done.reduce((s, e) => s + e.user + e.assistant, 0) / done.length;
  if (avg <= 0) return null;
  return Math.max(0, Math.floor((limit - used) / avg));
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : n < 100_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
}

/** e.g. "82.4k / 200k · 41%", with ≈ when the count is estimated. */
export function meterLabel(used: number, limit: number | null, approximate: boolean): string {
  const approx = approximate ? '≈ ' : '';
  if (limit === null) return `${approx}${formatTokens(used)} / unknown`;
  const pct = Math.round((used / limit) * 100);
  return `${approx}${formatTokens(used)} / ${formatTokens(limit)} · ${pct}%`;
}
