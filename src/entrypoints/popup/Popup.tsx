import { useEffect, useState } from 'preact/hooks';
import type { Conversation } from '../../core/schema/archive';
import type { SiteHealth } from '../../core/health/health';
import { siteForUrl, type SiteInfo } from '../../core/sites/sites';
import { activeTab, sendToTab } from '../../core/messaging/tabs';
import { buildDocument } from '../../core/export/document';
import { toMarkdown } from '../../core/export/markdown';
import { toText } from '../../core/export/text';
import { buildArchive, toJson } from '../../core/export/json';
import { formatFilename } from '../../core/util/filename';
import { saveFile } from '../../core/export/download';
import { t } from '../../core/i18n/t';
import { formatDiagnostics } from '../../core/health/diagnostics';
import { browser } from 'wxt/browser';

type State =
  | { kind: 'loading' }
  | { kind: 'no-site' }
  | { kind: 'not-loaded'; site: SiteInfo }
  | { kind: 'ready'; site: SiteInfo; tabId: number; conv: Conversation | null; health: SiteHealth };

export function Popup() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const tab = await activeTab();
      const site = tab ? siteForUrl(tab.url) : null;
      if (!tab || !site) return setState({ kind: 'no-site' });
      try {
        const res = await sendToTab(tab.id, { type: 'content:read' });
        setState({ kind: 'ready', site, tabId: tab.id, conv: res.conversation, health: res.health });
        if (res.error) setStatus({ text: res.error, error: true });
      } catch {
        setState({ kind: 'not-loaded', site });
      }
    })();
  }, []);

  if (state.kind === 'loading') return <div class="popup muted">…</div>;
  if (state.kind === 'no-site') return <div class="popup">{t('popup_no_site')}</div>;
  if (state.kind === 'not-loaded') return <div class="popup">{t('popup_not_loaded')}</div>;

  const { site, conv, health } = state;
  const count = conv ? Object.values(conv.messages).filter((m) => !m.hidden).length : 0;

  const run = async (format: 'md' | 'txt' | 'json' | 'copy') => {
    if (!conv) return;
    setStatus(null);
    try {
      const doc = buildDocument(conv);
      const base = formatFilename(undefined, { platform: site.name, title: conv.title, model: conv.model, id: conv.siteChatId });
      if (format === 'copy') {
        await navigator.clipboard.writeText(toMarkdown(doc));
        return setStatus({ text: t('export_copied') });
      }
      const version = browser.runtime.getManifest().version;
      const [body, ext, mime] =
        format === 'md'
          ? [toMarkdown(doc), 'md', 'text/markdown']
          : format === 'txt'
            ? [toText(doc), 'txt', 'text/plain']
            : [toJson(buildArchive([conv], version)), 'json', 'application/json'];
      await saveFile(`${base}.${ext}`, body, mime);
      setStatus({ text: t('export_done', `${base}.${ext}`) });
    } catch (e) {
      setStatus({ text: t('export_failed', (e as Error).message), error: true });
    }
  };

  const selfTest = async () => {
    const res = await sendToTab(state.tabId, { type: 'content:selftest' });
    setReport(formatDiagnostics([{ site: res.site, url: res.url, health: res.health }], browser.runtime.getManifest().version));
  };

  return (
    <div class="popup">
      <div class="head">
        <span class={`dot ${health.state}`} title={t('health_reason', [t(`health_${health.state}`), health.reason])} />
        <h1>{site.name}</h1>
        <span class="muted mono">{conv ? t('popup_messages', String(count)) : ''}</span>
      </div>
      {conv ? (
        <>
          <div class="title" title={conv.title}>{conv.title}</div>
          {conv.source.approximate && <div class="muted">{t('popup_approximate')}</div>}
          <div class="section-label">{t('export_heading')}</div>
          <div class="row">
            <button class="primary" onClick={() => run('md')}>{t('export_markdown')}</button>
            <button onClick={() => run('txt')}>{t('export_text')}</button>
            <button onClick={() => run('json')}>{t('export_json')}</button>
            <button onClick={() => run('copy')}>{t('export_copy_markdown')}</button>
          </div>
        </>
      ) : (
        <div class="muted">{t('popup_no_chat')}</div>
      )}
      <div class={`status${status?.error ? ' error' : ''}`} role="status">{status?.text}</div>
      <div class="row">
        <button onClick={selfTest}>{t('selftest_run')}</button>
        {report && <button onClick={() => navigator.clipboard.writeText(report)}>{t('selftest_copy')}</button>}
      </div>
      {report && <pre class="report">{report}</pre>}
    </div>
  );
}
