// Claude plan usage: the /usage endpoint (two observed shapes) and the
// message_limit frame in the reply stream. Sources: Claude Counter (MIT) and
// the dossier; unconfirmed live (docs/provider-notes.md).
import { z } from 'zod';
import type { DataSource } from '../../core/schema/archive';
import type { UsageReport, UsageWindow } from '../types';

const WindowSchema = z.looseObject({ utilization: z.number().nullable().optional(), resets_at: z.union([z.string(), z.number()]).nullable().optional() });

const UsageSchema = z.looseObject({
  five_hour: WindowSchema.nullable().optional(),
  seven_day: WindowSchema.nullable().optional(),
  seven_day_opus: WindowSchema.nullable().optional(),
  limits: z
    .array(
      z.looseObject({
        kind: z.string().optional(),
        percent: z.number().nullable().optional(),
        resets_at: z.union([z.string(), z.number()]).nullable().optional(),
        is_active: z.boolean().optional(),
        scope: z.unknown().optional(),
      }),
    )
    .optional(),
});

function resetIso(v: string | number | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return new Date(v < 1e11 ? v * 1000 : v).toISOString();
  const d = Date.parse(v);
  return Number.isNaN(d) ? null : new Date(d).toISOString();
}

/** utilization is a percentage (0-100) on /usage and a fraction (0-1) in message_limit. */
function fraction(v: number | null | undefined, isPercent: boolean): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const f = isPercent ? v / 100 : v;
  return Math.max(0, Math.min(1, f));
}

const LABELS: Record<string, string> = { five_hour: '5-hour', seven_day: 'Weekly', seven_day_opus: 'Weekly (Opus)' };

export function parseClaudeUsage(raw: unknown, source: DataSource): UsageReport | null {
  const res = UsageSchema.safeParse(raw);
  if (!res.success) return null;
  const windows: UsageWindow[] = [];
  if (res.data.limits?.length) {
    for (const l of res.data.limits) {
      if (l.is_active === false) continue;
      windows.push({ label: l.kind ?? 'limit', fraction: fraction(l.percent, true), resetsAt: resetIso(l.resets_at) });
    }
  } else {
    for (const key of ['five_hour', 'seven_day', 'seven_day_opus'] as const) {
      const w = res.data[key];
      if (!w) continue;
      windows.push({ label: LABELS[key]!, fraction: fraction(w.utilization, true), resetsAt: resetIso(w.resets_at) });
    }
  }
  return windows.length ? { windows, source } : null;
}

const LimitFrameSchema = z.looseObject({
  type: z.literal('message_limit'),
  message_limit: z.looseObject({
    windows: z.record(z.string(), z.looseObject({ utilization: z.number().nullable().optional(), resets_at: z.union([z.number(), z.string()]).nullable().optional() })).optional(),
  }),
});

const WINDOW_LABELS: Record<string, string> = { '5h': '5-hour', '7d': 'Weekly' };

export function parseClaudeMessageLimit(body: string): UsageReport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const res = LimitFrameSchema.safeParse(raw);
  if (!res.success || !res.data.message_limit.windows) return null;
  const windows = Object.entries(res.data.message_limit.windows).map(([k, w]) => ({
    label: WINDOW_LABELS[k] ?? k,
    fraction: fraction(w.utilization, false),
    resetsAt: resetIso(w.resets_at),
  }));
  return windows.length ? { windows, source: 'intercept' } : null;
}
