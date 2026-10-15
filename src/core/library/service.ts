// The library service runs in the background and is the only writer of the
// database and the search index. Pages and content scripts call it through
// typed `lib:*` messages (see ./client.ts).
import type MiniSearch from 'minisearch';
import { db, newId, type BookmarkRow, type ChatRow, type FavoriteRow, type HighlightRow, type LabelRow, type ReminderRow, type TagRuleRow } from '../db/db';
import type { Conversation } from '../schema/archive';
import { activeBranch, messageText } from '../model/tree';
import { createIndex, docsFor, loadIndex, search, type ChatHit, type SearchDoc, type SearchQuery } from '../search/engine';
import { applyRules, BUILTIN_RULES } from './tagrules';
import * as folders from './folders';
import type { ChatSummary } from '../../adapters/types';
import type { SiteId } from '../sites/sites';

const INDEX_KEY = 'search-index';

let index: MiniSearch<SearchDoc> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function getIndex(): Promise<MiniSearch<SearchDoc>> {
  if (!index) {
    const row = await db().kv.get(INDEX_KEY);
    index = loadIndex(typeof row?.value === 'string' ? row.value : null);
  }
  return index;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushIndex(), 1500);
}

export async function flushIndex(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (index) await db().kv.put({ key: INDEX_KEY, value: JSON.stringify(index) });
}

async function rules(): Promise<TagRuleRow[]> {
  const custom = await db().tagRules.toArray();
  const overrides = new Map(custom.filter((r) => r.builtin).map((r) => [r.id, r]));
  return [...BUILTIN_RULES.map((r) => overrides.get(r.id) ?? r), ...custom.filter((r) => !r.builtin)];
}

/** Stores a conversation, refreshes its search documents and Smart Tags. */
export async function ingest(conv: Conversation, opts: { opened?: boolean } = {}): Promise<ChatRow> {
  const d = db();
  const idx = await getIndex();
  const prev = await d.chats.get(conv.id);
  const prevConv = await d.conversations.get(conv.id);
  // A DOM read only sees what's rendered; never let it replace a fuller structured copy.
  const keepPrev = prevConv && conv.source.approximate && !prevConv.data.source.approximate;
  const stored = keepPrev ? prevConv.data : conv;
  if (!keepPrev) {
    if (prevConv) for (const m of Object.keys(prevConv.data.messages)) if (idx.has(`${conv.id}#${m}`)) idx.discard(`${conv.id}#${m}`);
    for (const doc of docsFor(conv)) {
      if (idx.has(doc.id)) idx.discard(doc.id);
      idx.add(doc);
    }
    await d.conversations.put({ id: conv.id, data: conv, storedAt: Date.now() });
    scheduleSave();
  }
  const branch = activeBranch(stored).filter((m) => !m.hidden);
  const content = branch.map((m) => messageText(m)).join('\n');
  const row: ChatRow = {
    id: conv.id,
    site: conv.site,
    siteChatId: conv.siteChatId,
    title: conv.title || prev?.title || 'Untitled',
    url: conv.url,
    createdAt: stored.createdAt ?? prev?.createdAt ?? null,
    updatedAt: stored.updatedAt ?? prev?.updatedAt ?? null,
    model: stored.model ?? prev?.model ?? null,
    projectId: stored.project?.id ?? prev?.projectId ?? null,
    projectName: stored.project?.name || prev?.projectName || null,
    archived: prev?.archived ?? 0,
    pinned: prev?.pinned ?? 0,
    tags: prev?.tags ?? [],
    autoTags: applyRules(await rules(), conv.site, conv.title, content),
    messageCount: branch.length,
    indexedAt: Date.now(),
    listedAt: prev?.listedAt ?? null,
    lastOpenedAt: opts.opened ? Date.now() : (prev?.lastOpenedAt ?? null),
    stale: 0,
  };
  await d.chats.put(row);
  return row;
}

