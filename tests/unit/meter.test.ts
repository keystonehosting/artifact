import { describe, expect, it } from 'vitest';
import { exchangesLeft, levelFor, meterLabel, toExchanges, formatTokens } from '../../src/core/meter/meter';
import { lookupLimit, modeForModel } from '../../src/core/limits/limits';
import { applyCalibration, updateCalibration } from '../../src/core/meter/calibration';
import { computeMeter, heaviest } from '../../src/features/meter/model';
import { sampleConversation } from './sample';

describe('meter math', () => {
  it('levels follow editable thresholds', () => {
    expect(levelFor(10)).toBe('neutral');
    expect(levelFor(50)).toBe('amber');
    expect(levelFor(75)).toBe('orange');
    expect(levelFor(90)).toBe('red');
    expect(levelFor(60, { amber: 70, orange: 80, red: 95 })).toBe('neutral');
    expect(levelFor(null)).toBe('unknown');
  });

  it('estimates exchanges left from the last five exchanges', () => {
    const ex = toExchanges([
      { role: 'user', tokens: 100 },
      { role: 'assistant', tokens: 900 },
      { role: 'user', tokens: 100 },
      { role: 'assistant', tokens: 900 },
    ]);
    expect(ex).toEqual([{ user: 100, assistant: 900 }, { user: 100, assistant: 900 }]);
    expect(exchangesLeft(2000, 10_000, ex)).toBe(8);
    expect(exchangesLeft(2000, null, ex)).toBeNull();
    expect(exchangesLeft(0, 1000, [])).toBeNull();
  });

  it('formats labels', () => {
    expect(meterLabel(82_400, 200_000, false)).toBe('82.4k / 200k · 41%');
    expect(meterLabel(1500, null, true)).toBe('≈ 1.5k / unknown');
    expect(formatTokens(1_000_000)).toBe('1M');
  });
});

describe('limits', () => {
  it('uses cited docs per site and plan', () => {
    expect(lookupLimit({ site: 'claude', model: 'claude-opus-5-5', plan: 'pro' })).toMatchObject({ tokens: 1_000_000, source: 'docs' });
    expect(lookupLimit({ site: 'claude', model: 'claude-sonnet-4-6', plan: 'max' }).tokens).toBe(500_000);
    expect(lookupLimit({ site: 'claude', model: 'claude-some-new', plan: 'pro' }).tokens).toBe(200_000);
    expect(lookupLimit({ site: 'claude', model: 'x', plan: 'free' })).toMatchObject({ tokens: null, source: 'unknown' });
    expect(lookupLimit({ site: 'chatgpt', model: 'gpt-x', plan: 'plus' }).tokens).toBe(54_000);
    expect(lookupLimit({ site: 'chatgpt', model: 'gpt-x-thinking', plan: 'plus' }).tokens).toBe(256_000);
    expect(lookupLimit({ site: 'chatgpt', model: 'gpt-x', plan: 'unknown' }).tokens).toBeNull();
    expect(lookupLimit({ site: 'gemini', model: null, plan: 'pro' }).tokens).toBe(1_000_000);
    expect(lookupLimit({ site: 'grok', model: 'grok-x', plan: 'unknown' }).tokens).toBeNull();
  });

  it('prefers overrides, then the site, then docs; never guesses', () => {
    expect(lookupLimit({ site: 'grok', model: 'grok-x', plan: 'unknown', overrides: { 'grok-x': 1234 } })).toMatchObject({ tokens: 1234, source: 'override' });
    expect(lookupLimit({ site: 'aistudio', model: 'm', plan: 'unknown', siteReported: 1_048_576 })).toMatchObject({ tokens: 1_048_576, source: 'site' });
    expect(lookupLimit({ site: 'aistudio', model: 'm', plan: 'unknown' }).tokens).toBeNull();
  });

  it('classifies reasoning models', () => {
    expect(modeForModel('gpt-5-thinking')).toBe('reasoning');
    expect(modeForModel('o3')).toBe('reasoning');
    expect(modeForModel('gpt-5-5')).toBe('instant');
  });
});

describe('calibration', () => {
  it('learns a smoothed factor and ignores noise', () => {
    const a = updateCalibration(null, 1000, 1100, 1)!;
    expect(a.factor).toBeCloseTo(1.1);
    const b = updateCalibration(a, 1000, 1200, 2)!;
    expect(b.factor).toBeCloseTo(1.1 * 0.7 + 1.2 * 0.3);
    expect(updateCalibration(b, 50, 80)).toBe(b);
    expect(updateCalibration(b, 1000, 5000)).toBe(b);
    expect(applyCalibration(1000, b)).toBe(Math.round(1000 * b.factor));
  });
});

describe('meter state', () => {
  it('breaks usage down and finds the heaviest messages', async () => {
    const count = async (texts: string[]) => texts.map((t) => t.length);
    const st = await computeMeter({
      conv: sampleConversation(),
      count,
      limit: { tokens: 1000, source: 'docs', label: 'x' },
      approximate: true,
      thresholds: { amber: 50, orange: 75, red: 90 },
      draft: 10,
    });
    expect(st.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2b', 'a2b']);
    expect(st.breakdown.user).toBe('Lorem ipsum dolor sit amet?'.length + 'Duis aute irure?'.length);
    expect(st.breakdown.unmeasuredFiles).toBe(2);
    expect(st.used).toBe(st.cumulative[st.cumulative.length - 1]! + 10);
    expect(heaviest(st.messages, 1)[0]!.id).toBe('a1');
    expect(st.messages.find((m) => m.id === 'a1')!.tokens).toBeGreaterThan(0);
  });
});
