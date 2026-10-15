// Side-panel helpers for the library: data that refreshes when the background
// reports a change, and opening a chat (and message) in a site tab.
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { lib } from '../../core/library/client';
import type { LibraryApi } from '../../core/library/api';
import { sendToTab } from '../../core/messaging/tabs';
import { siteForUrl } from '../../core/sites/sites';

/** Calls a library read and re-runs it whenever the library changes. */
export function useLib<K extends keyof LibraryApi>(fn: K, args: Parameters<LibraryApi[K]>, deps: unknown[] = []): [Awaited<ReturnType<LibraryApi[K]>> | null, () => void, string] {
  const [value, setValue] = useState<Awaited<ReturnType<LibraryApi[K]>> | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    lib(fn, ...args).then(
      (v) => {
        if (!alive) return;
        setValue(v);
        setError('');
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [tick, ...deps]);
  useEffect(() => {
    const on = (m: unknown) => {
      if ((m as { type?: string })?.type === 'lib:changed') setTick((n) => n + 1);
    };
    browser.runtime.onMessage.addListener(on);
    return () => browser.runtime.onMessage.removeListener(on);
  }, []);
  return [value, () => setTick((n) => n + 1), error];
}

function waitForLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      browser.tabs.onUpdated.removeListener(on);
      clearTimeout(timer);
      resolve();
    };
    const on = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, 20_000);
    browser.tabs.onUpdated.addListener(on);
  });
}

/**
 * Opens a stored chat. A tab already on that chat's site navigates in place
 * (the content script finishes the jump); otherwise a new tab opens and the
 * jump is sent once Artifact is running there.
 */
export async function openChat(chat: { id: string; url: string | null }, messageId: string | null = null): Promise<void> {
  if (!chat.url) throw new Error('This chat has no address on the site');
  const site = chat.id.slice(0, chat.id.indexOf(':'));
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== undefined && active.url && siteForUrl(active.url)?.id === site) {
    try {
      await sendToTab(active.id, { type: 'content:jump', chatId: chat.id, messageId, url: chat.url });
      return;
    } catch {
      // No content script in that tab yet: fall through to a plain navigation.
    }
    await browser.tabs.update(active.id, { url: chat.url });
    return;
  }
  const tab = await browser.tabs.create({ url: chat.url });
  if (!messageId || tab.id === undefined) return;
  await waitForLoad(tab.id);
  for (let i = 0; i < 10; i++) {
    try {
      await sendToTab(tab.id, { type: 'content:jump', chatId: chat.id, messageId, url: chat.url });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

export function fmtDate(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}
