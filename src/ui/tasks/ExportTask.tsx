// Runs a bulk export. Where the browser allows it the ZIP streams straight
// into a file the user picks; otherwise it is assembled in memory and saved
// to Downloads at the end (or when stopped, with what was finished).
import { useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ExportJobSpec, LogEntry } from '../../core/bulk/export-job';
import { runExportJob } from '../../core/bulk/export-job';
import { ZipSink } from '../../core/bulk/zip-sink';
import { SiteTabs } from '../../core/bulk/site-tabs';
import { lib } from '../../core/library/client';
import { loadSettings } from '../../core/settings/settings';
import { optionsFromSettings } from '../../core/export/options';
import { saveFile } from '../../core/export/download';
import { base64ToBytes } from '../../core/util/bytes';
import { Section } from '../components';
import { t } from '../../core/i18n/t';
import { Gate } from './gate';
import { LogView, RunControls } from './common';

type SaveHandle = { createWritable(): Promise<{ write(d: BlobPart): Promise<void>; close(): Promise<void> }> };
type PickerWindow = Window & { showSaveFilePicker?: (o: unknown) => Promise<SaveHandle> };

export function ExportTask({ spec }: { spec: ExportJobSpec }) {
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');
  const [prog, setProg] = useState({ done: 0, total: spec.chatIds.length + spec.projects.length, label: '' });
  const [paused, setPaused] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const gate = useRef(new Gate()).current;
  const name = `Artifact export ${new Date().toISOString().slice(0, 10)}`;
  const canStream = typeof (window as PickerWindow).showSaveFilePicker === 'function';

  const start = async (toDisk: boolean) => {
    setError('');
    let writable: Awaited<ReturnType<SaveHandle['createWritable']>> | null = null;
    if (toDisk) {
      try {
        const handle = await (window as PickerWindow).showSaveFilePicker!({ suggestedName: `${name}.zip`, types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }] });
        writable = await handle.createWritable();
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
        return;
      }
    }
    setPhase('running');
    const chunks: Uint8Array[] = [];
    const sink = new ZipSink(async (c) => {
      if (writable) await writable.write(c as BlobPart);
      else chunks.push(c);
    });
    const tabs = new SiteTabs();
    const settings = await loadSettings();
    const folderCache = new Map<string, string[]>();
    const projectByChat = new Map<string, string>();
    if (spec.projects.length) {
      const rows = (await lib('chats', { limit: 1_000_000 })).rows;
      for (const p of spec.projects) for (const r of rows) if (r.site === p.site && r.projectId === p.id) projectByChat.set(r.id, p.name);
    }
    const entries: LogEntry[] = [];
    try {
      const r = await runExportJob(spec, {
        options: optionsFromSettings(settings, { includeSourceLink: true }),
        version: browser.runtime.getManifest().version,
        stored: async (chatId) => {
          const [row, conv] = await Promise.all([lib('chat', chatId), lib('conversation', chatId)]);
          return conv && row.row && !row.row.stale && !conv.source.approximate ? conv : null;
        },
        fetch: async (site, siteChatId) => {
          const conv = (await tabs.send(site, { type: 'content:get-chat', chatId: siteChatId })).conversation;
          void lib('ingest', conv, {});
          return conv;
        },
        download: async (conv, att) => {
          const res = await tabs.send(conv.site, { type: 'content:download', conversation: conv, attachmentId: att.id });
          return { name: res.name, mimeType: res.mimeType, bytes: base64ToBytes(res.base64) };
        },
        project: async (site, id) => {
          const p = (await tabs.send(site, { type: 'content:project', id })).project;
          return { site, id: p.id, name: p.name, instructions: p.instructions, memory: p.memory, knowledge: p.knowledge.map((k) => ({ id: k.id, name: k.name, ...(k.content !== undefined ? { content: k.content } : {}) })) };
        },
        folderPath: async (chatId) => {
          if (spec.layout !== 'folders') return [];
          if (!folderCache.has(chatId)) {
            const fs = await lib('foldersOfChat', chatId);
            folderCache.set(chatId, fs[0] ? (await lib('breadcrumbs', fs[0].id)).map((f) => f.name) : []);
          }
          return folderCache.get(chatId)!;
        },
        projectOf: (chatId) => projectByChat.get(chatId) ?? null,
        sink,
        log: (e) => {
          entries.push(e);
          setLog([...entries]);
        },
        progress: (done, total, label) => setProg({ done, total, label }),
        gate: () => gate.wait(),
        sleep: (ms) => gate.sleep(ms),
      });
      if (writable) await writable.close();
      else await saveFile(`${name}.zip`, new Blob(chunks as BlobPart[], { type: 'application/zip' }), 'application/zip');
      setResult(r.stopped ? t('tasks_export_stopped', [String(r.ok), String(spec.chatIds.length)]) : t('tasks_export_done', [String(r.ok), String(r.failed)]));
    } catch (e) {
      setError((e as Error).message);
      if (writable) await writable.close().catch(() => undefined);
    } finally {
      await tabs.close();
      setPhase('done');
    }
  };

  return (
    <>
      <Section title={spec.title}>
        <p>{t('tasks_export_summary', [String(spec.chatIds.length), spec.format.toUpperCase(), t(`tasks_layout_${spec.layout}`)])}</p>
        {spec.projects.length ? <p class="muted">{t('tasks_export_projects', spec.projects.map((p) => p.name).join(', '))}</p> : null}
        <p class="hint muted">{t('tasks_export_hint')}</p>
        {phase === 'ready' ? (
          <div class="row">
            {canStream ? (
              <button class="primary" onClick={() => void start(true)}>
                {t('tasks_save_as')}
              </button>
            ) : null}
            <button class={canStream ? '' : 'primary'} onClick={() => void start(false)}>
              {t('tasks_save_downloads')}
            </button>
          </div>
        ) : null}
        {phase === 'running' ? <RunControls gate={gate} done={prog.done} total={prog.total} label={prog.label} paused={paused} onPause={setPaused} /> : null}
        {result ? <p class="status" role="status">{result}</p> : null}
        {error ? <p class="status error" role="alert">{error}</p> : null}
      </Section>
      <LogView entries={log} name={`${name} log`} />
    </>
  );
}
