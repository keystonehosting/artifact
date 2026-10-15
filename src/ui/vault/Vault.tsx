// Vaults (SPEC §6H): every artifact, image and code block across stored
// chats. Artifacts preview in the sandbox and download as real files; images
// load through the site with the user's session; snippets copy in one click.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { zipSync, strToU8 } from 'fflate';
import { lib } from '../../core/library/client';
import type { VaultArtifact, VaultMedia, VaultSnippet } from '../../core/library/vaults';
import type { Artifact } from '../../core/schema/archive';
import { artifactExtension } from '../../core/export/bundle';
import { saveFile } from '../../core/export/download';
import { sanitizeFilenamePart } from '../../core/util/filename';
import { SiteTabs } from '../../core/bulk/site-tabs';
import { base64ToBytes } from '../../core/util/bytes';
import { SITES, type SiteId } from '../../core/sites/sites';
import { Progress, Section, Tabs } from '../components';
import { useSettings } from '../app/hooks';
import { useTheme } from '../app/theme';
import { fmtDate, openChat } from '../app/library';
import { t } from '../../core/i18n/t';
import { ArtifactPreview, previewKind } from './Preview';

type View = 'artifacts' | 'media' | 'snippets';

function SiteFilter({ value, onChange, sites }: { value: string; onChange(v: string): void; sites: SiteId[] }) {
  return (
    <select aria-label={t('search_sites')} value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
      <option value="">{t('vault_all_sites')}</option>
      {sites.map((s) => (
        <option value={s}>{SITES[s].name}</option>
      ))}
    </select>
  );
}

export function Vault() {
  const [settings] = useSettings();
  useTheme(settings?.theme ?? 'system');
  const [view, setView] = useState<View>((new URLSearchParams(location.search).get('view') as View) || 'artifacts');
  return (
    <div class="app vault">
      <header class="app-head">
        <h1>{t('vault_title')}</h1>
      </header>
      <Tabs<View>
        tabs={[
          ['artifacts', t('vault_artifacts')],
          ['media', t('vault_media')],
          ['snippets', t('vault_snippets')],
        ]}
        value={view}
        onChange={setView}
      />
      <div class="content">
        {view === 'artifacts' && <Artifacts />}
        {view === 'media' && <Media />}
        {view === 'snippets' && <Snippets />}
      </div>
    </div>
  );
}

