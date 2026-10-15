// JSON export in the Artifact archive schema, plus parsing for Restore.
import {
  ARCHIVE_SCHEMA_URL,
  ArchiveSchema,
  type Archive,
  type Conversation,
  type ExportedConversation,
  type ProjectExport,
} from '../schema/archive';
import { activeBranch, messageText } from '../model/tree';
import { SITES } from '../sites/sites';
import { formatMessageTimestamp } from './ace-helpers';
import { roleLabel } from './document';
import { partToMarkdown } from './markdown';

export function toExportedConversation(conv: Conversation): ExportedConversation {
  const noFiles = { attachmentPath: () => null, artifactPath: () => null };
  const active = activeBranch(conv).filter((m) => !m.hidden);
  return {
    ...conv,
    source_ace: { platform: SITES[conv.site].name, url: conv.url, title: conv.title },
    activeBranch: active.map((m, index) => {
      const ts = formatMessageTimestamp(m.createdAt ?? undefined);
      return {
        index,
        role: m.role,
        displayRole: roleLabel(conv, m),
        content: m.parts.map((p) => partToMarkdown(p, noFiles)).filter(Boolean).join('\n\n') || messageText(m),
        ...(ts ? { timestamp: ts } : {}),
        id: m.id,
        ...(m.model ? { model: m.model } : {}),
      };
    }),
  };
}

export function buildArchive(
  conversations: Conversation[],
  version: string,
  extra: { projects?: ProjectExport[]; library?: Record<string, unknown> } = {},
): Archive {
  return {
    $schema: ARCHIVE_SCHEMA_URL,
    schemaVersion: 1,
    kind: 'artifact-archive',
    exportedAt: new Date().toISOString(),
    generator: { name: 'Artifact', version },
    conversations: conversations.map(toExportedConversation),
    ...(extra.projects ? { projects: extra.projects } : {}),
    ...(extra.library ? { library: extra.library } : {}),
  };
}

export function toJson(archive: Archive): string {
  return JSON.stringify(archive, null, 2) + '\n';
}

export type ParseResult = { ok: true; archive: Archive } | { ok: false; error: string };

/** Validates an archive file. Unknown future schema versions are rejected, not guessed. */
export function parseArchive(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  const res = ArchiveSchema.safeParse(raw);
  if (!res.success) {
    const issue = res.error.issues[0];
    return { ok: false, error: `Not an Artifact archive v1: ${issue?.path.join('.') || '(root)'} ${issue?.message ?? ''}`.trim() };
  }
  return { ok: true, archive: res.data };
}

/** Strips the export-only fields to get back the stored conversation shape. */
export function fromExportedConversation(e: ExportedConversation): Conversation {
  const { activeBranch: _a, source_ace: _s, ...conv } = e;
  return conv;
}
