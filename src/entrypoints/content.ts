// Core content script for Tier 1 sites: detects the site, loads its adapter
// and answers requests from the popup, side panel and background. Feature
// modules load on demand from here.
import { browser } from 'wxt/browser';
import { siteForUrl, type SiteInfo } from '../core/sites/sites';
import { TIER1_HOST_PERMISSIONS } from '../core/sites/hosts';
import { createAdapter } from '../adapters/registry';
import { isContentMessage, type ContentMessage, type ContentRequests } from '../core/messaging/protocol';
import type { SiteAdapter } from '../adapters/types';

type Handlers = { [K in keyof ContentRequests]: (msg: Extract<ContentMessage, { type: K }>) => Promise<ContentRequests[K]['res']> };

export function contentHandlers(site: SiteInfo, adapter: SiteAdapter): Handlers {
  return {
    'content:ping': async () => ({ site: site.id, chatId: adapter.detectConversation() }),
    'content:read': async () => {
      try {
        const read = await adapter.readConversation();
        return { conversation: read?.value ?? null, health: adapter.health() };
      } catch (e) {
        return { conversation: null, health: adapter.health(), error: (e as Error).message };
      }
    },
    'content:selftest': async () => ({ site: site.id, health: await adapter.selfTest(), url: location.href }),
    'content:fill': async (msg) => {
      const ok = await adapter.fillComposer(msg.text);
      if (ok && msg.submit) await adapter.submit();
      return { ok };
    },
  };
}

export default defineContentScript({
  matches: [...TIER1_HOST_PERMISSIONS],
  runAt: 'document_idle',
  async main() {
    const site = siteForUrl(location.href);
    if (!site) return;
    const adapter = await createAdapter(site.id);
    if (!adapter) return;
    const handlers = contentHandlers(site, adapter);

    browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
      if (!isContentMessage(msg)) return undefined;
      const handler = handlers[msg.type] as (m: ContentMessage) => Promise<unknown>;
      handler(msg).then(sendResponse, (e: Error) => sendResponse({ error: e.message }));
      return true;
    });
  },
});
