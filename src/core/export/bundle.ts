// Builds an export: the document in the chosen format plus the real files
// (uploads, generated images, created files) and artifacts, zipped when there
// is more than one file. Every download failure is recorded, and the export
// still completes, with the reason written next to the file name.
import { zipSync, strToU8 } from 'fflate';
import type { Artifact, Attachment, Conversation, ProjectExport } from '../schema/archive';
import { buildDocument, type ExportOptions } from './document';
import { toMarkdown } from './markdown';
import { toText } from './text';
import { toHtml } from './html';
import { toDocx } from './docx';
import { buildArchive, toJson } from './json';
import { formatFilename, sanitizeFilenamePart, uniqueName } from '../util/filename';
import { SITES } from '../sites/sites';
import { bytesToBase64, mimeFromName } from '../util/bytes';

export type FileFormat = 'md' | 'txt' | 'json' | 'html' | 'docx';

export interface FetchedFile {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface BundleInput {
  conv: Conversation;
  format: FileFormat;
  options: ExportOptions;
  version: string;
  project?: ProjectExport | null;
  download: (att: Attachment) => Promise<FetchedFile>;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, label: string) => void;
  /** Always produce a ZIP, even without files. */
  forceZip?: boolean;
  /** Also include the JSON archive in the ZIP. */
  includeJson?: boolean;
  now?: Date;
}

export interface BundleOutput {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  failures: Array<{ name: string; reason: string }>;
  fileCount: number;
}

const ARTIFACT_EXT: Record<string, string> = {
  'text/html': 'html',
  'text/markdown': 'md',
  'image/svg+xml': 'svg',
  'application/vnd.ant.react': 'jsx',
  'application/vnd.ant.mermaid': 'mmd',
  'application/vnd.ant.code': 'txt',
};

const LANG_EXT: Record<string, string> = {
  python: 'py', javascript: 'js', typescript: 'ts', tsx: 'tsx', jsx: 'jsx', html: 'html', css: 'css', json: 'json', bash: 'sh', shell: 'sh',
  rust: 'rs', go: 'go', java: 'java', ruby: 'rb', sql: 'sql', yaml: 'yml', markdown: 'md', c: 'c', cpp: 'cpp', csharp: 'cs', kotlin: 'kt',
  swift: 'swift', php: 'php', r: 'r', svg: 'svg', xml: 'xml', mermaid: 'mmd',
};

