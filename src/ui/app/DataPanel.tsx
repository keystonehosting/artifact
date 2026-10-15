// Data tab (SPEC §6F, §6G): export or act on many chats at once, Deep
// Import and restore, backups and auto-archive rules. Long jobs run on the
// Tasks page so they keep going when the panel closes.
import { useMemo, useState } from 'preact/hooks';
import type { ChatRow } from '../../core/db/db';
import type { FolderNode } from '../../core/library/folders';
import type { FileFormat } from '../../core/export/bundle';
import type { Layout } from '../../core/bulk/export-job';
import type { BulkAction } from '../../core/bulk/action-job';
import { lib } from '../../core/library/client';
import { SITES, TIER1_SITES, type SiteId } from '../../core/sites/sites';
import { Section, Select, Toggle } from '../components';
import { useLib } from './library';
import { startJob, openTasks } from '../tasks/start';
import { t } from '../../core/i18n/t';

type Scope = 'all' | 'site' | 'folder' | 'project';

function flat(nodes: FolderNode[], out: FolderNode[] = []): FolderNode[] {
  for (const n of nodes) {
    out.push(n);
    flat(n.children, out);
  }
  return out;
}

/** Chats in a scope, newest first. */
async function resolve(scope: Scope, value: string): Promise<ChatRow[]> {
  if (scope === 'folder') return value ? lib('chatsInFolder', value, true) : [];
  const { rows } = await lib('chats', { limit: 1_000_000, ...(scope === 'site' ? { site: value } : {}) });
  if (scope === 'project') return rows.filter((r) => `${r.site}|${r.projectId}` === value);
  return rows;
}

