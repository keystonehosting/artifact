// Puts a saved prompt into the composer: asks for its variables, attaches
// its files, and sends only when the prompt is set to send on its own.
import type { SiteAdapter } from '../../adapters/types';
import type { PromptRow } from '../../core/db/db';
import { lib } from '../../core/library/client';
import { needsForm, parseTemplate, renderTemplate } from '../../core/prompts/template';
import { base64ToBytes } from '../../core/util/bytes';
import { askVariables } from './var-form';

export interface ApplyOptions {
  /** Composer text kept in front of the prompt (text typed before a `//` trigger). */
  before?: string;
  /** Text selected on a page, for right-click prompts. */
  selection?: string;
  /** Send after inserting even if the prompt isn't set to. */
  send?: boolean;
}

async function libraryFiles(ids: string[]): Promise<File[]> {
  if (!ids.length) return [];
  const rows = await lib('promptFilesData', ids);
  return rows.map((f) => new File([base64ToBytes(f.data) as BlobPart], f.name, { type: f.mimeType }));
}

/** Renders a template for insertion. Resolves null when the user cancels the form. */
export async function renderForUse(name: string, body: string, selection?: string): Promise<{ text: string; files: File[] } | null> {
  const parsed = parseTemplate(body);
  let values = {};
  let files: File[] = [];
  if (needsForm(body)) {
    const r = await askVariables(name, parsed);
    if (!r) return null;
    values = r.values;
    files = r.files;
  }
  let text = renderTemplate(body, values, { selection });
  if (selection && !/\{\{\s*selection\s*\}\}/i.test(body)) text = `${text.trimEnd()}\n\n${selection}`;
  return { text, files };
}

export async function applyPrompt(adapter: SiteAdapter, prompt: PromptRow, o: ApplyOptions = {}): Promise<boolean> {
  const r = await renderForUse(prompt.name, prompt.body, o.selection);
  if (!r) return false;
  const files = [...r.files, ...(await libraryFiles(prompt.fileIds))];
  const before = o.before ? `${o.before.replace(/\s+$/, '')}${o.before.trim() ? ' ' : ''}` : '';
  const ok = await adapter.fillComposer(before + r.text, files);
  if (!ok) return false;
  void lib('usePrompt', prompt.id);
  if (prompt.autoSend || o.send) {
    // Give uploads a moment to register with the site before sending.
    if (files.length) await new Promise((res) => setTimeout(res, 1500));
    await adapter.submit();
  }
  return true;
}
