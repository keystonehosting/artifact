// Local log of messages sent, for the ChatGPT rate-limit widget and the
// hourly heatmap. Only a site id, a model label and a timestamp are kept.
import { browser } from 'wxt/browser';
import type { SiteId } from '../../core/sites/sites';

export interface SendEvent {
  site: SiteId;
  model: string | null;
  at: number;
}

const KEY = 'sendLog';
const MAX = 20_000;

export async function readSendLog(): Promise<SendEvent[]> {
  const got = await browser.storage.local.get(KEY);
  return Array.isArray(got[KEY]) ? (got[KEY] as SendEvent[]) : [];
}

export async function recordSend(site: SiteId, model: string | null, at = Date.now()): Promise<void> {
  const log = await readSendLog();
  log.push({ site, model, at });
  await browser.storage.local.set({ [KEY]: log.slice(-MAX) });
}

export interface CapStatus {
  model: string;
  used: number;
  cap: number;
  hours: number;
  /** When the oldest counted send leaves the window. */
  nextFreeAt: number | null;
}

/** Sends inside each user-defined window (SPEC §6A, ChatGPT local rate-limit widget). */
export function capStatus(log: SendEvent[], caps: Array<{ model: string; count: number; hours: number }>, now = Date.now()): CapStatus[] {
  return caps.map((c) => {
    const since = now - c.hours * 3600_000;
    const hits = log.filter((e) => e.site === 'chatgpt' && e.at >= since && (c.model === '*' || (e.model ?? '').toLowerCase() === c.model.toLowerCase())).map((e) => e.at);
    hits.sort((a, b) => a - b);
    const nextFreeAt = hits.length >= c.count ? hits[hits.length - c.count]! + c.hours * 3600_000 : null;
    return { model: c.model, used: hits.length, cap: c.count, hours: c.hours, nextFreeAt };
  });
}

/** 7 × 24 matrix of sends by weekday (0 = Sunday) and hour, in local time. */
export function hourlyHeatmap(log: SendEvent[], site?: SiteId): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const e of log) {
    if (site && e.site !== site) continue;
    const d = new Date(e.at);
    grid[d.getDay()]![d.getHours()]! += 1;
  }
  return grid;
}
