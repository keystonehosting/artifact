// Copy-diagnostics report (SPEC §6M): versions, health, data sources and
// check results. Never message text, tokens, cookies or keys.
import type { SiteHealth } from './health';

export interface DiagnosticEntry {
  site: string;
  url: string;
  health: SiteHealth;
}

/** Keeps the origin and path shape but drops ids and query strings. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|c_[0-9a-z]+|[0-9a-z_-]{16,}/gi, ':id');
    return `${u.origin}${path}`;
  } catch {
    return '(invalid url)';
  }
}

export function formatDiagnostics(entries: DiagnosticEntry[], version: string, extra: Record<string, string> = {}): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const lines = [`Artifact ${version}`, `Browser: ${ua}`, `Time: ${new Date().toISOString()}`];
  for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${v}`);
  for (const e of entries) {
    lines.push('', `[${e.site}] ${redactUrl(e.url)}`, `state: ${e.health.state} (${e.health.reason})`, `source: ${e.health.source ?? 'none'}`);
    for (const c of e.health.checks) lines.push(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`);
  }
  return lines.join('\n');
}
