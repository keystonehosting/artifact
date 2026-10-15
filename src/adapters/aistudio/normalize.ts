// AI Studio ResolveDriveResource payload → Artifact Conversation. Positions
// from the dossier (YourAIScroll reader) and Loominary's XHR reader (MIT):
// title [0][4][0]; chunks [0][13][0][] with text [0], role [8], thought flag
// [19]. Unconfirmed live; see docs/provider-notes.md (AI Studio).
import type { Attachment, Conversation, Message, Part } from '../../core/schema/archive';
import { at } from '../../core/schema/payloads/batchexecute';
import { linearMessages } from '../../core/model/tree';
import { PayloadError } from '../chatgpt/normalize';

const DATA_IMAGE = /^data:(image\/[\w.+-]+);base64,/;

function isChunk(c: unknown): c is unknown[] {
  return Array.isArray(c) && (at(c, 8) === 'user' || at(c, 8) === 'model');
}

/** Finds an inline image as [mimeType, base64] or a data: URL inside a chunk. */
function inlineImage(chunk: unknown[]): { mime: string; base64: string } | null {
  const scan = (v: unknown, depth: number): { mime: string; base64: string } | null => {
    if (depth > 4) return null;
    if (typeof v === 'string') {
      const m = DATA_IMAGE.exec(v);
      return m ? { mime: m[1]!, base64: v.slice(m[0].length) } : null;
    }
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string' && /^image\/[\w.+-]+$/.test(v[0]) && typeof v[1] === 'string' && v[1].length > 100) return { mime: v[0], base64: v[1] };
      for (const x of v) {
        const r = scan(x, depth + 1);
        if (r) return r;
      }
    }
    return null;
  };
  return scan(chunk.slice(1, 8), 0);
}

export function aistudioToConversation(raw: unknown, promptId: string, url: string): Conversation {
  const root = Array.isArray(raw) && typeof at(raw, 0) === 'string' ? [raw] : raw;
  const chunks = at(root, 0, 13, 0);
  if (!Array.isArray(chunks)) throw new PayloadError('AI Studio payload changed: [0][13][0] (chunks) is not an array');
  const title = typeof at(root, 0, 4, 0) === 'string' ? (at(root, 0, 4, 0) as string) : '';
  // The payload position of the model is not known; the adapter fills it from the page's model picker.
  const model: string | null = null;

  const items: Array<Omit<Message, 'parentId' | 'childIds'>> = [];
  const attachments: Attachment[] = [];
  let pending: { parts: Part[]; attachmentIds: string[] } | null = null;
  let n = 0;
  const flush = () => {
    if (pending && pending.parts.length) {
      items.push({ id: `m${n++}`, role: 'assistant', model, parts: pending.parts, attachmentIds: pending.attachmentIds, artifactIds: [] });
    }
    pending = null;
  };

  for (const c of chunks) {
    if (!isChunk(c)) continue;
    const text = typeof c[0] === 'string' ? c[0] : '';
    const img = inlineImage(c);
    if (c[8] === 'user') {
      flush();
      const id = `m${n}`;
      const parts: Part[] = [];
      const attIds: string[] = [];
      if (img) {
        const aid = `${id}:img`;
        attachments.push({ id: aid, messageId: id, kind: 'upload', name: `upload-${n + 1}.${img.mime.split('/')[1]}`, mimeType: img.mime, ref: { inline: img.base64 } });
        attIds.push(aid);
        parts.push({ type: 'image', attachmentId: aid });
      }
      if (text.trim()) parts.push({ type: 'text', text });
      if (!parts.length) continue;
      n++;
      items.push({ id, role: 'user', parts, attachmentIds: attIds, artifactIds: [] });
    } else {
      pending ??= { parts: [], attachmentIds: [] };
      if (c[19] === 1) {
        if (text.trim()) pending.parts.push({ type: 'thinking', text });
      } else {
        if (text.trim()) pending.parts.push({ type: 'text', text });
        if (img) {
          const aid = `m${n}:img:${pending.attachmentIds.length}`;
          attachments.push({ id: aid, messageId: `m${n}`, kind: 'generated', name: `image-${n + 1}.${img.mime.split('/')[1]}`, mimeType: img.mime, ref: { inline: img.base64 } });
          pending.attachmentIds.push(aid);
          pending.parts.push({ type: 'image', attachmentId: aid });
        }
      }
    }
  }
  flush();
  const tree = linearMessages(items);
  return {
    id: `aistudio:${promptId}`,
    site: 'aistudio',
    siteChatId: promptId,
    url,
    title: title || 'Untitled',
    createdAt: null,
    updatedAt: null,
    model,
    project: null,
    ...tree,
    attachments,
    artifacts: [],
    source: { method: 'endpoint', approximate: false, capturedAt: new Date().toISOString() },
    metadata: {},
  };
}
