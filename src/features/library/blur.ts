// Privacy blur (SPEC §6B): one hotkey blurs chat titles and content for
// screen sharing. Only the site's messages and chat list are marked, so
// Artifact's own UI (meter, find bar) stays sharp.
import type { SiteAdapter } from '../../adapters/types';

const ATTR = 'data-artifact-blur';
const CSS = `[${ATTR}] { filter: blur(7px) !important; transition: filter .15s; }`;

let style: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;
let on = false;

function mark(adapter: SiteAdapter): void {
  const targets = [adapter.getSidebarAnchor(), ...adapter.getMessageAnchors().map((a) => a.element)].filter((e): e is Element => !!e);
  for (const el of targets) if (!el.hasAttribute(ATTR)) el.setAttribute(ATTR, '');
}

export function setBlur(adapter: SiteAdapter, next: boolean): void {
  on = next;
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('data-artifact', '');
    style.textContent = CSS;
    (document.head ?? document.documentElement).append(style);
  }
  observer?.disconnect();
  observer = null;
  if (on) {
    mark(adapter);
    // New messages and a re-rendered sidebar get blurred as they appear.
    let timer: number | undefined;
    observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => mark(adapter), 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    for (const el of document.querySelectorAll(`[${ATTR}]`)) el.removeAttribute(ATTR);
  }
}

export function isBlurred(): boolean {
  return on;
}

/** Alt+Shift+B toggles the blur on the page. */
export function startBlurHotkey(adapter: SiteAdapter): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyB') {
      e.preventDefault();
      setBlur(adapter, !on);
    }
  };
  document.addEventListener('keydown', onKey, true);
  return () => document.removeEventListener('keydown', onKey, true);
}
