// Runs exports from an extension page (popup, side panel, preview): asks the
// tab's content script for the conversation and the file bytes, builds the
// bundle, and saves it. PDF and PNG open the preview tab, which renders the
// chat locally and prints it or captures it.
import { browser } from 'wxt/browser';
import type { Conversation, ProjectExport } from '../schema/archive';
import { sendToTab } from '../messaging/tabs';
import { base64ToBytes } from '../util/bytes';
import { buildBundle, type BundleOutput, type FileFormat } from './bundle';
import type { ExportOptions } from './document';
import { saveFile } from './download';

export type ExportFormat = FileFormat | 'pdf' | 'png' | 'png2x';

export function tabDownloader(tabId: number, conv: Conversation) {
  return async (att: { id: string }) => {
    const res = await sendToTab(tabId, { type: 'content:download', conversation: conv, attachmentId: att.id });
    return { name: res.name, mimeType: res.mimeType, bytes: base64ToBytes(res.base64) };
  };
}

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, label: string) => void;
  project?: ProjectExport | null;
  forceZip?: boolean;
}

export async function exportConversation(tabId: number, conv: Conversation, format: FileFormat, options: ExportOptions, run: RunOptions = {}): Promise<BundleOutput> {
  const out = await buildBundle({
    conv,
    format,
    options,
    version: browser.runtime.getManifest().version,
    project: run.project ?? null,
    download: tabDownloader(tabId, conv),
    signal: run.signal,
    onProgress: run.onProgress,
    forceZip: run.forceZip,
  });
  await saveFile(out.filename, out.bytes as BlobPart, out.mimeType);
  return out;
}


export { optionsFromSettings } from './options';
export { openPreview, takePreview } from './preview';
