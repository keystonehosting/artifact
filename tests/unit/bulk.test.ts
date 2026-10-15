import { beforeEach, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { ZipSink } from '../../src/core/bulk/zip-sink';
import { runExportJob, StopError, type ExportDeps, type ExportJobSpec, type LogEntry } from '../../src/core/bulk/export-job';
import { confirmMatches, confirmPhrase, logCsv, needsTypedConfirm, ruleMatches, runActionJob, type ActionJobSpec } from '../../src/core/bulk/action-job';
import { DEFAULT_EXPORT_OPTIONS } from '../../src/core/export/document';
import { ArtifactDB, db, setDb } from '../../src/core/db/db';
import { backupChanged, exportLibrary, importLibrary, readBackupState } from '../../src/core/backup/backup';
import { ingest, rebuildIndex } from '../../src/core/library/service';
import { createFolder } from '../../src/core/library/folders';
import { sampleConversation } from './sample';
import type { Conversation } from '../../src/core/schema/archive';

function conv(id: string, title: string): Conversation {
  const c = sampleConversation();
  return { ...c, id: `claude:${id}`, siteChatId: id, title, url: `https://claude.ai/chat/${id}`, attachments: [], artifacts: [], messages: Object.fromEntries(Object.entries(c.messages).map(([k, m]) => [k, { ...m, attachmentIds: [], artifactIds: [], parts: m.parts.filter((p) => p.type === 'text') }])) };
}

function sinkTo(chunks: Uint8Array[]) {
  return new ZipSink((c) => void chunks.push(c));
}

function unzip(chunks: Uint8Array[]): Record<string, string> {
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return Object.fromEntries(Object.entries(unzipSync(all)).map(([k, v]) => [k, strFromU8(v)]));
}

function deps(over: Partial<ExportDeps>, chunks: Uint8Array[], log: LogEntry[]): ExportDeps {
  return {
    options: { ...DEFAULT_EXPORT_OPTIONS, filenameTemplate: '{title}' },
    version: '0.0.0-test',
    stored: async () => null,
    fetch: async (_s, id) => conv(id, `Chat ${id}`),
    download: async () => {
      throw new Error('no files');
    },
    project: async (site, id) => ({ site, id, name: 'P', instructions: 'Be brief.', memory: null, knowledge: [{ id: 'k', name: 'notes.md', content: 'k1' }] }),
    folderPath: async (id) => (id.endsWith('a') ? ['Work', 'Lorem'] : []),
    sink: sinkTo(chunks),
    log: (e) => log.push(e),
    progress: () => undefined,
    gate: async () => undefined,
    sleep: async () => undefined,
    ...over,
  };
}

const spec = (ids: string[], extra: Partial<ExportJobSpec> = {}): ExportJobSpec => ({ kind: 'export', title: 'Test', chatIds: ids, format: 'md', layout: 'folders', includeJson: true, projects: [], ...extra });

describe('bulk export', () => {
  it('mirrors folders, writes JSON beside each chat, de-duplicates names and reports', async () => {
    const chunks: Uint8Array[] = [];
    const log: LogEntry[] = [];
    const d = deps({ fetch: async (_s, id) => conv(id, 'Same title') }, chunks, log);
    const r = await runExportJob(spec(['claude:a', 'claude:b', 'claude:c']), d);
    expect(r).toEqual({ ok: 3, failed: 0, stopped: false });
    const files = Object.keys(unzip(chunks)).sort();
    expect(files).toContain('Work/Lorem/Same title/Same title.md');
    expect(files).toContain('Work/Lorem/Same title/Same title.json');
    expect(files).toContain('Unfiled/Same title/Same title.md');
    expect(files).toContain('Unfiled/Same title (2)/Same title.md');
    expect(unzip(chunks)['EXPORT_REPORT.txt']).toContain('Chats exported: 3 of 3');
  });

  it('retries, then records a failure without stopping the job', async () => {
    const chunks: Uint8Array[] = [];
    const log: LogEntry[] = [];
    let calls = 0;
    const r = await runExportJob(spec(['claude:x', 'claude:y']), deps({ fetch: async (_s, id) => {
      if (id === 'x') {
        calls++;
        throw new Error('HTTP 500');
      }
      return conv(id, 'Y');
    } }, chunks, log));
    expect(calls).toBe(3);
    expect(r).toEqual({ ok: 1, failed: 1, stopped: false });
    expect(log.map((l) => l.result)).toEqual(['failed', 'ok']);
    expect(unzip(chunks)['EXPORT_REPORT.txt']).toContain('claude:x: HTTP 500');
  });

  it('keeps what was finished when stopped', async () => {
    const chunks: Uint8Array[] = [];
    let n = 0;
    const r = await runExportJob(spec(['claude:1', 'claude:2', 'claude:3']), deps({ gate: async () => {
      if (++n === 3) throw new StopError();
    } }, chunks, []));
    expect(r.stopped).toBe(true);
    expect(r.ok).toBe(2);
    const zip = unzip(chunks);
    expect(zip['EXPORT_REPORT.txt']).toContain('Stopped before the end: 1 item(s) not exported.');
  });

  it('exports a project with its instructions and knowledge', async () => {
    const chunks: Uint8Array[] = [];
    await runExportJob(spec(['claude:p1'], { layout: 'flat', projects: [{ site: 'claude', id: 'P1', name: 'Lorem project' }] }), deps({ projectOf: () => 'Lorem project' }, chunks, []));
    const zip = unzip(chunks);
    expect(zip['Projects/Lorem project/project/instructions.md']).toBe('Be brief.');
    expect(zip['Projects/Lorem project/project/knowledge/notes.md']).toBe('k1');
    expect(Object.keys(zip).some((k) => k.startsWith('Projects/Lorem project/Chat p1/'))).toBe(true);
  });
});

describe('bulk action guardrails', () => {
  it('requires typed confirmation above 10 items', () => {
    expect(needsTypedConfirm(10)).toBe(false);
    expect(needsTypedConfirm(11)).toBe(true);
    expect(confirmPhrase('delete', 23)).toBe('delete 23');
    expect(confirmMatches(' Delete  23 ', 'delete', 23)).toBe(true);
    expect(confirmMatches('delete 22', 'delete', 23)).toBe(false);
  });

  it('runs paced, skips unsupported sites, logs every item and stops on request', async () => {
    const s: ActionJobSpec = { kind: 'action', title: 't', action: 'archive', chatIds: ['chatgpt:1', 'claude:2', 'chatgpt:3', 'chatgpt:4'], removeFromLibrary: false };
    const log: LogEntry[] = [];
    const done: string[] = [];
    const sleeps: number[] = [];
    let gates = 0;
    const r = await runActionJob(s, {
      can: (site) => site === 'chatgpt',
      run: async (_site, id) => {
        if (id === '3') throw new Error('HTTP 429');
        done.push(id);
      },
      title: (id) => id,
      after: async () => undefined,
      log: (e) => log.push(e),
      progress: () => undefined,
      gate: async () => {
        if (++gates === 4) throw new StopError();
      },
      sleep: async (ms) => void sleeps.push(ms),
      gapMs: 1200,
    });
    expect(r).toEqual({ ok: 1, failed: 1, skipped: 1, stopped: true });
    expect(done).toEqual(['1']);
    expect(log.map((l) => l.result)).toEqual(['ok', 'skipped', 'failed']);
    expect(sleeps).toEqual([1200, 1200]);
    expect(logCsv(log).split('\n')[0]).toBe('time,chat,title,result,detail');
  });

  it('auto-archive rules match only old, unpinned, unfiled chats on sites that can archive', () => {
    const now = Date.parse('2026-06-01');
    const day = 86_400_000;
    const base = { site: 'chatgpt' as const, title: 't', pinned: 0 as const, archived: 0 as const, lastOpenedAt: null, inFolder: false };
    const chats = [
      { ...base, id: 'old', updatedAt: new Date(now - 100 * day).toISOString() },
      { ...base, id: 'new', updatedAt: new Date(now - 10 * day).toISOString() },
      { ...base, id: 'opened', updatedAt: new Date(now - 100 * day).toISOString(), lastOpenedAt: now - day },
      { ...base, id: 'pinned', updatedAt: new Date(now - 100 * day).toISOString(), pinned: 1 as const },
      { ...base, id: 'filed', updatedAt: new Date(now - 100 * day).toISOString(), inFolder: true },
      { ...base, id: 'claude', site: 'claude' as const, updatedAt: new Date(now - 100 * day).toISOString() },
    ];
    const rule = { id: 'r', name: 'r', days: 90, exceptPinned: true, exceptInFolders: true, sites: [], enabled: true };
    expect(ruleMatches(rule, chats, (s) => s === 'chatgpt', now).map((c) => c.id)).toEqual(['old']);
  });
});

let n = 0;
describe('backup and library export', () => {
  beforeEach(async () => {
    setDb(new ArtifactDB(`bulk-${++n}`));
    await rebuildIndex();
  });

  it('writes only changed chats, plus the library', async () => {
    await ingest(conv('a', 'Alpha'));
    const written = new Map<string, string>();
    const w = { write: async (p: string, d: string) => void written.set(p, d) };
    expect(await backupChanged(w, '0.0.0')).toBe(1);
    expect([...written.keys()].sort()).toEqual(['Claude/Alpha [a].json', 'Claude/Alpha [a].md', 'library.json']);
    written.clear();
    expect(await backupChanged(w, '0.0.0')).toBe(0);
    expect(written.size).toBe(0);
    expect((await readBackupState()).lastRunAt).toBeTypeOf('number');
  });

  it('round-trips library tables', async () => {
    await createFolder('Lorem');
    const lib = await exportLibrary();
    setDb(new ArtifactDB(`bulk-${++n}`));
    expect(await importLibrary(lib)).toBe(1);
    expect((await db().folders.toArray())[0]!.name).toBe('Lorem');
  });
});
