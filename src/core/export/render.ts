// Markdown + math → sanitized HTML, shared by the HTML export, the preview
// tab (PDF via print, PNG) and the side panel. Math becomes MathML, which
// browsers render natively, so exports need no fonts or scripts.
import { Marked, type Tokens } from 'marked';
import katex from 'katex';
import DOMPurify from 'dompurify';

function tex(src: string, display: boolean): string {
  try {
    return katex.renderToString(src, { displayMode: display, output: 'mathml', throwOnError: false, strict: 'ignore' });
  } catch {
    return `<code class="math-source">${escapeHtml(src)}</code>`;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const marked = new Marked({
  gfm: true,
  breaks: false,
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start: (src: string) => src.indexOf('$$'),
      tokenizer(src: string) {
        const m = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src);
        return m ? { type: 'mathBlock', raw: m[0], text: m[1]!.trim() } : undefined;
      },
      renderer: (t) => `<div class="math-display">${tex((t as Tokens.Generic).text as string, true)}</div>`,
    },
    {
      name: 'mathInline',
      level: 'inline',
      start: (src: string) => src.indexOf('$'),
      tokenizer(src: string) {
        const m = /^\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src);
        return m ? { type: 'mathInline', raw: m[0], text: m[1]! } : undefined;
      },
      renderer: (t) => tex((t as Tokens.Generic).text as string, false),
    },
  ],
});

const PURIFY = {
  USE_PROFILES: { html: true, mathMl: true },
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
};

/**
 * Sanitizes HTML, failing closed: where DOMPurify can't run (no usable DOM),
 * it would return its input unchanged, so we escape everything instead.
 */
export function sanitize(html: string): string {
  if (!DOMPurify.isSupported) return escapeHtml(html);
  return DOMPurify.sanitize(html, PURIFY) as unknown as string;
}

/** Markdown (with $…$ math) → sanitized HTML string. */
export function markdownToHtml(md: string): string {
  return sanitize(marked.parse(md, { async: false }) as string);
}

export function mathToHtml(src: string, display: boolean): string {
  return sanitize(display ? `<div class="math-display">${tex(src, true)}</div>` : tex(src, false));
}

export { marked };
