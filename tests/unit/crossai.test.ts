import { describe, expect, it } from 'vitest';
import { diffLines, diffWords, similarity } from '../../src/core/text/diff';
import { clip, handoffSeed, localHandoff, mentionBlock } from '../../src/core/crossai/carry';
import type { Conversation } from '../../src/core/schema/archive';
import { sampleConversation } from './sample';

function chat(turns: string[]): Conversation {
  const c = sampleConversation();
  const messages: Conversation['messages'] = {};
  let parent: string | null = null;
  turns.forEach((text, i) => {
    const id = `m${i}`;
    messages[id] = { id, parentId: parent, childIds: [], role: i % 2 ? 'assistant' : 'user', parts: [{ type: 'text', text }], attachmentIds: [], artifactIds: [] };
    if (parent) messages[parent]!.childIds.push(id);
    parent = id;
  });
  return { ...c, rootIds: ['m0'], currentLeafId: parent, messages, title: 'Trip plan' };
}

const words = (s: string) => Math.ceil(s.split(/\s+/).length);

describe('diff', () => {
  it('finds word insertions and deletions and round-trips both sides', () => {
    const a = 'The quick brown fox jumps over the lazy dog';
    const b = 'The quick red fox leaps over the lazy dog today';
    const ops = diffWords(a, b);
    expect(ops.filter((o) => o.type !== 'ins').map((o) => o.text).join('')).toBe(a);
    expect(ops.filter((o) => o.type !== 'del').map((o) => o.text).join('')).toBe(b);
    expect(ops.find((o) => o.type === 'del')?.text).toBe('brown');
    expect(similarity(ops)).toBeGreaterThan(0.6);
  });

  it('handles empty sides and line mode', () => {
    expect(diffWords('', 'new')).toEqual([{ type: 'ins', text: 'new' }]);
    expect(diffWords('old', '')).toEqual([{ type: 'del', text: 'old' }]);
    expect(diffLines('a\nb\nc\n', 'a\nc\n')).toEqual([
      { type: 'eq', text: 'a\n' },
      { type: 'del', text: 'b\n' },
      { type: 'eq', text: 'c\n' },
    ]);
  });
});

describe('carry forward', () => {
  it('clips long text keeping the start and end', () => {
    const s = clip('a'.repeat(100) + 'END', 40);
    expect(s.length).toBeLessThanOrEqual(42);
    expect(s).toContain('[…]');
    expect(s.endsWith('END')).toBe(true);
  });

  it('builds a local handoff with goal, constraints, decisions, code and recent turns', async () => {
    const conv = chat([
      'Plan a 3 day trip to Lisbon. Keep it under 500 euros. Never book hostels.',
      "Let's go with Alfama for the stay. Here is a budget:\n```py\nbudget = 500\n```",
      'Add a day trip.',
      'We will use the train to Sintra.',
    ]);
    const text = await localHandoff(conv, { siteName: 'Claude', budget: 10_000, count: words });
    expect(text).toContain('## Goal\nPlan a 3 day trip to Lisbon.');
    expect(text).toContain('- Keep it under 500 euros.');
    expect(text).toContain('- Never book hostels.');
    expect(text).toMatch(/## Decisions so far\n- Let's go with Alfama/);
    expect(text).toContain('```py\nbudget = 500\n```');
    expect(text).toContain('**Claude:** We will use the train to Sintra.');
    expect(text).toContain(conv.url!);
  });

  it('shrinks to fit a small budget', async () => {
    const long = Array.from({ length: 12 }, (_, i) => `Turn ${i} ${'word '.repeat(300)}`);
    const text = await localHandoff(chat(long), { siteName: 'ChatGPT', budget: 250, count: words });
    expect(words(text)).toBeLessThanOrEqual(250);
  });

  it('seeds the destination with a header and room to type', () => {
    const seed = handoffSeed('Summary.', { title: 'Trip plan', siteName: 'Gemini' }, true);
    expect(seed).toBe('I\'m continuing a conversation titled "Trip plan" that started on Gemini. Here is where it stands:\n\nSummary.\n\n---\n\n');
  });

  it('mentions short chats whole and long chats as an excerpt', () => {
    const short = mentionBlock(chat(['Hi', 'Hello']), 'Grok');
    expect(short).toBe('[Context: "Trip plan" on Grok]\nUser: Hi\nGrok: Hello\n[End of context]\n');
    const long = mentionBlock(chat(Array.from({ length: 30 }, (_, i) => `t${i} ${'x'.repeat(800)}`)), 'Grok');
    expect(long).toContain('30 messages');
    expect(long).toContain('(22 messages in between left out)');
    expect(long).toContain('User: t0');
    expect(long).toContain('Grok: t29');
    expect(long.length).toBeLessThan(31_000);
  });
});
