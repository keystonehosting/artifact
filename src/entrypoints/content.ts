// Core content script for Tier 1 sites. Starts at document_start so it hears
// the page-world hook from the first request, then loads only this site's
// adapter and answers requests from the popup, side panel and background.
// Feature modules (meter, folders...) load on demand once the page is ready.
import { browser } from 'wxt/browser';
import { siteForUrl } from '../core/sites/sites';
import { TIER1_HOST_PERMISSIONS } from '../core/sites/hosts';
import { createAdapter } from '../adapters/registry';
import { defaultContext } from '../adapters/base';
import { isContentMessage, type ContentMessage } from '../core/messaging/protocol';
import { contentHandlers } from '../features/content-handlers';
import { startFeatures } from '../features/runtime';

export default defineContentScript({
  matches: [...TIER1_HOST_PERMISSIONS],
  runAt: 'document_start',
  async main(ctx) {
    const site = siteForUrl(location.href);
    if (!site) return;
    const siteCtx = defaultContext(document);
    const adapter = await createAdapter(site.id, siteCtx);
    if (!adapter) return;
    const handlers = contentHandlers(site, adapter);

    browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
      if (!isContentMessage(msg)) return undefined;
      const handler = handlers[msg.type] as (m: ContentMessage) => Promise<unknown>;
      handler(msg).then(sendResponse, (e: Error) => sendResponse({ error: e.message }));
      return true;
    });

    if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    await startFeatures(site, adapter, ctx);
    ctx.onInvalidated(() => adapter.dispose());
  },
});
