// Which page requests the page-world hook copies. Shared by the hook (page
// world) and the bridge (isolated world); keep it dependency-free and small.

export const HOOK_SOURCE = 'artifact-page-hook';

export type CaptureKind =
  | 'chatgpt.conversation'
  | 'claude.conversation'
  | 'claude.completion'
  | 'claude.usage'
  | 'gemini.batchexecute'
  | 'aistudio.resolve'
  | 'grok.responses'
  | 'grok.nodes';

export type HookKind = CaptureKind | 'auth' | 'claude.message_limit' | 'claude.stream_end' | 'session.expired';

export interface HookMessage {
  source: typeof HOOK_SOURCE;
  kind: HookKind;
  url: string;
  method: string;
  status: number;
  body: string;
}

export function matchCapture(url: string, method: string): CaptureKind | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const h = u.hostname;
  const p = u.pathname;
  if (h === 'chatgpt.com' || h === 'chat.openai.com') {
    if (method === 'GET' && /^\/backend-api\/conversation\/[0-9a-f-]{8,}$/i.test(p)) return 'chatgpt.conversation';
    return null;
  }
  if (h === 'claude.ai') {
    if (method === 'GET' && /^\/api\/organizations\/[^/]+\/chat_conversations\/[0-9a-f-]{36}$/i.test(p) && /tree=true/i.test(u.search)) return 'claude.conversation';
    if (method === 'POST' && /^\/api\/organizations\/[^/]+\/chat_conversations\/[0-9a-f-]{36}\/(?:retry_)?completion$/i.test(p)) return 'claude.completion';
    if (method === 'GET' && /^\/api\/organizations\/[^/]+\/usage$/.test(p)) return 'claude.usage';
    return null;
  }
  if (h === 'gemini.google.com') {
    if (method === 'POST' && p.endsWith('/_/BardChatUi/data/batchexecute')) {
      const ids = u.searchParams.get('rpcids') ?? '';
      if (/\b(hNvQHb|jSf9Qc|MaZiqc)\b/.test(ids)) return 'gemini.batchexecute';
    }
    return null;
  }
  if (h === 'alkalimakersuite-pa.clients6.google.com') {
    if (method === 'POST' && /\/MakerSuiteService\/(ResolveDriveResource|CreatePrompt|UpdatePrompt)$/.test(p)) return 'aistudio.resolve';
    return null;
  }
  if (h === 'grok.com') {
    if (/^\/rest\/app-chat\/conversations\/[^/]+\/load-responses$/.test(p)) return 'grok.responses';
    if (method === 'GET' && /^\/rest\/app-chat\/conversations\/[^/]+\/response-node$/.test(p)) return 'grok.nodes';
    return null;
  }
  return null;
}
