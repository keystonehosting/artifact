// Deep Import (SPEC §6F) of the official data exports, plus restore of
// Artifact archives. Each file is validated before use; records that don't
// fit are skipped with a reason, never guessed at. Format facts and their
// status are in docs/provider-notes.md ("Official data exports").
import { unzipSync, strFromU8 } from 'fflate';
import { z } from 'zod';
import type { Conversation, Message } from '../schema/archive';
import { chatgptToConversation } from '../../adapters/chatgpt/normalize';
import { claudeToConversation } from '../../adapters/claude/normalize';
import { linearMessages } from '../model/tree';
import { fromExportedConversation, parseArchive } from '../export/json';
import { hashText } from '../tokenizer/client';

export type ImportKind = 'chatgpt' | 'claude' | 'gemini' | 'artifact';

export interface ImportResult {
  kind: ImportKind;
  /** Where in the upload the data came from. */
  source: string;
  conversations: Conversation[];
  skipped: Array<{ name: string; reason: string }>;
  /** Folders, tags, notes... from an Artifact archive made with "everything". */
  library?: Record<string, unknown>;
}

const now = () => new Date().toISOString();

function asImported(conv: Conversation): Conversation {
  return { ...conv, source: { method: 'import', approximate: false, capturedAt: now() } };
}

const ChatGPTExportSchema = z.array(z.looseObject({ title: z.string().nullable().optional(), mapping: z.record(z.string(), z.unknown()), conversation_id: z.string().optional(), id: z.string().optional() }));

export function importChatGPT(raw: unknown, source = 'conversations.json'): ImportResult {
  const parsed = ChatGPTExportSchema.safeParse(raw);
  if (!parsed.success) throw new Error('This conversations.json is not in the ChatGPT export format');
  const out: ImportResult = { kind: 'chatgpt', source, conversations: [], skipped: [] };
  for (const item of parsed.data) {
    const id = item.conversation_id ?? item.id;
    const name = item.title ?? id ?? 'Untitled';
    if (!id) {
      out.skipped.push({ name, reason: 'no conversation id' });
      continue;
    }
    try {
      out.conversations.push(asImported(chatgptToConversation(item, id, `https://chatgpt.com/c/${id}`)));
    } catch (e) {
      out.skipped.push({ name, reason: (e as Error).message });
    }
  }
  return out;
}

const ClaudeExportSchema = z.array(z.looseObject({ uuid: z.string(), name: z.string().nullable().optional(), chat_messages: z.array(z.looseObject({ uuid: z.string(), parent_message_uuid: z.string().nullable().optional() })) }));

export function importClaude(raw: unknown, source = 'conversations.json'): ImportResult {
  const parsed = ClaudeExportSchema.safeParse(raw);
  if (!parsed.success) throw new Error('This conversations.json is not in the Claude export format');
  const out: ImportResult = { kind: 'claude', source, conversations: [], skipped: [] };
  for (const item of parsed.data) {
    // Exports may list messages in order without parent links; chain them in that order.
    const msgs = item.chat_messages;
    const linked = msgs.some((m) => m.parent_message_uuid);
    const data = linked ? item : { ...item, chat_messages: msgs.map((m, i) => ({ ...m, parent_message_uuid: i ? msgs[i - 1]!.uuid : null })), current_leaf_message_uuid: msgs.at(-1)?.uuid ?? null };
    try {
      out.conversations.push(asImported(claudeToConversation(data, '', `https://claude.ai/chat/${item.uuid}`)));
    } catch (e) {
      out.skipped.push({ name: item.name ?? item.uuid, reason: (e as Error).message });
    }
  }
  return out;
}

// Google's My Activity schema documents header, title, time, subtitles and
// attachedFiles; the field holding a reply's text is not documented, so any
// array of items with an `html` string is read as the reply.
const ActivitySchema = z.array(z.looseObject({ title: z.string(), time: z.string(), header: z.string().optional() }));

