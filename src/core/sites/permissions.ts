// Optional host permissions for Tier 2 sites (SPEC §4): requested when the
// user turns a site on, then the core content script is registered for it.
import { browser } from 'wxt/browser';
import { SITES, type SiteId } from './sites';

export async function requestSitePermission(id: SiteId): Promise<boolean> {
  const origins = SITES[id].matches;
  return browser.permissions.request({ origins });
}

export async function hasSitePermission(id: SiteId): Promise<boolean> {
  return browser.permissions.contains({ origins: SITES[id].matches });
}