/** Records chats seen in a site listing. Returns the ids that need a full read. */
export async function noteListed(site: SiteId, items: ChatSummary[]): Promise<string[]> {
  const d = db();
  const now = Date.now();
  const need: string[] = [];
  await d.transaction('rw', d.chats, async () => {
    for (const it of items) {
      const id = `${site}:${it.siteChatId}`;
      const prev = await d.chats.get(id);
      const changed = !prev?.indexedAt || (it.updatedAt && prev.updatedAt && it.updatedAt > prev.updatedAt) || (it.updatedAt && !prev.updatedAt);
      if (changed) need.push(it.siteChatId);
      await d.chats.put({
        id,
        site,
        siteChatId: it.siteChatId,
        title: it.title || prev?.title || 'Untitled',
        url: it.url,
        createdAt: it.createdAt ?? prev?.createdAt ?? null,
        updatedAt: it.updatedAt ?? prev?.updatedAt ?? null,
        model: prev?.model ?? null,
        projectId: it.projectId ?? prev?.projectId ?? null,
        projectName: prev?.projectName ?? null,
        archived: it.archived ? 1 : (prev?.archived ?? 0),
        pinned: prev?.pinned ?? (it.pinned ? 1 : 0),
        tags: prev?.tags ?? [],
        autoTags: prev?.autoTags ?? [],
        messageCount: prev?.messageCount ?? 0,
        indexedAt: prev?.indexedAt ?? null,
        listedAt: now,
        lastOpenedAt: prev?.lastOpenedAt ?? null,
        stale: changed && prev?.indexedAt ? 1 : 0,
      });
    }
  });
  return need;
}

export interface SearchRequest extends Omit<SearchQuery, 'chatIds'> {
  folderId?: string | null;
  tag?: string | null;
}

export interface SearchResponse {
  chats: Array<ChatHit & { title: string; url: string | null; updatedAt: string | null; snippets: Array<{ messageId: string; role: string; text: string }> }>;
  total: number;
}

export async function runSearch(q: SearchRequest): Promise<SearchResponse> {
  const d = db();
  const idx = await getIndex();
  let chatIds: Set<string> | null = null;
  if (q.folderId) {
    const ids = await folders.descendantIds(q.folderId);
    chatIds = new Set((await d.folderItems.where('folderId').anyOf([...ids]).toArray()).map((i) => i.chatId));
  }
  if (q.tag) {
    const tagged = new Set([...(await d.chats.where('tags').equals(q.tag).primaryKeys()), ...(await d.chats.where('autoTags').equals(q.tag).primaryKeys())]);
    chatIds = chatIds ? new Set([...chatIds].filter((c) => tagged.has(c))) : tagged;
  }
  // Load texts lazily for phrase and include/exclude checks.
  const convCache = new Map<string, Conversation | null>();
  const needTexts = !!(q.exact || q.include?.length || q.exclude?.length);
  if (needTexts) {
    const pre = search(idx, { ...q, chatIds, exact: false, include: [], exclude: [], limit: 2000 }, () => '');
    const convs = await d.conversations.bulkGet(pre.map((c) => c.chatId));
    pre.forEach((c, i) => convCache.set(c.chatId, convs[i]?.data ?? null));
  }
  const textOf = (chatId: string, messageId: string) => {
    const m = convCache.get(chatId)?.messages[messageId];
    return m ? messageText(m) : null;
  };
  const hits = search(idx, { ...q, chatIds }, textOf);
  const top = hits.slice(0, q.limit ?? 100);
  const rows = await d.chats.bulkGet(top.map((h) => h.chatId));
  const missing = top.filter((h) => !convCache.has(h.chatId)).map((h) => h.chatId);
  const convs = await d.conversations.bulkGet(missing);
  missing.forEach((id, i) => convCache.set(id, convs[i]?.data ?? null));
  return {
    total: hits.length,
    chats: top.map((h, i) => ({
      ...h,
      title: rows[i]?.title ?? h.chatId,
      url: rows[i]?.url ?? null,
      updatedAt: rows[i]?.updatedAt ?? null,
      snippets: h.hits.slice(0, 3).map((x) => ({ messageId: x.messageId, role: x.role, text: textOf(x.chatId, x.messageId) ?? '' })),
    })),
  };
}

export async function removeChatFromIndex(chatId: string): Promise<void> {
  const idx = await getIndex();
  const conv = await db().conversations.get(chatId);
  if (conv) for (const m of Object.keys(conv.data.messages)) if (idx.has(`${chatId}#${m}`)) idx.discard(`${chatId}#${m}`);
  scheduleSave();
}

export async function rebuildIndex(): Promise<number> {
  const fresh = createIndex();
  let n = 0;
  await db().conversations.each((row) => {
    for (const doc of docsFor(row.data)) {
      fresh.add(doc);
      n++;
    }
  });
  index = fresh;
  await flushIndex();
  return n;
}

