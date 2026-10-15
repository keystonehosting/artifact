// Deep scan (SPEC §6C): lists every chat on the site and stores the ones that
// are new or changed since the last scan. Incremental, resumable, paced by the
// site rate limiter, and paused while the user types.
import { browser } from 'wxt/browser';
import type { SiteAdapter } from '../../adapters/types';
import { lib } from '../../core/library/client';

export interface ScanState {
  site: string;
  running: boolean;
  /** Listing cursor to resume from; null when listing is complete. */
  cursor: string | null;
  listed: number;
  fetched: number;
  failed: number;
  queue: string[];
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

const key = (site: string) => `scan:${site}`;

export async function readScanState(site: string): Promise<ScanState | null> {
  return (await lib('kvGet', key(site))) as ScanState | null;
}

function idle(): Promise<void> {
  return new Promise((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 50)));
}

export class DeepScan {
  private stopRequested = false;
  private running = false;
  private lastInput = 0;
  private readonly onInput = () => (this.lastInput = Date.now());

  constructor(private readonly adapter: SiteAdapter) {}

  get isRunning(): boolean {
    return this.running;
  }

  stop(): void {
    this.stopRequested = true;
  }

  private async save(s: ScanState): Promise<void> {
    await lib('kvSet', key(s.site), s);
    void browser.runtime.sendMessage({ type: 'scan:progress', state: s }).catch(() => undefined);
  }

  async run(fresh: boolean): Promise<ScanState> {
    const a = this.adapter;
    if (!a.listChats || !a.getChat) throw new Error('This site cannot be scanned');
    if (this.running) throw new Error('A scan is already running');
    this.running = true;
    this.stopRequested = false;
    document.addEventListener('keydown', this.onInput, true);
    const prev = fresh ? null : await readScanState(a.id);
    const s: ScanState =
      prev && !prev.finishedAt
        ? { ...prev, running: true, error: null }
        : { site: a.id, running: true, cursor: null, listed: 0, fetched: 0, failed: 0, queue: [], startedAt: Date.now(), finishedAt: null, error: null };
    try {
      let listingDone = !!prev && !prev.finishedAt && prev.cursor === null && prev.listed > 0;
      while (!this.stopRequested) {
        // Never compete with the user: wait while they're typing or a reply streams.
        while (Date.now() - this.lastInput < 5000 || a.isStreaming()) await new Promise((r) => setTimeout(r, 1000));
        await idle();
        if (!listingDone) {
          const page = await a.listChats(s.cursor);
          s.listed += page.items.length;
          s.queue.push(...(await lib('noteListed', a.id, page.items)));
          s.cursor = page.next;
          listingDone = page.next === null;
          await this.save(s);
          continue;
        }
        const next = s.queue.shift();
        if (!next) break;
        try {
          const read = await a.getChat(next);
          await lib('ingest', read.value, {});
          s.fetched++;
        } catch {
          s.failed++;
        }
        await this.save(s);
      }
      s.running = false;
      if (!this.stopRequested) s.finishedAt = Date.now();
      await this.save(s);
      return s;
    } catch (e) {
      s.running = false;
      s.error = (e as Error).message;
      await this.save(s);
      throw e;
    } finally {
      this.running = false;
      document.removeEventListener('keydown', this.onInput, true);
    }
  }
}
