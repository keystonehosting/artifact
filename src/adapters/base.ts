// Shared adapter machinery. Site adapters supply selectors and structured
// readers; this class handles the DOM fallback, composer, navigation,
// streaming detection and health bookkeeping.
import type { Capabilities, ModelInfo, Read, SiteAdapter } from './types';
import type { Conversation, Message } from '../core/schema/archive';
import { HealthTracker, type SiteHealth } from '../core/health/health';
import { SITES, type SiteId } from '../core/sites/sites';
import { activeBranch, allBranches } from '../core/model/tree';
import { clickSend, fillComposerElement, findComposer, readComposer, attachFiles } from '../core/dom/composer';
import { readDomConversation, readDomTurns, type DomReaderConfig } from './dom-reader';
import { HookBridge, type Captured } from '../core/intercept/bridge';
import type { HookKind } from '../core/intercept/patterns';
import { siteLimiter } from '../core/net/fetch';
import type { RateLimiter } from '../core/queue/ratelimit';

/** What an adapter needs from its environment; tests pass fakes. */
export interface SiteContext {
  doc: Document;
  bridge: HookBridge | null;
  limiter: RateLimiter;
}

export function defaultContext(doc: Document = document): SiteContext {
  return { doc, bridge: typeof window !== 'undefined' ? new HookBridge(window) : null, limiter: siteLimiter() };
}

export interface BaseConfig {
  site: SiteId;
  /** Extracts the site's chat id from a URL path; null on a new chat. */
  chatIdFromUrl(url: URL): string | null;
  dom: DomReaderConfig;
  composer: readonly string[];
  send: readonly string[];
  /** Present while a reply is streaming (usually the stop button). */
  streaming: string;
  sidebar: string;
  /** Model picker label in the page, used when no structured model is known. */
  modelLabel?: string;
  capabilities: Partial<Capabilities>;
}

const NO_CAPS: Capabilities = {
  structuredRead: false,
  branches: false,
  listChats: false,
  projects: false,
  deleteChat: false,
  archiveChat: false,
  renameChat: false,
  attachments: false,
  artifacts: false,
  usage: false,
  modelSwitch: false,
  fillComposer: true,
  sidebarFolders: false,
  reportsTokenCount: false,
};

export const DOM_CHECK = 'dom.turns';

export abstract class BaseAdapter implements SiteAdapter {
  readonly id: SiteId;
  readonly capabilities: Capabilities;
  protected readonly tracker: HealthTracker;
  private disposers: Array<() => void> = [];
  private readListeners = new Set<(r: Read<Conversation>) => void>();

  protected readonly doc: Document;
  protected readonly bridge: HookBridge | null;
  protected readonly limiter: RateLimiter;

  constructor(
    protected readonly cfg: BaseConfig,
    critical: string[] = [],
    ctx: SiteContext = defaultContext(),
  ) {
    this.doc = ctx.doc;
    this.bridge = ctx.bridge;
    this.limiter = ctx.limiter;
    this.id = cfg.site;
    this.capabilities = { ...NO_CAPS, ...cfg.capabilities };
    this.tracker = new HealthTracker(new Set(critical));
  }

  /** Structured (intercept or endpoint) read; null when unavailable. Must record health checks. */
  private readonly waited = new Set<string>();

  /**
   * The page's own copy of a payload. The first read of a chat may come
   * while the page's request is still in flight, so wait briefly for it
   * instead of asking the site a second time.
   */
  protected async captured(kind: HookKind, chatId: string): Promise<Captured | null> {
    if (!this.bridge) return null;
    const key = `${kind}:${chatId}`;
    const first = !this.waited.has(key);
    this.waited.add(key);
    return this.bridge.waitFor(kind, chatId, first ? 1500 : 0);
  }

  protected async readStructured(_siteChatId: string): Promise<Read<Conversation> | null> {
    return null;
  }

  protected url(): URL {
    return new URL(this.doc.location?.href ?? 'about:blank');
  }

  detectConversation(): string | null {
    return this.chatIdFromUrl(this.url());
  }

  chatIdFromUrl(url: URL): string | null {
    try {
      return this.cfg.chatIdFromUrl(url);
    } catch {
      return null;
    }
  }

  async readConversation(): Promise<Read<Conversation> | null> {
    const chatId = this.detectConversation();
    if (chatId && this.capabilities.structuredRead) {
      try {
        const structured = await this.readStructured(chatId);
        if (structured) {
          this.tracker.setSource(structured.source);
          this.emitRead(structured);
          return structured;
        }
      } catch (e) {
        this.tracker.fail(`${this.id}.structured`, `Structured read failed: ${(e as Error).message}`);
      }
    }
    const conv = readDomConversation(this.doc, this.cfg.dom, chatId ?? 'unsaved', this.url().href);
    if (!conv) {
      if (this.isChatPage()) this.tracker.fail(DOM_CHECK, 'No messages found on the page with the known selectors');
      return null;
    }
    this.tracker.pass(DOM_CHECK, `${Object.keys(conv.messages).length} turns read from the page`);
    this.tracker.setSource('dom');
    const read: Read<Conversation> = { value: conv, source: 'dom', approximate: true };
    this.emitRead(read);
    return read;
  }

  onConversationRead(cb: (r: Read<Conversation>) => void): () => void {
    this.readListeners.add(cb);
    return () => this.readListeners.delete(cb);
  }

  private emitRead(r: Read<Conversation>): void {
    for (const cb of this.readListeners) cb(r);
  }

  /** True when the page should be showing messages (a saved chat). */
  protected isChatPage(): boolean {
    return this.detectConversation() !== null;
  }

