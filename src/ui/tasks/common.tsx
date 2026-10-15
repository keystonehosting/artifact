// Shared pieces of the Tasks page: progress with pause and stop, and the log.
import type { LogEntry } from '../../core/bulk/export-job';
import { logCsv } from '../../core/bulk/action-job';
import { saveFile } from '../../core/export/download';
import { Progress } from '../components';
import { t } from '../../core/i18n/t';
import type { Gate } from './gate';

export function RunControls({ gate, done, total, label, paused, onPause }: { gate: Gate; done: number; total: number; label: string; paused: boolean; onPause(p: boolean): void }) {
  return (
    <div class="run-controls">
      <Progress done={done} total={total} label={label} />
      <div class="row">
        {paused ? (
          <button onClick={() => (gate.resume(), onPause(false))}>{t('run_continue')}</button>
        ) : (
          <button onClick={() => (gate.pause(), onPause(true))}>{t('run_pause')}</button>
        )}
        <button onClick={() => gate.stop()}>{t('tasks_stop_keep')}</button>
      </div>
    </div>
  );
}

export function LogView({ entries, name }: { entries: LogEntry[]; name: string }) {
  if (!entries.length) return null;
  return (
    <section class="section">
      <header class="section-head">
        <h2>{t('tasks_log', String(entries.length))}</h2>
        <div class="row">
          <button onClick={() => void saveFile(`${name}.csv`, logCsv(entries), 'text/csv')}>{t('tasks_log_csv')}</button>
          <button onClick={() => void saveFile(`${name}.json`, JSON.stringify(entries, null, 2), 'application/json')}>{t('tasks_log_json')}</button>
        </div>
      </header>
      <table class="dense">
        <thead>
          <tr>
            <th>{t('tasks_log_time')}</th>
            <th>{t('dash_title')}</th>
            <th>{t('tasks_log_result')}</th>
            <th>{t('tasks_log_detail')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.slice(-300).map((e) => (
            <tr class={e.result}>
              <td class="mono">{e.at.slice(11, 19)}</td>
              <td>{e.title}</td>
              <td>{t(`tasks_result_${e.result}`)}</td>
              <td>{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
