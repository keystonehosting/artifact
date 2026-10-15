import { unzipSync, strFromU8 } from 'fflate';
import { test, expect, openSite, sendToTab, SITE_FIXTURES } from './fixtures';

type Conv = { source: { method: string }; attachments: Array<{ id: string; name: string }>; artifacts: Array<{ title: string }> };

test('reads the page’s own conversation request (intercept) with files and canvases', async ({ context, extPage }) => {
  const { tabId } = await openSite(context, extPage, 'chatgptLive');
  await expect
    .poll(async () => (await sendToTab<{ conversation: Conv | null }>(extPage, tabId, { type: 'content:read' })).conversation?.source.method)
    .toBe('intercept');
  const res = await sendToTab<{ conversation: Conv }>(extPage, tabId, { type: 'content:read' });
  expect(res.conversation.attachments.map((a) => a.name)).toEqual(['file-AAA.png', 'notes.pdf']);
  expect(res.conversation.artifacts.map((a) => a.title)).toEqual(['Lorem doc']);
});

test('exports a ZIP containing the real uploaded file and the canvas', async ({ context, extPage, extensionId }) => {
  const { tabId } = await openSite(context, extPage, 'chatgptLive');
  await expect
    .poll(async () => (await sendToTab<{ conversation: Conv | null }>(extPage, tabId, { type: 'content:read' })).conversation?.source.method)
    .toBe('intercept');

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  // Capture the saved file instead of writing to disk.
  await panel.evaluate(() => {
    (window as unknown as { __saved: Array<{ url: string; filename: string }> }).__saved = [];
    chrome.downloads.download = ((o: { url: string; filename: string }) => {
      (window as unknown as { __saved: Array<{ url: string; filename: string }> }).__saved.push(o);
      return Promise.resolve(1);
    }) as typeof chrome.downloads.download;
  });
  await panel.getByRole('tab', { name: 'Export' }).click();
  await panel.getByLabel('Format').selectOption('md');
  await panel.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('.zip');

  const zipBytes = await panel.evaluate(async () => {
    const saved = (window as unknown as { __saved: Array<{ url: string }> }).__saved;
    const buf = await (await fetch(saved[0]!.url)).arrayBuffer();
    return Array.from(new Uint8Array(buf));
  });
  const files = unzipSync(new Uint8Array(zipBytes));
  const names = Object.keys(files);
  const pdf = names.find((n) => n.endsWith('files/notes.pdf'));
  expect(pdf, names.join('\n')).toBeTruthy();
  expect(strFromU8(files[pdf!]!)).toContain('%PDF-1.4 lorem ipsum');
  const canvas = names.find((n) => n.endsWith('artifacts/Lorem doc.md'));
  expect(canvas).toBeTruthy();
  expect(strFromU8(files[canvas!]!)).toBe('Hello canvas');
  const md = names.find((n) => /\/[^/]+\.md$/.test(n) && !n.includes('/artifacts/'))!;
  expect(strFromU8(files[md]!)).toContain('(files/notes.pdf)');
  const png = names.find((n) => n.endsWith('files/photo.png'));
  expect(png).toBeTruthy();
  expect(files[png!]!.slice(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]));
  expect(strFromU8(files[md]!)).toContain('![image](files/photo.png)');
  expect(names.some((n) => n.endsWith('MISSING_FILES.txt'))).toBe(false);
  expect(SITE_FIXTURES.chatgptLive).toBeDefined();
});
