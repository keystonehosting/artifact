// Dashboard: the chat in this tab, its health, plan usage, and the ChatGPT
// local rate-limit widget with an hourly heatmap.
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ActiveTab } from './hooks';
import type { Settings } from '../../core/settings/settings';
import type { Conversation } from '../../core/schema/archive';
import type { SiteHealth } from '../../core/health/health';
import type { UsageReport } from '../../adapters/types';
import { sendToTab } from '../../core/messaging/tabs';
import { Section } from '../components';
import { t } from '../../core/i18n/t';
import { capStatus, hourlyHeatmap, readSendLog, type SendEvent } from '../../features/usage/sendlog';
import { formatDiagnostics } from '../../core/health/diagnostics';
import { activeBranch } from '../../core/model/tree';
import { ThisChat } from './ThisChat';

function when(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => new Date(2024, 0, 7 + d).toLocaleDateString([], { weekday: 'short' }));
  return (
    <div class="heat" role="img" aria-label={t('dash_heatmap_label')}>
      {grid.map((row, d) => [
        <span>{days[d]}</span>,
        ...row.map((v, h) => <i title={`${days[d]} ${h}:00 · ${v}`} style={{ opacity: v ? 0.15 + (0.85 * v) / max : 0.06 }} />),
      ])}
    </div>
  );
}

export function Dashboard({ tab, settings, update }: { tab: ActiveTab | null; settings: Settings; update: (fn: (s: Settings) => void) => void }) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [health, setHealth] = useState<SiteHealth | null>(null);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [log, setLog] = useState<SendEvent[]>([]);
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    setConv(null);
    setUsage(null);
    setReport(null);
    void readSendLog().then(setLog);
    if (!tab?.ready) return;
    void sendToTab(tab.tabId, { type: 'content:read' }).then((r) => {
      setConv(r.conversation);
      setHealth(r.health);
    });
    if (tab.ready.capabilities.usage) void sendToTab(tab.tabId, { type: 'content:usage' }).then((r) => setUsage(r.usage));
  }, [tab?.tabId, tab?.url, tab?.ready?.chatId]);

  const caps = capStatus(log, settings.chatgptCaps);
  const selfTest = async () => {
    if (!tab?.ready) return;
    const r = await sendToTab(tab.tabId, { type: 'content:selftest' });
    setHealth(r.health);
    setReport(formatDiagnostics([{ site: r.site, url: r.url, health: r.health }], browser.runtime.getManifest().version));
  };

  return (
    <div class="content">
      <Section title={tab?.site ? tab.site.name : t('dash_no_site')} aside={health && <span class={`dot ${health.state}`} title={health.reason} />}>
        {!tab?.site && <p class="muted">{t('popup_no_site')}</p>}
        {tab?.site && !tab.ready && <p class="muted">{t('popup_not_loaded')}</p>}
        {conv && (
          <table class="dense">
            <tbody>
              <tr><th>{t('dash_title')}</th><td>{conv.title}</td></tr>
              <tr><th>{t('dash_messages')}</th><td class="num">{activeBranch(conv).filter((m) => !m.hidden).length}</td></tr>
              <tr><th>{t('dash_branches')}</th><td class="num">{Object.values(conv.messages).filter((m) => m.childIds.length === 0).length}</td></tr>
              <tr><th>{t('meter_model')}</th><td>{conv.model ?? t('meter_unknown')}</td></tr>
              <tr><th>{t('dash_files')}</th><td class="num">{conv.attachments.length}</td></tr>
              <tr><th>{t('dash_artifacts')}</th><td class="num">{conv.artifacts.length}</td></tr>
              <tr><th>{t('meter_data_source')}</th><td>{t(`source_${conv.source.method}`)}</td></tr>
            </tbody>
          </table>
        )}
        {health && health.state !== 'healthy' && <p class="callout">{health.reason}</p>}
        {tab?.ready && (
          <div class="row">
            <button onClick={selfTest}>{t('selftest_run')}</button>
            {report && <button onClick={() => navigator.clipboard.writeText(report)}>{t('selftest_copy')}</button>}
          </div>
        )}
        {report && <pre class="report mono">{report}</pre>}
      </Section>

      {tab?.ready?.chatId ? <ThisChat tab={tab} /> : null}

      {usage && (
        <Section title={t('usage_label')}>
          <table class="dense">
            <tbody>
              {usage.windows.map((w) => (
                <tr>
                  <th>{w.label}</th>
                  <td class="num">{w.fraction === null ? '—' : `${Math.round(w.fraction * 100)}%`}</td>
                  <td>{w.resetsAt ? new Date(w.resetsAt).toLocaleString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab?.site?.id === 'chatgpt' && (
        <Section title={t('dash_chatgpt_limits')}>
          {caps.length ? (
            <table class="dense">
              <thead><tr><th>{t('meter_model')}</th><th>{t('dash_used')}</th><th>{t('dash_window')}</th><th>{t('dash_next_free')}</th></tr></thead>
              <tbody>
                {caps.map((c) => (
                  <tr>
                    <td>{c.model === '*' ? t('dash_all_models') : c.model}</td>
                    <td class="num">{c.used}/{c.cap}</td>
                    <td class="num">{c.hours}h</td>
                    <td>{c.used >= c.cap ? when(c.nextFreeAt) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p class="muted">{t('dash_caps_empty')}</p>
          )}
          <CapEditor settings={settings} update={update} />
          <h3 class="muted">{t('dash_heatmap')}</h3>
          <Heatmap grid={hourlyHeatmap(log, 'chatgpt')} />
        </Section>
      )}
    </div>
  );
}

function CapEditor({ settings, update }: { settings: Settings; update: (fn: (s: Settings) => void) => void }) {
  const [model, setModel] = useState('*');
  // No defaults: caps are the user's own numbers, never guessed plan limits.
  const [count, setCount] = useState(0);
  const [hours, setHours] = useState(0);
  return (
    <details>
      <summary>{t('dash_caps_edit')}</summary>
      <p class="hint muted">{t('dash_caps_hint')}</p>
      {settings.chatgptCaps.map((c, i) => (
        <div class="row">
          <span class="mono">{c.model === '*' ? t('dash_all_models') : c.model}: {c.count} / {c.hours}h</span>
          <button onClick={() => update((s) => void s.chatgptCaps.splice(i, 1))}>{t('common_remove')}</button>
        </div>
      ))}
      <div class="row">
        <input type="text" aria-label={t('meter_model')} value={model} onChange={(e) => setModel((e.target as HTMLInputElement).value.trim() || '*')} style={{ width: '9em' }} />
        <input type="number" aria-label={t('dash_cap_count')} value={count || ''} min={1} placeholder={t('dash_cap_count')} onChange={(e) => setCount(Number((e.target as HTMLInputElement).value))} style={{ width: '5em' }} />
        <span class="muted">/</span>
        <input type="number" aria-label={t('dash_cap_hours')} value={hours || ''} min={0.5} step={0.5} placeholder={t('dash_cap_hours')} onChange={(e) => setHours(Number((e.target as HTMLInputElement).value))} style={{ width: '4.5em' }} />
        <span class="muted">h</span>
        <button onClick={() => count > 0 && hours > 0 && update((s) => void s.chatgptCaps.push({ model, count, hours }))}>{t('common_add')}</button>
      </div>
    </details>
  );
}
