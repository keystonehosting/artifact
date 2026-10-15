import { BaseAdapter, defaultContext, type SiteContext } from '../base';
import { AISTUDIO_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';
import type { ChatSummary, FileBytes, ModelInfo, Page, Read } from '../types';
import type { Attachment, Conversation } from '../../core/schema/archive';
import { aistudioToConversation } from './normalize';
import { at } from '../../core/schema/payloads/batchexecute';
import { readCookie, request } from '../../core/net/fetch';
import { base64ToBytes } from '../../core/util/bytes';
import { aistudioChatId } from '../../core/sites/chat-urls';
export { aistudioChatId };

const RPC_BASE = 'https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/';
const CHECK_READ = 'aistudio.conversation';
const ORIGIN = 'https://aistudio.google.com';

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class AIStudioAdapter extends BaseAdapter {
  constructor(ctx: SiteContext = defaultContext()) {
    super(
      {
        site: 'aistudio',
        chatIdFromUrl: aistudioChatId,
        dom: AISTUDIO_DOM,
        ...SELECTORS.aistudio,
        capabilities: { structuredRead: true, listChats: true, attachments: true, reportsTokenCount: true },
      },
      [],
      ctx,
    );
  }

  /** Google's first-party SAPISIDHASH header, computed the way the page does. */
  private async authHeaders(): Promise<Record<string, string>> {
    const sapisid = readCookie('SAPISID', this.doc.cookie) ?? readCookie('__Secure-3PAPISID', this.doc.cookie) ?? readCookie('__Secure-1PAPISID', this.doc.cookie);
    if (!sapisid) {
      this.tracker.fail('aistudio.auth', 'Session cookie not readable (signed out?)');
      throw new Error('AI Studio session unavailable');
    }
    this.tracker.pass('aistudio.auth', 'Session available');
    const ts = Math.floor(Date.now() / 1000);
    const authuser = /^\/u\/(\d+)/.exec(this.url().pathname)?.[1] ?? '0';
    return {
      authorization: `SAPISIDHASH ${ts}_${await sha1Hex(`${ts} ${sapisid} ${ORIGIN}`)}`,
      'content-type': 'application/json+protobuf',
      'x-goog-authuser': authuser,
      'x-user-agent': 'grpc-web-javascript/0.1',
    };
  }

  private async rpc(method: string, body: unknown): Promise<unknown> {
    const res = await request(this.limiter, RPC_BASE + method, { method: 'POST', headers: await this.authHeaders(), body: JSON.stringify(body) });
    return JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, ''));
  }

  protected override async readStructured(chatId: string): Promise<Read<Conversation> | null> {
    const url = `${ORIGIN}/prompts/${chatId}`;
    const captured = await this.captured('aistudio.resolve', chatId);
    if (captured) {
      try {
        const conv = aistudioToConversation(JSON.parse(captured.body.replace(/^\)\]\}'\s*/, '')), chatId, url);
        conv.source.method = 'intercept';
        conv.model = (await this.getModel()).label;
        this.tracker.pass(CHECK_READ, 'Read from the page’s own request');
        return { value: conv, source: 'intercept', approximate: false };
      } catch (e) {
        this.structuredFailed(CHECK_READ, e);
      }
    }
    try {
      return await this.getChat(chatId);
    } catch (e) {
      return this.structuredFailed(CHECK_READ, e);
    }
  }

  async getChat(chatId: string): Promise<Read<Conversation>> {
    const conv = aistudioToConversation(await this.rpc('ResolveDriveResource', [chatId]), chatId, `${ORIGIN}/prompts/${chatId}`);
    if (chatId === this.detectConversation()) conv.model = (await this.getModel()).label;
    this.tracker.pass(CHECK_READ, 'Read with ResolveDriveResource');
    return { value: conv, source: 'endpoint', approximate: false };
  }

  async listChats(): Promise<Page<ChatSummary>> {
    const payload = await this.rpc('ListPrompts', []);
    const rows = at(payload, 0);
    if (!Array.isArray(rows)) {
      this.tracker.fail('aistudio.list', 'Prompt list payload changed');
      throw new Error('AI Studio list payload changed');
    }
    this.tracker.pass('aistudio.list', 'Prompt list readable');
    const items: ChatSummary[] = [];
    for (const r of rows) {
      const name = at(r, 0);
      if (typeof name !== 'string') continue;
      const id = name.replace(/^prompts\//, '');
      const secs = at(r, 4, 4, 0);
      items.push({
        siteChatId: id,
        title: typeof at(r, 4, 0) === 'string' ? (at(r, 4, 0) as string) : 'Untitled',
        url: `${ORIGIN}/prompts/${id}`,
        updatedAt: typeof secs === 'number' ? new Date(secs * 1000).toISOString() : null,
      });
    }
    // Paging of ListPrompts is not known (dossier); one page is the full result we can read.
    return { items, next: null };
  }

  async downloadAttachment(_conv: Conversation, att: Attachment): Promise<FileBytes> {
    if (typeof att.ref.inline !== 'string') throw new Error('No inline data for this file');
    return { name: att.name, mimeType: att.mimeType ?? 'application/octet-stream', bytes: base64ToBytes(att.ref.inline) };
  }

  override async getModel(): Promise<ModelInfo> {
    const label = this.doc.querySelector(SELECTORS.aistudio.modelLabel)?.textContent?.trim() || null;
    return { slug: label, label, source: 'dom' };
  }

  /**
   * AI Studio shows its own token count for the prompt as "used / limit" next
   * to a "Token" label. Found by that text pattern, not a class name, because
   * the page's markup is unconfirmed live. Used to calibrate Artifact's estimate.
   */
  siteTokenCount(): { used: number; limit: number } | null {
    const walker = this.doc.createTreeWalker(this.doc.body ?? this.doc.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const m = /^\s*([\d,.\s]+?)\s*\/\s*([\d,.\s]+?)\s*$/.exec(n.textContent ?? '');
      if (!m) continue;
      let el: Element | null = n.parentElement;
      let labelled = false;
      for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
        if (/token/i.test(el.textContent ?? '')) {
          labelled = true;
          break;
        }
      }
      if (!labelled) continue;
      const used = Number(m[1]!.replace(/[,.\s]/g, ''));
      const limit = Number(m[2]!.replace(/[,.\s]/g, ''));
      if (Number.isFinite(used) && Number.isFinite(limit) && limit > used) return { used, limit };
    }
    return null;
  }
}
