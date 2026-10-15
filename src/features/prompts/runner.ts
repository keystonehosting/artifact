// Runs chains and the prompt queue (SPEC §6D): each step goes into the
// composer, is sent, and the next waits for the reply to finish (or for the
// user, on steps set to "wait for me"). One run at a time; pause, stop and
// retry from the composer bar.
import type { SiteAdapter } from '../../adapters/types';
import type { ChainStep } from '../../core/db/db';

export type RunPhase = 'sending' | 'waiting' | 'paused' | 'confirm' | 'timeout' | 'failed' | 'done' | 'stopped';

export interface RunState {
  name: string;
  /** Index of the current step. */
  index: number;
  total: number;
  stepName: string;
  phase: RunPhase;
  queue: boolean;
}

export interface RunnerTiming {
  /** How long a sent step may take to start replying. */
  startMs: number;
  /** Longest a reply may stream. */
  replyMs: number;
  /** Pause between a finished reply and the next step. */
  gapMs: number;
  pollMs: number;
}

const DEFAULT_TIMING: RunnerTiming = { startMs: 12_000, replyMs: 10 * 60_000, gapMs: 900, pollMs: 250 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Runner {
  private steps: ChainStep[] = [];
  private state: RunState | null = null;
  private listeners = new Set<(s: RunState | null) => void>();
  private generation = 0;
  private resumeFn: (() => void) | null = null;
  private paused = false;

  constructor(
    private readonly adapter: SiteAdapter,
    private readonly timing: RunnerTiming = DEFAULT_TIMING,
  ) {}

  get current(): RunState | null {
    return this.state;
  }

  subscribe(fn: (s: RunState | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<RunState>): void {
    if (!this.state) return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private clear(): void {
    this.state = null;
    for (const fn of this.listeners) fn(null);
  }

  /** Starts a chain, replacing any run in progress. */
  start(name: string, steps: ChainStep[], queue = false): void {
    const gen = ++this.generation;
    this.steps = [...steps];
    this.paused = false;
    this.resumeFn?.();
    this.state = { name, index: 0, total: steps.length, stepName: steps[0]?.name ?? '', phase: 'sending', queue };
    for (const fn of this.listeners) fn(this.state);
    void this.loop(gen, 0);
  }

  /** Adds text to the queue; starts the queue when nothing is running. */
  enqueue(text: string): void {
    const step: ChainStep = { name: '', text, after: 'reply' };
    const active = this.state && !['done', 'stopped', 'failed', 'timeout'].includes(this.state.phase);
    if (active) {
      // Joins the end of whatever is running, chain or queue.
      this.steps.push(step);
      this.set({ total: this.steps.length });
      return;
    }
    this.start('', [step], true);
  }

  pause(): void {
    this.paused = true;
    if (this.state && this.state.phase !== 'confirm') this.set({ phase: 'paused' });
  }

  resume(): void {
    this.paused = false;
    const fn = this.resumeFn;
    this.resumeFn = null;
    fn?.();
  }

  stop(): void {
    this.generation++;
    this.paused = false;
    const fn = this.resumeFn;
    this.resumeFn = null;
    fn?.();
    if (this.state) this.set({ phase: 'stopped' });
    setTimeout(() => this.state?.phase === 'stopped' && this.clear(), 2500);
  }

  /** Re-sends the current step after a timeout or failure. */
  retry(): void {
    if (!this.state) return;
    const gen = ++this.generation;
    void this.loop(gen, this.state.index);
  }

  dismiss(): void {
    this.generation++;
    this.clear();
  }

  private waitForUser(gen: number): Promise<void> {
    return new Promise((resolve) => {
      this.resumeFn = () => {
        if (gen === this.generation) resolve();
      };
    });
  }

  private async until(gen: number, ms: number, done: () => boolean): Promise<'ok' | 'timeout' | 'cancelled'> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (gen !== this.generation) return 'cancelled';
      if (done()) return 'ok';
      await sleep(this.timing.pollMs);
    }
    return 'timeout';
  }

  private async loop(gen: number, from: number): Promise<void> {
    const a = this.adapter;
    for (let i = from; i < this.steps.length; i++) {
      if (gen !== this.generation) return;
      const step = this.steps[i]!;
      this.set({ index: i, stepName: step.name, total: this.steps.length, phase: 'sending' });
      if (this.paused) {
        this.set({ phase: 'paused' });
        await this.waitForUser(gen);
        if (gen !== this.generation) return;
      }
      // Never interrupt a reply that is still coming in (the user's own, for the queue).
      if ((await this.until(gen, this.timing.replyMs, () => !a.isStreaming())) !== 'ok') return;
      const filled = await a.fillComposer(step.text);
      if (!filled) return this.set({ phase: 'failed' });
      await sleep(150);
      await a.submit();
      this.set({ phase: 'waiting' });
      const started = await this.until(gen, this.timing.startMs, () => a.isStreaming() || !a.getDraftText().trim());
      if (started === 'cancelled') return;
      if (started === 'timeout') return this.set({ phase: 'timeout' });
      // The composer emptied: the message went out. Now wait for the reply to end,
      // with a few calm polls in a row so a brief gap between chunks doesn't count.
      let calm = 0;
      const ended = await this.until(gen, this.timing.replyMs, () => {
        calm = a.isStreaming() ? 0 : calm + 1;
        return calm >= 3;
      });
      if (ended === 'cancelled') return;
      if (ended === 'timeout') return this.set({ phase: 'timeout' });
      if (i === this.steps.length - 1) break;
      if (step.after === 'confirm') {
        this.set({ phase: 'confirm' });
        await this.waitForUser(gen);
        if (gen !== this.generation) return;
      }
      await sleep(this.timing.gapMs);
    }
    if (gen !== this.generation) return;
    this.set({ phase: 'done', index: this.steps.length - 1 });
    setTimeout(() => {
      if (gen === this.generation && this.state?.phase === 'done') this.clear();
    }, 2500);
  }
}
