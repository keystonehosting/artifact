// Wraps a tokenizer Worker with request ids.
export class WorkerTokenizer {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (c: number[]) => void; reject: (e: Error) => void }>();

  constructor(private readonly create: () => Worker) {}

  private get w(): Worker {
    if (!this.worker) {
      this.worker = this.create();
      this.worker.onmessage = (e: MessageEvent<{ id: number; counts?: number[]; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.counts) p.resolve(e.data.counts);
        else p.reject(new Error(e.data.error ?? 'tokenizer failed'));
      };
    }
    return this.worker;
  }

  count(texts: string[]): Promise<number[]> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.w.postMessage({ id, texts });
    });
  }
}