export function artifactExtension(a: Pick<Artifact, 'type' | 'language' | 'title'>): string {
  const fromTitle = /\.([a-z0-9]{1,6})$/i.exec(a.title)?.[1];
  if (fromTitle) return fromTitle.toLowerCase();
  if (a.language && LANG_EXT[a.language.toLowerCase()]) return LANG_EXT[a.language.toLowerCase()]!;
  if (ARTIFACT_EXT[a.type]) return ARTIFACT_EXT[a.type]!;
  const m = /^text\/x-([\w+#-]+)$/.exec(a.type);
  if (m) return LANG_EXT[m[1]!] ?? m[1]!;
  return 'txt';
}

export function artifactFiles(a: Artifact, taken: Set<string>): Array<{ path: string; content: string; latest: boolean }> {
  const ext = artifactExtension(a);
  const base = sanitizeFilenamePart(a.title.replace(/\.[a-z0-9]{1,6}$/i, ''), 'artifact');
  const out = [{ path: uniqueName(`artifacts/${base}.${ext}`, taken), content: a.versions[a.versions.length - 1]!.content, latest: true }];
  if (a.versions.length > 1) {
    a.versions.slice(0, -1).forEach((v, i) => out.push({ path: uniqueName(`artifacts/versions/${base}.v${i + 1}.${ext}`, taken), content: v.content, latest: false }));
  }
  return out;
}

/** One chat's export as named entries: the main file, its files and artifacts, and a list of what couldn't be fetched. */
export interface BundleEntries {
  /** Base name from the filename pattern, already safe for a path. */
  root: string;
  ext: string;
  mimeType: string;
  main: Uint8Array;
  /** Paths relative to the chat's folder (files/, artifacts/, project/). */
  files: Record<string, Uint8Array>;
  failures: Array<{ name: string; reason: string }>;
  /** Links in the main file point at paths inside a ZIP (otherwise images are inlined). */
  zipped: boolean;
  /** Name for a lone file when nothing else needs saving. */
  filename: string;
}

/** Builds one chat's export. `zip` forces ZIP-style links; by default a chat with files is zipped. */
export async function bundleEntries(i: BundleInput & { zip?: boolean }): Promise<BundleEntries> {
  const now = i.now ?? new Date();
  const doc = buildDocument(i.conv, i.options);
  const site = SITES[i.conv.site].name;
  const base = formatFilename(i.options.filenameTemplate, { platform: site, title: i.conv.title, date: now, model: i.conv.model, id: i.conv.siteChatId });
  const files: Record<string, Uint8Array> = {};
  const taken = new Set<string>();
  const attPath = new Map<string, string>();
  const artPath = new Map<string, string>();
  const images = new Map<string, FetchedFile>();
  const failures: Array<{ name: string; reason: string }> = [];

  // Attachments referenced by exported messages.
  const wanted = new Map<string, Attachment>();
  for (const b of doc.branches) for (const m of b.messages) for (const a of m.attachments) wanted.set(a.id, a);
  const list = [...wanted.values()].filter((a) => {
    const isImage = (a.mimeType ?? mimeFromName(a.name)).startsWith('image/') || doc.branches.some((b) => b.messages.some((m) => m.parts.some((p) => p.type === 'image' && p.attachmentId === a.id)));
    return isImage ? i.options.includeImages : i.options.includeFiles;
  });
  let done = 0;
  for (const a of list) {
    if (i.signal?.aborted) break;
    i.onProgress?.(done, list.length, a.name);
    try {
      const f = await i.download(a);
      const path = uniqueName(`files/${sanitizeFilenamePart(f.name, 'file')}`, taken);
      files[path] = f.bytes;
      attPath.set(a.id, path);
      if (f.mimeType.startsWith('image/')) images.set(a.id, f);
    } catch (e) {
      const reason = (e as Error).message;
      failures.push({ name: a.name, reason });
      a.unavailableReason = reason;
    }
    done++;
  }
  i.onProgress?.(done, list.length, '');

  // Artifacts referenced by exported messages.
  if (i.options.includeArtifacts) {
    const arts = new Map<string, Artifact>();
    for (const b of doc.branches) for (const m of b.messages) for (const a of m.artifacts) arts.set(a.id, a);
    for (const a of arts.values()) {
      for (const f of artifactFiles(a, taken)) {
        files[f.path] = strToU8(f.content);
        if (f.latest) artPath.set(a.id, f.path);
      }
    }
  }

  // Claude project instructions, knowledge files and memory.
  if (i.project) {
    const p = i.project;
    if (p.instructions) files[uniqueName('project/instructions.md', taken)] = strToU8(p.instructions);
    if (p.memory) files[uniqueName('project/memory.md', taken)] = strToU8(p.memory);
    for (const k of p.knowledge) if (k.content !== undefined) files[uniqueName(`project/knowledge/${sanitizeFilenamePart(k.name, 'file')}`, taken)] = strToU8(k.content);
  }

  const zip = i.zip ?? (!!i.forceZip || Object.keys(files).length > 0);
  const linkFiles = {
    attachmentPath: (id: string) => attPath.get(id) ?? null,
    artifactPath: (id: string) => artPath.get(id) ?? null,
  };
  const htmlFiles = zip
    ? { attachmentHref: linkFiles.attachmentPath, artifactHref: linkFiles.artifactPath }
    : {
        attachmentHref: (id: string) => {
          const f = images.get(id);
          return f ? `data:${f.mimeType};base64,${bytesToBase64(f.bytes)}` : null;
        },
        artifactHref: () => null,
      };

  let main: Uint8Array;
  let ext: string;
  let mime: string;
  switch (i.format) {
    case 'md':
      [main, ext, mime] = [strToU8(toMarkdown(doc, linkFiles, now)), 'md', 'text/markdown'];
      break;
    case 'txt':
      [main, ext, mime] = [strToU8(toText(doc)), 'txt', 'text/plain'];
      break;
    case 'html':
      [main, ext, mime] = [strToU8(toHtml(doc, htmlFiles, now)), 'html', 'text/html'];
      break;
    case 'docx':
      main = toDocx(doc, { image: (id) => images.get(id) ?? null, attachmentName: (id) => attPath.get(id) ?? null }, now);
      [ext, mime] = ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      break;
    case 'json':
      [main, ext, mime] = [strToU8(toJson(buildArchive([i.conv], i.version, i.project ? { projects: [i.project] } : {}))), 'json', 'application/json'];
      break;
  }

  return { root: sanitizeFilenamePart(base, 'export'), ext, mimeType: mime, main, files, failures, zipped: zip, filename: `${base}.${ext}` };
}

/** The text of MISSING_FILES.txt for files that couldn't be downloaded. */
export function missingFilesText(failures: Array<{ name: string; reason: string }>): string {
  return `These files could not be downloaded:\n\n${failures.map((f) => `- ${f.name}: ${f.reason}`).join('\n')}\n`;
}

export async function buildBundle(i: BundleInput): Promise<BundleOutput> {
  const b = await bundleEntries(i);
  if (!b.zipped) return { filename: b.filename, mimeType: b.mimeType, bytes: b.main, failures: b.failures, fileCount: 1 };
  const root = b.root;
  const entries: Record<string, Uint8Array> = { [`${root}/${root}.${b.ext}`]: b.main };
  if (i.includeJson && i.format !== 'json') entries[`${root}/${root}.json`] = strToU8(toJson(buildArchive([i.conv], i.version)));
  for (const [p, bytes] of Object.entries(b.files)) entries[`${root}/${p}`] = bytes;
  if (b.failures.length) entries[`${root}/MISSING_FILES.txt`] = strToU8(missingFilesText(b.failures));
  return { filename: `${root}.zip`, mimeType: 'application/zip', bytes: zipSync(entries, { level: 6 }), failures: b.failures, fileCount: Object.keys(entries).length };
}
