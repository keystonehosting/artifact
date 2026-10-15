// grok.com response-node + load-responses payloads → Artifact Conversation.
// Field meanings: docs/provider-notes.md (Grok).
import type { Attachment, Conversation, Message, Part } from '../../core/schema/archive';
import { GrokLoadResponsesSchema, GrokResponseNodesSchema } from '../../core/schema/payloads/grok';
import { PayloadError } from '../chatgpt/normalize';

const ASSET_ORIGIN = 'https://assets.grok.com/';

function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return ASSET_ORIGIN + path.replace(/^\/+/, '');
}

/** Grok inlines citation cards as <grok:render> elements; drop them from the Markdown. */
export function stripRenderTags(text: string): string {
  return text.replace(/<grok:render[\s\S]*?<\/grok:render>/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

export function grokToConversation(
  nodesRaw: unknown,
  responsesRaw: unknown,
  siteChatId: string,
  url: string,
  title: string,
): Conversation {
  const nodes = GrokResponseNodesSchema.safeParse(nodesRaw);
  if (!nodes.success) throw new PayloadError(`Grok response-node payload changed: ${nodes.error.issues[0]?.path.join('.') ?? ''}`);
  const loaded = GrokLoadResponsesSchema.safeParse(Array.isArray(responsesRaw) ? { responses: responsesRaw } : responsesRaw);
  if (!loaded.success) throw new PayloadError(`Grok load-responses payload changed: ${loaded.error.issues[0]?.path.join('.') ?? ''}`);

  const byId = new Map(loaded.data.responses.map((r) => [r.responseId, r]));
  const messages: Record<string, Message> = {};
  const attachments: Attachment[] = [];
  const order = nodes.data.responseNodes.map((n) => n.responseId);

  for (const node of nodes.data.responseNodes) {
    const r = byId.get(node.responseId);
    if (!r) continue;
    const isUser = r.sender.toLowerCase() === 'human';
    const parts: Part[] = [];
    const attachmentIds: string[] = [];
    if (r.thinkingTrace?.trim()) parts.push({ type: 'thinking', text: r.thinkingTrace });
    const text = stripRenderTags(r.message);
    if (text) parts.push({ type: 'text', text });
    for (const [i, path] of (r.generatedImageUrls ?? []).entries()) {
      const id = `${r.responseId}:gen:${i}`;
      attachments.push({ id, messageId: r.responseId, kind: 'generated', name: path.split('/').pop() || `image-${i + 1}.jpg`, ref: { url: assetUrl(path) } });
      attachmentIds.push(id);
      parts.push({ type: 'image', attachmentId: id });
    }
    for (const [i, a] of (r.imageAttachments ?? []).entries()) {
      const path = typeof a === 'string' ? a : a && typeof a === 'object' ? ((a as { imageUrl?: unknown; url?: unknown }).imageUrl ?? (a as { url?: unknown }).url) : null;
      if (typeof path !== 'string') continue;
      const id = `${r.responseId}:img:${i}`;
      attachments.push({ id, messageId: r.responseId, kind: 'upload', name: path.split('/').pop() || `image-${i + 1}`, ref: { url: assetUrl(path) } });
      attachmentIds.push(id);
      parts.push({ type: 'image', attachmentId: id });
    }
    for (const [i, a] of (r.fileAttachments ?? []).entries()) {
      if (!a || typeof a !== 'object') continue;
      const f = a as { fileMetadataId?: unknown; fileName?: unknown; fileUri?: unknown; fileMimeType?: unknown };
      if (typeof f.fileName !== 'string' && typeof f.fileUri !== 'string') continue;
      const id = `${r.responseId}:file:${i}`;
      attachments.push({
        id,
        messageId: r.responseId,
        kind: 'upload',
        name: typeof f.fileName === 'string' ? f.fileName : `file-${i + 1}`,
        ...(typeof f.fileMimeType === 'string' ? { mimeType: f.fileMimeType } : {}),
        ref: { url: typeof f.fileUri === 'string' ? assetUrl(f.fileUri) : null, fileId: typeof f.fileMetadataId === 'string' ? f.fileMetadataId : null },
      });
      attachmentIds.push(id);
    }
    for (const w of r.webSearchResults ?? []) parts.push({ type: 'citation', url: w.url, ...(w.title ? { title: w.title } : {}) });

    const parentId = node.parentResponseId ?? r.parentResponseId ?? null;
    messages[r.responseId] = {
      id: r.responseId,
      parentId: parentId && byId.has(parentId) ? parentId : null,
      childIds: [],
      role: isUser ? 'user' : 'assistant',
      model: isUser ? null : (r.model ?? null),
      createdAt: r.createTime ?? null,
      parts,
      attachmentIds,
      artifactIds: [],
    };
  }
  for (const id of order) {
    const m = messages[id];
    if (m?.parentId) messages[m.parentId]!.childIds.push(id);
  }
  const all = Object.values(messages);
  const rootIds = all.filter((m) => !m.parentId).map((m) => m.id);
  // The page shows the most recent branch: the newest leaf.
  const leaf = all
    .filter((m) => m.childIds.length === 0)
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .pop();

  return {
    id: `grok:${siteChatId}`,
    site: 'grok',
    siteChatId,
    url,
    title: title || 'Untitled',
    createdAt: all[0]?.createdAt ?? null,
    updatedAt: leaf?.createdAt ?? null,
    model: [...all].reverse().find((m) => m.model)?.model ?? null,
    project: null,
    messages,
    rootIds,
    currentLeafId: leaf?.id ?? null,
    attachments,
    artifacts: [],
    source: { method: 'endpoint', approximate: false, capturedAt: new Date().toISOString() },
    metadata: {},
  };
}
