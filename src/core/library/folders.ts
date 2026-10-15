// Nested folders of any depth, holding chats from every site (SPEC §6B).
import { db, newId, type ChatRow, type FolderRow } from '../db/db';

export interface FolderNode extends FolderRow {
  children: FolderNode[];
  /** Chats directly in this folder. */
  count: number;
  /** Chats in this folder and all descendants (a chat in two subfolders counts once). */
  total: number;
  depth: number;
}

export class FolderError extends Error {}

export async function createFolder(name: string, parentId: string | null = null, opts: Partial<Pick<FolderRow, 'color' | 'origin'>> = {}): Promise<FolderRow> {
  const clean = name.trim();
  if (!clean) throw new FolderError('Folder name is empty');
  if (parentId && !(await db().folders.get(parentId))) throw new FolderError('Parent folder not found');
  const siblings = await db().folders.where('parentId').equals(parentId ?? '').toArray();
  const roots = parentId ? siblings : (await db().folders.toArray()).filter((f) => f.parentId === null);
  const row: FolderRow = {
    id: newId(),
    parentId,
    name: clean,
    color: opts.color ?? null,
    sort: 'recent',
    order: Math.max(-1, ...roots.map((f) => f.order)) + 1,
    pinned: 0,
    starred: 0,
    createdAt: Date.now(),
    origin: opts.origin ?? null,
  };
  await db().folders.add(row);
  return row;
}

export async function updateFolder(id: string, patch: Partial<Pick<FolderRow, 'name' | 'color' | 'sort' | 'pinned' | 'starred' | 'order'>>): Promise<void> {
  if (patch.name !== undefined && !patch.name.trim()) throw new FolderError('Folder name is empty');
  await db().folders.update(id, { ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) });
}

/** Ids of `id` and every folder below it. */
export async function descendantIds(id: string): Promise<Set<string>> {
  const all = await db().folders.toArray();
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of all) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Re-parents a folder. Moving a folder into itself or a descendant is refused. */
export async function moveFolder(id: string, newParentId: string | null, order?: number): Promise<void> {
  if (newParentId) {
    const below = await descendantIds(id);
    if (below.has(newParentId)) throw new FolderError('A folder cannot move inside itself');
    if (!(await db().folders.get(newParentId))) throw new FolderError('Target folder not found');
  }
  await db().folders.update(id, { parentId: newParentId, ...(order !== undefined ? { order } : {}) });
}

/** Deletes a folder. Its subfolders and chats move up to its parent; chats themselves are never deleted. */
export async function deleteFolder(id: string): Promise<void> {
  const d = db();
  await d.transaction('rw', d.folders, d.folderItems, async () => {
    const f = await d.folders.get(id);
    if (!f) return;
    const children = await d.folders.where('parentId').equals(id).toArray();
    for (const c of children) await d.folders.update(c.id, { parentId: f.parentId });
    const items = await d.folderItems.where('folderId').equals(id).toArray();
    if (f.parentId) {
      for (const it of items) await d.folderItems.put({ ...it, folderId: f.parentId });
    }
    await d.folderItems.where('folderId').equals(id).delete();
    await d.folders.delete(id);
  });
}

export async function addToFolder(folderId: string, chatIds: string[]): Promise<void> {
  const d = db();
  if (!(await d.folders.get(folderId))) throw new FolderError('Folder not found');
  const existing = await d.folderItems.where('folderId').equals(folderId).toArray();
  let order = Math.max(-1, ...existing.map((e) => e.order)) + 1;
  const now = Date.now();
  await d.folderItems.bulkPut(chatIds.filter((c) => !existing.some((e) => e.chatId === c)).map((chatId) => ({ folderId, chatId, order: order++, addedAt: now })));
}

export async function removeFromFolder(folderId: string, chatIds: string[]): Promise<void> {
  await db().folderItems.bulkDelete(chatIds.map((c) => [folderId, c] as [string, string]));
}

