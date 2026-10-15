import { describe, expect, it } from 'vitest';
import { cleanPageTitle, formatFilename, uniqueName } from '../../src/core/util/filename';

describe('filenames', () => {
  const date = new Date(2026, 0, 2, 3, 4);
  it('fills tokens and strips illegal characters', () => {
    expect(formatFilename('{platform} - {title} - {datetime}', { platform: 'Claude', title: 'a/b:c?', date })).toBe('Claude - abc - 2026-01-02_03-04');
    expect(formatFilename('{title} ({model})', { title: 'Plan', model: 'gpt-5', date })).toBe('Plan (gpt-5)');
  });
  it('replaces generic titles', () => {
    expect(formatFilename('{title}', { platform: 'ChatGPT', title: 'New chat', date })).toBe('ChatGPT Conversation');
  });
  it('cleans branded page titles', () => {
    expect(cleanPageTitle('Plan a trip - Claude', 'Claude')).toBe('Plan a trip');
    expect(cleanPageTitle('ChatGPT', 'ChatGPT')).toBe('');
  });
  it('dedupes names', () => {
    const taken = new Set<string>();
    expect(uniqueName('a.md', taken)).toBe('a.md');
    expect(uniqueName('a.md', taken)).toBe('a (2).md');
    expect(uniqueName('a.md', taken)).toBe('a (3).md');
  });
});
