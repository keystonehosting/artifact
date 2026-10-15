// Typed messages between extension contexts. Every request carries `type`;
// handlers return a response object. Content-script requests go through
// tabs.sendMessage; background requests through runtime.sendMessage.
import type { Conversation } from '../schema/archive';
import type { SiteHealth } from '../health/health';
import type { SiteId } from '../sites/sites';

export interface ContentRequests {
  'content:ping': { req: Record<never, never>; res: { site: SiteId; chatId: string | null } };
  'content:read': {
    req: Record<never, never>;
    res: { conversation: Conversation | null; health: SiteHealth; error?: string };
  };
  'content:selftest': { req: Record<never, never>; res: { site: SiteId; health: SiteHealth; url: string } };
  'content:fill': { req: { text: string; submit?: boolean }; res: { ok: boolean } };
}

export type ContentMessage = {
  [K in keyof ContentRequests]: { type: K } & ContentRequests[K]['req'];
}[keyof ContentRequests];

export type ContentResponse<K extends keyof ContentRequests> = ContentRequests[K]['res'];

export function isContentMessage(m: unknown): m is ContentMessage {
  return typeof m === 'object' && m !== null && typeof (m as { type?: unknown }).type === 'string' && (m as { type: string }).type.startsWith('content:');
}
