// Standalone HTML export: one file, no scripts, no external resources.
// Math is MathML; images are relative paths inside a ZIP, or data: URLs
// when the HTML file is saved on its own.
import type { Part } from '../schema/archive';
import type { DocMessage, ExportDocument } from './document';
import { escapeHtml, markdownToHtml, mathToHtml } from './render';
import { normalizeLatexMath } from './ace-helpers';

export interface HtmlFiles {
  /** Path or data: URL for an attachment, or null when it wasn't captured. */
  attachmentHref(id: string): string | null;
  artifactHref(id: string): string | null;
}

const NO_FILES: HtmlFiles = { attachmentHref: () => null, artifactHref: () => null };

export const EXPORT_CSS = `
:root { color-scheme: light dark; --fg:#16181b; --fg2:#4a5058; --bg:#fff; --bg2:#f4f5f6; --line:#dde0e4; --accent:#1f6b5c; }
@media (prefers-color-scheme: dark) { :root { --fg:#e6e8ea; --fg2:#b4bac1; --bg:#15171a; --bg2:#1f2226; --line:#30353b; --accent:#5fb8a4; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
main { max-width: 820px; margin: 0 auto; padding: 32px 20px 64px; }
header.doc { border-bottom: 1px solid var(--line); margin-bottom: 24px; padding-bottom: 12px; }
header.doc h1 { font-size: 24px; line-height: 1.25; margin: 0 0 6px; }
.meta { color: var(--fg2); font-size: 13px; }
.meta a { color: var(--accent); }
nav.toc ol { padding-left: 20px; font-size: 14px; }
article.msg { padding: 14px 0; border-top: 1px solid var(--line); }
article.msg > h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--fg2); margin: 0 0 6px; font-weight: 600; }
article.msg.user > h2 { color: var(--accent); }
article.msg pre { background: var(--bg2); border: 1px solid var(--line); border-radius: 4px; padding: 10px 12px; overflow-x: auto; font-size: 13px; line-height: 1.45; }
article.msg code { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: .92em; }
article.msg img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 4px; }
article.msg table { border-collapse: collapse; }
article.msg th, article.msg td { border: 1px solid var(--line); padding: 4px 8px; }
blockquote { margin: 0; padding-left: 12px; border-left: 3px solid var(--line); color: var(--fg2); }
details.thinking { color: var(--fg2); margin: 6px 0; }
.tool { border: 1px solid var(--line); border-radius: 4px; padding: 6px 10px; margin: 8px 0; }
.tool > summary { cursor: pointer; font-size: 13px; color: var(--fg2); }
.files { font-size: 13px; color: var(--fg2); padding-left: 18px; }
.math-display { overflow-x: auto; margin: 8px 0; }
.branch-head { margin-top: 32px; font-size: 16px; }
footer.credit { margin-top: 32px; color: var(--fg2); font-size: 12px; }
@media print { body { background: #fff; color: #000; } main { max-width: none; padding: 0; } article.msg { break-inside: auto; } pre { white-space: pre-wrap; } a { color: inherit; } }
`;

function partHtml(p: Part, files: HtmlFiles): string {
  switch (p.type) {
    case 'text':
      return markdownToHtml(normalizeLatexMath(p.text));
    case 'code':
      return `<pre><code${p.language ? ` class="language-${escapeHtml(p.language)}"` : ''}>${escapeHtml(p.code)}</code></pre>`;
    case 'math':
      return mathToHtml(p.tex, p.display);
    case 'tool_call':
      return `<details class="tool"><summary>${escapeHtml(p.name)}</summary>${p.input ? `<pre><code>${escapeHtml(p.input)}</code></pre>` : ''}${p.output ? `<pre><code>${escapeHtml(p.output)}</code></pre>` : ''}</details>`;
    case 'citation':
      return `<p class="citation"><a href="${escapeHtml(p.url)}" rel="noreferrer">${escapeHtml(p.title ?? p.url)}</a></p>`;
    case 'thinking':
      return `<details class="thinking"><summary>Thinking</summary>${markdownToHtml(p.text)}</details>`;
    case 'image': {
      const href = files.attachmentHref(p.attachmentId);
      return href ? `<p><img src="${escapeHtml(href)}" alt="${escapeHtml(p.alt ?? '')}"></p>` : `<p class="meta">[image${p.alt ? `: ${escapeHtml(p.alt)}` : ''} not captured]</p>`;
    }
    case 'artifact_ref': {
      const href = files.artifactHref(p.artifactId);
      return href ? `<p><a href="${escapeHtml(href)}">Artifact</a></p>` : '';
    }
  }
}

