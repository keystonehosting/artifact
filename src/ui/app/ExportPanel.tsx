// Export tab: every format, the export options, shift-click message
// selection, Claude project files, preview, Obsidian and copy as Markdown.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ActiveTab } from './hooks';
import type { Settings } from '../../core/settings/settings';
import type { Conversation, ProjectExport } from '../../core/schema/archive';
import { sendToTab } from '../../core/messaging/tabs';
import { Progress, Section, Select, TextField, Toggle } from '../components';
import { t } from '../../core/i18n/t';
import { exportConversation, openPreview, optionsFromSettings, type ExportFormat } from '../../core/export/runner';
import { buildDocument } from '../../core/export/document';
import { toMarkdown } from '../../core/export/markdown';
import { activeBranch, messageText } from '../../core/model/tree';
import { formatFilename } from '../../core/util/filename';
import { SITES } from '../../core/sites/sites';
import { obsidianNeedsClipboard, obsidianUri } from '../../core/export/obsidian';

const FORMATS: Array<[ExportFormat, string]> = [
  ['md', 'Markdown'],
  ['txt', 'Text'],
  ['json', 'JSON'],
  ['html', 'HTML'],
  ['docx', 'Word (DOCX)'],
  ['pdf', 'PDF'],
  ['png', 'PNG'],
  ['png2x', 'PNG 2×'],
];

