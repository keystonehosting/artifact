// A ZIP written as it grows (fflate's streaming Zip): each file is
// compressed and handed to `write` straight away, so a huge export can go to
// disk without holding the whole archive in memory.
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

/** Formats that are already compressed are stored, not deflated again. */
const STORED = /\.(png|jpe?g|gif|webp|zip|gz|docx|xlsx|pptx|pdf|mp3|mp4|m4a|webm|woff2?)$/i;

export class ZipSink {
  private zip: Zip;
  private pending: Promise<void> = Promise.resolve();
  private done: Promise<void>;
  private finishOk!: () => void;
  private fail!: (e: Error) => void;
  private readonly taken = new Set<string>();
  count = 0;
  bytes = 0;

  constructor(write: (chunk: Uint8Array) => Promise<void> | void) {
    this.done = new Promise((res, rej) => {
      this.finishOk = res;
      this.fail = rej;
    });
    this.zip = new Zip((err, chunk, final) => {
      if (err) return this.fail(err);
      this.bytes += chunk.length;
      this.pending = this.pending.then(() => write(chunk));
      if (final) void this.pending.then(this.finishOk, this.fail);
    });
  }

  /** A path not used yet in this archive: "a.md", then "a (2).md". */
  unique(path: string): string {
    if (!this.taken.has(path)) {
      this.taken.add(path);
      return path;
    }
    const dot = path.lastIndexOf('.');
    const slash = path.lastIndexOf('/');
    const [stem, ext] = dot > slash ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
    for (let n = 2; ; n++) {
      const p = `${stem} (${n})${ext}`;
      if (!this.taken.has(p)) {
        this.taken.add(p);
        return p;
      }
    }
  }

  /** Adds a file; its path must already be unique. Resolves once its bytes are written. */
  async add(path: string, data: Uint8Array): Promise<void> {
    const f = STORED.test(path) ? new ZipPassThrough(path) : new ZipDeflate(path, { level: 6 });
    this.zip.add(f);
    f.push(data, true);
    this.count++;
    await this.pending;
  }

  async finish(): Promise<void> {
    this.zip.end();
    await this.done;
  }
}
