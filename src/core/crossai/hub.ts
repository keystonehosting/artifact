// Background side of cross-AI features (SPEC §6D, §6I): opening a site with
// text waiting for its composer (handoff, broadcast, right-click prompts),
// broadcast jobs for the compare view, the right-click prompt menu, and the
// notification when a long reply finishes in a background tab.
import { browser } from 'wxt/browser';
import { SITES, siteForUrl, type Tier1SiteId } from '../sites/sites';
import { listPrompts } from '../prompts/service';
import { loadSettings } from '../settings/settings';
import { t } from '../i18n/t';

/** Text (or a saved prompt) waiting for a tab's composer. Never sent unless `autoSend`. */
export interface PendingFill {
  text?: string;
  promptId?: string;
  selection?: string;
  autoSend: boolean;
  at: number;
}

export interface BroadcastJob {
  id: string;
  text: string;
  at: number;
  tabs: Array<{ site: Tier1SiteId; tabId: number }>;
}

const FILL_TTL = 3 * 60_000;
const fillKey = (tabId: number) => `fill:${tabId}`;
const jobKey = (id: string) => `broadcast:${id}`;

// storage.session survives the service worker restarting but not the browser.
const store = browser.storage.session ?? browser.storage.local;

// A new tab can load and ask for its fill before the fill is stored; askers wait for opens in flight.
let opening: Promise<unknown> = Promise.resolve();

export function openWithFill(site: Tier1SiteId, fill: Omit<PendingFill, 'at'>, opener?: { id?: number; index?: number; windowId?: number }): Promise<number> {
  const run = open(site, fill, opener);
  opening = Promise.allSettled([opening, run]);
  return run;
}

async function open(site: Tier1SiteId, fill: Omit<PendingFill, 'at'>, opener?: { id?: number; index?: number; windowId?: number }): Promise<number> {
  const tab = await browser.tabs.create({
    url: SITES[site].newChatUrl,
    active: true,
    ...(opener?.index !== undefined ? { index: opener.index + 1 } : {}),
    ...(opener?.windowId !== undefined ? { windowId: opener.windowId } : {}),
    ...(opener?.id !== undefined ? { openerTabId: opener.id } : {}),
  });
  if (tab.id === undefined) throw new Error('The browser did not open a tab');
  await store.set({ [fillKey(tab.id)]: { ...fill, at: Date.now() } satisfies PendingFill });
  return tab.id;
}

export async function takeFill(tabId: number): Promise<PendingFill | null> {
  await opening;
  const key = fillKey(tabId);
  const got = (await store.get(key))[key] as PendingFill | undefined;
  if (!got) return null;
  await store.remove(key);
  return Date.now() - got.at < FILL_TTL ? got : null;
}

export async function broadcast(sites: Tier1SiteId[], text: string, autoSend: boolean, opener?: { id?: number; index?: number; windowId?: number }): Promise<BroadcastJob> {
  if (!text.trim()) throw new Error('Nothing to send');
  if (!sites.length) throw new Error('Pick at least one site');
  const job: BroadcastJob = { id: crypto.randomUUID(), text, at: Date.now(), tabs: [] };
  let index = opener?.index;
  for (const site of sites) {
    const tabId = await openWithFill(site, { text, autoSend }, { ...opener, index });
    job.tabs.push({ site, tabId });
    if (index !== undefined) index++;
  }
  await store.set({ [jobKey(job.id)]: job });
  await browser.tabs.create({ url: browser.runtime.getURL(`/compare.html?job=${job.id}`), ...(index !== undefined ? { index: index + 1 } : {}) });
  return job;
}

export async function getJob(id: string): Promise<BroadcastJob | null> {
  return ((await store.get(jobKey(id)))[jobKey(id)] as BroadcastJob | undefined) ?? null;
}

// ---------- right-click prompts ----------

export const MENU_PROMPTS = 'artifact-prompts';
const MENU_PROMPT_PREFIX = 'artifact-prompt:';
const MENU_LIMIT = 12;

let menuTimer: ReturnType<typeof setTimeout> | undefined;

/** Rebuilds "Run a prompt on the selection" with the favorite and most used prompts. */
export function rebuildPromptMenu(): void {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(() => void buildMenu(), 300);
}

async function buildMenu(): Promise<void> {
  const prompts = (await listPrompts('used')).sort((a, b) => b.favorite - a.favorite).slice(0, MENU_LIMIT);
  await browser.contextMenus.remove(MENU_PROMPTS).catch(() => undefined);
  if (!prompts.length) return;
  browser.contextMenus.create({ id: MENU_PROMPTS, title: t('menu_prompts'), contexts: ['selection'] });
  for (const p of prompts) browser.contextMenus.create({ id: `${MENU_PROMPT_PREFIX}${p.id}`, parentId: MENU_PROMPTS, title: p.name.slice(0, 60), contexts: ['selection'] });
}

/** Handles a click on a prompt in the selection menu. Returns false for other menu items. */
export async function onPromptMenu(info: { menuItemId: string | number; selectionText?: string }, tab?: { id?: number; url?: string; index?: number; windowId?: number }): Promise<boolean> {
  const id = String(info.menuItemId);
  if (!id.startsWith(MENU_PROMPT_PREFIX)) return false;
  const promptId = id.slice(MENU_PROMPT_PREFIX.length);
  const selection = (info.selectionText ?? '').trim();
  // On an AI site, insert into this chat; anywhere else, open a new chat on the chosen site.
  if (tab?.id !== undefined && tab.url && siteForUrl(tab.url)?.tier === 1) {
    const ok = await browser.tabs.sendMessage(tab.id, { type: 'content:insert-prompt', promptId, selection }).then(
      () => true,
      () => false,
    );
    if (ok) return true;
  }
  const s = await loadSettings();
  await openWithFill(s.prompts.target, { promptId, selection, autoSend: false }, tab);
  return true;
}

// ---------- reply finished ----------

const FINISHED = 'finished:';

export async function notifyFinished(tabId: number, title: string, seconds: number): Promise<void> {
  await browser.notifications.create(`${FINISHED}${tabId}`, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icons/icon128.png'),
    title: t('finished_title'),
    message: t('finished_message', [title || t('finished_untitled'), String(seconds)]),
  });
}

export function onFinishedClick(notificationId: string): boolean {
  if (!notificationId.startsWith(FINISHED)) return false;
  const tabId = Number(notificationId.slice(FINISHED.length));
  void browser.tabs.update(tabId, { active: true }).then((tab) => {
    if (tab?.windowId !== undefined) void browser.windows.update(tab.windowId, { focused: true });
  });
  void browser.notifications.clear(notificationId);
  return true;
}
