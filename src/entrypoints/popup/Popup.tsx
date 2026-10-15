// Toolbar popup: the chat in this tab, quick export in the default format,
// copy as Markdown, open the side panel, and Self-test.
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { Conversation } from '../../core/schema/archive';
import type { SiteHealth } from '../../core/health/health';
import { siteForUrl, type SiteInfo } from '../../core/sites/sites';
import { activeTab, sendToTab } from '../../core/messaging/tabs';
import { buildDocument } from '../../core/export/document';
import { toMarkdown } from '../../core/export/markdown';
import { exportConversation, openPreview, optionsFromSettings } from '../../core/export/runner';
import { loadSettings, type Settings } from '../../core/settings/settings';
import { t } from '../../core/i18n/t';
import { formatDiagnostics } from '../../core/health/diagnostics';
import { activeBranch } from '../../core/model/tree';

type State =
  | { kind: 'loading' }
  | { kind: 'no-site' }
  | { kind: 'not-loaded'; site: SiteInfo }
  | { kind: 'ready'; site: SiteInfo; tabId: number; windowId: number | null; conv: Conversation | null; health: SiteHealth };

const FORMAT_LABEL: Record<string, string> = { md: 'Markdown', txt: 'Text', json: 'JSON', html: 'HTML', docx: 'DOCX', pdf: 'PDF', png: 'PNG' };

export function Popup() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setSettings(await loadSettings());
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const at = await activeTab();
      const site = at ? siteForUrl(at.url) : null;
      if (!at || !site) return setState({ kind: 'no-site' });
      try {
        const res = await sendToTab(at.id, { type: 'content:read' });
        setState({ kind: 'ready', site, tabId: at.id, windowId: tab?.windowId ?? null, conv: res.conversation, health: res.health });
        if (res.error) setStatus({ text: res.error, error: true });
      } catch {
        setState({ kind: 'not-loaded', site });
      }
    })();
  }, []);

  const openPanel = async (windowId: number | null) => {
    // Firefox exposes its sidebar API as browser.sidebarAction; it isn't in the Chrome types.
    if (import.meta.env.BROWSER === 'firefox') await (browser as unknown as { sidebarAction: { open(): Promise<void> } }).sidebarAction.open();
    else if (windowId !== null) await chrome.sidePanel.open({ windowId });
    window.close();
  };

  if (state.kind === 'loading' || !settings) return <div class="popup muted">…</div>;
  if (state.kind === 'no-site')
    return (
      <div class="popup">
        <p>{t('popup_no_site')}</p>
        <button onClick={() => browser.runtime.openOptionsPage()}>{t('tab_settings')}</button>
      </div>
    );
  if (state.kind === 'not-loaded') return <div class="popup">{t('popup_not_loaded')}</div>;

  const { site, conv, health, tabId } = state;
  const count = conv ? activeBranch(conv).filter((m) => !m.hidden).length : 0;
  const fmt = settings.export.defaultFormat;

  const quickExport = async () => {
    if (!conv) return;
    setStatus(null);
    setBusy(true);
    try {
      const opts = optionsFromSettings(settings);
      if (fmt === 'pdf' || fmt === 'png') {
        await openPreview(tabId, conv, opts, fmt);
        return;
      }
      const out = await exportConversation(tabId, conv, fmt, opts);
      setStatus(out.failures.length ? { text: t('export_done_partial', [out.filename, String(out.failures.length)]), error: true } : { text: t('export_done', out.filename) });
    } catch (e) {
      setStatus({ text: t('export_failed', (e as Error).message), error: true });
    } finally {
      setBusy(false);
    }
  };

  const selfTest = async () => {
    const res = await sendToTab(tabId, { type: 'content:selftest' });
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
          <div class="row">
            <button class="primary" disabled={busy} onClick={quickExport}>{t('popup_export_as', FORMAT_LABEL[fmt] ?? fmt)}</button>
            <button onClick={() => navigator.clipboard.writeText(toMarkdown(buildDocument(conv, optionsFromSettings(settings)))).then(() => setStatus({ text: t('export_copied') }))}>
              {t('export_copy_markdown')}
            </button>
          </div>
        </>
      ) : (
        <div class="muted">{t('popup_no_chat')}</div>
      )}
      <div class={`status${status?.error ? ' error' : ''}`} role="status">{status?.text}</div>
      <div class="row">
        <button onClick={() => openPanel(state.windowId)}>{t('menu_open_panel')}</button>
        <button onClick={selfTest}>{t('selftest_run')}</button>
        {report && <button onClick={() => navigator.clipboard.writeText(report)}>{t('selftest_copy')}</button>}
      </div>
      {report && <pre class="report">{report}</pre>}
    </div>
  );
}
