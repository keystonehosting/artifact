// The library API the background exposes over `lib:call` messages. Pages and
// content scripts call it through ./client.ts; the background is the only
// writer, so the search index never forks between contexts.
import { db, type ChatRow, type FolderRow, type NoteRow } from '../db/db';
import * as folders from './folders';
import * as svc from './service';

async function chat(chatId: string) {
  const d = db();
  const [row, note, labels, bookmarks, highlights, inFolders, reminders] = await Promise.all([
    d.chats.get(chatId),
    d.notes.get(chatId),
    d.labels.where('chatId').equals(chatId).toArray(),
    d.bookmarks.where('chatId').equals(chatId).toArray(),
    d.highlights.where('chatId').equals(chatId).toArray(),
    folders.foldersOfChat(chatId),
    d.reminders.where('chatId').equals(chatId).toArray(),
  ]);
  return { row: row ?? null, note: note?.text ?? '', labels, bookmarks, highlights, folders: inFolders, reminders };
}

export interface ChatQuery {
  site?: string | null;
  tag?: string | null;
  pinned?: boolean;
  archived?: boolean | null;
  title?: string;
  /** Chats that are in no folder. */
  unfiled?: boolean;
  sort?: 'recent' | 'opened' | 'az';
  limit?: number;
  offset?: number;
}

async function chats(q: ChatQuery = {}): Promise<{ rows: ChatRow[]; total: number }> {
  const d = db();
  let rows = await d.chats.toArray();
  if (q.site) rows = rows.filter((r) => r.site === q.site);
  if (q.tag) rows = rows.filter((r) => r.tags.includes(q.tag!) || r.autoTags.includes(q.tag!));
  if (q.pinned) rows = rows.filter((r) => r.pinned === 1);
  if (q.archived !== undefined && q.archived !== null) rows = rows.filter((r) => r.archived === (q.archived ? 1 : 0));
  if (q.title?.trim()) {
    const t = q.title.trim().toLowerCase();
    rows = rows.filter((r) => r.title.toLowerCase().includes(t));
  }
  if (q.unfiled) {
    const filed = new Set((await d.folderItems.toArray()).map((i) => i.chatId));
    rows = rows.filter((r) => !filed.has(r.id));
  }
  const sorters = {
    recent: (a: ChatRow, b: ChatRow) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    opened: (a: ChatRow, b: ChatRow) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0),
    az: (a: ChatRow, b: ChatRow) => a.title.localeCompare(b.title),
  };
  rows.sort((a, b) => b.pinned - a.pinned || sorters[q.sort ?? 'recent'](a, b));
  const off = q.offset ?? 0;
  return { rows: rows.slice(off, off + (q.limit ?? 200)), total: rows.length };
}

async function tags() {
  const d = db();
  const [named, all] = await Promise.all([d.tags.toArray(), d.chats.toArray()]);
  const counts = new Map<string, { manual: number; auto: number }>();
  for (const c of all) {
    for (const t of c.tags) counts.set(t, { manual: (counts.get(t)?.manual ?? 0) + 1, auto: counts.get(t)?.auto ?? 0 });
    for (const t of c.autoTags) counts.set(t, { manual: counts.get(t)?.manual ?? 0, auto: (counts.get(t)?.auto ?? 0) + 1 });
  }
  const names = new Set([...named.map((t) => t.name), ...counts.keys()]);
  return [...names].sort().map((name) => ({ name, color: named.find((t) => t.name === name)?.color ?? null, ...(counts.get(name) ?? { manual: 0, auto: 0 }) }));
}

async function stats() {
  const d = db();
  const all = await d.chats.toArray();
  const bySite: Record<string, { total: number; indexed: number; archived: number }> = {};
  for (const c of all) {
    const s = (bySite[c.site] ??= { total: 0, indexed: 0, archived: 0 });
    s.total++;
    if (c.indexedAt) s.indexed++;
    if (c.archived) s.archived++;
  }
  return { chats: all.length, bySite, folders: await d.folders.count(), bookmarks: await d.bookmarks.count(), highlights: await d.highlights.count(), labels: await d.labels.count() };
}

