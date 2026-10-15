import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { loadSettings, onSettingsChanged, saveSettings, type Settings } from '../../core/settings/settings';
import { siteForUrl, type SiteInfo } from '../../core/sites/sites';
import { sendToTab } from '../../core/messaging/tabs';
import type { Capabilities } from '../../adapters/types';

export function useSettings(): [Settings | null, (fn: (s: Settings) => void) => void] {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    void loadSettings().then(setS);
    return onSettingsChanged(setS);
  }, []);
  const update = (fn: (s: Settings) => void) => {
    if (!s) return;
    const next = structuredClone(s);
    fn(next);
    setS(next);
    void saveSettings(next);
  };
  return [s, update];
}

export interface ActiveTab {
  tabId: number;
  url: string;
  site: SiteInfo | null;
  /** Null when Artifact's content script isn't running in the tab. */
  ready: { chatId: string | null; capabilities: Capabilities } | null;
}

async function describe(tabId: number, url: string): Promise<ActiveTab> {
  const site = siteForUrl(url);
  if (!site) return { tabId, url, site, ready: null };
  try {
    const pong = await sendToTab(tabId, { type: 'content:ping' });
    return { tabId, url, site, ready: { chatId: pong.chatId, capabilities: pong.capabilities } };
  } catch {
    return { tabId, url, site, ready: null };
  }
}

/** The active tab of this window, refreshed on tab switches and navigation. */
export function useActiveTab(): ActiveTab | null {
  const [tab, setTab] = useState<ActiveTab | null>(null);
  useEffect(() => {
    let alive = true;
    // A panel opened as its own tab or window (?tab=<id>) stays bound to that tab.
    const pinned = Number(new URLSearchParams(location.search).get('tab'));
    const refresh = async () => {
      const [t] = pinned ? [await browser.tabs.get(pinned).catch(() => undefined)] : await browser.tabs.query({ active: true, currentWindow: true });
      if (!alive) return;
      if (t?.id === undefined) return setTab(null);
      setTab(await describe(t.id, t.url ?? ''));
    };
    void refresh();
    const onActivated = () => void refresh();
    const onUpdated = (_id: number, info: { url?: string; status?: string }) => {
      if (info.url || info.status === 'complete') void refresh();
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      alive = false;
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
  return tab;
}
