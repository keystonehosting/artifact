// Search tab (SPEC §6C): full-text search over every stored chat, grouped by
// site with highlighted matches, filters, a must-include / exclude panel,
// a findings report, and deep scan of each site's full history.
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ActiveTab } from './hooks';
import { lib } from '../../core/library/client';
import type { SearchRequest, SearchResponse } from '../../core/library/service';
import { snippet } from '../../core/search/engine';
import { sendToTab } from '../../core/messaging/tabs';
import { saveFile } from '../../core/export/download';
import { Progress, Section } from '../components';
import { fmtDate, openChat, useLib } from './library';
import { t } from '../../core/i18n/t';
import { SITES, TIER1_SITES } from '../../core/sites/sites';
import type { ScanState } from '../../features/library/deepscan';
import type { FolderNode } from '../../core/library/folders';

const ROLES = ['user', 'assistant'] as const;

function dayStart(v: string): number | null {
  const n = v ? Date.parse(`${v}T00:00:00`) : NaN;
  return Number.isNaN(n) ? null : n;
}

function flat(nodes: FolderNode[], out: FolderNode[] = []): FolderNode[] {
  for (const n of nodes) {
    out.push(n);
    flat(n.children, out);
  }
  return out;
}

/** The findings as a Markdown report. */
export function findingsReport(q: SearchRequest, res: SearchResponse, at = new Date()): string {
  const terms = [q.text, ...(q.include ?? [])].join(' ').split(/\s+/).filter(Boolean);
  const lines = [`# Search: ${q.text || (q.include ?? []).join(', ')}`, '', `${res.total} chats · ${at.toISOString().slice(0, 16).replace('T', ' ')}`];
  const filters = [
    q.sites?.length ? `sites: ${q.sites.join(', ')}` : '',
    q.roles?.length ? `roles: ${q.roles.join(', ')}` : '',
    q.models?.length ? `models: ${q.models.join(', ')}` : '',
    q.exact ? 'exact phrase' : '',
    q.titlesOnly ? 'titles only' : '',
    q.include?.length ? `must include (${q.includeMode ?? 'all'}): ${q.include.join(', ')}` : '',
    q.exclude?.length ? `exclude: ${q.exclude.join(', ')}` : '',
  ].filter(Boolean);
  if (filters.length) lines.push('', `Filters: ${filters.join('; ')}`);
  for (const c of res.chats) {
    lines.push('', `## ${c.title}`, '', `${SITES[c.site as keyof typeof SITES]?.name ?? c.site}${c.updatedAt ? ` · ${c.updatedAt.slice(0, 10)}` : ''}${c.url ? ` · ${c.url}` : ''}`);
    for (const s of c.snippets) {
      const text = snippet(s.text, terms, 240)
        .map((p) => (p.match ? `**${p.text}**` : p.text))
        .join('');
      lines.push('', `> ${s.role}: ${text}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function SearchPanel({ tab }: { tab: ActiveTab | null }) {
  const [text, setText] = useState('');
  const [sites, setSites] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [folderId, setFolderId] = useState('');
  const [tag, setTag] = useState('');
  const [exact, setExact] = useState(false);
  const [titlesOnly, setTitlesOnly] = useState(false);
  const [include, setInclude] = useState('');
  const [includeMode, setIncludeMode] = useState<'all' | 'any'>('all');
  const [exclude, setExclude] = useState('');
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [folders] = useLib('folderTree', ['az']);
  const [tags] = useLib('tags', []);

  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const request = (): SearchRequest => ({
    text,
    sites,
    roles,
    models: split(model),
    from: dayStart(from),
    to: to ? (dayStart(to) ?? 0) + 86_399_999 : null,
    folderId: folderId || null,
    tag: tag || null,
    exact,
    titlesOnly,
    include: split(include),
    includeMode,
    exclude: split(exclude),
    limit: 100,
  });

  const run = async () => {
    const q = request();
    if (!q.text.trim() && !q.include?.length) return setRes(null);
    setBusy(true);
    try {
      setRes(await lib('search', q));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void run(), 250);
    return () => clearTimeout(timer);
  }, [text, sites.join(), roles.join(), model, from, to, folderId, tag, exact, titlesOnly, include, includeMode, exclude]);

  const toggleIn = (list: string[], v: string, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));
  const terms = [text, include].join(' ').split(/[\s,]+/).filter(Boolean);
  const bySite = new Map<string, SearchResponse['chats']>();
  for (const c of res?.chats ?? []) bySite.set(c.site, [...(bySite.get(c.site) ?? []), c]);

  return (
    <div class="content">
      <Section title={t('search_title')}>
        <input type="search" class="big" aria-label={t('search_label')} placeholder={t('search_label')} value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
        <div class="row">
          <label class="inline">
            <input type="checkbox" checked={exact} onChange={(e) => setExact((e.target as HTMLInputElement).checked)} /> {t('search_exact')}
          </label>
          <label class="inline">
            <input type="checkbox" checked={titlesOnly} onChange={(e) => setTitlesOnly((e.target as HTMLInputElement).checked)} /> {t('search_titles')}
          </label>
        </div>
        <details>
          <summary>{t('search_filters')}</summary>
          <fieldset class="row">
            <legend class="muted">{t('search_sites')}</legend>
            {TIER1_SITES.map((s) => (
              <label class="inline">
                <input type="checkbox" checked={sites.includes(s)} onChange={(e) => setSites(toggleIn(sites, s, (e.target as HTMLInputElement).checked))} /> {SITES[s].name}
              </label>
            ))}
          </fieldset>
          <fieldset class="row">
            <legend class="muted">{t('search_roles')}</legend>
            {ROLES.map((r) => (
              <label class="inline">
                <input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(toggleIn(roles, r, (e.target as HTMLInputElement).checked))} /> {t(`role_${r}`)}
              </label>
            ))}
          </fieldset>
          <div class="field">
            <label for="s-model">{t('search_models')}</label>
            <input id="s-model" type="text" value={model} placeholder={t('search_models_hint')} onInput={(e) => setModel((e.target as HTMLInputElement).value)} />
          </div>
          <div class="row">
            <label class="inline">
              {t('search_from')} <input type="date" value={from} onInput={(e) => setFrom((e.target as HTMLInputElement).value)} />
            </label>
            <label class="inline">
              {t('search_to')} <input type="date" value={to} onInput={(e) => setTo((e.target as HTMLInputElement).value)} />
            </label>
          </div>
          <div class="row">
            <select aria-label={t('search_folder')} value={folderId} onChange={(e) => setFolderId((e.target as HTMLSelectElement).value)}>
              <option value="">{t('search_any_folder')}</option>
              {flat(folders ?? []).map((f) => (
                <option value={f.id}>{`${'  '.repeat(f.depth)}${f.name}`}</option>
              ))}
            </select>
            <select aria-label={t('search_tag')} value={tag} onChange={(e) => setTag((e.target as HTMLSelectElement).value)}>
              <option value="">{t('search_any_tag')}</option>
              {(tags ?? []).map((x) => (
                <option value={x.name}>{x.name}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="s-inc">{t('search_include')}</label>
            <select aria-label={t('search_include_mode')} value={includeMode} onChange={(e) => setIncludeMode((e.target as HTMLSelectElement).value as 'all' | 'any')}>
              <option value="all">{t('search_mode_all')}</option>
              <option value="any">{t('search_mode_any')}</option>
            </select>
            <input id="s-inc" type="text" value={include} placeholder={t('search_terms_hint')} onInput={(e) => setInclude((e.target as HTMLInputElement).value)} />
          </div>
          <div class="field">
            <label for="s-exc">{t('search_exclude')}</label>
            <input id="s-exc" type="text" value={exclude} placeholder={t('search_terms_hint')} onInput={(e) => setExclude((e.target as HTMLInputElement).value)} />
          </div>
        </details>
        {error ? <p class="status error" role="alert">{error}</p> : null}
      </Section>

      {res ? (
        <Section
          title={t('search_results', String(res.total))}
          aside={
            res.chats.length ? (
              <button onClick={() => void saveFile(`Artifact search ${new Date().toISOString().slice(0, 10)}.md`, findingsReport(request(), res), 'text/markdown')}>{t('search_export')}</button>
            ) : null
          }
        >
          {busy ? <p class="muted">{t('search_busy')}</p> : null}
          {res.chats.length === 0 ? <p class="muted">{t('search_none')}</p> : null}
          {[...bySite].map(([site, chats]) => (
            <div class="site-group">
              <h3>
                {SITES[site as keyof typeof SITES]?.name ?? site} <span class="muted">{chats.length}</span>
              </h3>
              <ul class="results">
                {chats.map((c) => (
                  <li>
                    <button class="link title" onClick={() => void openChat({ id: c.chatId, url: c.url }).catch((e: Error) => setError(e.message))}>
                      {c.title}
                    </button>
                    <span class="muted when">{fmtDate(c.updatedAt)}</span>
                    {c.snippets.map((s) => (
                      <button class="snippet" onClick={() => void openChat({ id: c.chatId, url: c.url }, s.messageId).catch((e: Error) => setError(e.message))}>
                        <span class="role">{t(`role_${s.role}`)}</span>
                        {snippet(s.text, terms).map((p) => (p.match ? <mark>{p.text}</mark> : p.text))}
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      ) : null}

      <IndexSection tab={tab} />
    </div>
  );
}

function IndexSection({ tab }: { tab: ActiveTab | null }) {
  const [stats] = useLib('stats', []);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [error, setError] = useState('');
  const [rebuilt, setRebuilt] = useState<number | null>(null);
  const site = tab?.site && tab.ready?.capabilities.listChats ? tab.site : null;

  useEffect(() => {
    setScan(null);
    if (!site) return;
    void lib('kvGet', `scan:${site.id}`).then((v) => setScan(v as ScanState | null));
    const on = (m: unknown) => {
      const msg = m as { type?: string; state?: ScanState };
      if (msg?.type === 'scan:progress' && msg.state?.site === site.id) setScan(msg.state);
    };
    browser.runtime.onMessage.addListener(on);
    return () => browser.runtime.onMessage.removeListener(on);
  }, [site?.id]);

  const start = async (fresh: boolean) => {
    if (!tab) return;
    try {
      const r = await sendToTab(tab.tabId, { type: 'content:deep-scan', fresh });
      if (!r.started) setError(t('scan_already'));
      else setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const resumable = scan && !scan.running && !scan.finishedAt;
  return (
    <Section title={t('index_title')}>
      {stats ? (
        <table class="dense">
          <thead>
            <tr>
              <th>{t('index_site')}</th>
              <th>{t('index_known')}</th>
              <th>{t('index_indexed')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stats.bySite).map(([s, v]) => (
              <tr>
                <td>{SITES[s as keyof typeof SITES]?.name ?? s}</td>
                <td class="num">{v.total}</td>
                <td class="num">{v.indexed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {stats && stats.chats === 0 ? <p class="muted">{t('index_empty')}</p> : null}
      {site ? (
        <>
          <h3>{t('scan_title', site.name)}</h3>
          <p class="muted">{t('scan_hint')}</p>
          {scan ? (
            <>
              <Progress done={scan.fetched + scan.failed} total={scan.fetched + scan.failed + scan.queue.length} label={t('scan_chats')} onCancel={scan.running ? () => void sendToTab(tab!.tabId, { type: 'content:deep-scan-stop' }) : undefined} />
              <p class="muted mono">{t('scan_counts', [String(scan.listed), String(scan.fetched), String(scan.failed)])}</p>
              {scan.finishedAt ? <p class="muted">{t('scan_finished', new Date(scan.finishedAt).toLocaleString())}</p> : null}
              {scan.error ? <p class="status error">{scan.error}</p> : null}
            </>
          ) : null}
          {!scan?.running ? (
            <div class="row">
              {resumable ? (
                <>
                  <button class="primary" onClick={() => void start(false)}>{t('scan_resume')}</button>
                  <button onClick={() => void start(true)}>{t('scan_restart')}</button>
                </>
              ) : (
                // A finished scan only fetches chats that are new or changed since.
                <button class="primary" onClick={() => void start(false)}>{scan?.finishedAt ? t('scan_update') : t('scan_start')}</button>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <p class="muted">{t('scan_need_site')}</p>
      )}
      {error ? <p class="status error" role="alert">{error}</p> : null}
      <div class="row">
        <button onClick={() => void lib('rebuildIndex').then(setRebuilt, (e: Error) => setError(e.message))}>{t('index_rebuild')}</button>
        {rebuilt !== null ? <span class="muted">{t('index_rebuilt', String(rebuilt))}</span> : null}
      </div>
    </Section>
  );
}
