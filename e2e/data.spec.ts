import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { test, expect, openSite, libCall } from './fixtures';
import { sampleConversation } from '../tests/unit/sample';
import type { Page } from '@playwright/test';

const LIVE = 'chatgpt:68f0a1b2-0000-4000-8000-000000000001';

async function stored(extPage: Page) {
  await expect.poll(async () => (await libCall<{ rows: Array<{ id: string }> }>(extPage, 'chats', {})).rows.map((r) => r.id), { timeout: 20_000 }).toContain(LIVE);
}

async function openJob(extPage: Page, extensionId: string, spec: unknown): Promise<Page> {
  await libCall(extPage, 'kvSet', 'job:e2e', spec);
  const page = await extPage.context().newPage();
  await page.goto(`chrome-extension://${extensionId}/tasks.html?job=e2e`);
  return page;
}

type Item = { state: string; filename: string; mime: string; finalUrl: string };

/** Waits for a finished download that `match` accepts, and returns its bytes. Playwright saves downloads under random names. */
async function downloaded(extPage: Page, match: (i: Item) => boolean): Promise<Uint8Array> {
  let file = '';
  await expect
    .poll(async () => {
      const items = (await extPage.evaluate(() => chrome.downloads.search({ state: 'complete' }))) as Item[];
      file = items.find(match)?.filename ?? '';
      return !!file;
    }, { timeout: 20_000 })
    .toBe(true);
  return new Uint8Array(readFileSync(file));
}

const dataText = (i: Item) => (i.finalUrl.startsWith('data:') ? Buffer.from(i.finalUrl.slice(i.finalUrl.indexOf(',') + 1), 'base64').toString('utf8') : '');

test('bulk export writes a ZIP with each chat and a report', async ({ context, extPage, extensionId }) => {
  await openSite(context, extPage, 'chatgptLive');
  await stored(extPage);
  const page = await openJob(extPage, extensionId, { kind: 'export', title: 'E2E export', chatIds: [LIVE], format: 'md', layout: 'sites', includeJson: true, projects: [] });
  await page.getByRole('button', { name: 'Save to Downloads' }).click();
  await expect(page.getByText(/^Exported 1 chats/)).toBeVisible({ timeout: 20_000 });
  const zip = unzipSync(await downloaded(extPage, (i) => i.mime === 'application/zip'));
  const names = Object.keys(zip);
  expect(names).toContain('EXPORT_REPORT.txt');
  expect(names.some((n) => n.startsWith('ChatGPT/') && n.endsWith('.md'))).toBe(true);
  expect(names.some((n) => n.startsWith('ChatGPT/') && n.endsWith('.json'))).toBe(true);
});

test('bulk actions show the list and need typed confirmation above 10', async ({ extPage, extensionId }) => {
  const ids = Array.from({ length: 12 }, (_, i) => `chatgpt:lorem-${i}`);
  const page = await openJob(extPage, extensionId, { kind: 'action', title: 'Archive 12', action: 'archive', chatIds: ids, removeFromLibrary: false });
  await expect(page.locator('.preview-list li')).toHaveCount(12);
  const go = page.getByRole('button', { name: 'Archive 12 chats' });
  await expect(go).toBeDisabled();
  await page.getByLabel('Type “archive 12” to confirm').fill('archive 11');
  await expect(go).toBeDisabled();
  await page.getByLabel('Type “archive 12” to confirm').fill('archive 12');
  await expect(go).toBeEnabled();
});

test('archive runs through the site tab and is logged', async ({ context, extPage, extensionId }) => {
  await openSite(context, extPage, 'chatgptLive');
  await stored(extPage);
  const page = await openJob(extPage, extensionId, { kind: 'action', title: 'Archive 1', action: 'archive', chatIds: [LIVE, 'claude:lorem'], removeFromLibrary: false });
  await page.getByRole('button', { name: 'Archive 2 chats' }).click();
  await expect(page.getByText('Done: 1, failed 0, skipped 1.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('cell', { name: 'not available on this site', exact: false })).toBeVisible();
  expect((await libCall<{ row: { archived: number } }>(extPage, 'chat', LIVE)).row.archived).toBe(1);
});

test('deep import reads a ChatGPT export into the library and a folder', async ({ extPage, extensionId }) => {
  const item = { ...JSON.parse(readFileSync('tests/fixtures/payloads/chatgpt-conversation.json', 'utf8')), conversation_id: '68f0a1b2-0000-4000-8000-0000000000aa' };
  const page = await extPage.context().newPage();
  await page.goto(`chrome-extension://${extensionId}/tasks.html?import`);
  await page.locator('input[type=file]').setInputFiles({ name: 'conversations.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([item])) });
  await expect(page.getByRole('cell', { name: 'ChatGPT' })).toBeVisible();
  await page.getByRole('button', { name: 'Import 1 chats' }).click();
  await expect(page.getByText('Imported 1 chats.')).toBeVisible({ timeout: 10_000 });
  const chat = await libCall<{ row: { id: string } | null; folders: Array<{ name: string }> }>(extPage, 'chat', 'chatgpt:68f0a1b2-0000-4000-8000-0000000000aa');
  expect(chat.row).not.toBeNull();
  expect(chat.folders[0]!.name).toMatch(/^Imported from ChatGPT/);
});

test('back up now writes changed chats to Downloads', async ({ extPage, extensionId }) => {
  await libCall(extPage, 'ingest', sampleConversation(), {});
  const page = await extPage.context().newPage();
  await page.goto(`chrome-extension://${extensionId}/tasks.html?backup`);
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByText('Backed up 1 chats.')).toBeVisible({ timeout: 15_000 });
  const md = new TextDecoder().decode(await downloaded(extPage, (i) => dataText(i).startsWith('---') || dataText(i).startsWith('# ')));
  expect(md).toContain('Lorem ipsum dolor sit amet?');
});

test('the artifact vault previews in the sandbox and lists snippets', async ({ extPage, extensionId }) => {
  await libCall(extPage, 'ingest', sampleConversation(), {});
  const page = await extPage.context().newPage();
  await page.goto(`chrome-extension://${extensionId}/vault.html`);
  await page.getByRole('button', { name: 'Demo page' }).click();
  await expect(page.getByRole('combobox', { name: 'Version' })).toBeVisible();
  const inner = page.frameLocator('iframe.preview-frame').frameLocator('iframe');
  await expect(inner.getByText('v2')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('combobox', { name: 'Version' }).selectOption('0');
  await expect(inner.getByText('v1')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('tab', { name: 'Code snippets' }).click();
  await expect(page.locator('pre.code', { hasText: 'const a' })).toBeVisible();
});