function htmlItems(record: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const v of Object.values(record)) {
    if (!Array.isArray(v)) continue;
    for (const item of v) if (item && typeof item === 'object' && typeof (item as { html?: unknown }).html === 'string') out.push((item as { html: string }).html);
  }
  return out;
}

export function importGemini(raw: unknown, htmlToText: (html: string) => string, source = 'MyActivity.json'): ImportResult {
  const parsed = ActivitySchema.safeParse(raw);
  if (!parsed.success) throw new Error('This MyActivity.json is not in the My Activity export format');
  const out: ImportResult = { kind: 'gemini', source, conversations: [], skipped: [] };
  for (const rec of parsed.data) {
    const title = rec.title.trim();
    if (!title) {
      out.skipped.push({ name: rec.time, reason: 'empty activity' });
      continue;
    }
    const id = `takeout-${hashText(`${rec.time}\u0000${title}`).replace(':', '-')}`;
    const replies = htmlItems(rec as Record<string, unknown>).map(htmlToText).filter(Boolean);
    const items: Array<Omit<Message, 'parentId' | 'childIds'>> = [
      { id: `${id}-u`, role: 'user', createdAt: rec.time, parts: [{ type: 'text', text: title }], attachmentIds: [], artifactIds: [] },
      ...(replies.length ? [{ id: `${id}-a`, role: 'assistant' as const, createdAt: rec.time, parts: [{ type: 'text' as const, text: replies.join('\n\n') }], attachmentIds: [], artifactIds: [] }] : []),
    ];
    const tree = linearMessages(items);
    out.conversations.push({
      id: `gemini:${id}`,
      site: 'gemini',
      siteChatId: id,
      url: null,
      title: title.length > 80 ? `${title.slice(0, 79)}…` : title,
      createdAt: rec.time,
      updatedAt: rec.time,
      model: null,
      project: null,
      ...tree,
      attachments: [],
      artifacts: [],
      source: { method: 'import', approximate: true, capturedAt: now() },
      metadata: { takeout: true },
    });
  }
  return out;
}

export function importArtifactArchive(text: string, source: string): ImportResult {
  const r = parseArchive(text);
  if (!r.ok) throw new Error(r.error);
  return { kind: 'artifact', source, conversations: r.archive.conversations.map(fromExportedConversation), skipped: [], ...(r.archive.library ? { library: r.archive.library } : {}) };
}

/** Which parser a JSON payload fits, by its shape. */
export function detectJson(raw: unknown): ImportKind | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { kind?: unknown }).kind === 'artifact-archive') return 'artifact';
  if (!Array.isArray(raw) || !raw.length) return null;
  const first = raw[0] as Record<string, unknown>;
  if ('mapping' in first) return 'chatgpt';
  if ('chat_messages' in first) return 'claude';
  if ('title' in first && 'time' in first) return 'gemini';
  return null;
}

/** Reads an uploaded .zip or .json and returns everything it can import. */
export function readImport(name: string, bytes: Uint8Array, htmlToText: (html: string) => string): ImportResult[] {
  const files: Array<[string, string]> = [];
  if (/\.zip$/i.test(name)) {
    const entries = unzipSync(bytes, { filter: (f) => /\.json$/i.test(f.name) && !f.name.startsWith('__MACOSX/') });
    for (const [path, data] of Object.entries(entries)) files.push([path, strFromU8(data)]);
  } else files.push([name, strFromU8(bytes)]);
  const results: ImportResult[] = [];
  for (const [path, text] of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      continue;
    }
    const kind = detectJson(raw);
    if (kind === 'chatgpt') results.push(importChatGPT(raw, path));
    else if (kind === 'claude') results.push(importClaude(raw, path));
    else if (kind === 'gemini') results.push(importGemini(raw, htmlToText, path));
    else if (kind === 'artifact') results.push(importArtifactArchive(text, path));
  }
  if (!results.length) throw new Error('No ChatGPT, Claude, Gemini or Artifact data found in this file');
  return results;
}
