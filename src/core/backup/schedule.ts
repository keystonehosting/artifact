// Background schedules for backups and auto-archive review. Backups to
// Downloads run on their own; a chosen folder needs a page to write to it,
// so a notification opens one. Auto-archive only ever notifies.
import { browser } from 'wxt/browser';
import { db } from '../db/db';
import { loadSettings, type Settings } from '../settings/settings';
import { ruleMatches, type AutoArchiveRule } from '../bulk/action-job';
import { t } from '../i18n/t';
import { backupChanged } from './backup';
import { downloadsWriter } from './writers';

export const BACKUP_ALARM = 'artifact-backup';
export const AUTOARCHIVE_ALARM = 'artifact-autoarchive';
const BACKUP_NOTE = 'backup:due';
const ARCHIVE_NOTE = 'autoarchive:review';
const MINUTES = { hourly: 60, daily: 24 * 60, weekly: 7 * 24 * 60 } as const;

export async function scheduleBackup(s?: Settings): Promise<void> {
  const settings = s ?? (await loadSettings());
  const want = settings.backup.enabled ? MINUTES[settings.backup.every] : null;
  const cur = await browser.alarms.get(BACKUP_ALARM);
  // Recreating an alarm restarts its period, so only touch it when the schedule changed.
  if ((cur?.periodInMinutes ?? null) !== want) {
    await browser.alarms.clear(BACKUP_ALARM);
    if (want) await browser.alarms.create(BACKUP_ALARM, { periodInMinutes: want });
  }
  if (!(await browser.alarms.get(AUTOARCHIVE_ALARM))) await browser.alarms.create(AUTOARCHIVE_ALARM, { periodInMinutes: 24 * 60 });
}

export async function onScheduleAlarm(name: string): Promise<boolean> {
  if (name === BACKUP_ALARM) {
    const s = await loadSettings();
    if (!s.backup.enabled) return true;
    if (s.backup.target === 'downloads') await backupChanged(downloadsWriter(), browser.runtime.getManifest().version);
    else
      await browser.notifications.create(BACKUP_NOTE, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icons/icon128.png'),
        title: t('backup_due_title'),
        message: t('backup_due_message'),
      });
    return true;
  }
  if (name === AUTOARCHIVE_ALARM) {
    const rules = ((await db().kv.get('autoarchive:rules'))?.value as AutoArchiveRule[] | undefined)?.filter((r) => r.enabled) ?? [];
    if (!rules.length) return true;
    const [chats, items] = await Promise.all([db().chats.toArray(), db().folderItems.toArray()]);
    const filed = new Set(items.map((i) => i.chatId));
    const cands = chats.map((c) => ({ id: c.id, site: c.site, title: c.title, pinned: c.pinned, archived: c.archived, updatedAt: c.updatedAt, lastOpenedAt: c.lastOpenedAt, inFolder: filed.has(c.id) }));
    const count = new Set(rules.flatMap((r) => ruleMatches(r, cands, (site) => site === 'chatgpt').map((c) => c.id))).size;
    if (count)
      await browser.notifications.create(ARCHIVE_NOTE, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icons/icon128.png'),
        title: t('autoarchive_note_title'),
        message: t('autoarchive_note_message', String(count)),
      });
    return true;
  }
  return false;
}

export function onScheduleNotification(id: string): boolean {
  if (id === BACKUP_NOTE) void browser.tabs.create({ url: browser.runtime.getURL('/tasks.html?backup&run') });
  else if (id === ARCHIVE_NOTE) void browser.tabs.create({ url: browser.runtime.getURL('/tasks.html?autoarchive') });
  else return false;
  void browser.notifications.clear(id);
  return true;
}
