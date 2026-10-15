// Messages handled by the background.
export interface BackgroundRequests {
  'bg:fetch-bytes': { req: { url: string }; res: { base64: string; mimeType: string } | { error: string } };
}

export type BackgroundMessage = {
  [K in keyof BackgroundRequests]: { type: K } & BackgroundRequests[K]['req'];
}[keyof BackgroundRequests];

export function isBackgroundMessage(m: unknown): m is BackgroundMessage {
  return typeof m === 'object' && m !== null && typeof (m as { type?: unknown }).type === 'string' && (m as { type: string }).type.startsWith('bg:');
}
