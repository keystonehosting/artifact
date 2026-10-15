// Hands a conversation to the preview tab through session storage. Kept
// separate from the runner so the background can open previews cheaply.
import { browser } from 'wxt/browser';
import type { Conversation } from '../schema/archive';
import type { ExportOptions } from './document';

const PREVIEW_PREFIX = 'preview:';

/** Hands a conversation to the preview tab through session storage. */
export async function openPreview(tabId: number | null, conv: Conversation, options: ExportOptions, action: 'view' | 'pdf' | 'png' | 'png2x'): Promise<void> {
  const key = `${PREVIEW_PREFIX}${crypto.randomUUID()}`;
  await browser.storage.session.set({ [key]: { conv, options } });
  const q = new URLSearchParams({ key, action });
  if (tabId !== null) q.set('tab', String(tabId));
  await browser.tabs.create({ url: browser.runtime.getURL(`/preview.html?${q}`) });
}

export async function takePreview(key: string): Promise<{ conv: Conversation; options: ExportOptions } | null> {
  if (!key.startsWith(PREVIEW_PREFIX)) return null;
  const got = await browser.storage.session.get(key);
  await browser.storage.session.remove(key);
  return (got[key] as { conv: Conversation; options: ExportOptions } | undefined) ?? null;
}
