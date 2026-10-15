// Content-side token counting: caches counts per text and asks the
// background (which owns the worker) only for texts it hasn't seen.
import { browser } from 'wxt/browser';

export function hashText(s: string): string {
  // FNV-1a 32-bit plus length: enough to key a cache of message texts.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}:${s.length}`;
}

export type CountFn = (texts: string[]) => Promise<number[]>;

export const backgroundCount: CountFn = async (texts) => {
  const res = (await browser.runtime.sendMessage({ type: 'bg:tokenize', texts })) as { counts?: number[]; error?: string };
  if (!res?.counts) throw new Error(res?.error ?? 'Tokenizer unavailable');
  return res.counts;
};

export class TokenCache {
  private cache = new Map<string, number>();

  constructor(private readonly count: CountFn = backgroundCount, private readonly max = 5000) {}

  async counts(texts: string[]): Promise<number[]> {
    const keys = texts.map(hashText);
    const missing = [...new Set(keys.filter((k) => !this.cache.has(k)))];
    if (missing.length) {
      const byKey = new Map(keys.map((k, i) => [k, texts[i]!]));
      const counts = await this.count(missing.map((k) => byKey.get(k)!));
      missing.forEach((k, i) => this.cache.set(k, counts[i]!));
      if (this.cache.size > this.max) {
        const drop = this.cache.size - this.max;
        let n = 0;
        for (const k of this.cache.keys()) {
          if (n++ >= drop) break;
          this.cache.delete(k);
        }
      }
    }
    return keys.map((k) => this.cache.get(k)!);
  }
}
