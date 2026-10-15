import { test, expect, openSite, accessibleNames, libCall, sendToTab, composerText, simSent } from './fixtures';

test('// inserts a prompt after asking for its variables, without sending', async ({ context, extPage }) => {
  const p = await libCall<{ id: string }>(extPage, 'savePrompt', { name: 'Lorem greet', body: 'Say hello to {{name:World}} in a {{tone|formal|*casual}} tone.' });
  const { page } = await openSite(context, extPage, 'chatgptSim');
  const box = page.locator('#prompt-textarea');
  await box.click();
  await page.keyboard.type('//lor');
  await expect.poll(() => accessibleNames(page, /^Lorem greet$/), { timeout: 10_000 }).not.toHaveLength(0);
  await page.keyboard.press('Enter');
  await expect.poll(() => accessibleNames(page, /^Fill in “Lorem greet”$/), { timeout: 5_000 }).not.toHaveLength(0);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Ipsum');
  await page.keyboard.press('Enter');
  await expect.poll(() => composerText(page), { timeout: 5_000 }).toBe('Say hello to Ipsum in a casual tone.');
  expect(await simSent(page)).toEqual([]);
  await expect.poll(async () => (await libCall<{ uses: number }>(extPage, 'prompt', p.id)).uses).toBe(1);
});

test('.. runs a chain step by step, waiting for each reply', async ({ context, extPage }) => {
  await libCall(extPage, 'saveChain', { name: 'Two steps', steps: [{ name: 'a', text: 'step one', after: 'reply' }, { name: 'b', text: 'step two', after: 'reply' }] });
  const { page } = await openSite(context, extPage, 'chatgptSim');
  await page.locator('#prompt-textarea').click();
  await page.keyboard.type('..two');
  await expect.poll(() => accessibleNames(page, /^Two steps$/), { timeout: 10_000 }).not.toHaveLength(0);
  await page.keyboard.press('Enter');
  await expect.poll(() => simSent(page), { timeout: 20_000 }).toEqual(['step one', 'step two']);
  // The second step went out only after the first reply arrived.
  const order = () => page.evaluate(() => [...document.querySelectorAll('[data-message-author-role]')].map((e) => e.getAttribute('data-message-author-role')));
  await expect.poll(order, { timeout: 5_000 }).toEqual(['user', 'assistant', 'user', 'assistant']);
});

test('the queue sends after the current reply, from the panel and from Ctrl+Shift+Enter', async ({ context, extPage }) => {
  const { page, tabId } = await openSite(context, extPage, 'chatgptSim');
  await page.locator('#prompt-textarea').click();
  await page.keyboard.type('slow first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('queued next');
  await page.keyboard.press('Control+Shift+Enter');
  await sendToTab(extPage, tabId, { type: 'content:queue', texts: ['from panel'] });
  await expect.poll(() => simSent(page), { timeout: 20_000 }).toEqual(['slow first', 'queued next', 'from panel']);
});

test('Up in an empty composer brings back the last prompt', async ({ context, extPage }) => {
  const { page } = await openSite(context, extPage, 'chatgptSim');
  await page.locator('#prompt-textarea').click();
  await page.keyboard.type('hello history');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await libCall<Array<{ text: string }>>(extPage, 'history', 'chatgpt', 5)).map((h) => h.text), { timeout: 5_000 }).toContain('hello history');
  await expect.poll(() => composerText(page)).toBe('');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => composerText(page), { timeout: 5_000 }).toBe('hello history');
});

test('an unsent draft survives a reload', async ({ context, extPage }) => {
  const { page } = await openSite(context, extPage, 'chatgptSim');
  await page.locator('#prompt-textarea').click();
  await page.keyboard.type('unsent draft lorem');
  await expect.poll(async () => (await libCall<{ text: string } | null>(extPage, 'draft', 'chatgpt:68f0a1b2-0000-4000-8000-000000000003'))?.text, { timeout: 5_000 }).toBe('unsent draft lorem');
  await page.reload();
  await expect.poll(() => composerText(page), { timeout: 15_000 }).toBe('unsent draft lorem');
});

test('@@ pulls a stored chat into the composer as context', async ({ context, extPage }) => {
  await openSite(context, extPage, 'chatgptLive');
  await expect.poll(async () => (await libCall<{ rows: Array<{ id: string }> }>(extPage, 'chats', {})).rows.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const { page } = await openSite(context, extPage, 'chatgptSim');
  await page.locator('#prompt-textarea').click();
  await page.keyboard.type('Compare with @@lorem');
  await expect.poll(() => accessibleNames(page, /^Lorem ipsum$/), { timeout: 10_000 }).not.toHaveLength(0);
  await page.keyboard.press('Enter');
  await expect.poll(() => composerText(page), { timeout: 5_000 }).toContain('[Context: "Lorem ipsum" on ChatGPT]');
  expect(await composerText(page)).toMatch(/^Compare with/);
});

test('a prompt runs on selected text', async ({ context, extPage }) => {
  const p = await libCall<{ id: string }>(extPage, 'savePrompt', { name: 'Summarize', body: 'Summarize this:\n{{selection}}' });
  const { page, tabId } = await openSite(context, extPage, 'chatgptSim');
  await sendToTab(extPage, tabId, { type: 'content:insert-prompt', promptId: p.id, selection: 'lorem ipsum dolor' });
  await expect.poll(() => composerText(page), { timeout: 5_000 }).toBe('Summarize this:\nlorem ipsum dolor');
});

test('side panel: add starter prompts and use one in the tab', async ({ context, extPage, extensionId }) => {
  const { page, tabId } = await openSite(context, extPage, 'chatgptSim');
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  await panel.getByRole('tab', { name: 'Prompts' }).first().click();
  await panel.getByRole('button', { name: /^Add \d+ starter prompts$/ }).click();
  await expect(panel.getByText(/^Added \d+ starter prompts\.$/)).toBeVisible();
  await panel.getByRole('searchbox', { name: 'Filter' }).fill('Linux Terminal');
  await panel.locator('li', { has: panel.getByText('Linux Terminal', { exact: true }) }).getByRole('button', { name: 'Use', exact: true }).click();
  await expect.poll(() => composerText(page), { timeout: 10_000 }).toMatch(/^I want you to act as a linux terminal/i);
});

test('dashboard shows the branch map and diffs two replies', async ({ context, extPage, extensionId }) => {
  const { tabId } = await openSite(context, extPage, 'chatgptLive');
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  await expect(panel.getByRole('heading', { name: /^Branches \(\d+ forks\)$/ })).toBeVisible({ timeout: 15_000 });
  const picks = panel.getByRole('checkbox', { name: 'Compare this reply' });
  await picks.nth(0).check();
  await picks.nth(1).check();
  await expect(panel.getByRole('heading', { name: 'Differences between the two replies' })).toBeVisible();
});
