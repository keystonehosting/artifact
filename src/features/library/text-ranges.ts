// Finds text inside an element as DOM Ranges, across element boundaries,
// without modifying the page. Used by highlights and find-in-chat.

interface Flat {
  text: string;
  nodes: Array<{ node: Text; start: number }>;
}

export function flatten(root: Element): Flat {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest('script, style, [data-artifact]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)),
  });
  const nodes: Flat['nodes'] = [];
  let text = '';
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    nodes.push({ node: n, start: text.length });
    text += n.data;
  }
  return { text, nodes };
}

export function rangeAt(flat: Flat, start: number, end: number): Range | null {
  const find = (pos: number, isEnd: boolean) => {
    for (let i = flat.nodes.length - 1; i >= 0; i--) {
      const n = flat.nodes[i]!;
      if (pos > n.start || (!isEnd && pos === n.start) || (isEnd && pos === n.start && i === 0)) {
        return { node: n.node, offset: Math.min(pos - n.start, n.node.data.length) };
      }
    }
    return null;
  };
  const a = find(start, false);
  const b = find(end, true);
  if (!a || !b) return null;
  const r = a.node.ownerDocument.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  return r;
}

/** All case-insensitive occurrences of `needle` in `root`. */
export function findAll(root: Element, needle: string): Range[] {
  if (!needle) return [];
  const flat = flatten(root);
  const hay = flat.text.toLowerCase();
  const n = needle.toLowerCase();
  const out: Range[] = [];
  for (let i = hay.indexOf(n); i >= 0; i = hay.indexOf(n, i + n.length)) {
    const r = rangeAt(flat, i, i + n.length);
    if (r) out.push(r);
  }
  return out;
}

/** Locates a saved quote using its surrounding text, preferring the occurrence whose context matches. */
export function findQuote(root: Element, quote: string, prefix: string, suffix: string): Range | null {
  const flat = flatten(root);
  let best = -1;
  let bestScore = -1;
  for (let i = flat.text.indexOf(quote); i >= 0; i = flat.text.indexOf(quote, i + 1)) {
    const before = flat.text.slice(Math.max(0, i - prefix.length), i);
    const after = flat.text.slice(i + quote.length, i + quote.length + suffix.length);
    const score = (before === prefix ? 2 : before.endsWith(prefix.slice(-8)) ? 1 : 0) + (after === suffix ? 2 : after.startsWith(suffix.slice(0, 8)) ? 1 : 0);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best >= 0 ? rangeAt(flat, best, best + quote.length) : null;
}

/** Text before and after a selection inside `root`, for re-anchoring later. */
export function contextOf(root: Element, range: Range, chars = 32): { prefix: string; suffix: string } {
  const pre = root.ownerDocument.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  const post = root.ownerDocument.createRange();
  post.selectNodeContents(root);
  post.setStart(range.endContainer, range.endOffset);
  return { prefix: pre.toString().slice(-chars), suffix: post.toString().slice(0, chars) };
}

/** CSS Custom Highlight API wrapper; no DOM changes. Baseline since June 2025 per MDN; older browsers get no paint (docs/decisions.md D16). */
export function setHighlight(name: string, ranges: Range[]): boolean {
  const reg = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
  const HighlightCtor = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!reg || !HighlightCtor) return false;
  if (ranges.length) reg.set(name, new HighlightCtor(...ranges));
  else reg.delete(name);
  return true;
}

let styleEl: HTMLStyleElement | null = null;

/** Page-level ::highlight() rules (they can't live in a shadow root). */
export function ensureHighlightStyles(rules: string): void {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.setAttribute('data-artifact', '');
    (document.head ?? document.documentElement).append(styleEl);
  }
  if (styleEl.textContent !== rules) styleEl.textContent = rules;
}
