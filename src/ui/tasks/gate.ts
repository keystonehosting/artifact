// Pause, resume and stop for long jobs.
import { StopError } from '../../core/bulk/export-job';

export class Gate {
  private paused = false;
  private stopped = false;
  private waiters: Array<() => void> = [];

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.waiters.splice(0).forEach((w) => w());
  }

  stop(): void {
    this.stopped = true;
    this.resume();
  }

  async wait(): Promise<void> {
    if (this.stopped) throw new StopError();
    while (this.paused) await new Promise<void>((r) => this.waiters.push(r));
    if (this.stopped) throw new StopError();
  }

  /** A sleep that ends early when the job is stopped. */
  async sleep(ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.stopped) throw new StopError();
      await new Promise((r) => setTimeout(r, Math.min(200, end - Date.now())));
    }
  }
}