// ---------- tags ----------

export async function setChatTags(chatIds: string[], add: string[], remove: string[]): Promise<void> {
  const d = db();
  await d.transaction('rw', d.chats, d.tags, async () => {
    for (const t of add) if (!(await d.tags.get(t))) await d.tags.add({ name: t, color: null, createdAt: Date.now() });
    for (const id of chatIds) {
      const c = await d.chats.get(id);
      if (!c) continue;
      const tags = new Set(c.tags);
      add.forEach((t) => tags.add(t));
      remove.forEach((t) => tags.delete(t));
      await d.chats.update(id, { tags: [...tags].sort() });
    }
  });
}

export async function renameTag(from: string, to: string): Promise<void> {
  const d = db();
  const name = to.trim();
  if (!name || name === from) return;
  await d.transaction('rw', d.chats, d.tags, d.tagRules, async () => {
    const old = await d.tags.get(from);
    await d.tags.delete(from);
    await d.tags.put({ name, color: old?.color ?? null, createdAt: old?.createdAt ?? Date.now() });
    for (const c of await d.chats.where('tags').equals(from).toArray()) await d.chats.update(c.id, { tags: [...new Set(c.tags.map((t) => (t === from ? name : t)))].sort() });
    for (const r of await d.tagRules.where('tag').equals(from).toArray()) await d.tagRules.update(r.id, { tag: name });
  });
}

export async function deleteTag(name: string): Promise<void> {
  const d = db();
  await d.transaction('rw', d.chats, d.tags, async () => {
    await d.tags.delete(name);
    for (const c of await d.chats.where('tags').equals(name).toArray()) await d.chats.update(c.id, { tags: c.tags.filter((t) => t !== name) });
  });
}

export async function saveRule(rule: Omit<TagRuleRow, 'id'> & { id?: string }): Promise<TagRuleRow> {
  const row: TagRuleRow = { ...rule, id: rule.id ?? newId() };
  await db().tagRules.put(row);
  await reapplyRules();
  return row;
}

export async function deleteRule(id: string): Promise<void> {
  await db().tagRules.delete(id);
  await reapplyRules();
}

export async function allRules(): Promise<TagRuleRow[]> {
  return rules();
}

/** Re-runs Smart Tag rules over every stored conversation. */
export async function reapplyRules(): Promise<void> {
  const d = db();
  const rs = await rules();
  const updates: Array<[string, string[]]> = [];
  // Read first, write after: writes aren't allowed inside a read cursor.
  await d.conversations.each((row) => {
    const branch = activeBranch(row.data).filter((m) => !m.hidden);
    updates.push([row.id, applyRules(rs, row.data.site, row.data.title, branch.map((m) => messageText(m)).join('\n'))]);
  });
  await d.transaction('rw', d.chats, async () => {
    for (const [id, autoTags] of updates) await d.chats.update(id, { autoTags });
  });
}

// ---------- annotations ----------

export async function addLabel(l: Omit<LabelRow, 'id' | 'createdAt'>): Promise<LabelRow> {
  const row = { ...l, id: newId(), createdAt: Date.now() };
  await db().labels.add(row);
  return row;
}

export async function addBookmark(b: Omit<BookmarkRow, 'id' | 'createdAt'>): Promise<BookmarkRow> {
  const existing = await db().bookmarks.where('chatId').equals(b.chatId).filter((x) => x.messageId === b.messageId).first();
  if (existing) {
    await db().bookmarks.update(existing.id, { color: b.color, note: b.note, snippet: b.snippet });
    return { ...existing, ...b };
  }
  const row = { ...b, id: newId(), createdAt: Date.now() };
  await db().bookmarks.add(row);
  return row;
}

export async function addHighlight(h: Omit<HighlightRow, 'id' | 'createdAt'>): Promise<HighlightRow> {
  const row = { ...h, id: newId(), createdAt: Date.now() };
  await db().highlights.add(row);
  return row;
}

export async function addReminder(r: Omit<ReminderRow, 'id' | 'done'>): Promise<ReminderRow> {
  const row: ReminderRow = { ...r, id: newId(), done: 0 };
  await db().reminders.add(row);
  return row;
}

export async function setFavorite(f: Omit<FavoriteRow, 'addedAt'>, on: boolean): Promise<void> {
  if (on) await db().favorites.put({ ...f, addedAt: Date.now() });
  else await db().favorites.delete(f.id);
}
