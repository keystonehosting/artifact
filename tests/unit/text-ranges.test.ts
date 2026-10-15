import { describe, expect, it } from 'vitest';
import { contextOf, findAll, findQuote } from '../../src/features/library/text-ranges';

function el(html: string): Element {
  const d = document.createElement('div');
  d.innerHTML = html;
  document.body.append(d);
  return d;
}

describe('text ranges', () => {
  it('finds matches across element boundaries, case-insensitively, skipping our own UI', () => {
    const root = el('<p>Hello <b>wor</b>ld, hello again</p><span data-artifact>hello</span>');
    const ranges = findAll(root, 'HELLO');
    expect(ranges).toHaveLength(2);
    expect(findAll(root, 'world')[0]!.toString()).toBe('world');
  });

  it('re-finds a quote by its context when it appears twice', () => {
    const root = el('<p>one apple here. two apple there.</p>');
    const r = findQuote(root, 'apple', 'two ', ' there');
    expect(r).not.toBeNull();
    const ctx = contextOf(root, r!, 4);
    expect(ctx).toEqual({ prefix: 'two ', suffix: ' the' });
  });

  it('returns null for a quote that is gone', () => {
    expect(findQuote(el('<p>abc</p>'), 'xyz', '', '')).toBeNull();
  });
});
