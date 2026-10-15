// Per-host request pacing: a token bucket plus a minimum gap between calls,
// with backoff on 429/503 that honors Retry-After. Used for every request
// Artifact makes to a site or an AI API, so bulk work never floods anything.

export interface RateLimitOptions {
  /** Maximum burst. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
  /** Minimum milliseconds between two starts. */
  minGapMs: number;
  /** Backoff when a 429 has no Retry-After. */
  defaultBackoffMs: number;
  maxRetries: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class RetryableError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
  }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RateLimiter {
  private tokens: number;
  private last: number;
  private lastStart = -Infinity;
  private blockedUntil = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly o: RateLimitOptions) {
    this.now = o.now ?? (() => Date.now());
    this.sleep = o.sleep ?? realSleep;
    this.tokens = o.capacity;
    this.last = this.now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.o.capacity, this.tokens + ((t - this.last) / 1000) * this.o.refillPerSec);
    this.last = t;
  }

  private async acquire(): Promise<void> {
    for (;;) {
      this.refill();
      const t = this.now();
      const waitBlocked = this.blockedUntil - t;
      const waitGap = this.lastStart + this.o.minGapMs - t;
      const waitToken = this.tokens >= 1 ? 0 : ((1 - this.tokens) / this.o.refillPerSec) * 1000;
      const wait = Math.max(waitBlocked, waitGap, waitToken, 0);
      if (wait <= 0) {
        this.tokens -= 1;
        this.lastStart = t;
        return;
      }
      await this.sleep(Math.ceil(wait));
    }
  }

  /** Pauses all work (e.g. while the user is typing or after a 429). */
  pauseFor(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
  }

  /** Runs `fn` serially under the limit, retrying RetryableError with backoff. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.chain.then(async () => {
      for (let attempt = 0; ; attempt++) {
        await this.acquire();
        try {
          return await fn();
        } catch (e) {
          if (!(e instanceof RetryableError) || attempt >= this.o.maxRetries) throw e;
          const backoff = e.retryAfterMs ?? this.o.defaultBackoffMs * 2 ** attempt;
          this.pauseFor(backoff);
        }
      }
    });
    this.chain = task.catch(() => undefined);
    return task;
  }
}

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}
