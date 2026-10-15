// Lazily constructs the adapter for the current site. Each adapter is a
// separate chunk, so a page only loads its own site's code.
import type { SiteAdapter } from './types';
import type { SiteId } from '../core/sites/sites';

export async function createAdapter(site: SiteId, doc: Document = document): Promise<SiteAdapter | null> {
  switch (site) {
    case 'chatgpt':
      return new (await import('./chatgpt')).ChatGPTAdapter(doc);
    case 'claude':
      return new (await import('./claude')).ClaudeAdapter(doc);
    case 'gemini':
      return new (await import('./gemini')).GeminiAdapter(doc);
    case 'aistudio':
      return new (await import('./aistudio')).AIStudioAdapter(doc);
    case 'grok':
      return new (await import('./grok')).GrokAdapter(doc);
    default:
      return null;
  }
}
