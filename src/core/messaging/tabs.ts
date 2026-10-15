import { browser } from 'wxt/browser';
import type { ContentMessage, ContentRequests } from './protocol';

export async function activeTab(): Promise<{ id: number; url: string } | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id !== undefined && tab.url ? { id: tab.id, url: tab.url } : null;
}

/** Sends a request to the content script in `tabId`. Rejects when none is listening. */
export async function sendToTab<K extends keyof ContentRequests>(
  tabId: number,
  msg: Extract<ContentMessage, { type: K }>,
): Promise<ContentRequests[K]['res']> {
  const res = (await browser.tabs.sendMessage(tabId, msg)) as ContentRequests[K]['res'] & { error?: string };
  if (res && typeof res === 'object' && 'error' in res && res.error && !('health' in res)) throw new Error(res.error);
  return res;
}
