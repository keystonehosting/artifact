// Bulk export (SPEC §6F): many chats, whole folders or projects, in one ZIP
// that mirrors the folder tree. Stored copies are used when they are up to
// date; otherwise the chat is read from the site. Each chat is retried, the
// job can pause and stop, and a stopped export keeps everything finished so
// far plus a report of what is missing.
import { strToU8 } from 'fflate';
import type { Attachment, Conversation, ProjectExport } from '../schema/archive';
import { bundleEntries, missingFilesText, type FetchedFile, type FileFormat } from '../export/bundle';
import type { ExportOptions } from '../export/document';
import { buildArchive, toJson } from '../export/json';
import { sanitizeFilenamePart } from '../util/filename';
import { SITES, type SiteId } from '../sites/sites';
import type { ZipSink } from './zip-sink';

export type Layout = 'folders' | 'sites' | 'flat';

export interface ExportJobSpec {
  kind: 'export';
  title: string;
  chatIds: string[];
  format: FileFormat;
  layout: Layout;
  /** Also write the JSON archive next to each chat (for restore). */
  includeJson: boolean;
  /** Projects to export with their instructions, knowledge and memory. */
  projects: Array<{ site: SiteId; id: string; name: string }>;
}

export interface ExportDeps {
  options: ExportOptions;
  version: string;
  /** Up-to-date stored copy, or null to read from the site. */
  stored(chatId: string): Promise<Conversation | null>;
  fetch(site: SiteId, siteChatId: string): Promise<Conversation>;
  download(conv: Conversation, att: Attachment): Promise<FetchedFile>;
  project(site: SiteId, id: string): Promise<ProjectExport>;
  /** Folder path of a chat, e.g. ["Work", "Clients"], or [] when unfiled. */
  folderPath(chatId: string): Promise<string[]>;
  /** Folder for chats of a project, when exporting projects. */
  projectOf?(chatId: string): string | null;
  sink: ZipSink;
  log(entry: LogEntry): void;
  progress(done: number, total: number, label: string): void;
  /** Resolves while paused; rejects with AbortError when stopped. */
  gate(): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface LogEntry {
  at: string;
  chatId: string;
  title: string;
  result: 'ok' | 'partial' | 'failed' | 'skipped';
  detail: string;
}

const RETRY_DELAYS = [2000, 6000];

export class StopError extends Error {
  constructor() {
    super('Stopped');
  }
}

function dirFor(layout: Layout, site: SiteId, folders: string[], project: string | null): string {
  const parts = project ? ['Projects', project] : layout === 'folders' ? (folders.length ? folders : ['Unfiled']) : layout === 'sites' ? [SITES[site]?.name ?? site] : [];
  return parts.map((p) => sanitizeFilenamePart(p, 'folder')).join('/');
}

export async function runExportJob(spec: ExportJobSpec, d: ExportDeps): Promise<{ ok: number; failed: number; stopped: boolean }> {
  let ok = 0;
  let failed = 0;
  let stopped = false;
  const problems: string[] = [];
  const total = spec.chatIds.length + spec.projects.length;
  let done = 0;
  const now = new Date();

  try {
    // Project instructions, knowledge and memory first, next to their chats.
    for (const p of spec.projects) {
      await d.gate();
      d.progress(done, total, p.name);
      try {
        const proj = await d.project(p.site, p.id);
        const dir = dirFor(spec.layout, p.site, [], sanitizeFilenamePart(p.name, 'project'));
        if (proj.instructions) await d.sink.add(d.sink.unique(`${dir}/project/instructions.md`), strToU8(proj.instructions));
        if (proj.memory) await d.sink.add(d.sink.unique(`${dir}/project/memory.md`), strToU8(proj.memory));
        for (const k of proj.knowledge) if (k.content !== undefined) await d.sink.add(d.sink.unique(`${dir}/project/knowledge/${sanitizeFilenamePart(k.name, 'file')}`), strToU8(k.content));
        d.log({ at: new Date().toISOString(), chatId: `${p.site}:project:${p.id}`, title: p.name, result: 'ok', detail: `${proj.knowledge.length} knowledge files` });
      } catch (e) {
        if (e instanceof StopError) throw e;
        problems.push(`Project "${p.name}": ${(e as Error).message}`);
        d.log({ at: new Date().toISOString(), chatId: `${p.site}:project:${p.id}`, title: p.name, result: 'failed', detail: (e as Error).message });
      }
      done++;
    }

    for (const chatId of spec.chatIds) {
      await d.gate();
      const site = chatId.slice(0, chatId.indexOf(':')) as SiteId;
      const siteChatId = chatId.slice(chatId.indexOf(':') + 1);
      let conv: Conversation | null = null;
      let lastError = '';
      for (let attempt = 0; attempt <= RETRY_DELAYS.length && !conv; attempt++) {
        if (attempt) {
          await d.sleep(RETRY_DELAYS[attempt - 1]!);
          await d.gate();
        }
        try {
          conv = (await d.stored(chatId)) ?? (await d.fetch(site, siteChatId));
        } catch (e) {
          if (e instanceof StopError) throw e;
          lastError = (e as Error).message;
        }
      }
      if (!conv) {
        failed++;
        problems.push(`${chatId}: ${lastError}`);
        d.log({ at: new Date().toISOString(), chatId, title: chatId, result: 'failed', detail: lastError });
        done++;
        continue;
      }
      d.progress(done, total, conv.title);
      const c = conv;
      const b = await bundleEntries({
        conv: c,
        format: spec.format,
        options: d.options,
        version: d.version,
        download: (att) => d.download(c, att),
        zip: true,
        now,
      });
      const dir = dirFor(spec.layout, site, await d.folderPath(chatId), d.projectOf?.(chatId) ?? null);
      const chatDir = d.sink.unique(`${dir ? `${dir}/` : ''}${b.root}`);
      await d.sink.add(`${chatDir}/${b.root}.${b.ext}`, b.main);
      if (spec.includeJson && spec.format !== 'json') await d.sink.add(`${chatDir}/${b.root}.json`, strToU8(toJson(buildArchive([c], d.version))));
      for (const [p, bytes] of Object.entries(b.files)) await d.sink.add(`${chatDir}/${p}`, bytes);
      if (b.failures.length) {
        await d.sink.add(`${chatDir}/MISSING_FILES.txt`, strToU8(missingFilesText(b.failures)));
        problems.push(`${c.title}: ${b.failures.length} file(s) missing`);
      }
      ok++;
      d.log({ at: new Date().toISOString(), chatId, title: c.title, result: b.failures.length ? 'partial' : 'ok', detail: `${Object.keys(b.files).length} files${b.failures.length ? `, ${b.failures.length} missing` : ''}` });
      done++;
      d.progress(done, total, '');
    }
  } catch (e) {
    if (!(e instanceof StopError)) throw e;
    stopped = true;
  }

  const report = [
    `Artifact export, ${now.toISOString()}`,
    `${spec.title}`,
    '',
    `Chats exported: ${ok} of ${spec.chatIds.length}`,
    `Failed: ${failed}`,
    stopped ? `Stopped before the end: ${spec.chatIds.length + spec.projects.length - done} item(s) not exported.` : 'Completed.',
    ...(problems.length ? ['', 'Problems:', ...problems.map((p) => `- ${p}`)] : []),
    '',
  ].join('\n');
  await d.sink.add(d.sink.unique('EXPORT_REPORT.txt'), strToU8(report));
  await d.sink.finish();
  return { ok, failed, stopped };
}
