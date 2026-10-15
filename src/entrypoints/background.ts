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
import { LIBRARY_API, type LibraryApi } from '../core/library/api';
import { db } from '../core/db/db';
import type { Conversation } from '../core/schema/archive';
import { loadSettings } from '../core/settings/settings';
import { openPreview } from '../core/export/preview';
import { optionsFromSettings } from '../core/export/options';
import { broadcast, getJob, notifyFinished, onFinishedClick, onPromptMenu, openWithFill, rebuildPromptMenu, takeFill } from '../core/crossai/hub';

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
    .createDocument({
      url: 'tokenizer.html',
      reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Count tokens in a worker without blocking pages, and copy exports from keyboard commands.',
    })
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

async function copyText(text: string): Promise<boolean> {
  if (isFirefox) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  await ensureOffscreen();
  const res = (await browser.runtime.sendMessage({ type: 'offscreen:copy', text })) as { ok?: boolean };
  return res?.ok === true;
}

async function activeTabInfo(): Promise<{ id?: number; index?: number; windowId?: number } | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab ? { id: tab.id, index: tab.index, windowId: tab.windowId } : undefined;
}

async function readActiveChat(): Promise<{ tabId: number; conv: Conversation; windowId: number } | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url || !siteForUrl(tab.url)) return null;
  const res = (await browser.tabs.sendMessage(tab.id, { type: 'content:read' })) as ContentRequests['content:read']['res'];
  return res?.conversation ? { tabId: tab.id, conv: res.conversation, windowId: tab.windowId } : null;
}

async function onCommand(command: string): Promise<void> {
  if (command === 'open-panel') {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (isFirefox) await (browser as unknown as { sidebarAction: { open(): Promise<void> } }).sidebarAction.open();
    else if (tab?.windowId !== undefined) await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (command === 'find-in-chat' || command === 'privacy-blur') {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || !tab.url || !siteForUrl(tab.url)) return;
    await browser.tabs.sendMessage(tab.id, command === 'find-in-chat' ? { type: 'content:find' } : { type: 'content:blur' }).catch(() => undefined);
    return;
  }
  const chat = await readActiveChat();
  if (!chat) return;
  const settings = await loadSettings();
  const opts = optionsFromSettings(settings);
  if (command === 'copy-markdown') await copyText(toMarkdown(buildDocument(chat.conv, opts)));
  else if (command === 'open-preview') await openPreview(chat.tabId, chat.conv, opts, 'view');
  else if (command === 'export-chat') {
    const md = toMarkdown(buildDocument(chat.conv, opts));
    const name = `${formatFilename(opts.filenameTemplate, { platform: siteForUrl(chat.conv.url ?? '')?.name ?? 'AI', title: chat.conv.title, model: chat.conv.model, id: chat.conv.siteChatId })}.md`;
    await browser.downloads.download({ url: `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`, filename: name, conflictAction: 'uniquify' });
  }
}

// Library calls that change nothing; every other call tells open views to refresh.
const READ_ONLY = new Set<keyof LibraryApi>(['search', 'conversation', 'chat', 'chats', 'chatsById', 'stats', 'folderTree', 'chatsInFolder', 'breadcrumbs', 'foldersOfChat', 'tags', 'rules', 'labels', 'bookmarks', 'highlights', 'note', 'notes', 'reminders', 'favorites', 'kvGet', 'kvSet', 'prompts', 'prompt', 'promptOfTheDay', 'exportPrompts', 'chains', 'chain', 'promptFiles', 'promptFilesData', 'history', 'handoffs', 'draft', 'setDraft', 'addHistory']);
let changeTimer: ReturnType<typeof setTimeout> | undefined;

function notifyChanged(): void {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    const msg = { type: 'lib:changed' };
    void browser.runtime.sendMessage(msg).catch(() => undefined);
    void browser.tabs.query({ url: [...TIER1_HOST_PERMISSIONS] }).then((tabs) => {
      for (const tab of tabs) if (tab.id !== undefined) void browser.tabs.sendMessage(tab.id, msg).catch(() => undefined);
    });
  }, 250);
}

