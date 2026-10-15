// Where backups go: a folder the user picked (File System Access API, Chrome
// and Edge), or "Artifact Backup" in the Downloads folder (every browser).
import { browser } from 'wxt/browser';
import { db } from '../db/db';
import type { BackupWriter } from './backup';
import { bytesToBase64 } from '../util/bytes';

export const BACKUP_DIR_KEY = 'backup:dir';

type DirHandle = {
  name: string;
  getDirectoryHandle(name: string, o: { create: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
};

export function downloadsWriter(root = 'Artifact Backup'): BackupWriter {
  return {
    async write(path, data) {
      const url = `data:application/octet-stream;base64,${bytesToBase64(new TextEncoder().encode(data))}`;
      await browser.downloads.download({ url, filename: `${root}/${path}`, conflictAction: 'overwrite', saveAs: false });
    },
  };
}

export function folderWriter(dir: DirHandle): BackupWriter {
  return {
    async write(path, data) {
      const parts = path.split('/');
      const name = parts.pop()!;
      let cur = dir;
      for (const p of parts) cur = await cur.getDirectoryHandle(p, { create: true });
      const w = await (await cur.getFileHandle(name, { create: true })).createWritable();
      await w.write(data);
      await w.close();
    },
  };
}

/** The folder chosen for backups. Handles are stored straight in IndexedDB; they can't cross extension messaging. */
export async function savedFolder(): Promise<DirHandle | null> {
  return ((await db().kv.get(BACKUP_DIR_KEY))?.value as DirHandle | undefined) ?? null;
}

export async function saveFolder(handle: DirHandle): Promise<void> {
  await db().kv.put({ key: BACKUP_DIR_KEY, value: handle });
}

export type { DirHandle };
