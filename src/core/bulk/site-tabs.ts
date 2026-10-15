// Long jobs (bulk export, bulk actions) talk to each site through a tab of
// that site, so requests carry the user's own session. An open tab is reused;
// otherwise one is opened in the background and closed when the job ends.
import { browser } from 'wxt/browser';
import { SITES, type SiteId } from '../sites/sites';
import type { ContentMessage, ContentRequests } from '../messaging/protocol';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SiteTabs {
  private tabs = new Map<SiteId, number>();
  private opened = new Set<number>();

  private async ready(tabId: number): Promise<boolean> {
    try {
      const r = (await browser.tabs.sendMessage(tabId, { type: 'content:ping' })) as { site?: string } | undefined;
      return !!r?.site;
    } catch {
      return false;
    }
  }

  async tabFor(site: SiteId): Promise<number> {
    const known = this.tabs.get(site);
    if (known !== undefined && (await this.ready(known))) return known;
    for (const t of await browser.tabs.query({ url: SITES[site].matches })) {
      if (t.id !== undefined && (await this.ready(t.id))) {
        this.tabs.set(site, t.id);
        return t.id;
      }
    }
    const tab = await browser.tabs.create({ url: SITES[site].newChatUrl, active: false });
    if (tab.id === undefined) throw new Error(`Couldn't open ${SITES[site].name}`);
    this.opened.add(tab.id);
    for (let i = 0; i < 80; i++) {
      if (await this.ready(tab.id)) {
        this.tabs.set(site, tab.id);
        return tab.id;
      }
      await sleep(250);
    }
    throw new Error(`${SITES[site].name} didn't load in the background tab. Open it, sign in, and try again.`);
  }

  async send<K extends keyof ContentRequests>(site: SiteId, msg: Extract<ContentMessage, { type: K }>): Promise<ContentRequests[K]['res']> {
    const tabId = await this.tabFor(site);
    const res = (await browser.tabs.sendMessage(tabId, msg)) as ContentRequests[K]['res'] & { error?: string };
    if (res && typeof res === 'object' && 'error' in res && res.error && !('health' in res)) throw new Error(res.error);
    return res;
  }

  /** Closes the tabs this job opened. */
  async close(): Promise<void> {
    for (const id of this.opened) await browser.tabs.remove(id).catch(() => undefined);
    this.opened.clear();
    this.tabs.clear();
  }
}
