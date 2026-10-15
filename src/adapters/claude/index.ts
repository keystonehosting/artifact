import { BaseAdapter, defaultContext, type SiteContext } from '../base';
import { CLAUDE_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';
import type { ChatSummary, FileBytes, Page, ProjectDetail, ProjectSummary, Read, UsageReport, UsageWindow } from '../types';
import type { Artifact, Attachment, Conversation } from '../../core/schema/archive';
import { claudeToConversation } from './normalize';
import { ClaudeOrganizationsSchema, ClaudeProjectDocSchema, ClaudeProjectSchema } from '../../core/schema/payloads/claude';
import { readCookie, request, requestJson } from '../../core/net/fetch';
import { fetchBytes } from '../../core/net/bytes';
import { mimeFromName, withExtension } from '../../core/util/bytes';
import { parseClaudeMessageLimit, parseClaudeUsage } from './usage';
import { z } from 'zod';
import type { Plan } from '../../core/limits/limits';
import { claudeChatId } from '../../core/sites/chat-urls';
export { claudeChatId };

const CHECK_READ = 'claude.conversation';
const CHECK_ORG = 'claude.organization';
const PAGE = 100;

const ListV2Schema = z.union([
  z.array(z.looseObject({ uuid: z.string() })),
  z.looseObject({ data: z.array(z.looseObject({ uuid: z.string() })).optional(), has_more: z.boolean().optional() }),
]);

export class ClaudeAdapter extends BaseAdapter {
  private orgId: string | null = null;
  private lastUsage: UsageReport | null = null;

  constructor(ctx: SiteContext = defaultContext()) {
    super(
      {
        site: 'claude',
        chatIdFromUrl: claudeChatId,
        dom: CLAUDE_DOM,
        ...SELECTORS.claude,
        capabilities: {
          structuredRead: true,
          branches: true,
          listChats: true,
          projects: true,
          deleteChat: true,
          attachments: true,
          artifacts: true,
          usage: true,
          sidebarFolders: true,
        },
      },
      [],
      ctx,
    );
    this.bridge?.subscribe((c) => {
      const org = /\/api\/organizations\/([0-9a-f-]{36})\//i.exec(c.url)?.[1];
      if (org) this.orgId = org;
      if (c.kind === 'claude.message_limit') {
        const u = parseClaudeMessageLimit(c.body);
        if (u) this.lastUsage = u;
      } else if (c.kind === 'claude.usage') {
        try {
          const u = parseClaudeUsage(JSON.parse(c.body), 'intercept');
          if (u) this.lastUsage = u;
        } catch {
          // ignore malformed capture
        }
      }
    });
  }

  private async org(): Promise<string> {
    if (this.orgId) return this.orgId;
    const cookie = readCookie('lastActiveOrg', this.doc.cookie);
    if (cookie && /^[0-9a-f-]{36}$/i.test(cookie)) {
      this.orgId = cookie;
      this.tracker.pass(CHECK_ORG, 'Organization from session');
      return cookie;
    }
    const res = ClaudeOrganizationsSchema.safeParse(await requestJson(this.limiter, '/api/organizations'));
    if (!res.success || !res.data.length) {
      this.tracker.fail(CHECK_ORG, 'Organization list unavailable or changed');
      throw new Error('Claude organization unknown');
    }
    const chat = res.data.find((o) => o.capabilities?.includes('chat')) ?? res.data[0]!;
    this.orgId = chat.uuid;
    this.tracker.pass(CHECK_ORG, 'Organization found');
    return chat.uuid;
  }

  private chatUrl(id: string): string {
    return `https://claude.ai/chat/${id}`;
  }

  protected override async readStructured(chatId: string): Promise<Read<Conversation> | null> {
    const captured = this.bridge?.find('claude.conversation', chatId);
    if (captured) {
      try {
        const org = /\/organizations\/([^/]+)\//.exec(captured.url)?.[1] ?? (await this.org());
        const conv = claudeToConversation(JSON.parse(captured.body), org, this.chatUrl(chatId));
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
    const org = await this.org();
    const raw = await requestJson(
      this.limiter,
      `/api/organizations/${org}/chat_conversations/${chatId}?tree=True&rendering_mode=messages&render_all_tools=true`,
    );
    const conv = claudeToConversation(raw, org, this.chatUrl(chatId));
    this.tracker.pass(CHECK_READ, 'Read from the conversation endpoint');
    return { value: conv, source: 'endpoint', approximate: false };
  }

  async listChats(cursor: string | null): Promise<Page<ChatSummary>> {
    const org = await this.org();
    const offset = Number(cursor ?? '0') || 0;
    const raw = await requestJson(this.limiter, `/api/organizations/${org}/chat_conversations_v2?limit=${PAGE}&offset=${offset}&consistency=eventual`);
    const res = ListV2Schema.safeParse(raw);
    if (!res.success) {
      this.tracker.fail('claude.list', 'Conversation list payload changed');
      throw new Error('Claude list payload changed');
    }
    this.tracker.pass('claude.list', 'Conversation list readable');
    const rows = (Array.isArray(res.data) ? res.data : (res.data.data ?? [])) as Array<Record<string, unknown>>;
    const hasMore = Array.isArray(res.data) ? rows.length === PAGE : (res.data.has_more ?? rows.length === PAGE);
    const items = rows.map((r) => ({
      siteChatId: String(r.uuid),
      title: typeof r.name === 'string' && r.name ? r.name : 'Untitled',
      url: this.chatUrl(String(r.uuid)),
      updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
      createdAt: typeof r.created_at === 'string' ? r.created_at : null,
      projectId: typeof r.project_uuid === 'string' ? r.project_uuid : null,
      pinned: r.is_starred === true,
    }));
    return { items, next: hasMore ? String(offset + PAGE) : null };
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const org = await this.org();
    const raw = await requestJson(this.limiter, `/api/organizations/${org}/projects`);
    const res = z.array(ClaudeProjectSchema).safeParse(raw);
    if (!res.success) throw new Error('Claude project list payload changed');
    return res.data.map((p) => ({ id: p.uuid, name: p.name, kind: 'project' as const, url: `https://claude.ai/project/${p.uuid}` }));
  }

  async getProject(id: string): Promise<ProjectDetail> {
    const org = await this.org();
    const p = ClaudeProjectSchema.safeParse(await requestJson(this.limiter, `/api/organizations/${org}/projects/${id}`));
    if (!p.success) throw new Error('Claude project payload changed');
    const docs = z.array(ClaudeProjectDocSchema).safeParse(await requestJson(this.limiter, `/api/organizations/${org}/projects/${id}/docs`));
    let memory: string | null;
    try {
      const mem = (await requestJson(this.limiter, `/api/organizations/${org}/memory?project_uuid=${id}`)) as { memory?: unknown };
      memory = typeof mem.memory === 'string' ? mem.memory : null;
    } catch {
      memory = null;
    }
    return {
      id,
      name: p.data.name,
      kind: 'project',
      instructions: p.data.prompt_template ?? null,
      knowledge: (docs.success ? docs.data : []).map((d) => ({ id: d.uuid, name: d.file_name, content: d.content, downloadable: typeof d.content === 'string' })),
      memory,
    };
  }

  async deleteChat(chatId: string): Promise<void> {
    const org = await this.org();
    await request(this.limiter, `/api/organizations/${org}/chat_conversations/${chatId}`, { method: 'DELETE' });
  }

  async downloadAttachment(conv: Conversation, att: Attachment): Promise<FileBytes> {
    if (att.ref.extracted === true) {
      if (att.extractedText === undefined) throw new Error('Claude kept no text for this file');
      const name = /\.(txt|md|csv|json|py|js|ts|html|css|xml|ya?ml|log)$/i.test(att.name) ? att.name : `${att.name}.txt`;
      return { name, mimeType: mimeFromName(name), bytes: new TextEncoder().encode(att.extractedText) };
    }
    if (att.ref.created === true && typeof att.ref.path === 'string') {
      const org = typeof att.ref.orgId === 'string' ? att.ref.orgId : await this.org();
      const { bytes, mimeType } = await fetchBytes(
        `/api/organizations/${org}/conversations/${conv.siteChatId}/wiggle/download-file?path=${encodeURIComponent(att.ref.path)}`,
      );
      return { name: att.name, mimeType: mimeType.split(';')[0]!, bytes };
    }
    if (typeof att.ref.url === 'string') {
      const { bytes, mimeType } = await fetchBytes(att.ref.url);
      const mime = mimeType.split(';')[0]!;
      return { name: withExtension(att.name, mime), mimeType: mime, bytes };
    }
    throw new Error('Claude exposes no download link for this file');
  }

  async getArtifacts(conv: Conversation): Promise<Artifact[]> {
    return conv.artifacts;
  }

  async getUsage(): Promise<UsageReport | null> {
    try {
      const org = await this.org();
      const u = parseClaudeUsage(await requestJson(this.limiter, `/api/organizations/${org}/usage`), 'endpoint');
      if (u) {
        this.lastUsage = u;
        this.tracker.pass('claude.usage', 'Usage readable');
      } else this.tracker.fail('claude.usage', 'Usage payload changed');
    } catch (e) {
      this.tracker.fail('claude.usage', `Usage unavailable: ${(e as Error).message}`);
    }
    return this.lastUsage;
  }

  private plan: Plan | null = null;

  /** Plan tier from /api/account (dossier endpoints.md); "default_claude_ai" is the Free tier. */
  async getPlan(): Promise<Plan | null> {
    if (this.plan) return this.plan;
    try {
      const org = await this.org();
      const raw = (await requestJson(this.limiter, '/api/account')) as { memberships?: Array<{ organization?: { uuid?: string; rate_limit_tier?: unknown } }> };
      const m = raw.memberships?.find((x) => x.organization?.uuid === org) ?? raw.memberships?.[0];
      const tier = typeof m?.organization?.rate_limit_tier === 'string' ? m.organization.rate_limit_tier : '';
      if (!tier) return null;
      this.plan = tier === 'default_claude_ai' ? 'free' : /max/i.test(tier) ? 'max' : /team/i.test(tier) ? 'team' : /enterprise/i.test(tier) ? 'enterprise' : 'pro';
      this.tracker.pass('claude.plan', `Plan tier detected: ${this.plan}`);
      return this.plan;
    } catch (e) {
      this.tracker.fail('claude.plan', `Plan unavailable: ${(e as Error).message}`);
      return null;
    }
  }

  /** Latest usage seen in the page's own traffic, without a request. */
  observedUsage(): UsageReport | null {
    return this.lastUsage;
  }

  protected override async extraSelfTest(): Promise<void> {
    try {
      await this.org();
      await this.getUsage();
    } catch {
      // recorded in checks
    }
  }
}

export type { UsageWindow };
