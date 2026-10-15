// Same-origin JSON requests from a content script with the user's session,
// paced by a per-site RateLimiter. Errors carry the HTTP status.
import { RateLimiter, RetryableError, retryAfterMs } from '../queue/ratelimit';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Defaults follow the pacing AI Toolbox uses on ChatGPT (dossier sync-and-indexing.md):
// burst 6, 1.2 requests/s, one at a time with a gap, 60 s backoff on 429 without Retry-After.
export function siteLimiter(): RateLimiter {
  return new RateLimiter({ capacity: 6, refillPerSec: 1.2, minGapMs: 250, defaultBackoffMs: 60_000, maxRetries: 2 });
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  timeoutMs?: number;
}

export async function request(limiter: RateLimiter, url: string, opts: RequestOptions = {}): Promise<Response> {
  return limiter.run(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: opts.headers,
        body: opts.body ?? null,
        credentials: 'include',
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status === 503) {
        throw new RetryableError(`HTTP ${res.status} from ${new URL(url).pathname}`, retryAfterMs(res.headers.get('retry-after')));
      }
      if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).pathname}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  });
}

export async function requestJson(limiter: RateLimiter, url: string, opts: RequestOptions = {}): Promise<unknown> {
  const res = await request(limiter, url, { ...opts, headers: { accept: 'application/json', ...opts.headers } });
  return res.json();
}

export function readCookie(name: string, cookie = typeof document !== 'undefined' ? document.cookie : ''): string | null {
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
