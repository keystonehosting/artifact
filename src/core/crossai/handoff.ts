// Starting a handoff from a page or the side panel: builds the summary,
// opens the destination with the seed waiting in its composer, and keeps
// the last 20 handoffs.
import { browser } from 'wxt/browser';
import type { Conversation } from '../schema/archive';
import { SITES, type SiteId, type Tier1SiteId } from '../sites/sites';
import { backgroundCount } from '../tokenizer/client';
import { lib } from '../library/client';
import { handoffSeed, localHandoff } from './carry';

/** o200k counts from the background worker; a length estimate only if the worker is unavailable. */
async function count(text: string): Promise<number> {
  try {
    return (await backgroundCount([text]))[0]!;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

export function localHandoffText(conv: Conversation, budget: number): Promise<string> {
  return localHandoff(conv, { siteName: SITES[conv.site]?.name ?? conv.site, budget, count });
}

export async function sendHandoff(o: { conv: Conversation | null; fromSite: SiteId; target: Tier1SiteId; mode: 'local' | 'chat' | 'api'; summary: string; autoSend: boolean }): Promise<void> {
  const from = { title: o.conv?.title ?? '', siteName: SITES[o.fromSite]?.name ?? o.fromSite };
  const seed = handoffSeed(o.summary, from, o.target !== o.fromSite);
  await browser.runtime.sendMessage({ type: 'bg:open-with-fill', site: o.target, text: seed, autoSend: o.autoSend });
  await lib('addHandoff', { fromChatId: o.conv?.id ?? null, fromTitle: from.title, fromSite: o.fromSite, targetSite: o.target, mode: o.mode, text: seed });
}
