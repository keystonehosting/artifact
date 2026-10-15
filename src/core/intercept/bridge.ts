// Isolated-world side of the page hook: receives copies of page responses,
// keeps the latest per conversation, and notifies listeners.
import { HOOK_SOURCE, type HookKind, type HookMessage } from './patterns';

export interface Captured {
  kind: HookKind;
  url: string;
  body: string;
  at: number;
}

type Listener = (c: Captured) => void;

export class HookBridge {
  private latest = new Map<string, Captured>();
  private listeners = new Set<Listener>();
  private readonly onMessage = (e: MessageEvent) => {
    const fromThisPage = e.origin === window.location.origin && e.source === window;
    if (!fromThisPage) return;
    const d = e.data as Partial<HookMessage> | null;
    if (!d || d.source !== HOOK_SOURCE || typeof d.kind !== 'string' || typeof d.body !== 'string' || typeof d.url !== 'string') return;
    const c: Captured = { kind: d.kind, url: d.url, body: d.body, at: Date.now() };
    this.latest.set(this.key(c.kind, c.url), c);
    this.latest.set(c.kind, c);
    for (const fn of this.listeners) fn(c);
  };

  constructor(private readonly win: Window = window) {
    win.addEventListener('message', this.onMessage);
  }

  private key(kind: HookKind, url: string): string {
    return `${kind} ${url.split('?')[0]}`;
  }

  /** Latest capture of `kind` whose URL contains `needle` (e.g. the chat id). */
  find(kind: HookKind, needle?: string): Captured | null {
    if (!needle) return this.latest.get(kind) ?? null;
    let best: Captured | null = null;
    for (const [k, c] of this.latest) {
      if (k.startsWith(`${kind} `) && (c.url.includes(needle) || c.body.includes(needle)) && (!best || c.at > best.at)) best = c;
    }
    return best;
  }

  /** Like find(), but waits up to `ms` for a matching capture to arrive. */
  waitFor(kind: HookKind, needle: string, ms: number): Promise<Captured | null> {
    const hit = this.find(kind, needle);
    if (hit || ms <= 0) return Promise.resolve(hit);
    return new Promise((resolve) => {
      const done = (c: Captured | null) => {
        clearTimeout(timer);
        off();
        resolve(c);
      };
      const off = this.subscribe(() => {
        const c = this.find(kind, needle);
        if (c) done(c);
      });
      const timer = setTimeout(() => done(null), ms);
    });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispose(): void {
    this.win.removeEventListener('message', this.onMessage);
    this.listeners.clear();
  }
}