export function ExportPanel({ tab, settings, update }: { tab: ActiveTab | null; settings: Settings; update: (fn: (s: Settings) => void) => void }) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [format, setFormat] = useState<ExportFormat>(settings.export.defaultFormat === 'png' ? 'png' : settings.export.defaultFormat);
  const [selection, setSelection] = useState<string[]>([]);
  const [withProject, setWithProject] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastClicked = useRef<number | null>(null);

  useEffect(() => {
    setConv(null);
    setSelection([]);
    if (!tab?.ready) return;
    void sendToTab(tab.tabId, { type: 'content:read' }).then((r) => setConv(r.conversation));
  }, [tab?.tabId, tab?.ready?.chatId]);

  if (!tab?.site) return <div class="content muted">{t('popup_no_site')}</div>;
  if (!tab.ready) return <div class="content muted">{t('popup_not_loaded')}</div>;
  if (!conv) return <div class="content muted">{t('popup_no_chat')}</div>;

  const e = settings.export;
  const set = (fn: (x: Settings['export']) => void) => update((s) => fn(s.export));
  const branch = activeBranch(conv).filter((m) => !m.hidden);
  const opts = optionsFromSettings(settings, { selection });
  const filename = formatFilename(e.filenameTemplate, { platform: SITES[conv.site].name, title: conv.title, model: conv.model, id: conv.siteChatId });

  const toggleMsg = (idx: number, shift: boolean) => {
    const id = branch[idx]!.id;
    const on = !selection.includes(id);
    let ids = [id];
    if (shift && lastClicked.current !== null) {
      const [a, b] = [Math.min(lastClicked.current, idx), Math.max(lastClicked.current, idx)];
      ids = branch.slice(a, b + 1).map((m) => m.id);
    }
    lastClicked.current = idx;
    setSelection((sel) => (on ? [...new Set([...sel, ...ids])] : sel.filter((x) => !ids.includes(x))));
  };

  const run = async () => {
    setStatus(null);
    try {
      if (format === 'pdf' || format === 'png' || format === 'png2x') {
        await openPreview(tab.tabId, conv, opts, format);
        return;
      }
      let project: ProjectExport | null = null;
      if (withProject && conv.project?.id && tab.ready?.capabilities.projects) {
        const p = (await sendToTab(tab.tabId, { type: 'content:project', id: conv.project.id })).project;
        project = { site: conv.site, id: p.id, name: p.name, instructions: p.instructions, memory: p.memory, knowledge: p.knowledge.map((k) => ({ id: k.id, name: k.name, ...(k.content !== undefined ? { content: k.content } : {}) })) };
      }
      abort.current = new AbortController();
      const out = await exportConversation(tab.tabId, conv, format, opts, {
        signal: abort.current.signal,
        onProgress: (done, total, label) => setProgress({ done, total, label }),
        project,
      });
      setProgress(null);
      setStatus({
        text: out.failures.length ? t('export_done_partial', [out.filename, String(out.failures.length)]) : t('export_done', out.filename),
        error: out.failures.length > 0,
      });
    } catch (err) {
      setProgress(null);
      setStatus({ text: t('export_failed', (err as Error).message), error: true });
    }
  };

  return (
    <div class="content">
      <Section title={t('export_heading')}>
        <div class="title">{conv.title}</div>
        {conv.source.approximate && <p class="callout">{t('popup_approximate')}</p>}
        <Select label={t('export_format')} value={format} options={FORMATS} onChange={(v) => setFormat(v)} />
        <div class="row">
          <button class="primary" onClick={run} disabled={!!progress}>{t('export_run')}</button>
          <button onClick={() => navigator.clipboard.writeText(toMarkdown(buildDocument(conv, opts))).then(() => setStatus({ text: t('export_copied') }))}>{t('export_copy_markdown')}</button>
          <button onClick={() => openPreview(tab.tabId, conv, opts, 'view')}>{t('export_preview')}</button>
          {e.obsidianVault && (
            <button
              onClick={async () => {
                const md = toMarkdown(buildDocument(conv, opts));
                if (obsidianNeedsClipboard(md)) await navigator.clipboard.writeText(md);
                window.open(obsidianUri(e.obsidianVault, e.obsidianFolder, filename, md), '_blank');
              }}
            >
              {t('export_obsidian')}
            </button>
          )}
        </div>
        {progress && <Progress done={progress.done} total={progress.total} label={progress.label} onCancel={() => abort.current?.abort()} />}
        <div class={`status${status?.error ? ' error' : ''}`} role="status">{status?.text}</div>
        <p class="muted">{t('export_files_note', [String(conv.attachments.length), String(conv.artifacts.length)])}</p>
      </Section>

      <Section title={t('export_messages')} aside={<span class="muted">{selection.length ? t('export_selected', String(selection.length)) : t('export_all')}</span>}>
        <div class="msglist">
          {branch.map((m, i) => (
            <label onClick={(ev) => { ev.preventDefault(); toggleMsg(i, ev.shiftKey); }}>
              <input type="checkbox" checked={selection.includes(m.id)} readOnly tabIndex={-1} />
              <span class="muted">{m.role === 'user' ? t('meter_user') : t('meter_assistant')}</span>
              <span class="snip">{messageText(m).replace(/\s+/g, ' ').slice(0, 120)}</span>
            </label>
          ))}
        </div>
        <p class="hint muted">{t('export_shift_hint')}</p>
        {selection.length > 0 && <button onClick={() => setSelection([])}>{t('export_clear_selection')}</button>}
      </Section>

      <Section title={t('export_options')}>
        <Select label={t('export_branches')} value={e.branches} options={[['active', t('export_branches_active')], ['all', t('export_branches_all')]]} onChange={(v) => set((x) => void (x.branches = v))} />
        <Select label={t('export_numbering')} value={e.numbering} options={[['off', t('export_numbering_off')], ['per-message', t('export_numbering_message')], ['per-turn', t('export_numbering_turn')]]} onChange={(v) => set((x) => void (x.numbering = v))} />
        <Toggle label={t('export_opt_dates')} checked={e.includeTimestamps} onChange={(v) => set((x) => void (x.includeTimestamps = v))} />
        <Toggle label={t('export_opt_toc')} checked={e.includeToc} onChange={(v) => set((x) => void (x.includeToc = v))} />
        <Toggle label={t('export_opt_images')} checked={e.includeImages} onChange={(v) => set((x) => void (x.includeImages = v))} />
        <Toggle label={t('export_opt_files')} checked={e.includeFiles} onChange={(v) => set((x) => void (x.includeFiles = v))} />
        <Toggle label={t('export_opt_artifacts')} checked={e.includeArtifacts} onChange={(v) => set((x) => void (x.includeArtifacts = v))} />
        <Toggle label={t('export_opt_thinking')} checked={e.includeThinking} onChange={(v) => set((x) => void (x.includeThinking = v))} />
        <Toggle label={t('export_opt_tools')} checked={e.includeToolCalls} onChange={(v) => set((x) => void (x.includeToolCalls = v))} />
        <Toggle label={t('export_opt_credit')} checked={e.includeCredit} onChange={(v) => set((x) => void (x.includeCredit = v))} />
        {conv.project?.id && tab.ready.capabilities.projects && <Toggle label={t('export_opt_project')} checked={withProject} onChange={setWithProject} />}
        <TextField label={t('export_filename')} value={e.filenameTemplate} onChange={(v) => set((x) => void (x.filenameTemplate = v))} hint={`${t('export_filename_tokens')} → ${filename}`} />
      </Section>
    </div>
  );
}
