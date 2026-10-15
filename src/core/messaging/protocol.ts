// Typed messages between extension contexts. Every request carries `type`;
// handlers return a response object. Content-script requests go through
// tabs.sendMessage; background requests through runtime.sendMessage.
import type { Conversation } from '../schema/archive';
import type { SiteHealth } from '../health/health';
import type { SiteId } from '../sites/sites';
import type { Capabilities, ChatSummary, ModelInfo, Page, ProjectDetail, ProjectSummary, UsageReport } from '../../adapters/types';

type Empty = Record<never, never>;

export interface ContentRequests {
  'content:ping': { req: Empty; res: { site: SiteId; chatId: string | null; capabilities: Capabilities } };
  'content:read': { req: Empty; res: { conversation: Conversation | null; health: SiteHealth; error?: string } };
  'content:get-chat': { req: { chatId: string }; res: { conversation: Conversation } };
  'content:selftest': { req: Empty; res: { site: SiteId; health: SiteHealth; url: string } };
  'content:fill': { req: { text: string; submit?: boolean }; res: { ok: boolean } };
  'content:model': { req: Empty; res: ModelInfo };
  'content:usage': { req: Empty; res: { usage: UsageReport | null } };
  'content:list-chats': { req: { cursor: string | null }; res: Page<ChatSummary> };
  'content:projects': { req: Empty; res: { projects: ProjectSummary[] } };
  'content:project': { req: { id: string }; res: { project: ProjectDetail } };
  'content:download': { req: { conversation: Conversation; attachmentId: string }; res: { name: string; mimeType: string; base64: string } };
  'content:delete': { req: { chatId: string }; res: { ok: true } };
  'content:archive': { req: { chatId: string; archived: boolean }; res: { ok: true } };
  'content:rename': { req: { chatId: string; title: string }; res: { ok: true } };
  'content:jump': { req: { chatId: string; messageId: string | null; url: string | null }; res: { navigated: boolean; found: boolean } };
  'content:find': { req: Empty; res: { open: boolean } };
  'content:blur': { req: { on?: boolean }; res: { on: boolean } };
  'content:deep-scan': { req: { fresh: boolean }; res: { started: boolean } };
  'content:deep-scan-stop': { req: Empty; res: { ok: true } };
}

export type ContentMessage = {
  [K in keyof ContentRequests]: { type: K } & ContentRequests[K]['req'];
}[keyof ContentRequests];

export type ContentResponse<K extends keyof ContentRequests> = ContentRequests[K]['res'];

export function isContentMessage(m: unknown): m is ContentMessage {
  return typeof m === 'object' && m !== null && typeof (m as { type?: unknown }).type === 'string' && (m as { type: string }).type.startsWith('content:');
}
