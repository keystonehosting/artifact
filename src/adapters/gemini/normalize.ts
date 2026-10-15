// Gemini hNvQHb (read chat) payload → Artifact Conversation. Positions come
// from the captured response in tests/fixtures/sites/gemini-api-response.json
// and the dossier; see docs/provider-notes.md (Gemini). Turns arrive newest
// first. Each turn has one user prompt and one or more reply drafts
// (regenerations), which become sibling branches.
import { z } from 'zod';
import type { Attachment, Conversation, Message, Part } from '../../core/schema/archive';
import { at } from '../../core/schema/payloads/batchexecute';
import { PayloadError } from '../chatgpt/normalize';

const TurnSchema = z
  .array(z.unknown())
  .refine((t) => typeof at(t, 0, 1) === 'string', 'turn[0][1] (turn id) is not a string')
  .refine((t) => Array.isArray(at(t, 3, 0)), 'turn[3][0] (reply drafts) is not an array');

export const GeminiReadSchema = z
  .array(z.unknown())
  .refine((p) => Array.isArray(p[0]), 'payload[0] (turns) is not an array');

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function tsToIso(v: unknown): string | null {
  const secs = at(v, 0);
  const nanos = at(v, 1);
  if (typeof secs !== 'number') return null;
  return new Date(secs * 1000 + (typeof nanos === 'number' ? Math.floor(nanos / 1e6) : 0)).toISOString();
}

const IMAGE_URL = /^https:\/\/lh\d+\.googleusercontent\.com\/\S+$/;

/** Collects distinct image URLs anywhere inside a nested structure. */
function findImageUrls(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12) return out;
  if (typeof v === 'string') {
    if (IMAGE_URL.test(v) && !out.includes(v)) out.push(v);
  } else if (Array.isArray(v)) {
    for (const x of v) findImageUrls(x, out, depth + 1);
  }
  return out;
}

/** The model label (e.g. "2.5 Pro") sits in the reply block as a short string; position varies. */
function findModelLabel(reply: unknown): string | null {
  const fixed = str(at(reply, 21));
  if (fixed && fixed.length < 40) return fixed;
  return null;
}

/** Turns from one or more hNvQHb pages (each newest first), oldest first overall. */
export function geminiTurns(pages: unknown[]): unknown[][] {
  const turns: unknown[][] = [];
  for (const page of pages) {
    const res = GeminiReadSchema.safeParse(page);
    if (!res.success) throw new PayloadError(`Gemini read payload changed: ${res.error.issues[0]?.message ?? ''}`);
    for (const t of res.data[0] as unknown[]) {
      const tr = TurnSchema.safeParse(t);
      if (!tr.success) throw new PayloadError(`Gemini turn payload changed: ${tr.error.issues[0]?.message ?? ''}`);
      turns.push(tr.data);
    }
  }
  const seen = new Set<string>();
  return turns
    .filter((t) => {
      const id = at(t, 0, 1) as string;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => (tsToIso(at(a, 4)) ?? '').localeCompare(tsToIso(at(b, 4)) ?? ''));
}

export function geminiToConversation(pages: unknown[], siteChatId: string, url: string, title: string): Conversation {
  const turns = geminiTurns(pages);
  const messages: Record<string, Message> = {};
  const attachments: Attachment[] = [];
  const rootIds: string[] = [];
  let prevChosen: string | null = null;
  let lastModel: string | null = null;

  for (const t of turns) {
    const turnId = at(t, 0, 1) as string;
    const userId = `${turnId}:prompt`;
    const createdAt = tsToIso(at(t, 4));
    const userParts: Part[] = [];
    const userText = str(at(t, 2, 0, 0)) ?? '';
    if (userText.trim()) userParts.push({ type: 'text', text: userText });
    const userAtt: string[] = [];
    for (const [i, u] of findImageUrls(at(t, 2)).entries()) {
      const id = `${userId}:img:${i}`;
      attachments.push({ id, messageId: userId, kind: 'upload', name: `upload-${i + 1}.png`, ref: { url: u } });
      userAtt.push(id);
      userParts.push({ type: 'image', attachmentId: id });
    }
    messages[userId] = {
      id: userId,
      parentId: prevChosen,
      childIds: [],
      role: 'user',
      createdAt,
      parts: userParts,
      attachmentIds: userAtt,
      artifactIds: [],
    };
    if (prevChosen) messages[prevChosen]!.childIds.push(userId);
    else rootIds.push(userId);

    const reply = at(t, 3);
    const drafts = (at(reply, 0) as unknown[]).filter((d) => typeof at(d, 0) === 'string');
    const chosen = str(at(reply, 3)) ?? (at(drafts[0], 0) as string | undefined) ?? null;
    const model = findModelLabel(reply);
    if (model) lastModel = model;
    let chosenId: string | null = null;
    for (const d of drafts) {
      const rcId = at(d, 0) as string;
      const id = `${turnId}:${rcId}`;
      const parts: Part[] = [];
      const text = str(at(d, 1, 0)) ?? '';
      if (text.trim()) parts.push({ type: 'text', text });
      const attIds: string[] = [];
      for (const [i, u] of findImageUrls((d as unknown[]).slice(2)).entries()) {
        const aid = `${id}:img:${i}`;
        attachments.push({ id: aid, messageId: id, kind: 'generated', name: `image-${i + 1}.png`, ref: { url: u } });
        attIds.push(aid);
        parts.push({ type: 'image', attachmentId: aid });
      }
      messages[id] = {
        id,
        parentId: userId,
        childIds: [],
        role: 'assistant',
        model,
        createdAt,
        parts,
        attachmentIds: attIds,
        artifactIds: [],
      };
      messages[userId]!.childIds.push(id);
      if (rcId === chosen) chosenId = id;
    }
    prevChosen = chosenId ?? messages[userId]!.childIds[0] ?? userId;
  }

  return {
    id: `gemini:${siteChatId}`,
    site: 'gemini',
    siteChatId,
    url,
    title: title || 'Untitled',
    createdAt: messages[rootIds[0] ?? '']?.createdAt ?? null,
    updatedAt: prevChosen ? (messages[prevChosen]?.createdAt ?? null) : null,
    model: lastModel,
    project: null,
    messages,
    rootIds,
    currentLeafId: prevChosen,
    attachments,
    artifacts: [],
    source: { method: 'endpoint', approximate: false, capturedAt: new Date().toISOString() },
    metadata: {},
  };
}

/** Older-page cursor from an hNvQHb response, if any. */
export function geminiCursor(page: unknown): string | null {
  const c = at(page, 1);
  return typeof c === 'string' && c.length > 0 ? c : null;
}
