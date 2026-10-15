// Google batchexecute envelope (Gemini and AI Studio). The response body is
// `)]}'` followed by length-prefixed JSON chunks; each chunk is an array of
// frames, and "wrb.fr" frames carry an RPC id and a JSON-encoded payload.
import { z } from 'zod';

const FrameSchema = z.tuple([z.literal('wrb.fr'), z.string(), z.string().nullable()], z.unknown());

export interface RpcFrame {
  rpcId: string;
  payload: unknown;
}

export class EnvelopeError extends Error {}

/** Parses every wrb.fr frame in a batchexecute response body. */
export function decodeBatchExecute(body: string): RpcFrame[] {
  const text = body.replace(/^\)\]\}'\s*/, '');
  const frames: RpcFrame[] = [];
  const chunks: unknown[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length) break;
    const m = /^(\d+)\n/.exec(text.slice(i, i + 16));
    if (m) {
      // Length-prefixed chunk (length counts UTF-16 units in practice; fall back to bracket matching).
      i += m[0].length;
      const end = matchBracket(text, i);
      chunks.push(JSON.parse(text.slice(i, end)));
      i = end;
    } else if (text[i] === '[') {
      const end = matchBracket(text, i);
      chunks.push(JSON.parse(text.slice(i, end)));
      i = end;
    } else {
      throw new EnvelopeError(`Unexpected batchexecute content at offset ${i}`);
    }
  }
  for (const chunk of chunks) {
    if (!Array.isArray(chunk)) continue;
    for (const raw of chunk) {
      const res = FrameSchema.safeParse(raw);
      if (!res.success) continue;
      const [, rpcId, payload] = res.data;
      frames.push({ rpcId, payload: payload === null ? null : JSON.parse(payload) });
    }
  }
  if (!frames.length && !chunks.length) throw new EnvelopeError('Empty batchexecute response');
  return frames;
}

/** Index just past the JSON array/object starting at `start`, honoring strings. */
function matchBracket(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new EnvelopeError('Unterminated JSON in batchexecute response');
}

/** Builds the form body for a batchexecute call. */
export function encodeBatchExecute(rpcId: string, args: unknown, at: string): string {
  const freq = JSON.stringify([[[rpcId, JSON.stringify(args), null, 'generic']]]);
  return `f.req=${encodeURIComponent(freq)}&at=${encodeURIComponent(at)}&`;
}

/** Safe nested array access: at(x, 0, 2, 1). */
export function at(value: unknown, ...path: number[]): unknown {
  let v = value;
  for (const p of path) {
    if (!Array.isArray(v)) return undefined;
    v = v[p];
  }
  return v;
}

export const StringSchema = z.string();