function messageHtml(m: DocMessage, files: HtmlFiles, anchor: string): string {
  const num = m.number !== null ? ` [${m.number}]` : '';
  const model = m.message.role === 'assistant' && m.message.model ? ` · ${escapeHtml(m.message.model)}` : '';
  const ts = m.timestamp ? ` · <time datetime="${escapeHtml(m.timestamp)}">${escapeHtml(m.timestamp)}</time>` : '';
  const body = m.parts.map((p) => partHtml(p, files)).join('\n');
  const listed = m.attachments.filter((a) => !m.parts.some((p) => p.type === 'image' && p.attachmentId === a.id));
  const fileList = [
    ...listed.map((a) => {
      const href = files.attachmentHref(a.id);
      return `<li>${href ? `<a href="${escapeHtml(href)}">${escapeHtml(a.name)}</a>` : `${escapeHtml(a.name)}${a.unavailableReason ? ` (${escapeHtml(a.unavailableReason)})` : ''}`}</li>`;
    }),
    ...m.artifacts
      .filter((a) => !m.parts.some((p) => p.type === 'artifact_ref' && p.artifactId === a.id))
      .map((a) => {
        const href = files.artifactHref(a.id);
        return `<li>Artifact: ${href ? `<a href="${escapeHtml(href)}">${escapeHtml(a.title)}</a>` : escapeHtml(a.title)}</li>`;
      }),
  ];
  return `<article class="msg ${m.message.role}" id="${anchor}" data-message-id="${escapeHtml(m.message.id)}">
<h2>${escapeHtml(m.label)}${num}${model}${ts}</h2>
${body}
${fileList.length ? `<ul class="files">${fileList.join('')}</ul>` : ''}
</article>`;
}

export function toHtml(doc: ExportDocument, files: HtmlFiles = NO_FILES, exportedAt = new Date()): string {
  const c = doc.conversation;
  const meta = [
    escapeHtml(doc.siteName),
    c.model ? escapeHtml(c.model) : '',
    c.createdAt ? `created ${escapeHtml(c.createdAt.slice(0, 10))}` : '',
    `exported ${escapeHtml(exportedAt.toISOString().slice(0, 16).replace('T', ' '))}`,
    doc.options.includeSourceLink && c.url ? `<a href="${escapeHtml(c.url)}" rel="noreferrer">source</a>` : '',
    c.source.approximate ? 'read from page text (approximate)' : '',
  ].filter(Boolean);
  const active = doc.branches[0]?.messages ?? [];
  const toc = doc.options.includeToc && active.length
    ? `<nav class="toc"><ol>${active
        .map((m, i) => {
          const text = m.parts.find((p) => p.type === 'text');
          const snippet = text?.type === 'text' ? text.text.replace(/[#*_`>[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70) : '';
          return `<li><a href="#m${i}">${escapeHtml(m.label)}${m.number !== null ? ` [${m.number}]` : ''}: ${escapeHtml(snippet)}</a></li>`;
        })
        .join('')}</ol></nav>`
    : '';
  const body = doc.branches
    .map((b) => {
      const head = b.index > 0 ? `<h2 class="branch-head">Branch ${b.index + 1}</h2>` : '';
      return head + b.messages.map((m, i) => messageHtml(m, files, b.index === 0 ? `m${i}` : `b${b.index}m${i}`)).join('\n');
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="generator" content="Artifact">
<meta name="viewport" content="initial-scale=1, width=device-width">
<title>${escapeHtml(doc.title)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<main>
<header class="doc"><h1>${escapeHtml(doc.title)}</h1><div class="meta">${meta.join(' · ')}</div></header>
${toc}
${body}
${doc.options.includeCredit ? '<footer class="credit">Exported with Artifact</footer>' : ''}
</main>
</body>
</html>
`;
}
