import { BaseAdapter, defaultContext, type SiteContext } from '../base';
import { GROK_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';
import type { ChatSummary, FileBytes, Page, Read } from '../types';
import type { Attachment, Conversation } from '../../core/schema/archive';
import { grokToConversation } from './normalize';
import { GrokListSchema } from '../../core/schema/payloads/grok';
import { request, requestJson } from '../../core/net/fetch';
import { fetchBytes } from '../../core/net/bytes';
import { withExtension } from '../../core/util/bytes';

/** /c/<id>, or /project/<pid>?chat=<id>. */
export function grokChatId(url: URL): string | null {
  const m = /^\/c\/([0-9a-f-]{8,})/i.exec(url.pathname);
  if (m) return m[1]!;
  return url.searchParams.get('chat');
}

const CHECK_READ = 'grok.conversation';
const API = '/rest/app-chat/conversations';

export class GrokAdapter extends BaseAdapter {
  private titles = new Map<string, string>();

  constructor(ctx: SiteContext = defaultContext()) {
    super(
      {
        site: 'grok',
        chatIdFromUrl: grokChatId,
        dom: GROK_DOM,
        ...SELECTORS.grok,
        capabilities: { structuredRead: true, branches: true, listChats: true, deleteChat: true, renameChat: true, attachments: true, sidebarFolders: true },
      },
      [],
      ctx,
    );
  }

  private pageTitle(): string {
    return GROK_DOM.title(this.doc);
  }

  protected override async readStructured(chatId: string): Promise<Read<Conversation> | null> {
    const nodes = this.bridge?.find('grok.nodes', chatId);
    const responses = this.bridge?.find('grok.responses', chatId);
    if (nodes && responses) {
      try {
        const conv = grokToConversation(JSON.parse(nodes.body), JSON.parse(responses.body), chatId, `https://grok.com/c/${chatId}`, this.titles.get(chatId) ?? this.pageTitle());
        conv.source.method = 'intercept';
        this.tracker.pass(CHECK_READ, 'Read from the page’s own requests');
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
    const nodes = (await requestJson(this.limiter, `${API}/${chatId}/response-node?includeThreads=true`)) as { responseNodes?: Array<{ responseId?: string }> };
    const ids = (nodes.responseNodes ?? []).map((n) => n.responseId).filter((x): x is string => typeof x === 'string');
    const responses = await requestJson(this.limiter, `${API}/${chatId}/load-responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ responseIds: ids }),
    });
    let title = this.titles.get(chatId) ?? '';
    if (!title) {
      try {
        const meta = (await requestJson(this.limiter, `${API}/${chatId}`)) as { title?: unknown; conversation?: { title?: unknown } };
        const t = meta.title ?? meta.conversation?.title;
        title = typeof t === 'string' ? t : this.pageTitle();
      } catch {
        title = this.pageTitle();
      }
    }
    const conv = grokToConversation(nodes, responses, chatId, `https://grok.com/c/${chatId}`, title);
    this.tracker.pass(CHECK_READ, 'Read with load-responses');
    return { value: conv, source: 'endpoint', approximate: false };
  }

  async listChats(cursor: string | null): Promise<Page<ChatSummary>> {
    const q = new URLSearchParams({ pageSize: '100' });
    if (cursor) q.set('pageToken', cursor);
    const res = GrokListSchema.safeParse(await requestJson(this.limiter, `${API}?${q}`));
    if (!res.success) {
      this.tracker.fail('grok.list', 'Conversation list payload changed');
      throw new Error('Grok list payload changed');
    }
    this.tracker.pass('grok.list', 'Conversation list readable');
    const items = res.data.conversations.map((c) => {
      if (c.title) this.titles.set(c.conversationId, c.title);
      return {
        siteChatId: c.conversationId,
        title: c.title ?? 'Untitled',
        url: `https://grok.com/c/${c.conversationId}`,
        updatedAt: c.modifyTime ?? null,
        createdAt: c.createTime ?? null,
        pinned: c.starred ?? false,
      };
    });
    return { items, next: res.data.nextPageToken || null };
  }

  async deleteChat(chatId: string): Promise<void> {
    await request(this.limiter, `${API}/soft/${chatId}`, { method: 'DELETE' });
  }

  async renameChat(chatId: string, title: string): Promise<void> {
    const meta = (await requestJson(this.limiter, `${API}/${chatId}`)) as { starred?: unknown };
    await request(this.limiter, `${API}/${chatId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, starred: meta.starred === true }),
    });
  }

  async downloadAttachment(_conv: Conversation, att: Attachment): Promise<FileBytes> {
    if (typeof att.ref.url !== 'string') throw new Error('Grok exposes no download link for this file');
    const { bytes, mimeType } = await fetchBytes(att.ref.url);
    const mime = mimeType.split(';')[0]!;
    return { name: withExtension(att.name, mime), mimeType: mime, bytes };
  }
}
