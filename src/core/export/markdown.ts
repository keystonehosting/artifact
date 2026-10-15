// Markdown export: YAML frontmatter, LaTeX kept as $..$/$$..$$, Obsidian-friendly.
import type { Part } from '../schema/archive';
import type { DocMessage, ExportDocument } from './document';
import { extractContentHeadings, normalizeLatexMath, slugifyHeading } from './ace-helpers';

export interface FileLinkResolver {
  /** Relative path of an attachment or artifact file inside the export, if captured. */
  attachmentPath(id: string): string | null;
  artifactPath(id: string): string | null;
}

const NO_FILES: FileLinkResolver = { attachmentPath: () => null, artifactPath: () => null };

function yamlString(s: string): string {
  return JSON.stringify(s);
}

export function frontmatter(doc: ExportDocument, exportedAt: Date): string {
  const c = doc.conversation;
  const lines = [
    '---',
    `title: ${yamlString(doc.title)}`,
    `site: ${yamlString(doc.siteName)}`,
  ];
  if (c.url && doc.options.includeSourceLink) lines.push(`source: ${yamlString(c.url)}`);
  if (c.model) lines.push(`model: ${yamlString(c.model)}`);
  if (c.project) lines.push(`project: ${yamlString(c.project.name)}`);
  if (c.createdAt) lines.push(`created: ${yamlString(c.createdAt)}`);
  if (c.updatedAt) lines.push(`updated: ${yamlString(c.updatedAt)}`);
  lines.push(`exported: ${yamlString(exportedAt.toISOString())}`);
  lines.push(`messages: ${doc.branches[0]?.messages.length ?? 0}`);
  if (c.source.approximate) lines.push('approximate: true');
  lines.push('---');
  return lines.join('\n');
}

function fence(code: string): string {
  let ticks = '```';
  while (code.includes(ticks)) ticks += '`';
  return ticks;
}

export function partToMarkdown(p: Part, files: FileLinkResolver): string {
  switch (p.type) {
    case 'text':
      return normalizeLatexMath(p.text);
    case 'code': {
      const f = fence(p.code);
      return `${f}${p.language}\n${p.code}\n${f}`;
    }
    case 'math':
      return p.display ? `$$\n${p.tex}\n$$` : `$${p.tex}$`;
    case 'tool_call': {
      const f = fence(p.input + (p.output ?? ''));
      const out = p.output ? `\n\n**Result**\n\n${f}\n${p.output}\n${f}` : '';
      return `**Tool: ${p.name}**\n\n${f}\n${p.input}\n${f}${out}`;
    }
    case 'citation':
      return `[${p.title ?? p.url}](${p.url})`;
    case 'thinking':
      return p.text
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
        .replace(/^/, '> **Thinking**\n>\n');
    case 'image': {
      const path = files.attachmentPath(p.attachmentId);
      return path ? `![${p.alt ?? 'image'}](${encodeURI(path)})` : `*[image: ${p.alt ?? 'not captured'}]*`;
    }
    case 'artifact_ref': {
      const path = files.artifactPath(p.artifactId);
      return path ? `[Artifact](${encodeURI(path)})` : '';
    }
  }
}

function headingFor(m: DocMessage): string {
  const num = m.number !== null ? ` [${m.number}]` : '';
  const model = m.message.role === 'assistant' && m.message.model ? ` (${m.message.model})` : '';
  const ts = m.timestamp ? ` — ${m.timestamp}` : '';
  return `${m.label}${num}${model}${ts}`;
}

function messageBody(m: DocMessage, files: FileLinkResolver): string {
  const blocks = m.parts.map((p) => partToMarkdown(p, files)).filter((s) => s.trim());
  const listed = m.attachments.filter((a) => !m.parts.some((p) => p.type === 'image' && p.attachmentId === a.id));
  if (listed.length) {
    blocks.push(
      listed
        .map((a) => {
          const path = files.attachmentPath(a.id);
          return path ? `- Attachment: [${a.name}](${encodeURI(path)})` : `- Attachment: ${a.name}${a.unavailableReason ? ` (${a.unavailableReason})` : ''}`;
        })
        .join('\n'),
    );
  }
  for (const art of m.artifacts) {
    if (m.parts.some((p) => p.type === 'artifact_ref' && p.artifactId === art.id)) continue;
    const path = files.artifactPath(art.id);
    blocks.push(path ? `- Artifact: [${art.title}](${encodeURI(path)})` : `- Artifact: ${art.title}`);
  }
  return blocks.join('\n\n');
}

export function toMarkdown(doc: ExportDocument, files: FileLinkResolver = NO_FILES, exportedAt = new Date()): string {
  const out: string[] = [frontmatter(doc, exportedAt), '', `# ${doc.title}`, ''];
  const c = doc.conversation;
  if (doc.options.includeSourceLink && c.url) out.push(`Source: [${doc.siteName}](${c.url})`, '');

  const active = doc.branches[0]?.messages ?? [];
  if (doc.options.includeToc && active.length) {
    const counts = new Map<string, number>();
    const unique = (t: string) => {
      const base = slugifyHeading(t);
      const seen = counts.get(base) ?? 0;
      counts.set(base, seen + 1);
      return seen === 0 ? base : `${base}-${seen}`;
    };
    unique(doc.title);
    unique('Contents');
    out.push('## Contents', '');
    for (const m of active) {
      const h = headingFor(m);
      const anchor = unique(h);
      const body = messageBody(m, files);
      for (const sub of extractContentHeadings(body)) unique(sub);
      const snippet = body.replace(/[`#*_~>[\]()!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
      out.push(`- [${h.replace(/[[\]]/g, '\\$&')}: ${snippet.replace(/[[\]]/g, '\\$&')}](#${anchor})`);
    }
    out.push('');
  }

  for (const branch of doc.branches) {
    if (branch.index > 0) out.push('---', '', `## Branch ${branch.index + 1}`, '');
    for (const m of branch.messages) {
      out.push(`## ${headingFor(m)}`, '', messageBody(m, files), '');
    }
  }
  if (doc.options.includeCredit) out.push('---', '', '*Exported with Artifact*', '');
  return out.join('\n').trimEnd() + '\n';
}