  getActiveBranch(conv: Conversation): Message[] {
    return activeBranch(conv);
  }

  getAllBranches(conv: Conversation): string[][] {
    return allBranches(conv);
  }

  async getModel(): Promise<ModelInfo> {
    const turns = readDomTurns(this.doc, this.cfg.dom);
    const fromTurn = [...turns].reverse().find((t) => t.model)?.model ?? null;
    if (fromTurn) return { slug: fromTurn, label: fromTurn, source: 'dom' };
    const label = this.cfg.modelLabel ? this.doc.querySelector(this.cfg.modelLabel)?.textContent?.trim() || null : null;
    return { slug: null, label, source: 'dom' };
  }

  protected composerEl(): HTMLElement | null {
    return findComposer(this.doc, this.cfg.composer);
  }

  getComposerElement(): HTMLElement | null {
    return this.composerEl();
  }

  getDraftText(): string {
    return readComposer(this.composerEl());
  }

  onSend(cb: (text: string) => void): () => void {
    const win = this.doc.defaultView;
    if (!win) return () => undefined;
    let lastText = '';
    let lastAt = 0;
    // A send is confirmed when the composer empties shortly after Enter or a
    // click on the send button; a key a menu swallowed leaves the text in place.
    const watch = () => {
      const text = this.getDraftText().trim();
      if (!text) return;
      win.setTimeout(() => {
        if (this.getDraftText().trim()) return;
        if (text === lastText && Date.now() - lastAt < 1500) return;
        lastText = text;
        lastAt = Date.now();
        cb(text);
      }, 400);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.isComposing) return;
      const el = this.composerEl();
      if (el && e.target instanceof Node && el.contains(e.target)) watch();
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target && this.cfg.send.some((sel) => target.closest(sel))) watch();
    };
    win.addEventListener('keydown', onKey, true);
    this.doc.addEventListener('click', onClick, true);
    const off = () => {
      win.removeEventListener('keydown', onKey, true);
      this.doc.removeEventListener('click', onClick, true);
    };
    this.disposers.push(off);
    return off;
  }

  async fillComposer(text: string, files: File[] = []): Promise<boolean> {
    const el = this.composerEl();
    if (!el) return false;
    const ok = fillComposerElement(el, text);
    if (files.length) attachFiles(el, files);
    return ok;
  }

  async submit(): Promise<boolean> {
    return clickSend(this.doc, this.composerEl(), this.cfg.send);
  }

  newChatUrl(): string {
    return SITES[this.id].newChatUrl;
  }

  isStreaming(): boolean {
    return !!this.doc.querySelector(this.cfg.streaming);
  }

  onConversationChange(cb: (id: string | null) => void): () => void {
    let last = this.detectConversation();
    let lastHref = this.doc.location?.href;
    const check = () => {
      if (this.doc.location?.href === lastHref) return;
      lastHref = this.doc.location?.href;
      const id = this.detectConversation();
      if (id !== last) {
        last = id;
        cb(id);
      }
    };
    const win = this.doc.defaultView;
    const timer = win?.setInterval(check, 400);
    win?.addEventListener('popstate', check);
    const off = () => {
      if (timer !== undefined) win?.clearInterval(timer);
      win?.removeEventListener('popstate', check);
    };
    this.disposers.push(off);
    return off;
  }

  onStreamingDone(cb: () => void): () => void {
    let streaming = this.isStreaming();
    const win = this.doc.defaultView;
    let pending: number | undefined;
    const observer = new MutationObserver(() => {
      if (pending !== undefined) return;
      pending = win?.setTimeout(() => {
        pending = undefined;
        const now = this.isStreaming();
        if (streaming && !now) cb();
        streaming = now;
      }, 150);
    });
    observer.observe(this.doc.body ?? this.doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'data-testid', 'disabled'] });
    const off = () => observer.disconnect();
    this.disposers.push(off);
    return off;
  }

  getSidebarAnchor(): Element | null {
    return this.doc.querySelector(this.cfg.sidebar);
  }

  getComposerAnchor(): Element | null {
    const el = this.composerEl();
    return el?.closest('form') ?? el?.parentElement ?? null;
  }

  getMessageAnchors(): Array<{ messageId: string | null; index: number; element: Element; role: Message['role'] }> {
    return readDomTurns(this.doc, this.cfg.dom).map((t, index) => ({ messageId: t.id, index, element: t.element, role: t.role }));
  }

  health(): SiteHealth {
    return this.tracker.snapshot();
  }

  onHealthChange(cb: (h: SiteHealth) => void): () => void {
    return this.tracker.subscribe(cb);
  }

  async selfTest(): Promise<SiteHealth> {
    const composer = this.composerEl();
    if (composer) this.tracker.pass(`${this.id}.composer`, 'Composer found');
    else this.tracker.fail(`${this.id}.composer`, 'Composer not found with the known selectors');
    if (this.getSidebarAnchor()) this.tracker.pass(`${this.id}.sidebar`, 'Sidebar found');
    else this.tracker.fail(`${this.id}.sidebar`, 'Sidebar not found with the known selectors');
    if (this.isChatPage()) await this.readConversation();
    await this.extraSelfTest();
    return this.tracker.snapshot();
  }

  /** Site-specific checks (endpoints, usage) for Self-test. */
  protected async extraSelfTest(): Promise<void> {}

  dispose(): void {
    for (const off of this.disposers.splice(0)) off();
    this.bridge?.dispose();
  }

  /** Records a structured-read failure and rethrows nothing: callers fall back to the DOM. */
  protected structuredFailed(check: string, e: unknown): null {
    this.tracker.fail(check, e instanceof Error ? e.message : String(e));
    return null;
  }
}
