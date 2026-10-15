// Prepares a conversation for any export format: picks the branch(es) and the
// selected messages, numbers them, and resolves attachments and artifacts.
import type { Attachment, Artifact, Conversation, Message, Part } from '../schema/archive';
import { activeBranch, allBranches } from '../model/tree';
import { SITES } from '../sites/sites';
import { formatMessageTimestamp, getMessageNumbers, type NumberingMode } from './ace-helpers';

export interface ExportOptions {
  /** 'active' exports the branch on screen; 'all' adds every other branch after it. */
  branches: 'active' | 'all';
  /** Restrict to these message ids (shift-click selection). Empty = all. */
  selection: string[];
  numbering: NumberingMode;
  includeTimestamps: boolean;
  includeToc: boolean;
  includeThinking: boolean;
  includeImages: boolean;
  includeFiles: boolean;
  includeArtifacts: boolean;
  includeToolCalls: boolean;
  /** Optional credit line at the end of the document. Off by default. */
  includeCredit: boolean;
  /** Source link in every file (SPEC §6F). */
  includeSourceLink: boolean;
  filenameTemplate: string;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  branches: 'active',
  selection: [],
  numbering: 'off',
  includeTimestamps: false,
  includeToc: false,
  includeThinking: false,
  includeImages: true,
  includeFiles: true,
  includeArtifacts: true,
  includeToolCalls: true,
  includeCredit: false,
  includeSourceLink: true,
  filenameTemplate: '{platform} - {title} - {datetime}',
};

export interface DocMessage {
  message: Message;
  number: number | null;
  label: string;
  timestamp: string | null;
  parts: Part[];
  attachments: Attachment[];
  artifacts: Artifact[];
}

export interface DocBranch {
  /** 0 is the active branch. */
  index: number;
  /** Id of the first message that differs from the active branch. */
  divergesAt: string | null;
  messages: DocMessage[];
}

export interface ExportDocument {
  conversation: Conversation;
  siteName: string;
  title: string;
  branches: DocBranch[];
  options: ExportOptions;
}

export function roleLabel(conv: Conversation, msg: Message): string {
  if (msg.role === 'user') return 'User';
  if (msg.role === 'system') return 'System';
  if (msg.role === 'tool') return msg.author ?? 'Tool';
  return msg.author ?? SITES[conv.site].name;
}

function filterParts(parts: Part[], o: ExportOptions): Part[] {
  return parts.filter((p) => {
    if (p.type === 'thinking') return o.includeThinking;
    if (p.type === 'tool_call') return o.includeToolCalls;
    if (p.type === 'image') return o.includeImages;
    if (p.type === 'artifact_ref') return o.includeArtifacts;
    return true;
  });
}

export function buildDocument(conv: Conversation, options: Partial<ExportOptions> = {}): ExportDocument {
  const o: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const selection = new Set(o.selection);
  const attById = new Map(conv.attachments.map((a) => [a.id, a]));
  const artById = new Map(conv.artifacts.map((a) => [a.id, a]));

  const toDoc = (msgs: Message[]): DocMessage[] => {
    const visible = msgs.filter((m) => !m.hidden && (!selection.size || selection.has(m.id)));
    const numbers = getMessageNumbers(visible.map((m) => m.role), o.numbering);
    return visible.map((m, i) => ({
      message: m,
      number: numbers[i] ?? null,
      label: roleLabel(conv, m),
      timestamp: o.includeTimestamps ? formatMessageTimestamp(m.createdAt ?? undefined) : null,
      parts: filterParts(m.parts, o),
      attachments: o.includeFiles || o.includeImages
        ? m.attachmentIds.map((id) => attById.get(id)).filter((a): a is Attachment => !!a)
        : [],
      artifacts: o.includeArtifacts ? m.artifactIds.map((id) => artById.get(id)).filter((a): a is Artifact => !!a) : [],
    }));
  };

  const active = activeBranch(conv);
  const branches: DocBranch[] = [{ index: 0, divergesAt: null, messages: toDoc(active) }];
  if (o.branches === 'all') {
    const activeIds = active.map((m) => m.id);
    const activeKey = activeIds.join('/');
    let n = 1;
    for (const path of allBranches(conv)) {
      if (path.join('/') === activeKey) continue;
      let k = 0;
      while (k < path.length && path[k] === activeIds[k]) k++;
      const msgs = path.slice(k).map((id) => conv.messages[id]!).filter(Boolean);
      branches.push({ index: n++, divergesAt: path[k] ?? null, messages: toDoc(msgs) });
    }
  }
  return { conversation: conv, siteName: SITES[conv.site].name, title: conv.title || 'Untitled', branches, options: o };
}
