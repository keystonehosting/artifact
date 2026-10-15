import { describe, expect, it } from 'vitest';
import { readDomConversation } from '../../src/adapters/dom-reader';
import { TIER1_DOM } from '../../src/adapters/tier1-dom';
import { fixtureDocument } from './fixtures';
import { activeBranch, messageText } from '../../src/core/model/tree';

const cases = [
  ['chatgpt', 'sites/chatgpt-chat.html', 'https://chatgpt.com/c/68f0a1b2-0000-0000-0000-000000000000'],
  ['claude', 'sites/claude-chat.html', 'https://claude.ai/chat/00000000-0000-0000-0000-000000000000'],
  ['gemini', 'sites/gemini-chat.html', 'https://gemini.google.com/app/e87b6c6ac16404a5'],
  ['grok', 'sites/grok-chat.html', 'https://grok.com/c/00000000-0000-0000-0000-000000000000'],
  ['aistudio', 'synthetic/aistudio-chat.html', 'https://aistudio.google.com/prompts/abc'],
] as const;

describe('Tier 1 DOM fallback readers', () => {
  for (const [site, file, url] of cases) {
    it(`reads alternating turns from the ${site} capture`, () => {
      const doc = fixtureDocument(file, url);
      const conv = readDomConversation(doc, TIER1_DOM[site], 'x', url);
      expect(conv).not.toBeNull();
      const branch = activeBranch(conv!);
      expect(branch.length).toBeGreaterThanOrEqual(2);
      expect(branch[0]!.role).toBe('user');
      expect(branch.some((m) => m.role === 'assistant')).toBe(true);
      for (const m of branch) expect(messageText(m).trim().length).toBeGreaterThan(0);
      expect(conv!.source).toMatchObject({ method: 'dom', approximate: true });
    });
  }

  it('keeps ChatGPT message ids and the model slug', () => {
    const url = 'https://chatgpt.com/c/x';
    const conv = readDomConversation(fixtureDocument('sites/chatgpt-chat.html', url), TIER1_DOM.chatgpt, 'x', url)!;
    expect(Object.keys(conv.messages)).toContain('05d32391-4046-4fdc-bd49-6a2b9c72a3bb');
    expect(conv.model).toBe('gpt-5-5');
  });

  it('reads AI Studio title, skips thinking, keeps code blocks', () => {
    const url = 'https://aistudio.google.com/prompts/abc';
    const conv = readDomConversation(fixtureDocument('synthetic/aistudio-chat.html', url), TIER1_DOM.aistudio, 'abc', url)!;
    expect(conv.title).toBe('Lorem ipsum chat');
    const model = activeBranch(conv)[1]!;
    expect(model.parts).toContainEqual({ type: 'code', language: 'python', code: 'print("lorem")' });
    expect(messageText(model)).not.toContain('Consectetur');
  });
});
