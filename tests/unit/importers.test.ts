// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { detectJson, importChatGPT, importClaude, importGemini, readImport } from '../../src/core/importers/official';
import { buildArchive, toJson } from '../../src/core/export/json';
import { activeBranch, messageText } from '../../src/core/model/tree';
import { sampleConversation } from './sample';

const html = (s: string) => new DOMParser().parseFromString(s, 'text/html').body.textContent ?? '';
const chatgptItem = { ...JSON.parse(readFileSync('tests/fixtures/payloads/chatgpt-conversation.json', 'utf8')), conversation_id: '68f0a1b2-0000-4000-8000-000000000009' };
// Shaped like third-party descriptions of the Claude export (unconfirmed live): messages in order, no parent links.
const claudeItem = {
  uuid: '44444444-4444-4444-8444-444444444444',
  name: 'Lorem export',
  created_at: '2026-01-01T00:00:00Z',
  chat_messages: [
    { uuid: 'm1', sender: 'human', text: 'Lorem?', created_at: '2026-01-01T00:00:00Z', content: [{ type: 'text', text: 'Lorem?' }] },
    { uuid: 'm2', sender: 'assistant', text: 'Ipsum.', created_at: '2026-01-01T00:00:05Z', content: [{ type: 'text', text: 'Ipsum.' }] },
  ],
};
// Documented My Activity fields (title, time, header) plus an HTML item list.
const geminiRecords = [
  { header: 'Gemini Apps', title: 'Lorem question', time: '2026-02-02T10:00:00Z', safeHtmlItem: [{ html: '<p>Ipsum <b>answer</b></p>' }] },
  { header: 'Gemini Apps', title: 'Only a prompt', time: '2026-02-03T10:00:00Z' },
  { header: 'Gemini Apps', title: ' ', time: '2026-02-04T10:00:00Z' },
];

describe('deep import', () => {
  it('detects each format by shape', () => {
    expect(detectJson([chatgptItem])).toBe('chatgpt');
    expect(detectJson([claudeItem])).toBe('claude');
    expect(detectJson(geminiRecords)).toBe('gemini');
    expect(detectJson(JSON.parse(toJson(buildArchive([sampleConversation()], '0'))))).toBe('artifact');
    expect(detectJson({ other: 1 })).toBeNull();
  });

  it('imports ChatGPT conversations with their branches', () => {
    const r = importChatGPT([chatgptItem, { title: 'broken', mapping: { a: 1 } }]);
    expect(r.conversations).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
    const c = r.conversations[0]!;
    expect(c.id).toBe('chatgpt:68f0a1b2-0000-4000-8000-000000000009');
    expect(c.source.method).toBe('import');
    expect(Object.values(c.messages).filter((m) => m.childIds.length === 0).length).toBeGreaterThan(1);
  });

  it('imports Claude conversations, chaining messages listed without parents', () => {
    const c = importClaude([claudeItem]).conversations[0]!;
    expect(activeBranch(c).map((m) => [m.role, messageText(m)])).toEqual([
      ['user', 'Lorem?'],
      ['assistant', 'Ipsum.'],
    ]);
  });

  it('imports Gemini activity as one exchange each, skipping empty records', () => {
    const r = importGemini(geminiRecords, html);
    expect(r.conversations).toHaveLength(2);
    expect(r.skipped).toHaveLength(1);
    expect(activeBranch(r.conversations[0]!).map((m) => messageText(m))).toEqual(['Lorem question', 'Ipsum answer']);
    expect(activeBranch(r.conversations[1]!)).toHaveLength(1);
    expect(r.conversations[0]!.source.approximate).toBe(true);
  });

  it('reads a ZIP with several exports and an Artifact archive', () => {
    const zip = zipSync({
      'conversations.json': strToU8(JSON.stringify([chatgptItem])),
      'Takeout/My Activity/Gemini Apps/MyActivity.json': strToU8(JSON.stringify(geminiRecords)),
      'backup.json': strToU8(toJson(buildArchive([sampleConversation()], '0'))),
      'README.txt': strToU8('ignored'),
    });
    const rs = readImport('export.zip', zip, html);
    expect(rs.map((r) => r.kind).sort()).toEqual(['artifact', 'chatgpt', 'gemini']);
    expect(() => readImport('x.json', strToU8('[]'), html)).toThrow(/No ChatGPT, Claude, Gemini or Artifact data/);
  });
});
