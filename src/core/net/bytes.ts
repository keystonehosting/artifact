// Downloads file bytes. Same-origin URLs are fetched from the content script
// with the user's session. Cross-origin file hosts go through the background,
// which has host permission for them; content scripts are bound by the
// page's CORS rules.
import { browser } from 'wxt/browser';
import { base64ToBytes } from '../util/bytes';
import type { BackgroundRequests } from '../messaging/background';

export interface FetchedBytes {
  bytes: Uint8Array;
  mimeType: string;
}

export async function fetchBytes(url: string, init: RequestInit = {}): Promise<FetchedBytes> {
  const abs = new URL(url, location.href);
  if (abs.origin === location.origin) {
    const res = await fetch(abs.href, { credentials: 'include', ...init });
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${abs.pathname}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }
  const res = (await browser.runtime.sendMessage({ type: 'bg:fetch-bytes', url: abs.href })) as BackgroundRequests['bg:fetch-bytes']['res'];
  if (!res || 'error' in res) throw new Error(res?.error ?? 'Download failed');
  return { bytes: base64ToBytes(res.base64), mimeType: res.mimeType };
}
