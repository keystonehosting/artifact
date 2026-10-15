// Background: context menus, byte downloads from file hosts, and the
// tokenizer host. Later milestones add indexing, queues, alarms and backups.
import { browser } from 'wxt/browser';
import { t } from '../core/i18n/t';
import { siteForUrl } from '../core/sites/sites';
import { TIER1_ASSET_HOST_PERMISSIONS, TIER1_HOST_PERMISSIONS } from '../core/sites/hosts';
import { buildDocument } from '../core/export/document';
import { toMarkdown } from '../core/export/markdown';
import { formatFilename } from '../core/util/filename';
import { bytesToBase64 } from '../core/util/bytes';
import { isBackgroundMessage, type BackgroundMessage } from '../core/messaging/background';
import type { ContentRequests } from '../core/messaging/protocol';
import { WorkerTokenizer } from '../core/tokenizer/host';
import { hostAllowed } from '../core/net/hosts';

const MENU_EXPORT_MD = 'artifact-export-md';
const MENU_OPEN_PANEL = 'artifact-open-panel';
const MAX_BYTES = 200 * 1024 * 1024;

const isFirefox = import.meta.env.BROWSER === 'firefox';
let firefoxTokenizer: WorkerTokenizer | null = null;
let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (contexts.length) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({ url: 'tokenizer.html', reasons: [chrome.offscreen.Reason.WORKERS], justification: 'Count tokens in a worker without blocking pages.' })
    .finally(() => {
      creatingOffscreen = null;
    });
  await creatingOffscreen;
}

async function tokenize(texts: string[]): Promise<number[]> {
  if (isFirefox) {
    firefoxTokenizer ??= new WorkerTokenizer(() => new Worker(browser.runtime.getURL('/tokenizer-worker.js')));
    return firefoxTokenizer.count(texts);
  }
  await ensureOffscreen();
  const res = (await browser.runtime.sendMessage({ type: 'offscreen:tokenize', texts })) as { counts?: number[]; error?: string };
  if (!res?.counts) throw new Error(res?.error ?? 'tokenizer unavailable');
  return res.counts;
}

async function fetchBytes(url: string): Promise<{ base64: string; mimeType: string } | { error: string }> {
  if (!hostAllowed(url, [...TIER1_ASSET_HOST_PERMISSIONS, ...TIER1_HOST_PERMISSIONS])) return { error: 'Host not allowed for downloads' };
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return { error: 'File too large' };
  return { base64: bytesToBase64(buf), mimeType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

async function handle(msg: BackgroundMessage | { type: 'bg:tokenize'; texts: string[] }): Promise<unknown> {
  switch (msg.type) {
    case 'bg:fetch-bytes':
      return fetchBytes(msg.url);
    case 'bg:tokenize':
      return { counts: await tokenize(msg.texts) };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: MENU_EXPORT_MD, title: t('menu_export_markdown'), contexts: ['page'], documentUrlPatterns: [...TIER1_HOST_PERMISSIONS] });
      if (!isFirefox) browser.contextMenus.create({ id: MENU_OPEN_PANEL, title: t('menu_open_panel'), contexts: ['page', 'action'] });
    });
  });

  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    const m = msg as { type?: string; texts?: unknown };
    const ok = isBackgroundMessage(msg) || (m?.type === 'bg:tokenize' && Array.isArray(m.texts));
    if (!ok) return undefined;
    handle(msg as BackgroundMessage).then(sendResponse, (e: Error) => sendResponse({ error: e.message }));
    return true;
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_OPEN_PANEL && tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    }
    if (info.menuItemId !== MENU_EXPORT_MD || tab?.id === undefined || !tab.url) return;
    const site = siteForUrl(tab.url);
    if (!site) return;
    const res = (await browser.tabs.sendMessage(tab.id, { type: 'content:read' })) as ContentRequests['content:read']['res'];
    if (!res?.conversation) return;
    const md = toMarkdown(buildDocument(res.conversation));
    const name = `${formatFilename(undefined, { platform: site.name, title: res.conversation.title })}.md`;
    await browser.downloads.download({ url: `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`, filename: name, conflictAction: 'uniquify' });
  });
});
