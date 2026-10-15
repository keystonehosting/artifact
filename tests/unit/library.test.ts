import { beforeEach, describe, expect, it } from 'vitest';
import { ArtifactDB, db, setDb } from '../../src/core/db/db';
import * as folders from '../../src/core/library/folders';
import * as svc from '../../src/core/library/service';
import { LIBRARY_API } from '../../src/core/library/api';
import type { Conversation } from '../../src/core/schema/archive';
import { sampleConversation } from './sample';

let n = 0;
beforeEach(async () => {
  setDb(new ArtifactDB(`test-${++n}`));
  await svc.rebuildIndex();
});

function conv(id: string, title: string, texts: Array<[string, 'user' | 'assistant']>, extra: Partial<Conversation> = {}): Conversation {
  const base = sampleConversation();
  const messages: Conversation['messages'] = {};
  let parent: string | null = null;
  texts.forEach(([text, role], i) => {
    const mid = `m${i}`;
    messages[mid] = { id: mid, parentId: parent, childIds: [], role, parts: [{ type: 'text', text }], attachmentIds: [], artifactIds: [], createdAt: `2026-03-0${i + 1}T10:00:00.000Z` };
    if (parent) messages[parent]!.childIds.push(mid);
    parent = mid;
  });
  return {
    ...base,
    id: `claude:${id}`,
    siteChatId: id,
    url: `https://claude.ai/chat/${id}`,
    title,
    rootIds: ['m0'],
    currentLeafId: parent,
    messages,
    attachments: [],
    artifacts: [],
    ...extra,
  };
}

async function chatRow(id: string, title = id) {
  await svc.noteListed('claude', [{ siteChatId: id, title, url: `https://claude.ai/chat/${id}`, updatedAt: '2026-01-01T00:00:00Z' }]);
  return `claude:${id}`;
}

describe('folders', () => {
  it('nests folders, counts chats once across subfolders, and builds breadcrumbs', async () => {
    const a = await folders.createFolder('Work');
    const b = await folders.createFolder('Clients', a.id);
    const c = await folders.createFolder('Acme', b.id);
    const x = await chatRow('x');
    const y = await chatRow('y');
    await folders.addToFolder(a.id, [x]);
    await folders.addToFolder(c.id, [x, y]);
    const tree = await folders.folderTree();
    expect(tree).toHaveLength(1);
    expect(tree[0]!.count).toBe(1);
    expect(tree[0]!.total).toBe(2);
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
    expect((await folders.breadcrumbs(c.id)).map((f) => f.name)).toEqual(['Work', 'Clients', 'Acme']);
    expect((await folders.chatsInFolder(a.id, true)).map((r) => r.id).sort()).toEqual([x, y]);
  });

  it('refuses to move a folder inside itself or its descendants', async () => {
    const a = await folders.createFolder('A');
    const b = await folders.createFolder('B', a.id);
    await expect(folders.moveFolder(a.id, b.id)).rejects.toThrow(/inside itself/);
    await expect(folders.moveFolder(a.id, a.id)).rejects.toThrow(/inside itself/);
    await folders.moveFolder(b.id, null);
    expect((await db().folders.get(b.id))!.parentId).toBeNull();
  });

  it('deleting a folder moves its subfolders and chats up and never deletes chats', async () => {
    const a = await folders.createFolder('A');
    const b = await folders.createFolder('B', a.id);
    const c = await folders.createFolder('C', b.id);
    const x = await chatRow('x');
    await folders.addToFolder(b.id, [x]);
    await folders.deleteFolder(b.id);
    expect((await db().folders.get(c.id))!.parentId).toBe(a.id);
    expect((await folders.foldersOfChat(x)).map((f) => f.id)).toEqual([a.id]);
    expect(await db().chats.get(x)).toBeTruthy();
  });

  it('sorts by the folder mode with pinned first, and moves chats between folders', async () => {
    const a = await folders.createFolder('A');
    const b = await folders.createFolder('B');
    const ids = [await chatRow('c1', 'Banana'), await chatRow('c2', 'apple'), await chatRow('c3', 'Cherry')];
    await folders.addToFolder(a.id, ids);
    await folders.updateFolder(a.id, { sort: 'az' });
    expect((await folders.chatsInFolder(a.id)).map((c) => c.title)).toEqual(['apple', 'Banana', 'Cherry']);
    await db().chats.update(ids[2]!, { pinned: 1 });
    expect((await folders.chatsInFolder(a.id))[0]!.title).toBe('Cherry');
    await folders.moveChats(a.id, b.id, [ids[0]!]);
    expect((await folders.chatsInFolder(a.id)).map((c) => c.id)).not.toContain(ids[0]);
    expect((await folders.chatsInFolder(b.id)).map((c) => c.id)).toEqual([ids[0]]);
    await expect(folders.createFolder('  ')).rejects.toThrow(/empty/);
  });
});

