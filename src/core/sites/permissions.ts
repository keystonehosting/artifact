// Optional host permissions for Tier 2 sites (SPEC §4): requested when the
// user turns a site on, then the core content script is registered for it.
import { browser } from 'wxt/browser';
import { SITES, TIER2_SITES, type SiteId } from './sites';

export async function requestSitePermission(id: SiteId): Promise<boolean> {
  const origins = SITES[id].matches;
  return browser.permissions.request({ origins });
}

export async function hasSitePermission(id: SiteId): Promise<boolean> {
  return browser.permissions.contains({ origins: SITES[id].matches });
}

const scriptId = (id: SiteId) => `artifact-tier2-${id}`;

/**
 * Keeps the core content script registered on exactly the Tier 2 sites that
 * are switched on and whose host permission was granted.
 */
export async function syncTier2Scripts(enabled: Record<string, boolean>): Promise<void> {
  const registered = new Set((await browser.scripting.getRegisteredContentScripts()).map((s) => s.id));
  for (const id of TIER2_SITES) {
    const want = enabled[id] === true && (await hasSitePermission(id));
    const have = registered.has(scriptId(id));
    if (want && !have) {
      await browser.scripting.registerContentScripts([{ id: scriptId(id), matches: SITES[id].matches, js: ['content-scripts/content.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
    } else if (!want && have) {
      await browser.scripting.unregisterContentScripts({ ids: [scriptId(id)] });
    }
  }
}