export const LIBRARY_API = {
  ingest: svc.ingest,
  noteListed: svc.noteListed,
  search: svc.runSearch,
  rebuildIndex: svc.rebuildIndex,
  conversation: async (chatId: string) => (await db().conversations.get(chatId))?.data ?? null,
  chat,
  chats,
  chatsById: async (ids: string[]) => (await db().chats.bulkGet([...new Set(ids)])).filter((c): c is ChatRow => !!c),
  updateChat: async (chatId: string, patch: Partial<Pick<ChatRow, 'pinned' | 'archived' | 'title'>>) => void (await db().chats.update(chatId, patch)),
  stats,
  // folders
  folderTree: folders.folderTree,
  createFolder: folders.createFolder,
  updateFolder: folders.updateFolder,
  moveFolder: folders.moveFolder,
  deleteFolder: folders.deleteFolder,
  addToFolder: folders.addToFolder,
  removeFromFolder: folders.removeFromFolder,
  moveChats: folders.moveChats,
  chatsInFolder: folders.chatsInFolder,
  breadcrumbs: folders.breadcrumbs,
  foldersOfChat: folders.foldersOfChat,
  // tags and rules
  tags,
  setChatTags: svc.setChatTags,
  renameTag: svc.renameTag,
  deleteTag: svc.deleteTag,
  setTagColor: async (name: string, color: string | null) => void (await db().tags.put({ name, color, createdAt: (await db().tags.get(name))?.createdAt ?? Date.now() })),
  rules: svc.allRules,
  saveRule: svc.saveRule,
  deleteRule: svc.deleteRule,
  // annotations
  addLabel: svc.addLabel,
  deleteLabel: async (id: string) => void (await db().labels.delete(id)),
  labels: async (chatId?: string) => (chatId ? db().labels.where('chatId').equals(chatId).toArray() : db().labels.orderBy('createdAt').reverse().toArray()),
  addBookmark: svc.addBookmark,
  updateBookmark: async (id: string, patch: { color?: string; note?: string }) => void (await db().bookmarks.update(id, patch)),
  deleteBookmark: async (id: string) => void (await db().bookmarks.delete(id)),
  bookmarks: async (chatId?: string) => (chatId ? db().bookmarks.where('chatId').equals(chatId).toArray() : db().bookmarks.orderBy('createdAt').reverse().toArray()),
  addHighlight: svc.addHighlight,
  updateHighlight: async (id: string, patch: { color?: string; note?: string }) => void (await db().highlights.update(id, patch)),
  deleteHighlight: async (id: string) => void (await db().highlights.delete(id)),
  highlights: async (chatId?: string) => (chatId ? db().highlights.where('chatId').equals(chatId).toArray() : db().highlights.orderBy('createdAt').reverse().toArray()),
  note: async (chatId: string) => (await db().notes.get(chatId))?.text ?? '',
  setNote: async (chatId: string, text: string) => {
    const row: NoteRow = { chatId, text, updatedAt: Date.now() };
    if (text.trim()) await db().notes.put(row);
    else await db().notes.delete(chatId);
  },
  notes: async () => db().notes.orderBy('updatedAt').reverse().toArray(),
  addReminder: svc.addReminder,
  reminders: async () => db().reminders.orderBy('dueAt').toArray(),
  completeReminder: async (id: string) => void (await db().reminders.update(id, { done: 1 })),
  deleteReminder: async (id: string) => void (await db().reminders.delete(id)),
  favorites: async () => db().favorites.toArray(),
  setFavorite: svc.setFavorite,
  kvGet: async (key: string) => (await db().kv.get(key))?.value ?? null,
  kvSet: async (key: string, value: unknown) => void (await db().kv.put({ key, value })),
};

export type LibraryApi = typeof LIBRARY_API;
export type FolderInfo = FolderRow;
