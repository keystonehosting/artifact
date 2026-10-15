// Backups (SPEC §6F): pick a folder once (Chrome, Edge), or use
// Downloads/Artifact Backup (every browser), then back up now. Scheduled
// backups run from the background on the chosen interval.
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { backupChanged, exportEverything, readBackupState } from '../../core/backup/backup';
import { downloadsWriter, folderWriter, savedFolder, saveFolder, type DirHandle } from '../../core/backup/writers';
import { saveFile } from '../../core/export/download';
import { loadSettings } from '../../core/settings/settings';
import { useSettings } from '../app/hooks';
import { Progress, Section, Select, Toggle } from '../components';
import { t } from '../../core/i18n/t';

type PickerWindow = Window & { showDirectoryPicker?: (o?: unknown) => Promise<DirHandle> };

export function BackupTask() {
  const [settings, update] = useSettings();
  const [folder, setFolder] = useState<DirHandle | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const canFolder = typeof (window as PickerWindow).showDirectoryPicker === 'function';

  useEffect(() => {
    void savedFolder().then(setFolder);
    void readBackupState().then((s) => setLast(s.lastRunAt));
  }, []);

  const choose = async () => {
    try {
      const dir = await (window as PickerWindow).showDirectoryPicker!({ mode: 'readwrite' });
      await saveFolder(dir);
      setFolder(dir);
      update((s) => void (s.backup.target = 'folder'));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
  };

  const now = async () => {
    setError('');
    setStatus('');
    try {
      const s = await loadSettings();
      let writer = downloadsWriter();
      if (s.backup.target === 'folder') {
        if (!folder) throw new Error(t('backup_no_folder'));
        // Asking again needs this click; the browser may remember the answer.
        const perm = (await folder.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
        if (perm !== 'granted' && (await folder.requestPermission?.({ mode: 'readwrite' })) !== 'granted') throw new Error(t('backup_denied'));
        writer = folderWriter(folder);
      }
      setProg({ done: 0, total: 0 });
      const n = await backupChanged(writer, browser.runtime.getManifest().version, (done, total) => setProg({ done, total }));
      setStatus(t('backup_done', String(n)));
      setLast(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProg(null);
    }
  };

  useEffect(() => {
    // Opened from the "backup due" notification: run right away.
    if (new URLSearchParams(location.search).has('run') && settings) void now();
  }, [!!settings]);

  if (!settings) return null;
  return (
    <>
      <Section title={t('backup_title')}>
        <p class="hint muted">{t('backup_hint')}</p>
        <Toggle label={t('backup_enabled')} checked={settings.backup.enabled} onChange={(v) => update((s) => void (s.backup.enabled = v))} />
        <Select<'hourly' | 'daily' | 'weekly'>
          label={t('backup_every')}
          value={settings.backup.every}
          options={[
            ['hourly', t('backup_hourly')],
            ['daily', t('backup_daily')],
            ['weekly', t('backup_weekly')],
          ]}
          onChange={(v) => update((s) => void (s.backup.every = v))}
        />
        <Select<'downloads' | 'folder'>
          label={t('backup_target')}
          value={canFolder ? settings.backup.target : 'downloads'}
          options={canFolder ? [['downloads', t('backup_target_downloads')], ['folder', t('backup_target_folder')]] : [['downloads', t('backup_target_downloads')]]}
          onChange={(v) => update((s) => void (s.backup.target = v))}
        />
        {canFolder && settings.backup.target === 'folder' ? (
          <div class="row">
            <span>{folder ? t('backup_folder_is', folder.name) : t('backup_no_folder')}</span>
            <button onClick={() => void choose()}>{t('backup_choose_folder')}</button>
          </div>
        ) : null}
        {settings.backup.target === 'folder' ? <p class="muted">{t('backup_folder_note')}</p> : null}
        <p class="muted">{last ? t('backup_last', new Date(last).toLocaleString()) : t('backup_never')}</p>
        <button class="primary" disabled={!!prog} onClick={() => void now()}>
          {t('backup_now')}
        </button>
        {prog ? <Progress done={prog.done} total={prog.total} label={t('import_chats')} /> : null}
        {status ? <p class="status" role="status">{status}</p> : null}
        {error ? <p class="status error" role="alert">{error}</p> : null}
      </Section>
      <Section title={t('backup_everything_title')}>
        <p class="hint muted">{t('backup_everything_hint')}</p>
        <button
          onClick={() =>
            void exportEverything(browser.runtime.getManifest().version, settings).then(
              (json) => saveFile(`Artifact everything ${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json'),
              (e: Error) => setError(e.message),
            )
          }
        >
          {t('backup_everything')}
        </button>
      </Section>
    </>
  );
}
