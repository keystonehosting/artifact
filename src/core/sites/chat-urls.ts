// Chat ids in site URLs, shared by the adapters, the folder tree and the
// side panel (drag a chat link from any site onto a folder).
import { SITES, siteForUrl, type SiteId, type Tier2SiteId } from './sites';

export function chatgptChatId(url: URL): string | null {
  const m = /\/c\/([0-9a-f-]{8,})/i.exec(url.pathname);
  return m ? m[1]! : null;
}

export function claudeChatId(url: URL): string | null {
  const m = /^\/chat\/([0-9a-f-]{36})/i.exec(url.pathname);
  return m ? m[1]! : null;
}

export function geminiChatId(url: URL): string | null {
  const m = /^\/(?:u\/\d+\/)?(?:app|gem\/[^/]+)\/([0-9a-z_]{8,})/i.exec(url.pathname);
  if (!m) return null;
  return m[1]!.startsWith('c_') ? m[1]! : `c_${m[1]}`;
}

export function aistudioChatId(url: URL): string | null {
  const m = /^\/(?:u\/\d+\/)?prompts\/([\w-]+)/.exec(url.pathname);
  if (!m || m[1] === 'new_chat') return null;
  return m[1]!;
}

export function grokChatId(url: URL): string | null {
  const m = /^\/c\/([0-9a-f-]{8,})/i.exec(url.pathname);
  if (m) return m[1]!;
  return url.searchParams.get('chat');
}

const PARSERS: Partial<Record<SiteId, (url: URL) => string | null>> = {
  chatgpt: chatgptChatId,
  claude: claudeChatId,
  gemini: geminiChatId,
  aistudio: aistudioChatId,
  grok: grokChatId,
};

/**
 * Tier 2 chat ids are the page path (minus the site's prefix), which is
 * stable per chat without assuming each site's id format. The new-chat page
 * and Google AI Mode (no per-chat URL) have none.
 */
export function tier2ChatId(site: Tier2SiteId, url: URL): string | null {
  if (site === 'aimode') return null;
  const info = SITES[site];
  let path = url.pathname.replace(/\/+$/, '');
  if (info.pathPrefix) path = path.slice(info.pathPrefix.length);
  const fresh = new URL(info.newChatUrl).pathname.replace(/\/+$/, '');
  if (!path || path === fresh.slice(info.pathPrefix?.length ?? 0)) return null;
  return path.replace(/^\//, '');
}

/** Library id (`site:chatId`) for a chat URL on a supported site, or null. */
export function libraryIdForUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const site = siteForUrl(url.href);
    const id = site && (PARSERS[site.id] ? PARSERS[site.id]!(url) : site.tier === 2 ? tier2ChatId(site.id as Tier2SiteId, url) : null);
    return site && id ? `${site.id}:${id}` : null;
  } catch {
    return null;
  }
}
