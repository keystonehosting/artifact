// The latest conversation read on this page, shared by in-page features.
import type { SiteAdapter } from '../adapters/types';
import type { Conversation, Message } from '../core/schema/archive';
import { activeBranch } from '../core/model/tree';

export class PageState {
  conv: Conversation | null = null;
  private listeners = new Set<(c: Conversation | null) => void>();

  constructor(readonly adapter: SiteAdapter) {
    adapter.onConversationRead((r) => this.set(r.value));
    adapter.onConversationChange(() => this.set(null));
  }

  set(c: Conversation | null): void {
    this.conv = c;
    for (const fn of this.listeners) fn(c);
  }

  subscribe(fn: (c: Conversation | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Library id of the open chat, e.g. "claude:<uuid>". */
  chatId(): string | null {
    const id = this.adapter.detectConversation();
    return id ? `${this.adapter.id}:${id}` : null;
  }

  /**
   * The stored message behind a page element: by the element's own message id
   * when the site renders one, otherwise by position on the visible branch.
   */
  messageFor(anchor: { messageId: string | null; index: number }): Message | null {
    if (!this.conv) return null;
    if (anchor.messageId && this.conv.messages[anchor.messageId]) return this.conv.messages[anchor.messageId]!;
    const branch = activeBranch(this.conv).filter((m) => !m.hidden);
    return branch[anchor.index] ?? null;
  }
}

/**
 * Reads the open chat on load, on navigation and after each reply, for
 * features that need the conversation when the meter (which also reads) is off.
 */
export function startReader(adapter: SiteAdapter): () => void {
  let timer: number | undefined;
  const read = (ms: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (adapter.detectConversation()) void adapter.readConversation().catch(() => undefined);
    }, ms);
  };
  const offs = [adapter.onConversationChange(() => read(300)), adapter.onStreamingDone(() => read(1500))];
  read(0);
  return () => {
    window.clearTimeout(timer);
    for (const off of offs) off();
  };
}
