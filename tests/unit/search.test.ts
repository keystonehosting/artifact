import { describe, expect, it } from 'vitest';
import { createIndex, docsFor, search, snippet } from '../../src/core/search/engine';
import { ruleMatches, applyRules, BUILTIN_RULES } from '../../src/core/library/tagrules';
import { libraryIdForUrl } from '../../src/core/sites/chat-urls';
import { findingsReport } from '../../src/ui/app/SearchPanel';
import { sampleConversation } from './sample';
import type { TagRuleRow } from '../../src/core/db/db';

describe('search engine', () => {
  const conv = sampleConversation();
  const idx = createIndex();
  idx.addAll(docsFor(conv));
  const text = (c: string, m: string) => {
    const msg = conv.messages[m];
    return msg ? msg.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ') : null;
  };

  it('indexes every visible message on every branch', () => {
    expect(docsFor(conv).map((d) => d.messageId).sort()).toEqual(['a1', 'a2', 'a2b', 'u1', 'u2', 'u2b']);
  });

  it('matches by prefix and groups by chat', () => {
    const hits = search(idx, { text: 'lore' }, text);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.hits.some((h) => h.messageId === 'u1')).toBe(true);
  });

  it('applies role and date filters', () => {
    expect(search(idx, { text: 'veniam', roles: ['user'] }, text)).toHaveLength(0);
    expect(search(idx, { text: 'veniam', roles: ['assistant'] }, text)).toHaveLength(1);
    expect(search(idx, { text: 'lorem', from: Date.parse('2027-01-01') }, text)).toHaveLength(0);
  });

  it('exact phrase requires the words in order', () => {
    expect(search(idx, { text: 'dolor sit', exact: true }, text)).toHaveLength(1);
    expect(search(idx, { text: 'sit dolor', exact: true }, text)).toHaveLength(0);
  });

  it('builds snippets around matches', () => {
    const parts = snippet('Alpha beta gamma delta epsilon', ['gamma'], 20);
    expect(parts.find((p) => p.match)?.text).toBe('gamma');
    expect(snippet('no match here', [], 40)).toEqual([{ text: 'no match here', match: false }]);
  });
});

describe('smart tag rules', () => {
  const custom: TagRuleRow = { id: 'r', tag: 'T', terms: ['foo', 'bar'], match: 'all', fields: ['content'], sites: ['claude'], enabled: 1, builtin: 0 };

  it('built-in rules need two content hits or one title hit', () => {
    const code = BUILTIN_RULES.find((r) => r.id === 'builtin:code')!;
    expect(ruleMatches(code, 'claude', 'Hello', 'I like python')).toBe(false);
    expect(ruleMatches(code, 'claude', 'Hello', 'python and sql')).toBe(true);
    const writing = BUILTIN_RULES.find((r) => r.id === 'builtin:writing')!;
    expect(ruleMatches(writing, 'claude', 'Cover letter help', '')).toBe(true);
  });

  it('custom rules honour all/any and site limits', () => {
    expect(ruleMatches(custom, 'claude', '', 'foo only')).toBe(false);
    expect(ruleMatches(custom, 'claude', '', 'foo and bar')).toBe(true);
    expect(ruleMatches(custom, 'chatgpt', '', 'foo and bar')).toBe(false);
    expect(applyRules([custom, { ...custom, id: 'r2' }], 'claude', '', 'foo bar')).toEqual(['T']);
    expect(ruleMatches({ ...custom, enabled: 0 }, 'claude', '', 'foo bar')).toBe(false);
  });
});

describe('chat urls', () => {
  it('maps site URLs to library ids', () => {
    expect(libraryIdForUrl('https://chatgpt.com/c/6810f2a4-0000-8000-9000-000000000001')).toBe('chatgpt:6810f2a4-0000-8000-9000-000000000001');
    expect(libraryIdForUrl('https://claude.ai/chat/11111111-1111-1111-1111-111111111111')).toBe('claude:11111111-1111-1111-1111-111111111111');
    expect(libraryIdForUrl('https://gemini.google.com/app/abcdef0123456789')).toBe('gemini:c_abcdef0123456789');
    expect(libraryIdForUrl('https://aistudio.google.com/prompts/new_chat')).toBeNull();
    expect(libraryIdForUrl('https://example.com/c/123456789')).toBeNull();
    expect(libraryIdForUrl('not a url')).toBeNull();
  });
});

describe('findings report', () => {
  it('lists each chat with filters and bolded matches', () => {
    const md = findingsReport(
      { text: 'borrow', sites: ['claude'], exclude: ['garden'] },
      { total: 1, chats: [{ chatId: 'claude:x', site: 'claude', score: 1, hits: [], title: 'Rust', url: 'https://claude.ai/chat/x', updatedAt: '2026-03-01T00:00:00Z', snippets: [{ messageId: 'm', role: 'assistant', text: 'The borrow checker' }] }] },
      new Date('2026-04-01T12:00:00Z'),
    );
    expect(md).toContain('# Search: borrow');
    expect(md).toContain('Filters: sites: claude; exclude: garden');
    expect(md).toContain('## Rust');
    expect(md).toContain('**borrow**');
  });
});
