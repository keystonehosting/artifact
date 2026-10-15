// Runs a bulk delete, archive or unarchive with the guardrails of SPEC §0.5:
// the full list first, typed confirmation above 10 items, paced execution
// with pause and cancel, and a downloadable log.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ChatRow } from '../../core/db/db';
import type { LogEntry } from '../../core/bulk/export-job';
import { confirmMatches, confirmPhrase, needsTypedConfirm, runActionJob, type ActionJobSpec, type BulkAction } from '../../core/bulk/action-job';
import { SiteTabs } from '../../core/bulk/site-tabs';
import { lib } from '../../core/library/client';
import { SITES, type SiteId } from '../../core/sites/sites';
import { Section } from '../components';
import { t } from '../../core/i18n/t';
import { Gate } from './gate';
import { LogView, RunControls } from './common';

/** Which sites can do what, as their adapters declare (SPEC §5 capabilities). */
const CAN: Record<BulkAction, SiteId[]> = {
  delete: ['chatgpt', 'claude', 'gemini', 'grok'],
  archive: ['chatgpt'],
  unarchive: ['chatgpt'],
};

export function ActionTask({ spec }: { spec: ActionJobSpec }) {
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');
  const [prog, setProg] = useState({ done: 0, total: spec.chatIds.length, label: '' });
  const [paused, setPaused] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const gate = useRef(new Gate()).current;
  const n = spec.chatIds.length;
  const typedOk = !needsTypedConfirm(n) || confirmMatches(typed, spec.action, n);

  useEffect(() => {
    void lib('chatsById', spec.chatIds).then(setRows);
  }, []);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const unsupported = spec.chatIds.filter((id) => !CAN[spec.action].includes(id.split(':')[0] as SiteId)).length;

  const start = async () => {
    setPhase('running');
    const tabs = new SiteTabs();
    const entries: LogEntry[] = [];
    try {
      const r = await runActionJob(spec, {
        can: (site, action) => CAN[action].includes(site),
        run: async (site, siteChatId, action) => {
          if (action === 'delete') await tabs.send(site, { type: 'content:delete', chatId: siteChatId });
          else await tabs.send(site, { type: 'content:archive', chatId: siteChatId, archived: action === 'archive' });
        },
        title: (id) => byId.get(id)?.title ?? id,
        after: async (chatId, action) => {
          if (action === 'delete' && spec.removeFromLibrary) await lib('removeChats', [chatId]);
          else if (action !== 'delete') await lib('updateChat', chatId, { archived: action === 'archive' ? 1 : 0 });
        },
        log: (e) => {
          entries.push(e);
          setLog([...entries]);
        },
        progress: (done, total, label) => setProg({ done, total, label }),
        gate: () => gate.wait(),
        sleep: (ms) => gate.sleep(ms),
        gapMs: 1200,
      });
      setResult(t(r.stopped ? 'tasks_action_stopped' : 'tasks_action_done', [String(r.ok), String(r.failed), String(r.skipped)]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await tabs.close();
      setPhase('done');
    }
  };

  return (
    <>
      <Section title={spec.title}>
        <p class="callout">{t(`tasks_action_warning_${spec.action}`, String(n))}</p>
        {unsupported ? <p class="muted">{t('tasks_action_unsupported', [String(unsupported), CAN[spec.action].map((s) => SITES[s].name).join(', ')])}</p> : null}
        {spec.action === 'delete' ? <p class="muted">{spec.removeFromLibrary ? t('tasks_delete_library_remove') : t('tasks_delete_library_keep')}</p> : null}
        <h3>{t('tasks_preview', String(n))}</h3>
        <ol class="preview-list">
          {spec.chatIds.map((id) => (
            <li>
              <span>{byId.get(id)?.title ?? id}</span> <span class="site-tag">{SITES[id.split(':')[0] as SiteId]?.name}</span>
            </li>
          ))}
        </ol>
        {phase === 'ready' ? (
          <>
            {needsTypedConfirm(n) ? (
              <div class="field">
                <label for="typed">{t('tasks_type_to_confirm', confirmPhrase(spec.action, n))}</label>
                <input id="typed" type="text" autocomplete="off" value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
              </div>
            ) : null}
            <button class="danger" disabled={!typedOk} onClick={() => void start()}>
              {t(`tasks_action_go_${spec.action}`, String(n))}
            </button>
          </>
        ) : null}
        {phase === 'running' ? <RunControls gate={gate} done={prog.done} total={prog.total} label={prog.label} paused={paused} onPause={setPaused} /> : null}
        {result ? <p class="status" role="status">{result}</p> : null}
        {error ? <p class="status error" role="alert">{error}</p> : null}
      </Section>
      <LogView entries={log} name={`Artifact ${spec.action} log ${new Date().toISOString().slice(0, 10)}`} />
    </>
  );
}