function Artifacts() {
  const [rows, setRows] = useState<VaultArtifact[] | null>(null);
  const [q, setQ] = useState('');
  const [site, setSite] = useState('');
  const [open, setOpen] = useState<{ row: VaultArtifact; art: Artifact; version: number } | null>(null);
  useEffect(() => void lib('vaultArtifacts').then(setRows), []);
  const list = (rows ?? []).filter((r) => (!site || r.site === site) && (!q || `${r.title} ${r.chatTitle}`.toLowerCase().includes(q.toLowerCase())));
  const sites = [...new Set((rows ?? []).map((r) => r.site))];
  const select = async (row: VaultArtifact) => {
    const art = await lib('vaultArtifact', row.chatId, row.artifactId);
    if (art) setOpen({ row, art, version: art.versions.length - 1 });
  };
  const fileName = (a: Artifact, v?: number) => `${sanitizeFilenamePart(a.title, 'artifact')}${v !== undefined ? ` v${v + 1}` : ''}.${artifactExtension(a)}`;
  return (
    <div class="split">
      <Section title={t('vault_artifacts_count', String(list.length))}>
        <div class="row">
          <input type="search" aria-label={t('library_filter')} placeholder={t('library_filter')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <SiteFilter value={site} onChange={setSite} sites={sites} />
        </div>
        {rows && !rows.length ? <p class="muted">{t('vault_artifacts_empty')}</p> : null}
        <ul class="plain">
          {list.map((r) => (
            <li class={`row${open?.row === r ? ' sel' : ''}`}>
              <button class="link grow" onClick={() => void select(r)}>
                {r.title}
              </button>
              <span class="muted">{r.type}</span>
              <span class="muted">{t('vault_versions', String(r.versions))}</span>
              <span class="site-tag">{SITES[r.site].name}</span>
            </li>
          ))}
        </ul>
      </Section>
      {open ? (
        <Section title={open.art.title}>
          <div class="row">
            <select aria-label={t('vault_version')} value={open.version} onChange={(e) => setOpen({ ...open, version: Number((e.target as HTMLSelectElement).value) })}>
              {open.art.versions.map((v, i) => (
                <option value={i}>{t('vault_version_n', [String(i + 1), fmtDate(v.createdAt ?? null)])}</option>
              ))}
            </select>
            <button onClick={() => void saveFile(fileName(open.art), open.art.versions[open.version]!.content, 'text/plain')}>{t('vault_download')}</button>
            {open.art.versions.length > 1 ? (
              <button
                onClick={() => {
                  const files = Object.fromEntries(open.art.versions.map((v, i) => [fileName(open.art, i), strToU8(v.content)]));
                  void saveFile(`${sanitizeFilenamePart(open.art.title, 'artifact')}.zip`, zipSync(files) as BlobPart, 'application/zip');
                }}
              >
                {t('vault_download_all')}
              </button>
            ) : null}
            <button onClick={() => void openChat({ id: open.row.chatId, url: open.row.url })}>{t('vault_open_chat')}</button>
          </div>
          <p class="muted">{open.row.chatTitle}</p>
          <ArtifactPreview kind={previewKind(open.art.type, open.art.language ?? null)} content={open.art.versions[open.version]!.content} />
        </Section>
      ) : null}
    </div>
  );
}

function Media() {
  const [rows, setRows] = useState<VaultMedia[] | null>(null);
  const [site, setSite] = useState('');
  const [kind, setKind] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => void lib('vaultMedia').then(setRows), []);
  const key = (m: VaultMedia) => `${m.chatId}|${m.attachmentId}`;
  const list = (rows ?? []).filter((m) => (!site || m.site === site) && (!kind || m.kind === kind));
  const sites = [...new Set((rows ?? []).map((r) => r.site))];

  /** Fetches image bytes through each site's tab, with the user's session. */
  const fetchAll = async (items: VaultMedia[], use: (m: VaultMedia, bytes: Uint8Array, mime: string, name: string) => void) => {
    const tabs = new SiteTabs();
    setError('');
    setProg({ done: 0, total: items.length });
    let failed = 0;
    try {
      for (const [i, m] of items.entries()) {
        try {
          const conv = await lib('conversation', m.chatId);
          if (!conv) throw new Error('not stored');
          const r = await tabs.send(m.site, { type: 'content:download', conversation: conv, attachmentId: m.attachmentId });
          use(m, base64ToBytes(r.base64), r.mimeType, r.name);
        } catch {
          failed++;
        }
        setProg({ done: i + 1, total: items.length });
      }
    } finally {
      await tabs.close();
      setProg(null);
      if (failed) setError(t('vault_media_failed', String(failed)));
    }
  };

  const previews = () =>
    void fetchAll(list.filter((m) => !thumbs.has(key(m))).slice(0, 60), (m, bytes, mime) => {
      setThumbs((cur) => new Map(cur).set(key(m), URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))));
    });

  const download = () => {
    const files: Record<string, Uint8Array> = {};
    const items = list.filter((m) => selected.has(key(m)));
    void fetchAll(items, (_m, bytes, _mime, name) => {
      let n = sanitizeFilenamePart(name, 'image');
      for (let i = 2; files[n]; i++) n = n.replace(/(\.\w+)?$/, ` (${i})$1`);
      files[n] = bytes;
    }).then(async () => {
      if (Object.keys(files).length) await saveFile(`Artifact images ${new Date().toISOString().slice(0, 10)}.zip`, zipSync(files) as BlobPart, 'application/zip');
    });
  };

  return (
    <Section title={t('vault_media_count', String(list.length))}>
      <p class="hint muted">{t('vault_media_hint')}</p>
      <div class="row">
        <SiteFilter value={site} onChange={setSite} sites={sites} />
        <select aria-label={t('vault_kind')} value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value)}>
          <option value="">{t('vault_kind_all')}</option>
          <option value="generated">{t('vault_kind_generated')}</option>
          <option value="upload">{t('vault_kind_upload')}</option>
        </select>
        <button disabled={!!prog || !list.length} onClick={previews}>{t('vault_load_previews')}</button>
        <button disabled={!!prog || !selected.size} onClick={download}>{t('vault_download_selected', String(selected.size))}</button>
      </div>
      {prog ? <Progress done={prog.done} total={prog.total} label={t('vault_images')} /> : null}
      {error ? <p class="status error" role="alert">{error}</p> : null}
      {rows && !rows.length ? <p class="muted">{t('vault_media_empty')}</p> : null}
      <ul class="gallery">
        {list.map((m) => (
          <li>
            <label>
              <input type="checkbox" checked={selected.has(key(m))} onChange={(e) => {
                const next = new Set(selected);
                if ((e.target as HTMLInputElement).checked) next.add(key(m));
                else next.delete(key(m));
                setSelected(next);
              }} />
              {thumbs.has(key(m)) ? <img src={thumbs.get(key(m))} alt={m.name} /> : <span class="thumb-empty">{m.name}</span>}
            </label>
            <button class="link" title={m.chatTitle} onClick={() => void openChat({ id: m.chatId, url: m.url })}>
              {m.chatTitle}
            </button>
            <span class="muted">
              {SITES[m.site].name} · {t(`vault_kind_${m.kind === 'upload' ? 'upload' : 'generated'}`)} · {fmtDate(m.at)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Snippets() {
  const [rows, setRows] = useState<VaultSnippet[] | null>(null);
  const [lang, setLang] = useState('');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<VaultSnippet | null>(null);
  const [copied, setCopied] = useState('');
  useEffect(() => void lib('vaultSnippets').then(setRows), []);
  const langs = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.language || 'text', (m.get(r.language || 'text') ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const list = (rows ?? []).filter((r) => (!lang || (r.language || 'text') === lang) && (!q || r.code.toLowerCase().includes(q.toLowerCase()))).slice(0, 500);
  return (
    <Section title={t('vault_snippets_count', String(rows?.length ?? 0))}>
      <div class="row">
        <input type="search" aria-label={t('library_filter')} placeholder={t('vault_snippet_search')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <select aria-label={t('vault_language')} value={lang} onChange={(e) => setLang((e.target as HTMLSelectElement).value)}>
          <option value="">{t('vault_all_languages')}</option>
          {langs.map(([l, n]) => (
            <option value={l}>{`${l} (${n})`}</option>
          ))}
        </select>
      </div>
      {rows && !rows.length ? <p class="muted">{t('vault_snippets_empty')}</p> : null}
      {preview ? (
        <div class="snippet-preview">
          <ArtifactPreview kind="mermaid" content={preview.code} />
          <button onClick={() => setPreview(null)}>{t('common_close')}</button>
        </div>
      ) : null}
      <ul class="cards">
        {list.map((s) => (
          <li>
            <div class="row">
              <span class="mono">{s.language || 'text'}</span>
              <button class="link grow" onClick={() => void openChat({ id: s.chatId, url: s.url }, s.messageId)}>
                {s.chatTitle}
              </button>
              <span class="site-tag">{SITES[s.site].name}</span>
              <span class="muted when">{fmtDate(s.at)}</span>
            </div>
            <pre class="code">{s.code.length > 1200 ? `${s.code.slice(0, 1200)}\n…` : s.code}</pre>
            <div class="row">
              <button onClick={() => void navigator.clipboard.writeText(s.code).then(() => setCopied(`${s.chatId}${s.messageId}${s.code.length}`))}>
                {copied === `${s.chatId}${s.messageId}${s.code.length}` ? t('code_copied') : t('code_copy')}
              </button>
              {s.language === 'mermaid' ? <button onClick={() => setPreview(s)}>{t('vault_render')}</button> : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
