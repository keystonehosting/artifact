// Calls the background's library API from any extension context.
import { browser } from 'wxt/browser';
import type { LibraryApi } from './api';

export async function lib<K extends keyof LibraryApi>(fn: K, ...args: Parameters<LibraryApi[K]>): Promise<Awaited<ReturnType<LibraryApi[K]>>> {
  const res = (await browser.runtime.sendMessage({ type: 'lib:call', fn, args })) as { ok: true; value: Awaited<ReturnType<LibraryApi[K]>> } | { ok: false; error: string } | undefined;
  if (!res) throw new Error('Artifact background did not answer');
  if (!res.ok) throw new Error(res.error);
  return res.value;
}
