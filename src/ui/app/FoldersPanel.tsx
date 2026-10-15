// Folders tab (SPEC §6B): the cross-site folder tree, chat lists for each
// folder and for All / Unfiled / Pinned / Archived, multi-select filing, and
// one-click import of the site's own projects, GPTs and Gems as folders.
import { useMemo, useState } from 'preact/hooks';
import type { ActiveTab } from './hooks';
import type { ChatRow, FolderRow } from '../../core/db/db';
import type { FolderNode } from '../../core/library/folders';
import type { ProjectSummary } from '../../adapters/types';
import { lib } from '../../core/library/client';
import { sendToTab } from '../../core/messaging/tabs';
import { FolderTree, setDragData } from '../FolderTree';
import { fileDrop } from '../../features/library/sidebar-tree';
import { COLORS, COLOR_VALUES } from '../colors';
import { Icon } from '../icons';
import { ConfirmButton, InlineEdit, Section, Select } from '../components';
import { useResolvedDark } from './theme';
import { fmtDate, openChat, useLib } from './library';
import { t } from '../../core/i18n/t';
import { SITES } from '../../core/sites/sites';

type View = { kind: 'all' | 'unfiled' | 'pinned' | 'archived' } | { kind: 'folder'; id: string };

function flatten(nodes: FolderNode[], out: FolderNode[] = []): FolderNode[] {
  for (const n of nodes) {
    out.push(n);
    flatten(n.children, out);
  }
  return out;
}

