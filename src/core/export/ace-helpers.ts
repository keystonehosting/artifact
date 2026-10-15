/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Derived from ACE content/formatters/base.js and markdown.js
 * (Covai-Labs/ace@671dfc8, MPL-2.0). Changes: TypeScript, Artifact roles. */

export type NumberingMode = 'off' | 'per-message' | 'per-turn';

export function normalizeMessageNumbering(value: unknown): NumberingMode {
  if (value === 'per-message' || value === 'perMessage') return 'per-message';
  if (value === 'per-turn' || value === 'perTurn') return 'per-turn';
  return 'off';
}

/** Display numbers for messages: sequential, or one number per user turn. */
export function getMessageNumbers(roles: string[], mode: NumberingMode): Array<number | null> {
  if (mode === 'off') return roles.map(() => null);
  if (mode === 'per-message') return roles.map((_, i) => i + 1);
  let turn = 0;
  return roles.map((role) => {
    if (role === 'user') turn += 1;
    return turn === 0 ? 1 : turn;
  });
}

export function normalizeEpochToMs(value: number): number {
  return Math.abs(value) < 1e11 ? value * 1000 : value;
}

const ISO_LIKE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/i;

/**
 * Formats a raw timestamp as ISO 8601 (UTC). Numeric epochs (s or ms) and ISO
 * strings become ISO; anything else is returned as cleaned single-line text
 * so information is never blanked. Null when absent.
 */
export function formatMessageTimestamp(timestamp: unknown): string | null {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const d = new Date(normalizeEpochToMs(timestamp));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof timestamp !== 'string') return null;
  const trimmed = timestamp.trim();
  if (!trimmed) return null;
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    const d = new Date(normalizeEpochToMs(Number(trimmed)));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const single = trimmed.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').slice(0, 200);
  if (ISO_LIKE.test(single)) {
    const d = new Date(single);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return single;
}

/** GitHub-style heading slug used for Markdown ToC anchors. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/ /g, '-');
}

/** ATX headings in Markdown, ignoring fenced code. */
export function extractContentHeadings(content: string): string[] {
  const headings: string[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  for (const line of content.split(/\r?\n/)) {
    const lead = line.replace(/^[ ]{0,3}/, '');
    const fence = lead.match(/^(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1]![0]!;
      const len = fence[1]!.length;
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
        fenceLen = len;
        continue;
      } else if (ch === fenceChar && len >= fenceLen) {
        inFence = false;
        continue;
      }
    }
    if (inFence) continue;
    const h = line.match(/^[ ]{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/);
    if (h) headings.push(h[1]!.trim());
  }
  return headings;
}

function cleanLatexMath(latex: string): string {
  return latex.replace(/\\\\([a-zA-Z]+)/g, '\\$1').replace(/\\([_\][*])/g, '$1');
}

/**
 * Normalizes LaTeX delimiters in Markdown text: \[..\] -> $$..$$ and
 * \(..\) -> $..$, leaving code untouched.
 */
export function normalizeLatexMath(text: string): string {
  const placeholders: Array<{ id: string; content: string }> = [];
  let n = 0;
  const protect = (content: string) => {
    const id = `\u0000M${n++}\u0000`;
    placeholders.push({ id, content });
    return id;
  };
  let s = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (m) => protect(m));
  s = s.replace(/`([^`\n]+?)`/g, (m) => protect(m));
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_m, math: string) => protect(`$$${cleanLatexMath(math)}$$`));
  s = s.replace(/\$([^$\n]+?)\$/g, (_m, math: string) => protect(`$${cleanLatexMath(math)}$`));
  s = s.replace(/(?:\\{1,2}\[)([\s\S]+?)(?:\\{1,2}\])/g, (_m, math: string) => `$$${cleanLatexMath(math).trim()}$$`);
  s = s.replace(/(?:\\{1,2}\()([\s\S]+?)(?:\\{1,2}\))/g, (_m, math: string) => `$${cleanLatexMath(math).trim()}$`);
  s = s.replace(/\n{3,}/g, '\n\n');
  for (let i = placeholders.length - 1; i >= 0; i--) {
    const { id, content } = placeholders[i]!;
    s = s.replace(id, () => content);
  }
  return s;
}

/** Strips well-formed HTML tags and comments, keeping literal `<` comparisons. */
export function stripTags(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('<', i);
    if (open === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, open);
    const rest = text.slice(open);
    const tag = rest.match(
      /^<(?:\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^"'>]*(?:(?:"[^"]*"|'[^']*')[^"'>]*)*)?\s*\/?>|!--[\s\S]*?-->|![a-zA-Z][^>]*>)/,
    );
    if (tag) i = open + tag[0].length;
    else {
      out += '<';
      i = open + 1;
    }
  }
  return out;
}