async function fireReminders(): Promise<void> {
  const due = await db().reminders.where('dueAt').belowOrEqual(Date.now()).filter((r) => r.done === 0).toArray();
  for (const r of due) {
    const chat = await db().chats.get(r.chatId);
    await browser.notifications.create(`reminder:${r.chatId}|${r.id}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icons/icon128.png'),
      title: t('reminder_title', chat?.title ?? 'Chat'),
      message: r.note || t('reminder_default'),
    });
    await db().reminders.update(r.id, { done: 1 });
  }
}

async function fetchBytes(url: string): Promise<{ base64: string; mimeType: string } | { error: string }> {
  if (!hostAllowed(url, [...TIER1_ASSET_HOST_PERMISSIONS, ...TIER1_HOST_PERMISSIONS])) return { error: 'Host not allowed for downloads' };
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return { error: 'File too large' };
  return { base64: bytesToBase64(buf), mimeType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

type Sender = { tab?: { id?: number; index?: number; windowId?: number } };

async function handle(msg: BackgroundMessage | { type: 'bg:tokenize'; texts: string[] }, sender: Sender): Promise<unknown> {
  const tab = sender.tab;
  switch (msg.type) {
    case 'bg:fetch-bytes':
      return fetchBytes(msg.url);
    case 'bg:take-fill':
      return { fill: tab?.id !== undefined ? await takeFill(tab.id) : null };
    case 'bg:open-with-fill':
      return { tabId: await openWithFill(msg.site, { text: msg.text, autoSend: msg.autoSend }, tab ?? (await activeTabInfo())) };
    case 'bg:broadcast':
      return { job: await broadcast(msg.sites, msg.text, msg.autoSend, tab ?? (await activeTabInfo())) };
    case 'bg:job':
      return { job: await getJob(msg.id) };
    case 'bg:reply-finished':
      if (tab?.id !== undefined) await notifyFinished(tab.id, msg.title, msg.seconds);
      return { ok: true };
    case 'bg:tokenize':
      return { counts: await tokenize(msg.texts) };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: MENU_EXPORT_MD, title: t('menu_export_markdown'), contexts: ['page'], documentUrlPatterns: [...TIER1_HOST_PERMISSIONS] });
      if (!isFirefox) browser.contextMenus.create({ id: MENU_OPEN_PANEL, title: t('menu_open_panel'), contexts: ['page', 'action'] });
      rebuildPromptMenu();
    });
  });
  browser.runtime.onStartup.addListener(() => rebuildPromptMenu());

  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    const m = msg as { type?: string; texts?: unknown; fn?: string; args?: unknown[] };
    if (m?.type === 'lib:call' && typeof m.fn === 'string' && m.fn in LIBRARY_API) {
      const fn = LIBRARY_API[m.fn as keyof LibraryApi] as (...a: unknown[]) => Promise<unknown>;
      fn(...(Array.isArray(m.args) ? m.args : [])).then(
        (value) => {
          if (!READ_ONLY.has(m.fn as keyof LibraryApi)) notifyChanged();
          if (m.fn && /prompt|Starter/i.test(m.fn)) rebuildPromptMenu();
          sendResponse({ ok: true, value });
        },
        (e: Error) => sendResponse({ ok: false, error: e.message }),
      );
      return true;
    }
    const ok = isBackgroundMessage(msg) || (m?.type === 'bg:tokenize' && Array.isArray(m.texts));
    if (!ok) return undefined;
    handle(msg as BackgroundMessage, sender).then(sendResponse, (e: Error) => sendResponse({ error: e.message }));
    return true;
  });

  browser.commands.onCommand.addListener((command) => void onCommand(command));

  // Continue-later reminders: checked every minute while the browser runs.
  void browser.alarms.create('artifact-reminders', { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === 'artifact-reminders') void fireReminders();
  });
  browser.notifications?.onClicked.addListener((id) => {
    if (onFinishedClick(id) || !id.startsWith('reminder:')) return;
    void db().chats.get(id.slice('reminder:'.length).split('|')[0]!).then((c) => {
      if (c?.url) void browser.tabs.create({ url: c.url });
    });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (await onPromptMenu(info, tab)) return;
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
