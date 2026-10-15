// Myers O(ND) diff over tokens, for the branch diff (words) and the
// enhancer's before/after view (lines).

export type DiffOp = { type: 'eq' | 'del' | 'ins'; text: string };

export function wordTokens(s: string): string[] {
  return s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

export function lineTokens(s: string): string[] {
  return s.split(/(?<=\n)/);
}

export function diffTokens(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map<number, number>([[1, 0]]);
  const trace: Array<Map<number, number>> = [];
  outer: for (let d = 0; d <= max; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
      let x = down ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) break outer;
    }
  }
  // Walk the trace back from the end to recover the edit script.
  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && (vd.get(k - 1) ?? -1) < (vd.get(k + 1) ?? -1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = vd.get(prevK) ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: 'eq', text: a[--x]! });
      y--;
    }
    if (d > 0) {
      if (down) ops.push({ type: 'ins', text: b[--y]! });
      else ops.push({ type: 'del', text: a[--x]! });
    }
  }
  ops.reverse();
  // Merge neighbours of the same type.
  const out: DiffOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else out.push({ ...op });
  }
  return out;
}

export function diffWords(a: string, b: string): DiffOp[] {
  return diffTokens(wordTokens(a), wordTokens(b));
}

export function diffLines(a: string, b: string): DiffOp[] {
  return diffTokens(lineTokens(a), lineTokens(b));
}

/** Share of `a`'s text left unchanged in `b`, 0..1. */
export function similarity(ops: DiffOp[]): number {
  let same = 0;
  let total = 0;
  for (const o of ops) {
    if (o.type !== 'ins') total += o.text.length;
    if (o.type === 'eq') same += o.text.length;
  }
  return total ? same / total : 1;
}
