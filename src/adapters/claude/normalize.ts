// claude.ai conversation payload (tree=True) → Artifact Conversation.
// Field meanings: docs/provider-notes.md (Claude).
import type { Artifact, Attachment, Conversation, Message, Part } from '../../core/schema/archive';
import { ClaudeConversationSchema, type ClaudeMessage } from '../../core/schema/payloads/claude';
import { PayloadError } from '../chatgpt/normalize';

// Root messages point at this all-zero parent instead of null.
const ZERO_PARENT = /^0{8}-0{4}-[0-9]0{3}-[0-9]0{3}-0{12}$/;

function s(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

const EXT_LANG: Record<string, string> = {
  py: 'python', js: 'javascript', ts: 'typescript', tsx: 'tsx', jsx: 'jsx', html: 'html', css: 'css', md: 'markdown',
  json: 'json', sh: 'bash', rs: 'rust', go: 'go', java: 'java', rb: 'ruby', sql: 'sql', yml: 'yaml', yaml: 'yaml', svg: 'svg',
};

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

export function claudeToConversation(raw: unknown, orgId: string, url: string): Conversation {
  const parsed = ClaudeConversationSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new PayloadError(`Claude conversation payload changed: ${i?.path.join('.') || 'root'} ${i?.message ?? ''}`);
  }
  const data = parsed.data;
  const messages: Record<string, Message> = {};
  const attachments: Attachment[] = [];
  const artifacts = new Map<string, Artifact>();
  const ordered = [...data.chat_messages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0) || s(a.created_at).localeCompare(s(b.created_at)));
  const ids = new Set(ordered.map((m) => m.uuid));

  const upsertArtifact = (id: string, msgId: string, at: string | null, init: Omit<Artifact, 'versions' | 'id' | 'messageId'>, content: string) => {
    const existing = artifacts.get(id);
    if (existing) existing.versions.push({ content, createdAt: at, messageId: msgId });
    else artifacts.set(id, { id, messageId: msgId, ...init, versions: [{ content, createdAt: at, messageId: msgId }] });
  };

  for (const m of ordered) {
    const parts: Part[] = [];
    const attachmentIds: string[] = [];
    const artifactIds = new Set<string>();
    const at = m.created_at ?? null;
    const blocks = m.content?.length ? m.content : m.text ? [{ type: 'text', text: m.text }] : [];

    // Results of tools Artifact turns into artifacts or files carry no extra content.
    let swallowResult = false;
    for (const b of blocks) {
      if (b.type === 'tool_result' && swallowResult) {
        swallowResult = false;
        continue;
      }
      if (b.type === 'tool_use') swallowResult = ['artifacts', 'create_file', 'str_replace', 'present_files'].includes(s(b.name));
      if (b.type === 'text' && s(b.text).trim()) parts.push({ type: 'text', text: s(b.text) });
      else if (b.type === 'thinking' && s(b.thinking).trim()) parts.push({ type: 'thinking', text: s(b.thinking) });
      else if (b.type === 'tool_use') {
        const input = (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>;
        const name = s(b.name);
        if (name === 'artifacts') {
          const id = s(input.id) || `artifact-${m.uuid}`;
          const cmd = s(input.command);
          const prev = artifacts.get(id);
          const prevContent = prev?.versions[prev.versions.length - 1]?.content ?? '';
          let content: string | null = null;
          if (cmd === 'create' || cmd === 'rewrite') content = s(input.content);
          else if (cmd === 'update' && prev) content = prevContent.split(s(input.old_str)).join(s(input.new_str));
          if (content !== null) {
            const type = s(input.type) || prev?.type || 'text/markdown';
            upsertArtifact(id, m.uuid, at, { kind: 'claude-artifact', title: s(input.title) || prev?.title || 'Artifact', type, ...(s(input.language) || prev?.language ? { language: s(input.language) || prev?.language } : {}) }, content);
            artifactIds.add(id);
            parts.push({ type: 'artifact_ref', artifactId: id });
          }
        } else if (name === 'create_file' && typeof input.path === 'string' && typeof input.file_text === 'string') {
          const id = `file:${input.path}`;
          const ext = basename(input.path).split('.').pop()?.toLowerCase() ?? '';
          upsertArtifact(id, m.uuid, at, { kind: 'document', title: basename(input.path), type: ext === 'md' ? 'text/markdown' : `text/x-${EXT_LANG[ext] ?? ext}`, ...(EXT_LANG[ext] ? { language: EXT_LANG[ext] } : {}) }, input.file_text);
          artifactIds.add(id);
          parts.push({ type: 'artifact_ref', artifactId: id });
        } else if (name === 'str_replace' && typeof input.path === 'string' && artifacts.has(`file:${input.path}`)) {
          const art = artifacts.get(`file:${input.path}`)!;
          const prev = art.versions[art.versions.length - 1]!.content;
          art.versions.push({ content: prev.split(s(input.old_str)).join(s(input.new_str)), createdAt: at, messageId: m.uuid });
          artifactIds.add(art.id);
        } else if (name === 'present_files' && Array.isArray(input.filepaths)) {
          for (const p of input.filepaths) {
            if (typeof p !== 'string' || artifacts.has(`file:${p}`)) continue;
            const id = `${m.uuid}:${p}`;
            attachments.push({ id, messageId: m.uuid, kind: 'generated', name: basename(p), ref: { orgId, path: p, created: true } });
            attachmentIds.push(id);
          }
        } else {
          parts.push({ type: 'tool_call', name: name || 'tool', input: JSON.stringify(b.input ?? {}, null, 2) });
        }
      } else if (b.type === 'tool_result') {
        const text = toolResultText(b.content);
        const last = parts[parts.length - 1];
        if (last?.type === 'tool_call' && last.output === undefined) last.output = text;
        else if (text) parts.push({ type: 'tool_call', name: s(b.name) || 'tool', input: '', output: text });
      }
    }

    for (const [i, a] of (m.attachments ?? []).entries()) {
      const id = `${m.uuid}:att:${a.id ?? i}`;
      attachments.push({
        id,
        messageId: m.uuid,
        kind: 'pasted',
        name: a.file_name || `attachment-${i + 1}.txt`,
        ...(a.file_type ? { mimeType: a.file_type } : {}),
        ...(typeof a.file_size === 'number' ? { size: a.file_size } : {}),
        ref: { extracted: true },
        ...(a.extracted_content ? { extractedText: a.extracted_content } : {}),
      });
      attachmentIds.push(id);
    }

    const files = [...(m.files_v2 ?? []), ...(m.files ?? [])];
    const seen = new Set<string>();
    for (const f of files) {
      const fid = f.file_uuid ?? f.uuid;
      if (!fid || seen.has(fid)) continue;
      seen.add(fid);
      const rec = f as Record<string, unknown>;
      const assetUrl = (key: string) => {
        const v = rec[key];
        return v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string' ? (v as { url: string }).url : null;
      };
      const best = assetUrl('document_asset') ?? assetUrl('preview_asset') ?? f.preview_url ?? assetUrl('thumbnail_asset') ?? f.thumbnail_url ?? null;
      const id = `${m.uuid}:file:${fid}`;
      const isImage = f.file_kind === 'image';
      attachments.push({
        id,
        messageId: m.uuid,
        kind: m.sender === 'human' ? 'upload' : 'generated',
        name: f.file_name ?? `${fid}${isImage ? '.png' : ''}`,
        ref: { fileId: fid, url: best, kind: f.file_kind ?? null, preview: best !== null && best === (assetUrl('preview_asset') ?? f.preview_url ?? null) },
      });
      attachmentIds.push(id);
      if (isImage) parts.push({ type: 'image', attachmentId: id, ...(f.file_name ? { alt: f.file_name } : {}) });
    }

    const parent = m.parent_message_uuid && !ZERO_PARENT.test(m.parent_message_uuid) && ids.has(m.parent_message_uuid) ? m.parent_message_uuid : null;
    messages[m.uuid] = {
      id: m.uuid,
      parentId: parent,
      childIds: [],
      role: m.sender === 'human' ? 'user' : 'assistant',
      model: null,
      createdAt: at,
      parts,
      attachmentIds,
      artifactIds: [...artifactIds],
    };
  }

  for (const msg of Object.values(messages)) if (msg.parentId) messages[msg.parentId]!.childIds.push(msg.id);
  const rootIds = Object.values(messages)
    .filter((m) => !m.parentId)
    .map((m) => m.id);
  const leaf = data.current_leaf_message_uuid && messages[data.current_leaf_message_uuid] ? data.current_leaf_message_uuid : null;
  if (data.model) for (const msg of Object.values(messages)) if (msg.role === 'assistant') msg.model = data.model;

  return {
    id: `claude:${data.uuid}`,
    site: 'claude',
    siteChatId: data.uuid,
    url,
    title: data.name?.trim() || 'Untitled',
    createdAt: data.created_at ?? null,
    updatedAt: data.updated_at ?? null,
    model: data.model ?? null,
    project: data.project_uuid ? { id: data.project_uuid, name: '' } : null,
    messages,
    rootIds,
    currentLeafId: leaf,
    attachments,
    artifacts: [...artifacts.values()],
    source: { method: 'endpoint', approximate: false, capturedAt: new Date().toISOString() },
    metadata: { orgId, ...(data.summary ? { summary: data.summary } : {}) },
  };
}

export type { ClaudeMessage };
