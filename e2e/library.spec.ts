import { test, expect, openSite, accessibleNames, libCall, sendToTab } from './fixtures';

const CHAT = 'chatgpt:68f0a1b2-0000-4000-8000-000000000001';

async function stored(extPage: Parameters<typeof libCall>[0]) {
  await expect.poll(async () => (await libCall<{ rows: Array<{ id: string }> }>(extPage, 'chats', {})).rows.map((r) => r.id), { timeout: 20_000 }).toContain(CHAT);
}

test('an opened chat is stored and searchable across branches', async ({ context, extPage }) => {
  await openSite(context, extPage, 'chatgptLive');
  await stored(extPage);
  // "Veniam" is only on a branch that isn't shown on the page.
  const res = await libCall<{ total: number; chats: Array<{ chatId: string; title: string }> }>(extPage, 'search', { text: 'veniam' });
  expect(res.chats.map((c) => c.chatId)).toEqual([CHAT]);
  const info = await libCall<{ row: { title: string; messageCount: number } }>(extPage, 'chat', CHAT);
  expect(info.row.title).toBe('Lorem ipsum');
});

test('folders show in the site sidebar and file chats', async ({ context, extPage }) => {
  const folder = await libCall<{ id: string }>(extPage, 'createFolder', 'Lorem folder', null);
  const { page } = await openSite(context, extPage, 'chatgptLive');
  await stored(extPage);
  await libCall(extPage, 'addToFolder', folder.id, [CHAT]);
  await expect(page.locator('nav artifact-folders')).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(() => accessibleNames(page, /^Lorem folder/), { timeout: 10_000 }).not.toHaveLength(0);
  const tree = await libCall<Array<{ name: string; total: number }>>(extPage, 'folderTree', 'manual');
  expect(tree).toEqual([expect.objectContaining({ name: 'Lorem folder', total: 1 })]);
});

test('bookmark and label from the message margin', async ({ context, extPage }) => {
  const { page } = await openSite(context, extPage, 'chatgptLive');
  await stored(extPage);
  const msg = page.locator('[data-message-id="a1c"]');
  const box = (await msg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => accessibleNames(page, /^Bookmark message$/), { timeout: 10_000 }).toHaveLength(1);
  // Toolbar geometry: 26px buttons in a column left of the message (see message-tools.ts).
  const left = box.x > 44 ? box.x - 36 : box.x + 4;
  const top = Math.max(4, box.y + 4);
  await page.mouse.click(left + 13, top + 13);
  await expect.poll(() => accessibleNames(page, /^Yellow$/), { timeout: 5_000 }).toHaveLength(1);
  await page.mouse.click(Math.max(4, left) + 4 + 1 + 9, top + 26 + 2 + 26 + 2 + 4 + 9);
  await expect.poll(async () => (await libCall<Array<{ messageId: string; color: string }>>(extPage, 'bookmarks', CHAT)).map((b) => `${b.messageId}:${b.color}`), { timeout: 5_000 }).toEqual(['a1c:yellow']);
  await libCall(extPage, 'addLabel', { chatId: CHAT, messageId: 'a1c', color: 'red', text: '' });
  const labels = await libCall<unknown[]>(extPage, 'labels', CHAT);
  expect(labels).toHaveLength(1);
});

test('highlight selected text and redraw it', async ({ context, extPage }) => {
  const { page } = await openSite(context, extPage, 'chatgptLive');
  await stored(extPage);
  const target = page.locator('[data-message-id="a1c"] p');
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => accessibleNames(page, /^Highlight in /), { timeout: 5_000 }).toHaveLength(5);
  const sel = await page.evaluate(() => {
    const r = document.getSelection()!.getRangeAt(0).getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
  // Popover: 4px padding, 14px icon, 4px gap, then 18px swatches 4px apart.
  await page.mouse.click(Math.max(4, sel.x) + 4 + 14 + 4 + 9, Math.max(4, sel.y - 36) + 4 + 9);
  await expect.poll(async () => (await libCall<Array<{ quote: string; color: string }>>(extPage, 'highlights', CHAT)).map((h) => h.color), { timeout: 5_000 }).toEqual(['yellow']);
  const hl = await libCall<Array<{ quote: string }>>(extPage, 'highlights', CHAT);
  expect(hl[0]!.quote).toContain('eiusmod');
  await expect.poll(() => page.evaluate(() => (CSS as unknown as { highlights: Map<string, unknown> }).highlights.has('artifact-yellow')), { timeout: 5_000 }).toBe(true);
});

test('find in chat steps through matches and blur toggles', async ({ context, extPage }) => {
  const { page, tabId } = await openSite(context, extPage, 'chatgptLive');
  await stored(extPage);
  await page.locator('[data-message-id="u1"] div').click();
  await page.keyboard.press('Control+Shift+F');
  await expect.poll(() => accessibleNames(page, /^Find in chat$/), { timeout: 5_000 }).not.toHaveLength(0);
  await page.keyboard.type('o');
  await expect.poll(() => accessibleNames(page, /^1 of \d+$/), { timeout: 5_000 }).not.toHaveLength(0);
  await page.keyboard.press('Enter');
  await expect.poll(() => accessibleNames(page, /^2 of \d+$/), { timeout: 5_000 }).not.toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect.poll(() => accessibleNames(page, /^Find in chat$/)).toHaveLength(0);

  await page.keyboard.press('Alt+Shift+B');
  await expect(page.locator('[data-message-id="a1c"]')).toHaveAttribute('data-artifact-blur', '');
  await expect(page.locator('nav[aria-label="Chat history"]')).toHaveAttribute('data-artifact-blur', '');
  // Artifact's own meter is never blurred.
  await expect(page.locator('artifact-meter')).not.toHaveAttribute('data-artifact-blur');
  const r = await sendToTab<{ on: boolean }>(extPage, tabId, { type: 'content:blur' });
  expect(r.on).toBe(false);
  await expect(page.locator('[data-artifact-blur]')).toHaveCount(0);
});

test('side panel: create a folder, search, and see the library', async ({ context, extPage, extensionId }) => {
  const { tabId } = await openSite(context, extPage, 'chatgptLive');
  await stored(extPage);
  await libCall(extPage, 'addBookmark', { chatId: CHAT, messageId: 'a1c', site: 'chatgpt', color: 'green', note: '', snippet: 'Sed do eiusmod' });
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);

  await panel.getByRole('tab', { name: 'Folders' }).click();
  await panel.getByRole('button', { name: 'New folder' }).click();
  await panel.getByRole('textbox', { name: 'Folder name' }).fill('Panel folder');
  await panel.keyboard.press('Enter');
  await expect(panel.getByRole('treeitem', { name: /Panel folder/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Lorem ipsum' })).toBeVisible();

  await panel.getByRole('tab', { name: 'Search' }).click();
  await panel.getByRole('searchbox', { name: 'Search every chat' }).fill('excepteur');
  await expect(panel.getByText('Results (1 chats)')).toBeVisible();
  await expect(panel.locator('mark', { hasText: /excepteur/i })).toBeVisible();

  await panel.getByRole('tab', { name: 'Library' }).click();
  await expect(panel.getByText('Bookmarks (1)')).toBeVisible();
  await expect(panel.getByText('Sed do eiusmod')).toBeVisible();
});
