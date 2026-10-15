// Messages handled by the background.
import type { BroadcastJob, PendingFill } from '../crossai/hub';
import type { Tier1SiteId } from '../sites/sites';

export interface BackgroundRequests {
  'bg:fetch-bytes': { req: { url: string }; res: { base64: string; mimeType: string } | { error: string } };
  /** A content script asks for text waiting for its tab's composer. */
  'bg:take-fill': { req: Record<never, never>; res: { fill: PendingFill | null } };
  /** Opens a new chat on `site` with text waiting in its composer. */
  'bg:open-with-fill': { req: { site: Tier1SiteId; text: string; autoSend: boolean }; res: { tabId: number } };
  'bg:broadcast': { req: { sites: Tier1SiteId[]; text: string; autoSend: boolean }; res: { job: BroadcastJob } };
  'bg:job': { req: { id: string }; res: { job: BroadcastJob | null } };
  'bg:reply-finished': { req: { title: string; seconds: number }; res: { ok: true } };
}

export type BackgroundMessage = {
  [K in keyof BackgroundRequests]: { type: K } & BackgroundRequests[K]['req'];
}[keyof BackgroundRequests];

export function isBackgroundMessage(m: unknown): m is BackgroundMessage {
  return typeof m === 'object' && m !== null && typeof (m as { type?: unknown }).type === 'string' && (m as { type: string }).type.startsWith('bg:');
}
