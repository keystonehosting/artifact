// Jump to a message from search results, bookmarks or highlights. When the
// chat isn't open, the tab navigates there first and the jump finishes once
// the conversation has been read.
import type { SiteAdapter } from '../../adapters/types';
import type { PageState } from '../page-state';

const PENDING = 'artifact:jump';

interface Pending {
  chatId: string;
  messageId: string;
  quote?: string;
  at: number;
}

function flash(el: Element): void {
  const h = el as HTMLElement;
  const prev = h.style.outline;
  h.style.outline = '2px solid #1f6b5c';
  h.style.outlineOffset = '4px';
  setTimeout(() => {
    h.style.outline = prev;
    h.style.outlineOffset = '';
  }, 1600);
}

/** Scrolls to the message on screen. Returns false when it isn't rendered. */
export function scrollToMessage(adapter: SiteAdapter, state: PageState, messageId: string): boolean {
  const anchor = adapter.getMessageAnchors().find((a) => a.messageId === messageId || state.messageFor(a)?.id === messageId);
  if (!anchor) return false;
  anchor.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  flash(anchor.element);
  return true;
}

export async function jumpTo(adapter: SiteAdapter, state: PageState, req: { chatId: string; messageId: string | null; url: string | null }): Promise<{ navigated: boolean; found: boolean }> {
  if (state.chatId() === req.chatId) {
    if (!req.messageId) return { navigated: false, found: true };
    // Just after a load the chat may not be read or rendered yet; retry briefly.
    for (let i = 0; i < 20; i++) {
      if (scrollToMessage(adapter, state, req.messageId)) return { navigated: false, found: true };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { navigated: false, found: false };
  }
  if (!req.url) throw new Error('This chat has no address on the site');
  if (req.messageId) {
    const p: Pending = { chatId: req.chatId, messageId: req.messageId, at: Date.now() };
    sessionStorage.setItem(PENDING, JSON.stringify(p));
  }
  location.assign(req.url);
  return { navigated: true, found: false };
}

/** Finishes a jump started before navigation. */
export function resumeJump(adapter: SiteAdapter, state: PageState): () => void {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PENDING);
  } catch {
    return () => undefined;
  }
  if (!raw) return () => undefined;
  let p: Pending;
  try {
    p = JSON.parse(raw) as Pending;
  } catch {
    sessionStorage.removeItem(PENDING);
    return () => undefined;
  }
  if (Date.now() - p.at > 60_000) {
    sessionStorage.removeItem(PENDING);
    return () => undefined;
  }
  const tryJump = () => {
    if (state.chatId() !== p.chatId) return;
    // Sites render long chats lazily; retry briefly until the message appears.
    let tries = 0;
    const tick = () => {
      if (scrollToMessage(adapter, state, p.messageId) || ++tries > 20) {
        sessionStorage.removeItem(PENDING);
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
    off();
  };
  const off = state.subscribe((c) => c && tryJump());
  if (state.conv) tryJump();
  return off;
}
