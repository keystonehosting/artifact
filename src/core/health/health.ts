// Per-site health (SPEC §5, §6M). A site change must surface as Degraded with
// a reason, never as silently wrong numbers.
import type { DataSource } from '../schema/archive';

export type HealthState = 'healthy' | 'degraded' | 'broken' | 'unknown';

export interface HealthCheck {
  /** Stable check id, e.g. "chatgpt.conversation.endpoint". */
  id: string;
  ok: boolean;
  /** Human-readable reason when not ok, or the data source when ok. */
  detail: string;
  at: number;
}

export interface SiteHealth {
  state: HealthState;
  reason: string;
  checks: HealthCheck[];
  /** Data source used for the last successful read. */
  source: DataSource | null;
  updatedAt: number;
}

export class HealthTracker {
  private checks = new Map<string, HealthCheck>();
  private source: DataSource | null = null;
  private listeners = new Set<(h: SiteHealth) => void>();

  /** `critical` failures make the site Broken; others make it Degraded. */
  constructor(private readonly critical: ReadonlySet<string> = new Set()) {}

  pass(id: string, detail = 'ok'): void {
    this.set({ id, ok: true, detail, at: Date.now() });
  }

  fail(id: string, detail: string): void {
    this.set({ id, ok: false, detail, at: Date.now() });
  }

  setSource(source: DataSource): void {
    this.source = source;
    this.emit();
  }

  private set(check: HealthCheck): void {
    const prev = this.checks.get(check.id);
    this.checks.set(check.id, check);
    if (!prev || prev.ok !== check.ok || prev.detail !== check.detail) this.emit();
  }

  snapshot(): SiteHealth {
    return summarize([...this.checks.values()], this.critical, this.source);
  }

  subscribe(fn: (h: SiteHealth) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }
}

export function summarize(checks: HealthCheck[], critical: ReadonlySet<string>, source: DataSource | null): SiteHealth {
  const failed = checks.filter((c) => !c.ok);
  const updatedAt = checks.reduce((m, c) => Math.max(m, c.at), 0);
  if (!checks.length) return { state: 'unknown', reason: 'No checks have run yet', checks, source, updatedAt };
  const broken = failed.filter((c) => critical.has(c.id));
  if (broken.length) return { state: 'broken', reason: broken.map((c) => c.detail).join('; '), checks, source, updatedAt };
  if (failed.length) return { state: 'degraded', reason: failed.map((c) => c.detail).join('; '), checks, source, updatedAt };
  const reason = source === 'dom' ? 'Reading page text (approximate)' : 'All checks passing';
  return { state: 'healthy', reason, checks, source, updatedAt };
}
