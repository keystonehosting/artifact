import { BaseAdapter, defaultContext, type SiteContext } from '../base';
import { GEMINI_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';
import type { ChatSummary, FileBytes, Page, ProjectSummary, Read, UsageReport } from '../types';
import type { Attachment, Conversation } from '../../core/schema/archive';
import { geminiCursor, geminiToConversation } from './normalize';
import { at, decodeBatchExecute, encodeBatchExecute } from '../../core/schema/payloads/batchexecute';
import { request } from '../../core/net/fetch';
import { fetchBytes } from '../../core/net/bytes';
import { withExtension } from '../../core/util/bytes';
import { textOf } from '../dom-reader';
import { geminiChatId } from '../../core/sites/chat-urls';
export { geminiChatId };

/** /app/<id> and /gem/<gemId>/<id>, with an optional /u/<n> account prefix. RPCs use the c_ form. */

const CHECK_READ = 'gemini.conversation';
const CHECK_TOKENS = 'gemini.page_tokens';
const MAX_PAGES = 200;

interface PageTokens {
  at: string;
  bl: string | null;
  fsid: string | null;
  hl: string;
  prefix: string;
}

export class GeminiAdapter extends BaseAdapter {
  private reqId = Math.floor(100000 + Math.random() * 800000);

  constructor(ctx: SiteContext = defaultContext()) {
    super(
      {
        site: 'gemini',
        chatIdFromUrl: geminiChatId,
        dom: GEMINI_DOM,
        ...SELECTORS.gemini,
        capabilities: {
          structuredRead: true,
          branches: true,
          listChats: true,
          projects: true,
          deleteChat: true,
          attachments: true,
          usage: true,
          sidebarFolders: true,
        },
      },
      [],
      ctx,
    );
  }

  /** The page embeds its RPC tokens in inline scripts (WIZ_global_data). */
  private tokens(): PageTokens {
    const html = Array.from(this.doc.querySelectorAll('script:not([src])'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    const pick = (k: string) => new RegExp(`"${k}":"([^"]+)"`).exec(html)?.[1] ?? null;
    const atToken = pick('SNlM0e');
    if (!atToken) {
      this.tracker.fail(CHECK_TOKENS, 'Page token SNlM0e not found (signed out, or the page changed)');
      throw new Error('Gemini page token missing');
    }
    this.tracker.pass(CHECK_TOKENS, 'Page tokens found');
    const prefix = /^\/u\/\d+/.exec(this.url().pathname)?.[0] ?? '';
    return { at: atToken, bl: pick('cfb2h'), fsid: pick('FdrFJe'), hl: pick('TuX5cc') ?? 'en', prefix };
  }

  private async rpc(rpcId: string, args: unknown, sourcePath: string): Promise<unknown> {
    const t = this.tokens();
    const q = new URLSearchParams({ rpcids: rpcId, 'source-path': sourcePath, hl: t.hl, _reqid: String((this.reqId += 100000)), rt: 'c' });
    if (t.bl) q.set('bl', t.bl);
    if (t.fsid) q.set('f.sid', t.fsid);
    const res = await request(this.limiter, `${t.prefix}/_/BardChatUi/data/batchexecute?${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'x-same-domain': '1' },
      body: encodeBatchExecute(rpcId, args, t.at),
    });
    const frame = decodeBatchExecute(await res.text()).find((f) => f.rpcId === rpcId);
    if (!frame) throw new Error(`Gemini ${rpcId} returned no data`);
    return frame.payload;
  }

  private title(): string {
    return textOf(this.doc.querySelector('[data-test-id="conversation-title"], .conversation-title')) || GEMINI_DOM.title(this.doc);
  }

  protected override async readStructured(chatId: string): Promise<Read<Conversation> | null> {
    const url = this.url().href.split('?')[0]!;
    const captured = this.bridge?.find('gemini.batchexecute', chatId);
    if (captured) {
      try {
        const pages = decodeBatchExecute(captured.body)
          .filter((f) => f.rpcId === 'hNvQHb')
          .map((f) => f.payload);
        if (pages.length && !geminiCursor(pages[pages.length - 1])) {
          const conv = geminiToConversation(pages, chatId, url, this.title());
          conv.source.method = 'intercept';
          this.tracker.pass(CHECK_READ, 'Read from the page’s own request');
          return { value: conv, source: 'intercept', approximate: false };
        }
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
    const bare = chatId.replace(/^c_/, '');
    const pages: unknown[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < MAX_PAGES; i++) {
      // Argument layout observed in AI Toolbox (dossier endpoints.md); unconfirmed live.
      const page = await this.rpc('hNvQHb', [bare, 100000, cursor, 1, [0], [4], null, 1], `/app/${bare}`);
      pages.push(page);
      cursor = geminiCursor(page);
      if (!cursor) break;
    }
    const conv = geminiToConversation(pages, chatId, `https://gemini.google.com/app/${bare}`, this.title());
    this.tracker.pass(CHECK_READ, 'Read with the hNvQHb RPC');
    return { value: conv, source: 'endpoint', approximate: false };
  }

  async listChats(cursor: string | null): Promise<Page<ChatSummary>> {
    const payload = await this.rpc('MaZiqc', cursor ? [20, cursor, [0, null, 1]] : [], '/search');
    const rows = at(payload, 2);
    if (!Array.isArray(rows)) {
      this.tracker.fail('gemini.list', 'Chat list payload changed: [2] is not an array');
      throw new Error('Gemini list payload changed');
    }
    this.tracker.pass('gemini.list', 'Chat list readable');
    const items: ChatSummary[] = [];
    for (const r of rows) {
      const id = at(r, 0);
      if (typeof id !== 'string') continue;
      const secs = at(r, 5, 0);
      const bare = id.replace(/^c_/, '');
      items.push({
        siteChatId: id.startsWith('c_') ? id : `c_${id}`,
        title: typeof at(r, 1) === 'string' ? (at(r, 1) as string) : 'Untitled',
        url: `https://gemini.google.com/app/${bare}`,
        updatedAt: typeof secs === 'number' ? new Date(secs * 1000).toISOString() : null,
        pinned: at(r, 2) === true,
      });
    }
    const next = at(payload, 1);
    return { items, next: typeof next === 'string' && next ? next : null };
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const payload = await this.rpc('CNgdBe', [2, ['en'], 0], '/gems/view');
    const rows = at(payload, 2);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => typeof at(r, 0) === 'string')
      .map((r) => ({ id: at(r, 0) as string, name: (at(r, 1, 0) as string) ?? 'Gem', kind: 'gem' as const, url: `https://gemini.google.com/gem/${at(r, 0) as string}` }));
  }

  async deleteChat(chatId: string): Promise<void> {
    const id = chatId.startsWith('c_') ? chatId : `c_${chatId}`;
    await this.rpc('GzXR5e', [id], '/app');
  }

  async downloadAttachment(_conv: Conversation, att: Attachment): Promise<FileBytes> {
    if (typeof att.ref.url !== 'string') throw new Error('No URL for this image');
    const { bytes, mimeType } = await fetchBytes(att.ref.url);
    const mime = mimeType.split(';')[0]!;
    return { name: withExtension(att.name.replace(/\.png$/, ''), mime), mimeType: mime, bytes };
  }

  async getUsage(): Promise<UsageReport | null> {
    try {
      const payload = await this.rpc('jSf9Qc', [], '/app');
      const rows = at(payload, 1);
      if (!Array.isArray(rows)) throw new Error('usage payload changed');
      const windows = rows
        .map((r) => {
          const frac = at(r, 1);
          const kind = at(r, 2);
          const secs = at(r, 3, 0);
          return {
            label: kind === 1 ? 'Current' : kind === 2 ? 'Weekly' : `Limit ${String(kind)}`,
            fraction: typeof frac === 'number' ? Math.max(0, Math.min(1, frac)) : null,
            resetsAt: typeof secs === 'number' ? new Date(secs * 1000).toISOString() : null,
          };
        })
        .filter((w) => w.fraction !== null);
      this.tracker.pass('gemini.usage', 'Usage readable');
      return windows.length ? { windows, source: 'endpoint' } : null;
    } catch (e) {
      this.tracker.fail('gemini.usage', `Usage unavailable: ${(e as Error).message}`);
      return null;
    }
  }

  protected override async extraSelfTest(): Promise<void> {
    try {
      this.tokens();
    } catch {
      // recorded
    }
  }
}
