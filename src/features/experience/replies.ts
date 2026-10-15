// Reply helpers (SPEC §6E): auto-continue for truncated replies (off by
// default), an alert when a long reply finishes in a background tab, copying
// a formula's LaTeX by double-clicking it, and collapsible messages.
import { browser } from 'wxt/browser';
import type { SiteAdapter } from '../../adapters/types';
import { t } from '../../core/i18n/t';
import { toast } from '../prompts/toast';

const CONTINUE = /^(continue|continue generating)$/i;

/** A visible "Continue generating" button on the page, outside Artifact's own UI. */
export function findContinueButton(doc: Document = document): HTMLElement | null {
  for (const b of doc.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    if (b.closest('[data-artifact]')) continue;
    const text = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!CONTINUE.test(text) && !CONTINUE.test(b.getAttribute('aria-label') ?? '')) continue;
    const r = b.getBoundingClientRect();
    if (r.width && r.height && !(b as HTMLButtonElement).disabled) return b;
  }
  return null;
}

export function startAutoContinue(adapter: SiteAdapter, max: number): () => void {
  let count = 0;
  const offSend = adapter.onSend(() => (count = 0));
  const offDone = adapter.onStreamingDone(() => {
    setTimeout(() => {
      const b = findContinueButton();
      if (!b) return;
      if (count >= max) return toast(t('autocontinue_limit', String(max)));
      count++;
      b.click();
    }, 600);
  });
  return () => {
    offSend();
    offDone();
  };
}

function chime(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    for (const [i, f] of [660, 880].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.15, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 0.32);
    }
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // Audio unavailable: the notification alone is enough.
  }
}

export function startFinishAlert(adapter: SiteAdapter, o: { sound: boolean; minSeconds: number }): () => void {
  let startedAt = 0;
  const poll = setInterval(() => {
    const s = adapter.isStreaming();
    if (s && !startedAt) startedAt = Date.now();
    if (!s && startedAt && !document.hidden) startedAt = 0;
  }, 1000);
  const off = adapter.onStreamingDone(() => {
    const took = startedAt ? (Date.now() - startedAt) / 1000 : 0;
    startedAt = 0;
    if (!document.hidden || took < o.minSeconds) return;
    if (o.sound) chime();
    void browser.runtime.sendMessage({ type: 'bg:reply-finished', title: document.title, seconds: Math.round(took) }).catch(() => undefined);
  });
  return () => {
    clearInterval(poll);
    off();
  };
}

/** Double-click a rendered formula to copy its LaTeX source. */
export function startFormulaCopy(): () => void {
  const onDbl = (e: MouseEvent) => {
    const k = e.target instanceof Element ? e.target.closest('.katex') : null;
    const tex = k?.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (!tex) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    void navigator.clipboard.writeText(tex).then(
      () => toast(t('formula_copied')),
      () => toast(t('formula_copy_failed')),
    );
  };
  document.addEventListener('dblclick', onDbl, true);
  return () => document.removeEventListener('dblclick', onDbl, true);
}

const COLLAPSED = 'data-artifact-collapsed';

/** Collapsed messages show their first lines only; state is kept per chat for this tab. */
export class Collapser {
  private offStyle: (() => void) | null = null;

  constructor(private readonly adapter: SiteAdapter) {}

  private key(): string {
    return `artifact:collapsed:${this.adapter.id}:${this.adapter.detectConversation() ?? 'new'}`;
  }

  private stored(): Set<string> {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(this.key()) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  }

  private store(ids: Set<string>): void {
    try {
      sessionStorage.setItem(this.key(), JSON.stringify([...ids]));
    } catch {
      // Storage blocked: collapsing still works until reload.
    }
  }

  start(): () => void {
    const el = document.createElement('style');
    el.setAttribute('data-artifact', 'collapse');
    el.textContent = `[${COLLAPSED}] { max-height: 4.6em !important; overflow: hidden !important; -webkit-mask-image: linear-gradient(#000 60%, transparent); mask-image: linear-gradient(#000 60%, transparent); }`;
    (document.head ?? document.documentElement).append(el);
    this.offStyle = () => el.remove();
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyE') {
        e.preventDefault();
        this.toggleAll();
      }
    };
    document.addEventListener('keydown', onKey, true);
    let timer: number | undefined;
    const obs = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => this.apply(), 300);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    this.apply();
    return () => {
      obs.disconnect();
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey, true);
      this.offStyle?.();
      for (const x of document.querySelectorAll(`[${COLLAPSED}]`)) x.removeAttribute(COLLAPSED);
    };
  }

  private id(a: { messageId: string | null; index: number }): string {
    return a.messageId ?? `#${a.index}`;
  }

  private apply(): void {
    const ids = this.stored();
    for (const a of this.adapter.getMessageAnchors()) {
      const want = ids.has(this.id(a));
      if (want !== a.element.hasAttribute(COLLAPSED)) a.element.toggleAttribute(COLLAPSED, want);
    }
  }

  isCollapsed(anchor: { messageId: string | null; index: number }): boolean {
    return this.stored().has(this.id(anchor));
  }

  toggle(anchor: { messageId: string | null; index: number }): void {
    const ids = this.stored();
    const id = this.id(anchor);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    this.store(ids);
    this.apply();
  }

  toggleAll(): void {
    const anchors = this.adapter.getMessageAnchors();
    const ids = this.stored();
    const allCollapsed = anchors.every((a) => ids.has(this.id(a)));
    this.store(allCollapsed ? new Set() : new Set(anchors.map((a) => this.id(a))));
    this.apply();
    toast(allCollapsed ? t('collapse_expanded_all') : t('collapse_collapsed_all'));
  }
}

/** A copy button at the bottom-right of the code block under the pointer, clear of the site's own buttons. */
export function startCodeCopy(adapter: SiteAdapter): () => void {
  let host: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  const btn = () => {
    if (host) return host;
    host = document.createElement('artifact-code-copy');
    host.setAttribute('data-artifact', '');
    const root = host.attachShadow({ mode: 'closed' });
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t('code_copy');
    b.setAttribute('aria-label', t('code_copy_label'));
    b.style.cssText = 'font:12px system-ui,sans-serif;padding:2px 8px;border:1px solid rgba(127,127,127,.5);border-radius:4px;background:Canvas;color:CanvasText;cursor:pointer';
    b.addEventListener('click', () => {
      const text = target?.querySelector('code')?.textContent ?? target?.textContent ?? '';
      void navigator.clipboard.writeText(text).then(
        () => toast(t('code_copied')),
        () => toast(t('formula_copy_failed')),
      );
    });
    root.append(b);
    host.style.cssText = 'position:fixed;z-index:2147482000;display:none';
    document.body.append(host);
    return host;
  };
  const onMove = (e: MouseEvent) => {
    const el = e.target instanceof Element ? e.target : null;
    if (el && host?.contains(el)) return;
    const pre = el?.closest('pre') as HTMLElement | null;
    const inMessage = pre && adapter.getMessageAnchors().some((a) => a.element.contains(pre));
    if (!pre || !inMessage) {
      if (host) host.style.display = 'none';
      target = null;
      return;
    }
    if (pre === target) return;
    target = pre;
    const r = pre.getBoundingClientRect();
    const h = btn();
    h.style.display = 'block';
    h.style.left = `${Math.max(4, r.right - 64)}px`;
    h.style.top = `${Math.max(4, r.bottom - 28)}px`;
  };
  document.addEventListener('mousemove', onMove, { passive: true });
  return () => {
    document.removeEventListener('mousemove', onMove);
    host?.remove();
  };
}
