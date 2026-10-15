import { BaseAdapter, defaultContext, type SiteContext } from '../base';
import { CHATGPT_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';
import type { ChatSummary, FileBytes, ModelInfo, Page, ProjectSummary, Read } from '../types';
import type { Artifact, Attachment, Conversation } from '../../core/schema/archive';
import { chatgptToConversation } from './normalize';
import { ChatGPTFileDownloadSchema, ChatGPTListSchema, ChatGPTSessionSchema } from '../../core/schema/payloads/chatgpt';
import { readCookie, request, requestJson } from '../../core/net/fetch';
import { fetchBytes } from '../../core/net/bytes';
import { mimeFromName, withExtension } from '../../core/util/bytes';
import type { Plan } from '../../core/limits/limits';

export function chatgptChatId(url: URL): string | null {
  const m = /\/c\/([0-9a-f-]{8,})/i.exec(url.pathname);
  return m ? m[1]! : null;
}

const CHECK_READ = 'chatgpt.conversation';
const CHECK_AUTH = 'chatgpt.auth';
const PAGE = 100;

export class ChatGPTAdapter extends BaseAdapter {
  private auth: { token: string; account: string | null } | null = null;

  constructor(ctx: SiteContext = defaultContext()) {
    super(
      {
        site: 'chatgpt',
        chatIdFromUrl: chatgptChatId,
        dom: CHATGPT_DOM,
        ...SELECTORS.chatgpt,
        capabilities: {
          structuredRead: true,
          branches: true,
          listChats: true,
          projects: true,
          deleteChat: true,
          archiveChat: true,
          renameChat: true,
          attachments: true,
          artifacts: true,
          modelSwitch: true,
          sidebarFolders: true,
        },
      },
      [],
      ctx,
    );
    this.bridge?.subscribe((c) => {
      if (c.kind !== 'auth') return;
      try {
        const v = JSON.parse(c.body) as { auth?: string; account?: string | null };
        if (v.auth?.startsWith('Bearer ')) this.auth = { token: v.auth.slice(7), account: v.account ?? null };
      } catch {
        // ignore malformed hook messages
      }
    });
  }

  private async headers(): Promise<Record<string, string>> {
    if (!this.auth) {
      const session = ChatGPTSessionSchema.safeParse(await requestJson(this.limiter, '/api/auth/session'));
      if (!session.success) {
        this.tracker.fail(CHECK_AUTH, 'Session has no access token (signed out, or the session payload changed)');
        throw new Error('ChatGPT session token unavailable');
      }
      this.auth = { token: session.data.accessToken, account: null };
    }
    this.tracker.pass(CHECK_AUTH, 'Session token available');
    const h: Record<string, string> = { authorization: `Bearer ${this.auth.token}` };
    const device = readCookie('oai-did', this.doc.cookie);
    if (device) h['oai-device-id'] = device;
    if (this.auth.account) h['chatgpt-account-id'] = this.auth.account;
    return h;
  }

  private chatUrl(id: string): string {
    return `${this.url().origin}/c/${id}`;
  }

  protected override async readStructured(chatId: string): Promise<Read<Conversation> | null> {
    const captured = this.bridge?.find('chatgpt.conversation', chatId);
    if (captured) {
      try {
        const conv = chatgptToConversation(JSON.parse(captured.body), chatId, this.chatUrl(chatId));
        conv.source.method = 'intercept';
        this.tracker.pass(CHECK_READ, 'Read from the page’s own conversation request');
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
    const raw = await requestJson(this.limiter, `/backend-api/conversation/${encodeURIComponent(chatId)}`, { headers: await this.headers() });
    const conv = chatgptToConversation(raw, chatId, this.chatUrl(chatId));
    this.tracker.pass(CHECK_READ, 'Read from backend-api');
    return { value: conv, source: 'endpoint', approximate: false };
  }

  async listChats(cursor: string | null): Promise<Page<ChatSummary>> {
    // Cursor encodes "<archived 0|1>:<offset>" so one listing covers active then archived chats.
    const [arch, off] = (cursor ?? '0:0').split(':');
    const archived = arch === '1';
    const offset = Number(off) || 0;
    const raw = await requestJson(
      this.limiter,
      `/backend-api/conversations?offset=${offset}&limit=${PAGE}&order=updated&is_archived=${archived}`,
      { headers: await this.headers() },
    );
    const res = ChatGPTListSchema.safeParse(raw);
    if (!res.success) {
      this.tracker.fail('chatgpt.list', `Conversation list payload changed: ${res.error.issues[0]?.path.join('.')}`);
      throw new Error('ChatGPT list payload changed');
    }
    this.tracker.pass('chatgpt.list', 'Conversation list readable');
    const iso = (v: string | number | null | undefined) =>
      v == null ? null : typeof v === 'number' ? new Date(v * 1000).toISOString() : v;
    const items = res.data.items.map((i) => ({
      siteChatId: i.id,
      title: i.title ?? 'Untitled',
      url: this.chatUrl(i.id),
      updatedAt: iso(i.update_time),
      createdAt: iso(i.create_time),
      archived: i.is_archived ?? archived,
      projectId: i.gizmo_id ?? null,
    }));
    const next = items.length === PAGE ? `${arch}:${offset + PAGE}` : archived ? null : '1:0';
    return { items, next };
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const out: ProjectSummary[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 50; i++) {
      const q: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const raw = (await requestJson(this.limiter, `/backend-api/gizmos/snorlax/sidebar?owned_only=true${q}`, { headers: await this.headers() })) as {
        items?: Array<{ gizmo?: { gizmo?: { id?: string; display?: { name?: string } }; id?: string; display?: { name?: string } } }>;
        cursor?: string | null;
      };
      for (const it of raw.items ?? []) {
        const g = it.gizmo?.gizmo ?? it.gizmo;
        if (g?.id) out.push({ id: g.id, name: g.display?.name ?? g.id, kind: g.id.startsWith('g-p-') ? 'project' : 'gpt', url: `${this.url().origin}/g/${g.id}/project` });
      }
      cursor = raw.cursor ?? null;
      if (!cursor) break;
    }
    return out;
  }

  private async patch(chatId: string, body: Record<string, unknown>, query = ''): Promise<void> {
    await request(this.limiter, `/backend-api/conversation/${encodeURIComponent(chatId)}${query}`, {
      method: 'PATCH',
      headers: { ...(await this.headers()), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.patch(chatId, { is_visible: false });
  }

  async archiveChat(chatId: string, archived: boolean): Promise<void> {
    await this.patch(chatId, { is_archived: archived });
  }

  async renameChat(chatId: string, title: string): Promise<void> {
    await this.patch(chatId, { title });
  }

  async downloadAttachment(conv: Conversation, att: Attachment): Promise<FileBytes> {
    const fileId = typeof att.ref.fileId === 'string' ? att.ref.fileId : null;
    if (!fileId) throw new Error('No file id for this attachment');
    const pointer = typeof att.ref.assetPointer === 'string' ? att.ref.assetPointer : '';
    const path = pointer.startsWith('sediment://')
      ? `/backend-api/conversation/${encodeURIComponent(conv.siteChatId)}/attachment/${encodeURIComponent(fileId)}/download`
      : `/backend-api/files/${encodeURIComponent(fileId)}/download`;
    const meta = ChatGPTFileDownloadSchema.safeParse(await requestJson(this.limiter, path, { headers: await this.headers() }));
    if (!meta.success) throw new Error('File download payload changed (no download_url)');
    const { bytes, mimeType } = await fetchBytes(meta.data.download_url);
    const name = meta.data.file_name ?? att.name;
    const mime = mimeType === 'application/octet-stream' ? mimeFromName(name) : mimeType.split(';')[0]!;
    return { name: withExtension(name, mime), mimeType: mime, bytes };
  }

  private plan: Plan | null = null;

  /** Plan from the accounts check endpoint (dossier endpoints.md); unconfirmed live. */
  async getPlan(): Promise<Plan | null> {
    if (this.plan) return this.plan;
    try {
      const raw = (await requestJson(this.limiter, '/backend-api/accounts/check/v4-2023-04-27', { headers: await this.headers() })) as {
        accounts?: Record<string, { account?: { plan_type?: unknown; structure?: unknown } }>;
      };
      const accounts = raw.accounts ?? {};
      const acct = (this.auth?.account && accounts[this.auth.account]) || accounts.default || Object.values(accounts)[0];
      const t = typeof acct?.account?.plan_type === 'string' ? acct.account.plan_type.toLowerCase() : '';
      const map: Record<string, Plan> = { free: 'free', go: 'go', plus: 'plus', pro: 'pro', team: 'business', business: 'business', enterprise: 'enterprise', edu: 'enterprise' };
      this.plan = map[t] ?? null;
      if (this.plan) this.tracker.pass('chatgpt.plan', `Plan detected: ${this.plan}`);
      else this.tracker.fail('chatgpt.plan', 'Plan not recognized in the accounts payload');
      return this.plan;
    } catch (e) {
      this.tracker.fail('chatgpt.plan', `Plan unavailable: ${(e as Error).message}`);
      return null;
    }
  }

  async getArtifacts(conv: Conversation): Promise<Artifact[]> {
    return conv.artifacts;
  }

  override async getModel(): Promise<ModelInfo> {
    const dom = await super.getModel();
    if (dom.slug) return dom;
    const label = this.doc.querySelector(SELECTORS.chatgpt.modelLabel)?.textContent?.trim() ?? null;
    return { slug: null, label, source: 'dom' };
  }

  protected override async extraSelfTest(): Promise<void> {
    try {
      await this.headers();
    } catch {
      // recorded by headers()
    }
  }
}
