// Stores and indexes every chat the user opens, so search, folders and the
// library work across sites without a separate scan.
import type { SiteAdapter } from '../../adapters/types';
import type { Conversation } from '../../core/schema/archive';
import { lib } from '../../core/library/client';

export function startIndexer(adapter: SiteAdapter): () => void {
  let timer: number | undefined;
  let pending: Conversation | null = null;
  const flush = () => {
    const conv = pending;
    pending = null;
    if (!conv || conv.siteChatId === 'unsaved') return;
    void lib('ingest', conv, { opened: true }).catch((e: Error) => console.warn('Artifact indexer:', e.message));
  };
  const off = adapter.onConversationRead((r) => {
    pending = r.value;
    window.clearTimeout(timer);
    // Wait until replies settle so a streaming chat isn't stored on every token.
    timer = window.setTimeout(flush, adapter.isStreaming() ? 4000 : 800);
  });
  return () => {
    off();
    window.clearTimeout(timer);
    flush();
  };
}
