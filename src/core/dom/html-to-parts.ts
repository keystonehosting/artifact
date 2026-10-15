// Converts rendered chat HTML into message Parts: Markdown text, code blocks
// with their language, math (from KaTeX/MathJax source annotations), images
// and citations. Used by DOM-fallback readers and by sites whose payloads
// carry HTML. Pure DOM walking, no innerHTML assignment.
import type { Part } from '../schema/archive';

export interface HtmlToPartsOptions {
  /** Elements to skip entirely (buttons, toolbars, hidden copies). */
  skip?: string;
  /** Called for <img>; return an attachment id to emit an image part. */
  onImage?: (img: HTMLImageElement) => string | null;
}

const DEFAULT_SKIP =
  'button, svg, style, script, noscript, template, [aria-hidden="true"], .sr-only, .katex-html, mjx-assistive-mml';

const BLOCK = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY',
  'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'PRE', 'FIGURE', 'DETAILS', 'SUMMARY',
]);

export function htmlToParts(root: Element, options: HtmlToPartsOptions = {}): Part[] {
  const skip = options.skip ? `${DEFAULT_SKIP}, ${options.skip}` : DEFAULT_SKIP;
  const parts: Part[] = [];
  let buf = '';

  const flushText = () => {
    const text = tidy(buf);
    if (text) parts.push({ type: 'text', text });
    buf = '';
  };

  const inline = (el: Node): string => {
    let out = '';
    el.childNodes.forEach((child) => {
      out += render(child, true);
    });
    return out;
  };

  const render = (node: Node, inInline: boolean): string => {
    if (node.nodeType === 3) return escapeInline(node.textContent ?? '', inInline);
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    const tag = el.tagName;

    const math = mathSource(el);
    if (math) {
      const display = isDisplayMath(el);
      if (display && !inInline) {
        flushText();
        parts.push({ type: 'math', tex: math, display: true });
        return '';
      }
      return display ? `\n$$${math}$$\n` : `$${math}$`;
    }
    if (el.matches(skip)) return '';

    if (tag === 'PRE') {
      const code = el.querySelector('code') ?? el;
      const language = codeLanguage(code) ?? codeLanguage(el) ?? headerLanguage(el) ?? '';
      const text = (code.textContent ?? '').replace(/\n$/, '');
      flushText();
      parts.push({ type: 'code', language, code: text });
      return '';
    }
    if (tag === 'IMG') {
      const img = el as HTMLImageElement;
      const id = options.onImage?.(img) ?? null;
      if (id) {
        flushText();
        parts.push({ type: 'image', attachmentId: id, alt: img.alt || undefined });
        return '';
      }
      return img.alt ? `[${img.alt}]` : '';
    }
    if (tag === 'BR') return '\n';
    if (tag === 'CODE') return '`' + (el.textContent ?? '').replace(/`/g, '\\`') + '`';
    if (tag === 'STRONG' || tag === 'B') return wrap('**', inline(el));
    if (tag === 'EM' || tag === 'I') return wrap('*', inline(el));
    if (tag === 'DEL' || tag === 'S') return wrap('~~', inline(el));
    if (tag === 'A') {
      const href = (el as HTMLAnchorElement).getAttribute('href') ?? '';
      const text = inline(el).trim();
      if (!href || href.startsWith('javascript:')) return text;
      return text && text !== href ? `[${text}](${href})` : `<${href}>`;
    }
    if (/^H[1-6]$/.test(tag)) return block(`${'#'.repeat(Number(tag[1]))} ${inline(el).trim()}`);
    if (tag === 'HR') return block('---');
    if (tag === 'BLOCKQUOTE') {
      const inner = tidy(blockChildren(el));
      return block(inner.split('\n').map((l) => `> ${l}`).join('\n'));
    }
    if (tag === 'UL' || tag === 'OL') return block(list(el, tag === 'OL', 0));
    if (tag === 'TABLE') return block(table(el));
    if (BLOCK.has(tag)) return block(blockChildren(el));
    return inline(el);
  };

  const blockChildren = (el: Element): string => {
    let out = '';
    el.childNodes.forEach((child) => {
      out += render(child, false);
    });
    return out;
  };

  const list = (el: Element, ordered: boolean, depth: number): string => {
    const lines: string[] = [];
    let n = Number(el.getAttribute('start') ?? '1') || 1;
    for (const li of Array.from(el.children)) {
      if (li.tagName !== 'LI') continue;
      const marker = ordered ? `${n++}.` : '-';
      let text = '';
      const nested: string[] = [];
      li.childNodes.forEach((c) => {
        if (c.nodeType === 1 && ((c as Element).tagName === 'UL' || (c as Element).tagName === 'OL')) {
          nested.push(list(c as Element, (c as Element).tagName === 'OL', depth + 1));
        } else {
          text += render(c, true);
        }
      });
      const checkbox = li.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
      const box = checkbox ? (checkbox.checked ? '[x] ' : '[ ] ') : '';
      lines.push(`${'  '.repeat(depth)}${marker} ${box}${tidy(text).replace(/\n/g, ' ')}`);
      lines.push(...nested);
    }
    return lines.join('\n');
  };

  const table = (el: Element): string => {
    const rows = Array.from(el.querySelectorAll('tr'));
    if (!rows.length) return '';
    const cells = rows.map((r) =>
      Array.from(r.querySelectorAll('th, td')).map((c) => tidy(inline(c)).replace(/\|/g, '\\|').replace(/\n/g, ' ')),
    );
    const width = Math.max(...cells.map((r) => r.length));
    const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
    const head = pad(cells[0]!);
    const out = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
    for (const r of cells.slice(1)) out.push(`| ${pad(r).join(' | ')} |`);
    return out.join('\n');
  };

  root.childNodes.forEach((child) => {
    buf += render(child, false);
  });
  flushText();
  return mergeText(parts);
}

function block(s: string): string {
  const t = s.trim();
  return t ? `\n\n${t}\n\n` : '';
}

function wrap(marker: string, s: string): string {
  const t = s.trim();
  return t ? `${marker}${t}${marker}` : '';
}

function escapeInline(text: string, _inInline: boolean): string {
  return text.replace(/\u00a0/g, ' ');
}

function tidy(s: string): string {
  return s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mergeText(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (p.type === 'text' && last?.type === 'text') last.text = `${last.text}\n\n${p.text}`;
    else out.push(p);
  }
  return out;
}

/** TeX source for KaTeX or MathJax rendered math, if `el` is a math root. */
export function mathSource(el: Element): string | null {
  if (el.classList.contains('katex') || el.classList.contains('katex-display')) {
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    if (ann?.textContent) return ann.textContent.trim();
  }
  if (el.tagName === 'MJX-CONTAINER') {
    const tex = el.getAttribute('data-tex') ?? el.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (tex) return tex.trim();
  }
  const dataMath = el.getAttribute('data-math');
  if (dataMath && (el.classList.contains('math-inline') || el.classList.contains('math-block'))) return dataMath.trim();
  return null;
}

function isDisplayMath(el: Element): boolean {
  return (
    el.classList.contains('katex-display') ||
    el.classList.contains('math-block') ||
    el.getAttribute('display') === 'true' ||
    el.parentElement?.classList.contains('katex-display') === true
  );
}

function codeLanguage(el: Element): string | null {
  for (const cls of Array.from(el.classList)) {
    const m = /^(?:language|lang)-([\w+#.-]+)$/.exec(cls);
    if (m) return m[1]!.toLowerCase();
  }
  return el.getAttribute('data-language')?.toLowerCase() ?? null;
}

// Many sites render the language in a header next to the <pre> rather than as a class.
function headerLanguage(pre: Element): string | null {
  const container = pre.parentElement?.closest('[class*="code"], .code-block, figure') ?? pre.parentElement;
  if (!container) return null;
  const label = container.querySelector('.code-block-decoration span, [data-testid="code-block-language"], .text-token-text-secondary');
  const text = label?.textContent?.trim().toLowerCase();
  return text && /^[\w+#.-]{1,24}$/.test(text) ? text : null;
}