function ScopePicker({ scope, value, onChange }: { scope: Scope; value: string; onChange(s: Scope, v: string): void }) {
  const [tree] = useLib('folderTree', ['az']);
  const [all] = useLib('chats', [{ limit: 1_000_000 }]);
  const projects = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const r of all?.rows ?? []) {
      if (!r.projectId) continue;
      const k = `${r.site}|${r.projectId}`;
      m.set(k, { label: `${SITES[r.site].name}: ${r.projectName ?? r.projectId}`, count: (m.get(k)?.count ?? 0) + 1 });
    }
    return [...m];
  }, [all]);
  return (
    <div class="row">
      <select aria-label={t('data_scope')} value={scope} onChange={(e) => onChange((e.target as HTMLSelectElement).value as Scope, '')}>
        <option value="all">{t('data_scope_all')}</option>
        <option value="site">{t('data_scope_site')}</option>
        <option value="folder">{t('data_scope_folder')}</option>
        <option value="project">{t('data_scope_project')}</option>
      </select>
      {scope === 'site' ? (
        <select aria-label={t('data_scope_site')} value={value} onChange={(e) => onChange(scope, (e.target as HTMLSelectElement).value)}>
          <option value="">—</option>
          {TIER1_SITES.map((s) => (
            <option value={s}>{SITES[s].name}</option>
          ))}
        </select>
      ) : null}
      {scope === 'folder' ? (
        <select aria-label={t('data_scope_folder')} value={value} onChange={(e) => onChange(scope, (e.target as HTMLSelectElement).value)}>
          <option value="">—</option>
          {flat(tree ?? []).map((f) => (
            <option value={f.id}>{`${'  '.repeat(f.depth)}${f.name} (${f.total})`}</option>
          ))}
        </select>
      ) : null}
      {scope === 'project' ? (
        <select aria-label={t('data_scope_project')} value={value} onChange={(e) => onChange(scope, (e.target as HTMLSelectElement).value)}>
          <option value="">—</option>
          {projects.map(([k, p]) => (
            <option value={k}>{`${p.label} (${p.count})`}</option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

export function DataPanel() {
  return (
    <div class="content">
      <BulkExport />
      <BulkActions />
      <Section title={t('data_more')}>
        <div class="row">
          <button onClick={() => void openTasks('import')}>{t('data_open_import')}</button>
          <button onClick={() => void openTasks('backup')}>{t('data_open_backup')}</button>
          <button onClick={() => void openTasks('autoarchive')}>{t('data_open_autoarchive')}</button>
        </div>
      </Section>
    </div>
  );
}

function BulkExport() {
  const [scope, setScope] = useState<Scope>('all');
  const [value, setValue] = useState('');
  const [format, setFormat] = useState<FileFormat>('md');
  const [layout, setLayout] = useState<Layout>('folders');
  const [includeJson, setIncludeJson] = useState(true);
  const [error, setError] = useState('');
  const go = async () => {
    setError('');
    const rows = await resolve(scope, value);
    if (!rows.length) return setError(t('data_none'));
    const projects: Array<{ site: SiteId; id: string; name: string }> = [];
    if (scope === 'project') {
      const r = rows[0]!;
      projects.push({ site: r.site, id: r.projectId!, name: r.projectName ?? r.projectId! });
    }
    await startJob({ kind: 'export', title: t('data_export_title', String(rows.length)), chatIds: rows.map((r) => r.id), format, layout: scope === 'project' ? 'flat' : layout, includeJson, projects });
  };
  return (
    <Section title={t('data_export')}>
      <p class="hint muted">{t('data_export_hint')}</p>
      <ScopePicker scope={scope} value={value} onChange={(s, v) => (setScope(s), setValue(v))} />
      <Select<FileFormat>
        label={t('export_format')}
        value={format}
        options={[
          ['md', 'Markdown'],
          ['html', 'HTML'],
          ['docx', 'Word (DOCX)'],
          ['txt', t('data_format_txt')],
          ['json', 'JSON'],
        ]}
        onChange={setFormat}
      />
      <p class="hint muted">{t('data_pdf_note')}</p>
      {scope !== 'project' ? (
        <Select<Layout>
          label={t('data_layout')}
          value={layout}
          options={[
            ['folders', t('tasks_layout_folders')],
            ['sites', t('tasks_layout_sites')],
            ['flat', t('tasks_layout_flat')],
          ]}
          onChange={setLayout}
        />
      ) : null}
      <Toggle label={t('data_include_json')} hint={t('data_include_json_hint')} checked={includeJson} onChange={setIncludeJson} />
      <button class="primary" onClick={() => void go().catch((e: Error) => setError(e.message))}>
        {t('data_export_go')}
      </button>
      {error ? <p class="status error" role="alert">{error}</p> : null}
    </Section>
  );
}

function BulkActions() {
  const [scope, setScope] = useState<Scope>('site');
  const [value, setValue] = useState('');
  const [action, setAction] = useState<BulkAction>('archive');
  const [removeFromLibrary, setRemove] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setError('');
    let rows = await resolve(scope, value);
    if (action === 'archive') rows = rows.filter((r) => !r.archived);
    if (action === 'unarchive') rows = rows.filter((r) => r.archived);
    if (!rows.length) return setError(t('data_none'));
    await startJob({ kind: 'action', title: t(`data_action_title_${action}`, String(rows.length)), action, chatIds: rows.map((r) => r.id), removeFromLibrary: action === 'delete' && removeFromLibrary });
  };
  return (
    <Section title={t('data_actions')}>
      <p class="hint muted">{t('data_actions_hint')}</p>
      <ScopePicker scope={scope} value={value} onChange={(s, v) => (setScope(s), setValue(v))} />
      <Select<BulkAction>
        label={t('data_action')}
        value={action}
        options={[
          ['archive', t('data_action_archive')],
          ['unarchive', t('data_action_unarchive')],
          ['delete', t('data_action_delete')],
        ]}
        onChange={setAction}
      />
      {action === 'delete' ? <Toggle label={t('data_remove_library')} checked={removeFromLibrary} onChange={setRemove} /> : null}
      <button onClick={() => void go().catch((e: Error) => setError(e.message))}>{t('data_review')}</button>
      {error ? <p class="status error" role="alert">{error}</p> : null}
    </Section>
  );
}
