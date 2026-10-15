// Vaults (SPEC §6H): every artifact, image and code block across the chats
// stored in the library, with enough context to open the chat they came from.
import { db } from '../db/db';
import type { Artifact } from '../schema/archive';
import { mimeFromName } from '../util/bytes';
import type { SiteId } from '../sites/sites';

export interface VaultArtifact {
  chatId: string;
  chatTitle: string;
  site: SiteId;
  url: string | null;
  artifactId: string;
  title: string;
  type: string;
  language: string | null;
  versions: number;
  updatedAt: string | null;
}

export interface VaultMedia {
  chatId: string;
  chatTitle: string;
  site: SiteId;
  url: string | null;
  attachmentId: string;
  name: string;
  mimeType: string;
  kind: string;
  at: string | null;
}

export interface VaultSnippet {
  chatId: string;
  chatTitle: string;
  site: SiteId;
  url: string | null;
  messageId: string;
  language: string;
  code: string;
  at: string | null;
}

export async function vaultArtifacts(): Promise<VaultArtifact[]> {
  const out: VaultArtifact[] = [];
  await db().conversations.each(({ data: c }) => {
    for (const a of c.artifacts) {
      const last = a.versions[a.versions.length - 1];
      out.push({ chatId: c.id, chatTitle: c.title, site: c.site, url: c.url, artifactId: a.id, title: a.title, type: a.type, language: a.language ?? null, versions: a.versions.length, updatedAt: last?.createdAt ?? c.updatedAt ?? null });
    }
  });
  return out.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

export async function vaultArtifact(chatId: string, artifactId: string): Promise<Artifact | null> {
  const c = (await db().conversations.get(chatId))?.data;
  return c?.artifacts.find((a) => a.id === artifactId) ?? null;
}

export async function vaultMedia(): Promise<VaultMedia[]> {
  const out: VaultMedia[] = [];
  await db().conversations.each(({ data: c }) => {
    const imageParts = new Set(Object.values(c.messages).flatMap((m) => m.parts.filter((p) => p.type === 'image').map((p) => (p as { attachmentId: string }).attachmentId)));
    for (const a of c.attachments) {
      const mime = a.mimeType ?? mimeFromName(a.name);
      if (!mime.startsWith('image/') && !imageParts.has(a.id)) continue;
      out.push({ chatId: c.id, chatTitle: c.title, site: c.site, url: c.url, attachmentId: a.id, name: a.name, mimeType: mime, kind: a.kind, at: c.messages[a.messageId]?.createdAt ?? c.updatedAt ?? null });
    }
  });
  return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

const FENCE = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g;

export async function vaultSnippets(): Promise<VaultSnippet[]> {
  const out: VaultSnippet[] = [];
  await db().conversations.each(({ data: c }) => {
    for (const m of Object.values(c.messages)) {
      if (m.hidden) continue;
      for (const p of m.parts) {
        if (p.type === 'code' && p.code.trim()) out.push({ chatId: c.id, chatTitle: c.title, site: c.site, url: c.url, messageId: m.id, language: (p.language ?? '').toLowerCase(), code: p.code, at: m.createdAt ?? c.updatedAt ?? null });
        if (p.type === 'text') for (const f of p.text.matchAll(FENCE)) if (f[2]!.trim()) out.push({ chatId: c.id, chatTitle: c.title, site: c.site, url: c.url, messageId: m.id, language: (f[1] ?? '').toLowerCase(), code: f[2]!.replace(/\n$/, ''), at: m.createdAt ?? c.updatedAt ?? null });
      }
    }
  });
  return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}