export function FoldersPanel({ tab }: { tab: ActiveTab | null }) {
  const dark = useResolvedDark();
  const [rootSort, setRootSort] = useState<FolderRow['sort']>('manual');
  const [tree] = useLib('folderTree', [rootSort], [rootSort]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>({ kind: 'all' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const nodes = tree ?? [];
  const all = useMemo(() => flatten(nodes), [tree]);
  const folder = view.kind === 'folder' ? all.find((f) => f.id === view.id) ?? null : null;

  const run = async (p: Promise<unknown>, done = '') => {
    try {
      await p;
      setError('');
      setStatus(done);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  return (
    <div class="content">
      <Section
        title={t('folders_title')}
        aside={
          <div class="inline">
            <InlineEdit label={t('folder_name')} onSave={(name) => void run(lib('createFolder', name, null))}>
              <Icon name="plus" size={12} /> {t('folder_new')}
            </InlineEdit>
          </div>
        }
      >
        <div class="views" role="tablist">
          {(['all', 'unfiled', 'pinned', 'archived'] as const).map((k) => (
            <button role="tab" aria-selected={view.kind === k} class={view.kind === k ? 'active' : ''} onClick={() => setView({ kind: k })}>
              {t(`folders_view_${k}`)}
            </button>
          ))}
        </div>
        <div class="tree panel-tree" onDragOver={(e) => e.preventDefault()}>
          {nodes.length === 0 ? <p class="muted">{t('folders_empty')}</p> : null}
          <FolderTree
            nodes={nodes}
            dark={dark}
            open={open}
            selected={folder?.id ?? null}
            onToggle={toggle}
            onSelect={(id) => setView({ kind: 'folder', id })}
            onDrop={(target, d) => void run(fileDrop(target, d))}
          />
          <div
            class="root-drop muted"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const raw = e.dataTransfer?.getData('application/x-artifact');
              if (raw) {
                const d = JSON.parse(raw) as { kind: string; id?: string };
                if (d.kind === 'folder' && d.id) void run(lib('moveFolder', d.id, null));
              }
            }}
          >
            {t('folder_drop_root')}
          </div>
        </div>
        <Select<FolderRow['sort']>
          label={t('folder_sort_roots')}
          value={rootSort}
          options={[
            ['manual', t('sort_manual')],
            ['recent', t('sort_recent')],
            ['az', t('sort_az')],
            ['za', t('sort_za')],
          ]}
          onChange={setRootSort}
        />
        {error ? <p class="status error" role="alert">{error}</p> : <p class="status" role="status">{status}</p>}
      </Section>

      {folder ? <FolderHeader folder={folder} onDeleted={() => setView({ kind: 'all' })} run={run} /> : null}
      <ChatList view={view} folders={all} run={run} />
      <ImportSection tab={tab} run={run} />
      <Favorites />
    </div>
  );
}

function FolderHeader({ folder, onDeleted, run }: { folder: FolderNode; onDeleted(): void; run(p: Promise<unknown>, done?: string): Promise<void> }) {
  const dark = useResolvedDark();
  const [crumbs] = useLib('breadcrumbs', [folder.id], [folder.id, folder.parentId]);
  return (
    <Section title={folder.name}>
      <nav class="crumbs" aria-label={t('folder_path')}>
        {(crumbs ?? []).map((c, i) => (
          <span>
            {i > 0 ? ' / ' : ''}
            {c.name}
          </span>
        ))}
      </nav>
      <div class="row">
        <InlineEdit label={t('folder_name')} initial={folder.name} onSave={(name) => void run(lib('updateFolder', folder.id, { name }))}>
          {t('folder_rename')}
        </InlineEdit>
        <InlineEdit label={t('folder_name')} onSave={(name) => void run(lib('createFolder', name, folder.id))}>
          {t('folder_new_sub')}
        </InlineEdit>
        <button aria-pressed={!!folder.pinned} onClick={() => void run(lib('updateFolder', folder.id, { pinned: folder.pinned ? 0 : 1 }))}>
          <Icon name="pin" size={12} /> {folder.pinned ? t('folder_unpin') : t('folder_pin')}
        </button>
        <button aria-pressed={!!folder.starred} onClick={() => void run(lib('updateFolder', folder.id, { starred: folder.starred ? 0 : 1 }))}>
          <Icon name="star" size={12} /> {folder.starred ? t('folder_unstar') : t('folder_star')}
        </button>
        <ConfirmButton label={t('common_delete')} confirmLabel={t('folder_delete_confirm', folder.name)} onConfirm={() => void run(lib('deleteFolder', folder.id)).then(onDeleted)} />
      </div>
      <div class="row" role="radiogroup" aria-label={t('folder_color')}>
        <span class="muted">{t('folder_color')}</span>
        {COLORS.map((c) => (
          <button
            class="swatch"
            role="radio"
            aria-checked={folder.color === c}
            aria-label={t(`color_${c}`)}
            style={{ background: COLOR_VALUES[c][dark ? 'dark' : 'light'] }}
            onClick={() => void run(lib('updateFolder', folder.id, { color: folder.color === c ? null : c }))}
          />
        ))}
      </div>
      <Select<FolderRow['sort']>
        label={t('folder_sort')}
        value={folder.sort}
        options={[
          ['recent', t('sort_recent')],
          ['az', t('sort_az')],
          ['za', t('sort_za')],
          ['manual', t('sort_manual')],
        ]}
        onChange={(sort) => void run(lib('updateFolder', folder.id, { sort }))}
      />
    </Section>
  );
}

function ChatList({ view, folders, run }: { view: View; folders: FolderNode[]; run(p: Promise<unknown>, done?: string): Promise<void> }) {
  const [filter, setFilter] = useState('');
  const [deep, setDeep] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const key = JSON.stringify(view);
  const [inFolder] = useLib('chatsInFolder', [view.kind === 'folder' ? view.id : '', deep], [key, deep]);
  const [listed] = useLib(
    'chats',
    [{ unfiled: view.kind === 'unfiled', pinned: view.kind === 'pinned', archived: view.kind === 'archived' ? true : view.kind === 'all' ? null : false, title: filter, limit: 500 }],
    [key, filter],
  );
  const rows: ChatRow[] = (view.kind === 'folder' ? (inFolder ?? []).filter((c) => !filter || c.title.toLowerCase().includes(filter.toLowerCase())) : listed?.rows ?? []);
  const total = view.kind === 'folder' ? rows.length : listed?.total ?? 0;
  const ids = [...selected].filter((id) => rows.some((r) => r.id === id));
  const pick = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  return (
    <Section title={t('folders_chats', String(total))}>
      <input type="search" aria-label={t('folders_filter')} placeholder={t('folders_filter')} value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
      {view.kind === 'folder' ? (
        <label class="inline">
          <input type="checkbox" checked={deep} onChange={(e) => setDeep((e.target as HTMLInputElement).checked)} /> {t('folders_include_sub')}
        </label>
      ) : null}
      {ids.length ? (
        <div class="row bulk">
          <span>{t('folders_selected', String(ids.length))}</span>
          <select aria-label={t('folders_add_to')} value={target} onChange={(e) => setTarget((e.target as HTMLSelectElement).value)}>
            <option value="">{t('folders_add_to')}</option>
            {folders.map((f) => (
              <option value={f.id}>{`${'  '.repeat(f.depth)}${f.name}`}</option>
            ))}
          </select>
          <button disabled={!target} onClick={() => void run(lib('addToFolder', target, ids), t('folders_added', String(ids.length))).then(() => setSelected(new Set()))}>
            {t('common_add')}
          </button>
          {view.kind === 'folder' ? (
            <button onClick={() => void run(lib('removeFromFolder', view.id, ids)).then(() => setSelected(new Set()))}>{t('folders_remove_from')}</button>
          ) : null}
          <button onClick={() => void run(Promise.all(ids.map((id) => lib('updateChat', id, { pinned: 1 }))))}>{t('chat_pin')}</button>
        </div>
      ) : null}
      {rows.length === 0 ? <p class="muted">{t(view.kind === 'folder' ? 'folders_folder_empty' : 'folders_none')}</p> : null}
      <ul class="chat-list">
        {rows.map((c) => (
          <li draggable onDragStart={(e) => setDragData(e, { kind: 'chats', chatIds: selected.has(c.id) ? ids : [c.id], from: view.kind === 'folder' ? view.id : null })}>
            <input type="checkbox" aria-label={t('folders_select', c.title)} checked={selected.has(c.id)} onChange={(e) => pick(c.id, (e.target as HTMLInputElement).checked)} />
            <button class="link" title={c.url ?? ''} onClick={() => void run(openChat(c))}>
              {c.title}
            </button>
            <span class="site-tag">{SITES[c.site]?.name ?? c.site}</span>
            <span class="muted when">{fmtDate(c.updatedAt)}</span>
            <button
              class="icon"
              aria-pressed={!!c.pinned}
              aria-label={c.pinned ? t('chat_unpin') : t('chat_pin')}
              title={c.pinned ? t('chat_unpin') : t('chat_pin')}
              onClick={() => void run(lib('updateChat', c.id, { pinned: c.pinned ? 0 : 1 }))}
            >
              <Icon name="pin" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ImportSection({ tab, run }: { tab: ActiveTab | null; run(p: Promise<unknown>, done?: string): Promise<void> }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const can = !!tab?.ready?.capabilities.projects && !!tab.site;
  const load = async () => {
    if (!tab?.ready) return;
    const r = await sendToTab(tab.tabId, { type: 'content:projects' });
    setProjects(r.projects);
  };
  const importAll = async () => {
    if (!tab?.site || !projects) return;
    const site = tab.site.id;
    const tree = await lib('folderTree', 'manual');
    const existing = new Map(flatten(tree).filter((f) => f.origin).map((f) => [f.origin!, f.id]));
    let parent = existing.get(`${site}:root`);
    parent ??= (await lib('createFolder', tab.site.name, null, { origin: `${site}:root` })).id;
    let made = 0;
    let filed = 0;
    for (const p of projects.filter((x) => x.kind === 'project' || x.kind === 'folder')) {
      const origin = `${site}:${p.kind}:${p.id}`;
      let id = existing.get(origin);
      if (!id) {
        id = (await lib('createFolder', p.name, parent, { origin })).id;
        made++;
      }
      const inProject = (await lib('chats', { site, limit: 100000 })).rows.filter((c) => c.projectId === p.id).map((c) => c.id);
      if (inProject.length) {
        await lib('addToFolder', id, inProject);
        filed += inProject.length;
      }
    }
    return t('import_done', [String(made), String(filed)]);
  };
  if (!can) return null;
  return (
    <Section title={t('import_title', tab.site!.name)}>
      <p class="muted">{t('import_hint')}</p>
      <div class="row">
        <button onClick={() => void run(load())}>{t('import_list')}</button>
        {projects?.length ? (
          <button class="primary" onClick={() => void importAll().then((msg) => run(Promise.resolve(), msg ?? ''), (e: Error) => run(Promise.reject(e)))}>
            {t('import_go')}
          </button>
        ) : null}
      </div>
      {projects ? (
        projects.length ? (
          <ul class="plain">
            {projects.map((p) => (
              <li class="row">
                <FavoriteStar site={tab.site!.id} item={p} />
                <span>{p.name}</span>
                <span class="muted">{t(`kind_${p.kind}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted">{t('import_none')}</p>
        )
      ) : null}
    </Section>
  );
}

function FavoriteStar({ site, item }: { site: string; item: ProjectSummary }) {
  const [favs] = useLib('favorites', []);
  if (item.kind === 'folder') return <span class="icon-spacer" />;
  const id = `${site}:${item.kind}:${item.id}`;
  const on = !!favs?.some((f) => f.id === id);
  return (
    <button
      class="icon"
      aria-pressed={on}
      aria-label={on ? t('favorite_remove', item.name) : t('favorite_add', item.name)}
      onClick={() => void lib('setFavorite', { id, site: site as ChatRow['site'], kind: item.kind as 'gpt' | 'gem' | 'project', name: item.name, url: item.url ?? null }, !on)}
    >
      <Icon name="star" size={12} />
    </button>
  );
}

function Favorites() {
  const [favs] = useLib('favorites', []);
  if (!favs?.length) return null;
  return (
    <Section title={t('favorites_title')}>
      <ul class="plain">
        {favs.map((f) => (
          <li class="row">
            {f.url ? (
              <a href={f.url} target="_blank" rel="noreferrer">
                {f.name}
              </a>
            ) : (
              <span>{f.name}</span>
            )}
            <span class="muted">
              {SITES[f.site]?.name ?? f.site} · {t(`kind_${f.kind}`)}
            </span>
            <button class="icon" aria-label={t('favorite_remove', f.name)} onClick={() => void lib('setFavorite', f, false)}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
