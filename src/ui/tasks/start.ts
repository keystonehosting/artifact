// Opens the Tasks page for a long job.
import { browser } from 'wxt/browser';
import { lib } from '../../core/library/client';
import type { ExportJobSpec } from '../../core/bulk/export-job';
import type { ActionJobSpec } from '../../core/bulk/action-job';

export async function startJob(spec: ExportJobSpec | ActionJobSpec): Promise<void> {
  const id = crypto.randomUUID();
  await lib('kvSet', `job:${id}`, spec);
  await browser.tabs.create({ url: browser.runtime.getURL(`/tasks.html?job=${id}`) });
}

export async function openTasks(mode: 'import' | 'backup' | 'autoarchive'): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL(`/tasks.html?${mode}`) });
}