/** Moves chats from one folder to another (drag and drop). */
export async function moveChats(fromFolderId: string | null, toFolderId: string, chatIds: string[]): Promise<void> {
  await addToFolder(toFolderId, chatIds);
  if (fromFolderId && fromFolderId !== toFolderId) await removeFromFolder(fromFolderId, chatIds);
}

export async function foldersOfChat(chatId: string): Promise<FolderRow[]> {
  const items = await db().folderItems.where('chatId').equals(chatId).toArray();
  return (await db().folders.bulkGet(items.map((i) => i.folderId))).filter((f): f is FolderRow => !!f);
}

function sortFolders(list: FolderRow[], mode: FolderRow['sort']): FolderRow[] {
  const byPin = (a: FolderRow, b: FolderRow) => b.pinned - a.pinned;
  const cmp: Record<FolderRow['sort'], (a: FolderRow, b: FolderRow) => number> = {
    manual: (a, b) => byPin(a, b) || a.order - b.order,
    az: (a, b) => byPin(a, b) || a.name.localeCompare(b.name),
    za: (a, b) => byPin(a, b) || b.name.localeCompare(a.name),
    recent: (a, b) => byPin(a, b) || b.createdAt - a.createdAt,
  };
  return [...list].sort(cmp[mode]);
}

/** The whole folder tree with counts. Root folders sort by `rootSort`; each folder sorts its own children. */
export async function folderTree(rootSort: FolderRow['sort'] = 'manual'): Promise<FolderNode[]> {
  const [folders, items] = await Promise.all([db().folders.toArray(), db().folderItems.toArray()]);
  const direct = new Map<string, Set<string>>();
  for (const it of items) {
    let s = direct.get(it.folderId);
    if (!s) direct.set(it.folderId, (s = new Set()));
    s.add(it.chatId);
  }
  const build = (parentId: string | null, depth: number, mode: FolderRow['sort']): FolderNode[] =>
    sortFolders(folders.filter((f) => f.parentId === parentId), mode).map((f) => {
      const children = build(f.id, depth + 1, f.sort);
      const all = new Set(direct.get(f.id) ?? []);
      const collect = (nodes: FolderNode[]) => nodes.forEach((n) => {
        for (const c of direct.get(n.id) ?? []) all.add(c);
        collect(n.children);
      });
      collect(children);
      return { ...f, children, count: direct.get(f.id)?.size ?? 0, total: all.size, depth };
    });
  return build(null, 0, rootSort);
}

/** Breadcrumb from the root to `id`. */
export async function breadcrumbs(id: string): Promise<FolderRow[]> {
  const out: FolderRow[] = [];
  const seen = new Set<string>();
  let cur = await db().folders.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? await db().folders.get(cur.parentId) : undefined;
  }
  return out;
}

/** Chats in a folder (optionally including subfolders), sorted by the folder's own mode. */
export async function chatsInFolder(folderId: string, deep = false): Promise<ChatRow[]> {
  const f = await db().folders.get(folderId);
  if (!f) return [];
  const ids = deep ? await descendantIds(folderId) : new Set([folderId]);
  const items = (await db().folderItems.where('folderId').anyOf([...ids]).toArray()).sort((a, b) => a.order - b.order);
  const uniq = [...new Map(items.map((i) => [i.chatId, i])).values()];
  const chats = (await db().chats.bulkGet(uniq.map((i) => i.chatId))).filter((c): c is ChatRow => !!c);
  const order = new Map(uniq.map((i, n) => [i.chatId, n]));
  const sorters: Record<FolderRow['sort'], (a: ChatRow, b: ChatRow) => number> = {
    manual: (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    az: (a, b) => a.title.localeCompare(b.title),
    za: (a, b) => b.title.localeCompare(a.title),
    recent: (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  };
  return chats.sort((a, b) => b.pinned - a.pinned || sorters[f.sort](a, b));
}
