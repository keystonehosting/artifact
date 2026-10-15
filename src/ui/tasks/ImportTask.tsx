// Deep Import and restore (SPEC §6F): the official ChatGPT, Claude and
// Gemini (Takeout) exports, Artifact archives, and library/settings files.
// Shows what was found before anything is written.
import { useState } from 'preact/hooks';
import { readImport, type ImportResult } from '../../core/importers/official';
import { lib } from '../../core/library/client';
import { saveSettings, parseSettings } from '../../core/settings/settings';
import { SITES } from '../../core/sites/sites';
import { Progress, Section, Toggle } from '../components';
import { t } from '../../core/i18n/t';

function htmlToText(html: string): string {
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim();
}

export function ImportTask() {
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [toFolder, setToFolder] = useState(true);
  const [withLibrary, setWithLibrary] = useState(true);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const pick = async (f: File) => {
    setError('');
    setStatus('');
    setResults(null);
    setFileName(f.name);
    try {
      setResults(readImport(f.name, new Uint8Array(await f.arrayBuffer()), htmlToText));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const run = async () => {
    if (!results) return;
    const total = results.reduce((n, r) => n + r.conversations.length, 0);
    let done = 0;
    setProg({ done, total });
    try {
      for (const r of results) {
        let folderId: string | null = null;
        if (toFolder && r.kind !== 'artifact' && r.conversations.length) {
          const site = r.kind === 'chatgpt' ? 'ChatGPT' : r.kind === 'claude' ? 'Claude' : 'Gemini';
          folderId = (await lib('createFolder', t('import_folder_name', [site, new Date().toISOString().slice(0, 10)]), null, { origin: `import:${r.kind}` })).id;
        }
        const ids: string[] = [];
        for (const c of r.conversations) {
          await lib('ingest', c, {});
          ids.push(c.id);
          setProg({ done: ++done, total });
        }
        if (folderId && ids.length) await lib('addToFolder', folderId, ids);
        if (withLibrary && r.library) {
          const { settings, ...rest } = r.library as Record<string, unknown> & { settings?: unknown };
          await lib('importLibrary', rest);
          if (settings) await saveSettings(parseSettings(settings));
        }
      }
      setStatus(t('import_done_count', String(done)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProg(null);
    }
  };

  return (
    <Section title={t('import_title_deep')}>
      <p class="hint muted">{t('import_deep_hint')}</p>
      <label class="button-like">
        {t('import_choose')}
        <input type="file" accept=".zip,.json" class="sr-only" onChange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) void pick(f);
        }} />
      </label>
      {fileName ? <p class="muted">{fileName}</p> : null}
      {results ? (
        <>
          <table class="dense">
            <thead>
              <tr>
                <th>{t('import_found_in')}</th>
                <th>{t('import_kind')}</th>
                <th>{t('import_chats')}</th>
                <th>{t('import_skipped')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr>
                  <td class="mono">{r.source}</td>
                  <td>{r.kind === 'artifact' ? t('import_kind_artifact') : SITES[r.kind].name}</td>
                  <td class="num">{r.conversations.length}</td>
                  <td class="num" title={r.skipped.map((s) => `${s.name}: ${s.reason}`).join('\n')}>{r.skipped.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.some((r) => r.kind === 'gemini') ? <p class="callout">{t('import_gemini_note')}</p> : null}
          {results.some((r) => r.kind !== 'artifact') ? <Toggle label={t('import_to_folder')} checked={toFolder} onChange={setToFolder} /> : null}
          {results.some((r) => r.library) ? <Toggle label={t('import_with_library')} hint={t('import_with_library_hint')} checked={withLibrary} onChange={setWithLibrary} /> : null}
          <button class="primary" disabled={!!prog} onClick={() => void run()}>
            {t('import_go_count', String(results.reduce((n, r) => n + r.conversations.length, 0)))}
          </button>
        </>
      ) : null}
      {prog ? <Progress done={prog.done} total={prog.total} label={t('import_chats')} /> : null}
      {status ? <p class="status" role="status">{status}</p> : null}
      {error ? <p class="status error" role="alert">{error}</p> : null}
    </Section>
  );
}
