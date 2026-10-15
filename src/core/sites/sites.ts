export const TIER1_SITES = ['chatgpt', 'claude', 'gemini', 'aistudio', 'grok'] as const;
export const TIER2_SITES = [
  'perplexity',
  'deepseek',
  'mistral',
  'kimi',
  'poe',
  'copilot',
  'ghcopilot',
  'aimode',
] as const;
export const ALL_SITES = [...TIER1_SITES, ...TIER2_SITES] as const;

export type Tier1SiteId = (typeof TIER1_SITES)[number];
export type Tier2SiteId = (typeof TIER2_SITES)[number];
export type SiteId = (typeof ALL_SITES)[number];

export interface SiteInfo {
  id: SiteId;
  name: string;
  tier: 1 | 2;
  /** Hostnames the site is served from. */
  hosts: string[];
  /** Optional path prefix that must also match (GitHub Copilot, Google AI Mode). */
  pathPrefix?: string;
  /** Required query parameter (Google AI Mode uses udm=50 on /search). */
  query?: { key: string; value: string };
  newChatUrl: string;
  /** Match patterns for host permissions and dynamic content-script registration. */
  matches: string[];
}

export const SITES: Record<SiteId, SiteInfo> = {
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    tier: 1,
    hosts: ['chatgpt.com', 'chat.openai.com'],
    newChatUrl: 'https://chatgpt.com/',
    matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    tier: 1,
    hosts: ['claude.ai'],
    newChatUrl: 'https://claude.ai/new',
    matches: ['https://claude.ai/*'],
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    tier: 1,
    hosts: ['gemini.google.com'],
    newChatUrl: 'https://gemini.google.com/app',
    matches: ['https://gemini.google.com/*'],
  },
  aistudio: {
    id: 'aistudio',
    name: 'Google AI Studio',
    tier: 1,
    hosts: ['aistudio.google.com'],
    newChatUrl: 'https://aistudio.google.com/prompts/new_chat',
    matches: ['https://aistudio.google.com/*'],
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    tier: 1,
    hosts: ['grok.com'],
    newChatUrl: 'https://grok.com/',
    matches: ['https://grok.com/*'],
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    tier: 2,
    hosts: ['www.perplexity.ai', 'perplexity.ai'],
    newChatUrl: 'https://www.perplexity.ai/',
    matches: ['https://www.perplexity.ai/*'],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    tier: 2,
    hosts: ['chat.deepseek.com'],
    newChatUrl: 'https://chat.deepseek.com/',
    matches: ['https://chat.deepseek.com/*'],
  },
  mistral: {
    id: 'mistral',
    name: 'Le Chat',
    tier: 2,
    hosts: ['chat.mistral.ai'],
    newChatUrl: 'https://chat.mistral.ai/chat',
    matches: ['https://chat.mistral.ai/*'],
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi',
    tier: 2,
    hosts: ['www.kimi.com', 'kimi.moonshot.cn'],
    newChatUrl: 'https://www.kimi.com/',
    matches: ['https://www.kimi.com/*', 'https://kimi.moonshot.cn/*'],
  },
  poe: {
    id: 'poe',
    name: 'Poe',
    tier: 2,
    hosts: ['poe.com'],
    newChatUrl: 'https://poe.com/',
    matches: ['https://poe.com/*'],
  },
  copilot: {
    id: 'copilot',
    name: 'Microsoft Copilot',
    tier: 2,
    hosts: ['copilot.microsoft.com'],
    newChatUrl: 'https://copilot.microsoft.com/',
    matches: ['https://copilot.microsoft.com/*'],
  },
  ghcopilot: {
    id: 'ghcopilot',
    name: 'GitHub Copilot',
    tier: 2,
    hosts: ['github.com'],
    pathPrefix: '/copilot',
    newChatUrl: 'https://github.com/copilot',
    matches: ['https://github.com/copilot/*'],
  },
  aimode: {
    id: 'aimode',
    name: 'Google AI Mode',
    tier: 2,
    hosts: ['www.google.com'],
    pathPrefix: '/search',
    query: { key: 'udm', value: '50' },
    newChatUrl: 'https://www.google.com/search?udm=50',
    matches: ['https://www.google.com/search*'],
  },
};

export function siteForUrl(rawUrl: string): SiteInfo | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  for (const site of Object.values(SITES)) {
    if (!site.hosts.includes(url.hostname)) continue;
    const prefix = site.pathPrefix;
    if (prefix && url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) continue;
    if (site.query && url.searchParams.get(site.query.key) !== site.query.value) continue;
    return site;
  }
  return null;
}

export function isTier1(id: SiteId): id is Tier1SiteId {
  return (TIER1_SITES as readonly string[]).includes(id);
}