describe('library service', () => {
  it('ingests a chat, indexes every branch, and searches with highlights', async () => {
    await svc.ingest(sampleConversation(), { opened: true });
    const row = await db().chats.get('claude:11111111-1111-1111-1111-111111111111');
    expect(row?.messageCount).toBe(4);
    expect(row?.lastOpenedAt).toBeTypeOf('number');
    // "Veniam" lives on the inactive branch; it is still found.
    const res = await svc.runSearch({ text: 'veniam' });
    expect(res.total).toBe(1);
    expect(res.chats[0]!.snippets[0]!.text).toContain('Veniam');
  });

  it('keeps a structured copy when a later read is only approximate', async () => {
    const full = sampleConversation();
    await svc.ingest(full);
    const dom = { ...sampleConversation(), source: { method: 'dom' as const, approximate: true, capturedAt: full.source.capturedAt }, messages: { u1: full.messages.u1! }, currentLeafId: 'u1' };
    await svc.ingest(dom);
    expect(Object.keys((await db().conversations.get(full.id))!.data.messages)).toHaveLength(6);
  });

  it('replaces old search documents when a chat changes', async () => {
    await svc.ingest(conv('c1', 'Alpha', [['the quick fox', 'user']]));
    await svc.ingest(conv('c1', 'Alpha', [['the slow turtle', 'user']]));
    expect((await svc.runSearch({ text: 'fox' })).total).toBe(0);
    expect((await svc.runSearch({ text: 'turtle' })).total).toBe(1);
  });

  it('filters by folder, tag, role, site, exact phrase and include/exclude', async () => {
    await svc.ingest(conv('c1', 'Rust lifetimes', [['explain borrow checker in rust', 'user'], ['The borrow checker enforces ownership', 'assistant']]));
    await svc.ingest(conv('c2', 'Garden', [['which tomato varieties need a checker pattern', 'user'], ['Plant in a checker grid', 'assistant']]));
    const f = await folders.createFolder('Code');
    await folders.addToFolder(f.id, ['claude:c1']);
    expect((await svc.runSearch({ text: 'checker' })).total).toBe(2);
    expect((await svc.runSearch({ text: 'checker', folderId: f.id })).chats.map((c) => c.chatId)).toEqual(['claude:c1']);
    await svc.setChatTags(['claude:c2'], ['home'], []);
    expect((await svc.runSearch({ text: 'checker', tag: 'home' })).chats.map((c) => c.chatId)).toEqual(['claude:c2']);
    const assistantOnly = await svc.runSearch({ text: 'checker', roles: ['assistant'] });
    expect(assistantOnly.chats.every((c) => c.hits.every((h) => h.role === 'assistant'))).toBe(true);
    expect((await svc.runSearch({ text: 'checker', sites: ['chatgpt'] })).total).toBe(0);
    expect((await svc.runSearch({ text: 'borrow checker', exact: true })).chats.map((c) => c.chatId)).toEqual(['claude:c1']);
    expect((await svc.runSearch({ text: 'checker', exclude: ['tomato', 'grid'] })).chats.map((c) => c.chatId)).toEqual(['claude:c1']);
    expect((await svc.runSearch({ text: '', include: ['ownership', 'grid'], includeMode: 'any' })).total).toBe(2);
    expect((await svc.runSearch({ text: '', include: ['ownership', 'grid'], includeMode: 'all' })).total).toBe(0);
    expect((await svc.runSearch({ text: 'garden', titlesOnly: true })).chats.map((c) => c.chatId)).toEqual(['claude:c2']);
  });

  it('applies Smart Tag rules on ingest and when rules change', async () => {
    await svc.ingest(conv('c1', 'Fix my TypeScript', [['my typescript function throws a stack trace', 'user']]));
    expect((await db().chats.get('claude:c1'))!.autoTags).toContain('Code');
    await svc.saveRule({ tag: 'Turtles', terms: ['stack trace'], match: 'any', fields: ['content'], sites: [], enabled: 1, builtin: 0 });
    expect((await db().chats.get('claude:c1'))!.autoTags).toContain('Turtles');
    const code = (await svc.allRules()).find((r) => r.id === 'builtin:code')!;
    await svc.saveRule({ ...code, enabled: 0 });
    expect((await db().chats.get('claude:c1'))!.autoTags).not.toContain('Code');
  });

  it('renames and deletes tags everywhere', async () => {
    const x = await chatRow('x');
    await svc.setChatTags([x], ['draft', 'work'], []);
    await svc.renameTag('draft', 'later');
    expect((await db().chats.get(x))!.tags).toEqual(['later', 'work']);
    await svc.deleteTag('work');
    expect((await db().chats.get(x))!.tags).toEqual(['later']);
  });

  it('lists only new or changed chats for a deep scan', async () => {
    await svc.ingest(conv('c1', 'One', [['a', 'user']], { updatedAt: '2026-01-01T00:00:00Z' }));
    const need = await svc.noteListed('claude', [
      { siteChatId: 'c1', title: 'One', url: 'https://claude.ai/chat/c1', updatedAt: '2026-01-01T00:00:00Z' },
      { siteChatId: 'c2', title: 'Two', url: 'https://claude.ai/chat/c2', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(need).toEqual(['c2']);
    const again = await svc.noteListed('claude', [{ siteChatId: 'c1', title: 'One', url: 'https://claude.ai/chat/c1', updatedAt: '2026-02-01T00:00:00Z' }]);
    expect(again).toEqual(['c1']);
    expect((await db().chats.get('claude:c1'))!.stale).toBe(1);
  });

  it('keeps one bookmark per message and stores highlights, notes and reminders', async () => {
    const x = await chatRow('x');
    await svc.addBookmark({ chatId: x, messageId: 'm1', site: 'claude', color: 'yellow', note: '', snippet: 's' });
    await svc.addBookmark({ chatId: x, messageId: 'm1', site: 'claude', color: 'blue', note: 'n', snippet: 's' });
    const marks = await LIBRARY_API.bookmarks(x);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.color).toBe('blue');
    await svc.addHighlight({ chatId: x, messageId: 'm1', site: 'claude', quote: 'q', prefix: '', suffix: '', color: 'green', note: '' });
    await LIBRARY_API.setNote(x, 'remember this');
    await svc.addReminder({ chatId: x, dueAt: Date.now() + 1000, note: '' });
    const info = await LIBRARY_API.chat(x);
    expect(info.highlights).toHaveLength(1);
    expect(info.note).toBe('remember this');
    expect(info.reminders).toHaveLength(1);
    await LIBRARY_API.setNote(x, '  ');
    expect(await LIBRARY_API.note(x)).toBe('');
  });

  it('persists the index and reloads it', async () => {
    await svc.ingest(conv('c1', 'Persist', [['zebra crossing', 'user']]));
    await svc.flushIndex();
    const raw = (await db().kv.get('search-index'))!.value;
    expect(typeof raw).toBe('string');
    expect(await svc.rebuildIndex()).toBe(1);
    expect((await svc.runSearch({ text: 'zebra' })).total).toBe(1);
  });
});
