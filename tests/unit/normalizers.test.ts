import { describe, expect, it } from 'vitest';
import { fixture } from './fixtures';
import { chatgptToConversation, PayloadError } from '../../src/adapters/chatgpt/normalize';
import { claudeToConversation } from '../../src/adapters/claude/normalize';
import { grokToConversation, stripRenderTags } from '../../src/adapters/grok/normalize';
import { geminiToConversation } from '../../src/adapters/gemini/normalize';
import { aistudioToConversation } from '../../src/adapters/aistudio/normalize';
import { decodeBatchExecute } from '../../src/core/schema/payloads/batchexecute';
import { activeBranch, allBranches, messageText } from '../../src/core/model/tree';
import { ConversationSchema } from '../../src/core/schema/archive';

const json = (name: string) => JSON.parse(fixture(`payloads/${name}`)) as unknown;

describe('ChatGPT normalizer', () => {
  const conv = chatgptToConversation(json('chatgpt-conversation.json'), 'cid', 'https://chatgpt.com/c/cid');

  it('produces a valid conversation following current_node', () => {
    expect(ConversationSchema.safeParse(conv).success).toBe(true);
    expect(activeBranch(conv).filter((m) => !m.hidden).map((m) => m.id)).toEqual(['u1', 'a1', 'a1b', 'a1c', 'u2b', 'a2b']);
    expect(allBranches(conv)).toHaveLength(3);
    expect(conv.messages.sys!.hidden).toBe(true);
  });

  it('rebuilds canvas versions', () => {
    expect(conv.artifacts).toHaveLength(1);
    expect(conv.artifacts[0]).toMatchObject({ id: 'doc1', kind: 'chatgpt-canvas', title: 'Lorem doc' });
    expect(conv.artifacts[0]!.versions.map((v) => v.content)).toEqual(['Hello world', 'Hello canvas']);
  });

  it('keeps images, uploads, citations, thinking and models', () => {
    const u1 = conv.messages.u1!;
    expect(u1.parts[0]).toMatchObject({ type: 'image' });
    expect(conv.attachments.map((a) => a.name)).toEqual(['file-AAA.png', 'notes.pdf']);
    expect(conv.attachments[1]!.ref).toEqual({ fileId: 'file-BBB' });
    expect(messageText(conv.messages.a1c!)).toContain('[Example](https://example.test/a)');
    expect(conv.messages.th!.parts[0]).toEqual({ type: 'thinking', text: '**Plan**\n\nConsectetur.' });
    expect(conv.messages.a2b!.model).toBe('gpt-x-thinking');
  });

  it('reports a changed payload instead of guessing', () => {
    expect(() => chatgptToConversation({ mapping: 'nope' }, 'x', 'u')).toThrow(PayloadError);
  });
});

describe('Claude normalizer', () => {
  const conv = claudeToConversation(json('claude-conversation.json'), 'org', 'https://claude.ai/chat/x');

  it('follows parent links and the current leaf', () => {
    expect(ConversationSchema.safeParse(conv).success).toBe(true);
    expect(conv.rootIds).toEqual(['u1']);
    expect(activeBranch(conv).map((m) => m.id)).toEqual(['u1', 'a1', 'u2b', 'a2b']);
    expect(conv.model).toBe('claude-opus-5-5');
  });

  it('versions artifacts and created files', () => {
    const page = conv.artifacts.find((a) => a.id === 'page')!;
    expect(page.versions.map((v) => v.content)).toEqual(['<p>one</p>', '<p>two</p>']);
    const file = conv.artifacts.find((a) => a.id === 'file:/mnt/user-data/outputs/app.py')!;
    expect(file.versions.map((v) => v.content)).toEqual(['print(1)\n', 'print(2)\n']);
    expect(file.language).toBe('python');
  });

  it('turns tools into tool calls with results, and lists files', () => {
    const a1 = conv.messages.a1!;
    expect(a1.parts.find((p) => p.type === 'tool_call')).toEqual({ type: 'tool_call', name: 'web_search', input: '{\n  "query": "lorem"\n}', output: 'results' });
    expect(a1.parts[0]).toEqual({ type: 'thinking', text: 'Consectetur.' });
    const names = conv.attachments.map((a) => a.name);
    expect(names).toContain('data.csv');
    expect(names).toContain('photo.png');
    expect(names).toContain('report.docx');
    expect(names).not.toContain('app.py');
    expect(conv.attachments.find((a) => a.name === 'data.csv')!.extractedText).toBe('a,b\n1,2');
    expect(conv.attachments.find((a) => a.name === 'report.docx')!.ref).toMatchObject({ created: true, path: '/mnt/user-data/outputs/report.docx' });
  });
});

describe('Grok normalizer', () => {
  const conv = grokToConversation(json('grok-nodes.json'), json('grok-responses.json'), 'g1', 'https://grok.com/c/g1', 'Lorem');
  it('builds sibling drafts and picks the newest leaf', () => {
    expect(conv.messages.r1!.childIds).toEqual(['r2', 'r3']);
    expect(conv.currentLeafId).toBe('r3');
    expect(conv.messages.r3!.parts.find((p) => p.type === 'text')).toEqual({ type: 'text', text: 'Second draft .' });
    expect(conv.attachments[0]!.ref.url).toBe('https://assets.grok.com/users/u/generated/abc/image.jpg');
    expect(conv.messages.r3!.parts.some((p) => p.type === 'citation')).toBe(true);
  });
  it('strips render tags', () => {
    expect(stripRenderTags('a <grok:render x="1">y</grok:render> b')).toBe('a  b');
  });
});

describe('Gemini normalizer (captured response)', () => {
  const raw = JSON.parse(fixture('sites/gemini-api-response.json')) as { page1_raw: string; page2_raw: string };
  const pages = [raw.page1_raw, raw.page2_raw].flatMap((b) => decodeBatchExecute(b).filter((f) => f.rpcId === 'hNvQHb').map((f) => f.payload));
  const conv = geminiToConversation(pages, 'c_e87b6c6ac16404a5', 'https://gemini.google.com/app/e87b6c6ac16404a5', 'Lorem');

  it('orders turns oldest first and alternates roles', () => {
    expect(ConversationSchema.safeParse(conv).success).toBe(true);
    const branch = activeBranch(conv);
    expect(branch.length).toBe(30);
    branch.forEach((m, i) => expect(m.role).toBe(i % 2 ? 'assistant' : 'user'));
    expect(branch.every((m) => messageText(m).length > 0)).toBe(true);
    expect(conv.model).toBeTruthy();
  });
});

describe('AI Studio normalizer', () => {
  it('merges model chunks, keeps thinking separate', () => {
    const conv = aistudioToConversation(json('aistudio-resolve.json'), '1AbCdEf', 'https://aistudio.google.com/prompts/1AbCdEf');
    expect(conv.title).toBe('Lorem studio');
    const b = activeBranch(conv);
    expect(b.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(b[1]!.parts).toEqual([
      { type: 'thinking', text: 'Thinking lorem' },
      { type: 'text', text: 'Answer part one' },
      { type: 'text', text: 'Answer part two' },
    ]);
  });
  it('fails clearly when the layout changes', () => {
    expect(() => aistudioToConversation([[1, 2]], 'x', 'u')).toThrow(/chunks/);
  });
});
