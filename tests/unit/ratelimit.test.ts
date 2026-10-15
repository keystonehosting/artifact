import { describe, expect, it } from 'vitest';
import { RateLimiter, RetryableError, retryAfterMs } from '../../src/core/queue/ratelimit';
import { hostAllowed } from '../../src/core/net/hosts';
import { matchCapture } from '../../src/core/intercept/patterns';

function clock() {
  let now = 0;
  return { now: () => now, sleep: async (ms: number) => void (now += ms) };
}

describe('rate limiter', () => {
  it('spaces calls by the minimum gap and the token bucket', async () => {
    const c = clock();
    const rl = new RateLimiter({ capacity: 2, refillPerSec: 1, minGapMs: 100, defaultBackoffMs: 1000, maxRetries: 1, ...c });
    const starts: number[] = [];
    await Promise.all([1, 2, 3, 4].map(() => rl.run(async () => void starts.push(c.now()))));
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(100);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(100);
    expect(starts[3]! - starts[2]!).toBeGreaterThanOrEqual(900);
  });

  it('retries with Retry-After and gives up after maxRetries', async () => {
    const c = clock();
    const rl = new RateLimiter({ capacity: 5, refillPerSec: 5, minGapMs: 0, defaultBackoffMs: 1000, maxRetries: 2, ...c });
    let n = 0;
    const v = await rl.run(async () => {
      if (++n < 3) throw new RetryableError('429', 5000);
      return 'ok';
    });
    expect(v).toBe('ok');
    expect(c.now()).toBeGreaterThanOrEqual(10_000);
    await expect(rl.run(async () => Promise.reject(new RetryableError('429', null)))).rejects.toThrow('429');
  });

  it('parses Retry-After', () => {
    expect(retryAfterMs('3')).toBe(3000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4000)).toBe(6000);
  });
});

describe('network allowlists', () => {
  it('only allows the AI sites and their file hosts', () => {
    const pats = ['https://*.oaiusercontent.com/*', 'https://claude.ai/*'];
    expect(hostAllowed('https://files.oaiusercontent.com/x?sig=1', pats)).toBe(true);
    expect(hostAllowed('https://claude.ai/api/x', pats)).toBe(true);
    expect(hostAllowed('https://evil.test/claude.ai/', pats)).toBe(false);
    expect(hostAllowed('http://claude.ai/x', pats)).toBe(false);
    expect(hostAllowed('https://oaiusercontent.com.evil.test/x', pats)).toBe(false);
  });

  it('captures only conversation reads from the page', () => {
    expect(matchCapture('https://chatgpt.com/backend-api/conversation/68f0a1b2-0000', 'GET')).toBe('chatgpt.conversation');
    expect(matchCapture('https://chatgpt.com/backend-api/conversation', 'POST')).toBeNull();
    expect(matchCapture('https://claude.ai/api/organizations/o/chat_conversations/11111111-1111-4111-8111-111111111111?tree=True', 'GET')).toBe('claude.conversation');
    expect(matchCapture('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=hNvQHb', 'POST')).toBe('gemini.batchexecute');
    expect(matchCapture('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=GzXR5e', 'POST')).toBeNull();
    expect(matchCapture('https://grok.com/rest/app-chat/conversations/x/load-responses', 'POST')).toBe('grok.responses');
  });
});
