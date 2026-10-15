// The Tasks page: long jobs that need a page of their own to keep running,
// with progress, pause, stop and a log.
import { useEffect, useState } from 'preact/hooks';
import { lib } from '../../core/library/client';
import type { ExportJobSpec } from '../../core/bulk/export-job';
import type { ActionJobSpec } from '../../core/bulk/action-job';
import { useSettings } from '../app/hooks';
import { useTheme } from '../app/theme';
import { t } from '../../core/i18n/t';
import { ExportTask } from './ExportTask';
import { ActionTask } from './ActionTask';
import { AutoArchive } from './AutoArchive';
import { ImportTask } from './ImportTask';
import { BackupTask } from './BackupTask';

type Spec = ExportJobSpec | ActionJobSpec;

export function Tasks() {
  const [settings] = useSettings();
  useTheme(settings?.theme ?? 'system');
  const q = new URLSearchParams(location.search);
  const id = q.get('job');
  const [spec, setSpec] = useState<Spec | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!id) return;
    void lib('kvGet', `job:${id}`).then((s) => (s ? setSpec(s as Spec) : setMissing(true)));
  }, [id]);
  return (
    <div class="app tasks">
      <header class="app-head">
        <h1>{t('tasks_title')}</h1>
      </header>
      <div class="content">
        {missing ? <p class="status error">{t('tasks_missing')}</p> : null}
        {spec?.kind === 'export' ? <ExportTask spec={spec} /> : null}
        {spec?.kind === 'action' ? <ActionTask spec={spec} /> : null}
        {q.has('autoarchive') ? <AutoArchive /> : null}
        {q.has('import') ? <ImportTask /> : null}
        {q.has('backup') ? <BackupTask /> : null}
      </div>
    </div>
  );
}
