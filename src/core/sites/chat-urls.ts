// Chat ids in site URLs, shared by the adapters, the folder tree and the
// side panel (drag a chat link from any site onto a folder).
import { siteForUrl, type SiteId } from './sites';

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

/** Library id (`site:chatId`) for a chat URL on a Tier 1 site, or null. */
export function libraryIdForUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const site = siteForUrl(url.href);
    const id = site && PARSERS[site.id]?.(url);
    return site && id ? `${site.id}:${id}` : null;
  } catch {
    return null;
  }
}
