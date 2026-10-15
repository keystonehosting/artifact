// Plain-text export: readable without any Markdown renderer.
import type { Part } from '../schema/archive';
import type { ExportDocument } from './document';

function partToText(p: Part): string {
  switch (p.type) {
    case 'text':
      return markdownToPlain(p.text);
    case 'code':
      return p.code
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n');
    case 'math':
      return p.display ? `    ${p.tex}` : p.tex;
    case 'tool_call':
      return `[Tool: ${p.name}]\n${p.input}${p.output ? `\n[Result]\n${p.output}` : ''}`;
    case 'citation':
      return p.title ? `${p.title} <${p.url}>` : p.url;
    case 'thinking':
      return `[Thinking]\n${p.text}`;
    case 'image':
      return `[Image${p.alt ? `: ${p.alt}` : ''}]`;
    case 'artifact_ref':
      return '';
  }
}

/** Strips Markdown decoration while keeping link targets and list structure. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) => `[Image${alt ? `: ${alt}` : ''}]`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) => (text === url ? url : `${text} <${url}>`))
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^>\s?/gm, '  ');
}

export function toText(doc: ExportDocument): string {
  const c = doc.conversation;
  const out: string[] = [doc.title, '='.repeat(Math.min(doc.title.length, 80) || 1), ''];
  out.push(`Site: ${doc.siteName}`);
  if (doc.options.includeSourceLink && c.url) out.push(`Source: ${c.url}`);
  if (c.model) out.push(`Model: ${c.model}`);
  out.push(`Exported: ${new Date().toISOString()}`, '');
  for (const branch of doc.branches) {
    if (branch.index > 0) out.push('', `--- Branch ${branch.index + 1} ---`, '');
    for (const m of branch.messages) {
      const head = `${m.label}${m.number !== null ? ` [${m.number}]` : ''}${m.timestamp ? ` - ${m.timestamp}` : ''}`;
      out.push(head, '-'.repeat(head.length));
      out.push(m.parts.map(partToText).filter((s) => s.trim()).join('\n\n'));
      for (const a of m.attachments) out.push(`[Attachment: ${a.name}]`);
      for (const a of m.artifacts) out.push(`[Artifact: ${a.title}]`);
      out.push('');
    }
  }
  if (doc.options.includeCredit) out.push('Exported with Artifact');
  return out.join('\n').trimEnd() + '\n';
}
