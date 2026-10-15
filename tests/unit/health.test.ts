import { describe, expect, it } from 'vitest';
import { HealthTracker } from '../../src/core/health/health';
import { formatDiagnostics, redactUrl } from '../../src/core/health/diagnostics';

describe('health', () => {
  it('is unknown, then healthy, degraded and broken as checks change', () => {
    const h = new HealthTracker(new Set(['critical']));
    expect(h.snapshot().state).toBe('unknown');
    h.pass('a');
    h.setSource('endpoint');
    expect(h.snapshot().state).toBe('healthy');
    h.fail('b', 'payload changed');
    expect(h.snapshot()).toMatchObject({ state: 'degraded', reason: 'payload changed' });
    h.fail('critical', 'no data');
    expect(h.snapshot().state).toBe('broken');
  });

  it('notifies subscribers only on change', () => {
    const h = new HealthTracker();
    const seen: string[] = [];
    h.subscribe((s) => seen.push(s.state));
    h.pass('a');
    h.pass('a');
    h.fail('a', 'x');
    expect(seen).toEqual(['healthy', 'degraded']);
  });

  it('diagnostics never include ids or query strings', () => {
    expect(redactUrl('https://claude.ai/chat/11111111-2222-3333-4444-555555555555?x=secret')).toBe('https://claude.ai/chat/:id');
    const h = new HealthTracker();
    h.pass('c', 'ok');
    const report = formatDiagnostics([{ site: 'gemini', url: 'https://gemini.google.com/app/c_abcdef0123456789', health: h.snapshot() }], '0.1.0');
    expect(report).toContain('[gemini] https://gemini.google.com/app/:id');
    expect(report).not.toContain('abcdef0123456789');
  });
});
