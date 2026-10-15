// Library export/import and auto-backup (SPEC §6F). A backup writes each
// new or changed chat as Markdown (to read) and an Artifact archive (to
// restore), plus library.json with folders, tags, notes, prompts and the
// rest. Only what changed since the last run is written.
import { db, type ArtifactDB } from '../db/db';
import { buildArchive, toJson } from '../export/json';
import { buildDocument, DEFAULT_EXPORT_OPTIONS } from '../export/document';
import { toMarkdown } from '../export/markdown';
import { formatFilename, sanitizeFilenamePart } from '../util/filename';
import { SITES } from '../sites/sites';

/** Tables a library export carries. Conversations travel as archive entries; drafts stay local. */
const TABLES = ['chats', 'folders', 'folderItems', 'tags', 'tagRules', 'labels', 'bookmarks', 'highlights', 'notes', 'reminders', 'favorites', 'prompts', 'chains', 'promptFiles', 'history', 'handoffs'] as const;
type Table = (typeof TABLES)[number];

export async function exportLibrary(): Promise<Record<string, unknown>> {
  const d = db();
  const out: Record<string, unknown> = {};
  for (const name of TABLES) out[name] = await (d[name] as ArtifactDB[Table]).toArray();
  return out;
}

/** Merges a library export into this one; rows with the same key are replaced. Returns rows written. */
export async function importLibrary(lib: Record<string, unknown>): Promise<number> {
  const d = db();
  let n = 0;
  for (const name of TABLES) {
    const rows = lib[name];
    if (!Array.isArray(rows) || !rows.length) continue;
    await (d[name] as unknown as { bulkPut(r: unknown[]): Promise<unknown> }).bulkPut(rows);
    n += rows.length;
  }
  return n;
}

/** Everything as one Artifact archive: every stored chat plus the library. */
export async function exportEverything(version: string, settings: unknown): Promise<string> {
  const convs = (await db().conversations.toArray()).map((r) => r.data);
  return toJson(buildArchive(convs, version, { library: { ...(await exportLibrary()), settings } }));
}

export interface BackupWriter {
  write(path: string, data: string): Promise<void>;
}

export interface BackupState {
  /** chat id -> indexedAt written last time */
  written: Record<string, number>;
  lastRunAt: number | null;
}

export const BACKUP_STATE_KEY = 'backup:state';

export async function readBackupState(): Promise<BackupState> {
  const v = (await db().kv.get(BACKUP_STATE_KEY))?.value as BackupState | undefined;
  return v ?? { written: {}, lastRunAt: null };
}

/** Writes new and changed chats and the library. Returns how many chats were written. */
export async function backupChanged(w: BackupWriter, version: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const d = db();
  const state = await readBackupState();
  const rows = await d.chats.toArray();
  const changed = rows.filter((r) => r.indexedAt && r.indexedAt !== state.written[r.id]);
  let done = 0;
  for (const row of changed) {
    const conv = (await d.conversations.get(row.id))?.data;
    if (conv) {
      const site = SITES[conv.site]?.name ?? conv.site;
      // The chat id keeps names stable across title changes, so a changed chat overwrites its old file.
      const base = `${sanitizeFilenamePart(site, 'site')}/${formatFilename('{title}', { title: conv.title })} [${sanitizeFilenamePart(conv.siteChatId.slice(0, 12), 'id')}]`;
      await w.write(`${base}.md`, toMarkdown(buildDocument(conv, DEFAULT_EXPORT_OPTIONS)));
      await w.write(`${base}.json`, toJson(buildArchive([conv], version)));
      state.written[row.id] = row.indexedAt!;
    }
    onProgress?.(++done, changed.length);
  }
  if (changed.length || !state.lastRunAt) await w.write('library.json', JSON.stringify({ format: 'artifact-library', version: 1, exportedAt: new Date().toISOString(), library: await exportLibrary() }, null, 1));
  state.lastRunAt = Date.now();
  await d.kv.put({ key: BACKUP_STATE_KEY, value: state });
  return changed.length;
}
