// ChatGPT backend-api conversation payload → Artifact Conversation.
// Field meanings: docs/provider-notes.md (ChatGPT). Unknown content types are
// kept as plain text when they carry text, and skipped otherwise.
import type { Artifact, Attachment, Conversation, Message, Part } from '../../core/schema/archive';
import { ChatGPTConversationSchema, type ChatGPTConversation, type ChatGPTMessage } from '../../core/schema/payloads/chatgpt';

export class PayloadError extends Error {}

const HIDDEN_TYPES = new Set(['user_editable_context', 'model_editable_context', 'reasoning_recap']);

function iso(epochSeconds: number | null | undefined): string | null {
  return typeof epochSeconds === 'number' && Number.isFinite(epochSeconds) ? new Date(epochSeconds * 1000).toISOString() : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Replaces inline citation markers with Markdown links and returns citation parts. */
function applyReferences(text: string, refs: unknown[] | undefined): { text: string; citations: Part[] } {
  const citations: Part[] = [];
  if (!refs?.length) return { text, citations };
  let out = text;
  for (const r of refs) {
    if (!r || typeof r !== 'object') continue;
    const ref = r as { matched_text?: unknown; items?: Array<{ url?: unknown; title?: unknown }>; type?: unknown };
    const matched = str(ref.matched_text);
    if (!matched) continue;
    const item = ref.items?.find((i) => typeof i?.url === 'string');
    if (item && typeof item.url === 'string') {
      const title = str(item.title) || new URL(item.url).hostname;
      out = out.split(matched).join(` [${title.replace(/[[\]]/g, '')}](${item.url})`);
      citations.push({ type: 'citation', url: item.url, title });
    } else {
      out = out.split(matched).join('');
    }
  }
  return { text: out, citations };
}

export function chatgptToConversation(raw: unknown, siteChatId: string, url: string): Conversation {
  const parsed = ChatGPTConversationSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new PayloadError(`ChatGPT conversation payload changed: ${i?.path.join('.') || 'root'} ${i?.message ?? ''}`);
  }
  const data: ChatGPTConversation = parsed.data;
  const messages: Record<string, Message> = {};
  const attachments: Attachment[] = [];
  const artifacts = new Map<string, Artifact>();
  const nodes = data.mapping;

  const hasMessage = (id: string | null | undefined): id is string => !!id && !!nodes[id]?.message;

  // Canvas (textdoc) operations appear as assistant messages addressed to canmore.*.
  // The tool reply that follows carries the textdoc id and version.
  const canvasTarget = (nodeId: string): { id: string; version: number | null } | null => {
    for (const child of nodes[nodeId]?.children ?? []) {
      const meta = nodes[child]?.message?.metadata as { canvas?: { textdoc_id?: unknown; version?: unknown } } | undefined;
      const id = meta?.canvas?.textdoc_id;
      if (typeof id === 'string') return { id, version: typeof meta?.canvas?.version === 'number' ? meta.canvas.version : null };
    }
    return null;
  };

  // Walk nodes in creation order so canvas versions apply in sequence.
  const order = Object.keys(nodes)
    .filter(hasMessage)
    .sort((a, b) => (nodes[a]!.message!.create_time ?? 0) - (nodes[b]!.message!.create_time ?? 0));

  for (const nodeId of order) {
    const node = nodes[nodeId]!;
    const m: ChatGPTMessage = node.message!;
    const role = m.author.role === 'user' || m.author.role === 'assistant' || m.author.role === 'system' || m.author.role === 'tool' ? m.author.role : 'tool';
    const ct = m.content.content_type;
    const parts: Part[] = [];
    const attachmentIds: string[] = [];
    const artifactIds: string[] = [];
    let hidden = m.metadata?.is_visually_hidden_from_conversation === true || role === 'system' || HIDDEN_TYPES.has(ct);

    const recipient = m.recipient ?? 'all';
    if (role === 'assistant' && recipient.startsWith('canmore.')) {
      const target = canvasTarget(nodeId);
      const text = str(m.content.text) || (m.content.parts ?? []).map(str).join('');
      let payload: { name?: unknown; type?: unknown; content?: unknown; updates?: unknown } = {};
      try {
        payload = JSON.parse(text) as typeof payload;
      } catch {
        payload = {};
      }
      if (target) {
        const existing = artifacts.get(target.id);
        if (recipient === 'canmore.create_textdoc' && typeof payload.content === 'string') {
          const type = str(payload.type) || 'document';
          artifacts.set(target.id, {
            id: target.id,
            messageId: nodeId,
            kind: 'chatgpt-canvas',
            title: str(payload.name) || 'Canvas',
            type: type.startsWith('code/') ? `text/x-${type.slice(5)}` : 'text/markdown',
            language: type.startsWith('code/') ? type.slice(5) : undefined,
            versions: [{ content: payload.content, createdAt: iso(m.create_time), messageId: nodeId }],
          });
          artifactIds.push(target.id);
          parts.push({ type: 'artifact_ref', artifactId: target.id });
        } else if (recipient === 'canmore.update_textdoc' && existing && Array.isArray(payload.updates)) {
          let content = existing.versions[existing.versions.length - 1]!.content;
          for (const u of payload.updates as Array<{ pattern?: unknown; replacement?: unknown; multiple?: unknown }>) {
            if (typeof u.pattern !== 'string' || typeof u.replacement !== 'string') continue;
            try {
              content = content.replace(new RegExp(u.pattern, u.multiple ? 'gs' : 's'), () => u.replacement as string);
            } catch {
              // An invalid pattern leaves this version unchanged.
            }
          }
          existing.versions.push({ content, createdAt: iso(m.create_time), messageId: nodeId });
          artifactIds.push(target.id);
          parts.push({ type: 'artifact_ref', artifactId: target.id });
        }
      }
      hidden = hidden || parts.length === 0;
    } else if (ct === 'text') {
      const text = (m.content.parts ?? []).map(str).join('');
      const { text: withLinks, citations } = applyReferences(text, m.metadata?.content_references);
      if (withLinks.trim()) parts.push({ type: 'text', text: withLinks });
      parts.push(...citations);
    } else if (ct === 'multimodal_text') {
      for (const p of m.content.parts ?? []) {
        if (typeof p === 'string') {
          if (p.trim()) parts.push({ type: 'text', text: p });
          continue;
        }
        const obj = p as { content_type?: unknown; asset_pointer?: unknown; text?: unknown; size_bytes?: unknown; metadata?: { dalle?: { prompt?: unknown } } };
        if (obj.content_type === 'image_asset_pointer' && typeof obj.asset_pointer === 'string') {
          const id = `${nodeId}:${obj.asset_pointer}`;
          const fileId = obj.asset_pointer.replace(/^[a-z-]+:\/\//, '');
          const prompt = str(obj.metadata?.dalle?.prompt);
          attachments.push({
            id,
            messageId: nodeId,
            kind: role === 'user' ? 'upload' : 'generated',
            name: `${fileId}.png`,
            mimeType: 'image/png',
            ...(typeof obj.size_bytes === 'number' ? { size: obj.size_bytes } : {}),
            ref: { assetPointer: obj.asset_pointer, fileId },
          });
          attachmentIds.push(id);
          parts.push({ type: 'image', attachmentId: id, ...(prompt ? { alt: prompt } : {}) });
        } else if (typeof obj.text === 'string' && obj.text.trim()) {
          parts.push({ type: 'text', text: obj.text });
        }
      }
    } else if (ct === 'code') {
      const code = str(m.content.text);
      if (role === 'assistant' && recipient !== 'all') parts.push({ type: 'tool_call', name: recipient, input: code });
      else parts.push({ type: 'code', language: str(m.content.language) || '', code });
    } else if (ct === 'execution_output') {
      parts.push({ type: 'tool_call', name: m.author.name ?? 'tool', input: '', output: str(m.content.text) });
    } else if (ct === 'thoughts') {
      const thoughts = (m.content as { thoughts?: Array<{ summary?: unknown; content?: unknown }> }).thoughts ?? [];
      const text = thoughts
        .map((t) => [str(t.summary) && `**${str(t.summary)}**`, str(t.content)].filter(Boolean).join('\n\n'))
        .filter(Boolean)
        .join('\n\n');
      if (text) parts.push({ type: 'thinking', text });
    } else {
      const text = str(m.content.text) || (m.content.parts ?? []).map(str).join('') || str((m.content as { result?: unknown }).result);
      if (text.trim()) parts.push({ type: 'text', text });
    }

    for (const a of m.metadata?.attachments ?? []) {
      const id = `${nodeId}:${a.id}`;
      if (attachments.some((x) => x.id === id)) continue;
      attachments.push({
        id,
        messageId: nodeId,
        kind: 'upload',
        name: a.name ?? a.id,
        ...(a.mime_type ? { mimeType: a.mime_type } : {}),
        ...(typeof a.size === 'number' ? { size: a.size } : {}),
        ref: { fileId: a.id },
      });
      attachmentIds.push(id);
    }

    if (role === 'tool' && (!parts.length || (m.author.name ?? '').startsWith('canmore.'))) hidden = true;

    const parent = node.parent && hasMessage(node.parent) ? node.parent : null;
    messages[nodeId] = {
      id: nodeId,
      parentId: parent,
      childIds: node.children.filter(hasMessage),
      role,
      ...(role === 'tool' && m.author.name ? { author: m.author.name } : {}),
      model: m.metadata?.model_slug ?? null,
      createdAt: iso(m.create_time),
      parts,
      attachmentIds,
      artifactIds,
      ...(m.status && m.status !== 'finished_successfully' ? { status: m.status === 'in_progress' ? 'streaming' : 'error' } : {}),
      ...(hidden ? { hidden: true } : {}),
    } as Message;
  }

  const rootIds = Object.values(messages)
    .filter((m) => m.parentId === null)
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map((m) => m.id);
  const current = hasMessage(data.current_node) ? data.current_node : null;
  const lastModel = [...Object.values(messages)].reverse().find((m) => m.role === 'assistant' && m.model)?.model ?? null;

  return {
    id: `chatgpt:${siteChatId}`,
    site: 'chatgpt',
    siteChatId,
    url,
    title: data.title?.trim() || 'Untitled',
    createdAt: iso(data.create_time),
    updatedAt: iso(data.update_time),
    model: data.default_model_slug ?? lastModel,
    project: null,
    messages,
    rootIds,
    currentLeafId: current,
    attachments,
    artifacts: [...artifacts.values()],
    source: { method: 'endpoint', approximate: false, capturedAt: new Date().toISOString() },
    metadata: {
      ...(data.gizmo_id ? { gizmoId: data.gizmo_id } : {}),
      ...(typeof data.is_archived === 'boolean' ? { archived: data.is_archived } : {}),
    },
  };
}
