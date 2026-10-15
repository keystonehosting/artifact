// Constructs the adapter for the current site. Each adapter is a separate
// chunk, so a page only loads its own site's code.
import type { SiteAdapter } from './types';
import type { SiteId } from '../core/sites/sites';
import { defaultContext, type SiteContext } from './base';

export async function createAdapter(site: SiteId, ctx: SiteContext = defaultContext()): Promise<SiteAdapter | null> {
  switch (site) {
    case 'chatgpt':
      return new (await import('./chatgpt')).ChatGPTAdapter(ctx);
    case 'claude':
      return new (await import('./claude')).ClaudeAdapter(ctx);
    case 'gemini':
      return new (await import('./gemini')).GeminiAdapter(ctx);
    case 'aistudio':
      return new (await import('./aistudio')).AIStudioAdapter(ctx);
    case 'grok':
      return new (await import('./grok')).GrokAdapter(ctx);
    case 'perplexity':
    case 'deepseek':
    case 'mistral':
    case 'kimi':
    case 'poe':
    case 'copilot':
    case 'ghcopilot':
    case 'aimode':
      return new (await import('./tier2')).Tier2Adapter(site, ctx);
    default:
      return null;
  }
}
