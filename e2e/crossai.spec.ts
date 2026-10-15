import { test, expect, openSite, composerText, simSent, extensionOpened } from './fixtures';

test('handoff opens the destination with the text waiting, not sent', async ({ context, extPage }) => {
  await openSite(context, extPage, 'chatgptSim');
  const claude = (await extensionOpened(context, ['https://claude.ai/new'], () =>
    extPage.evaluate(() => chrome.runtime.sendMessage({ type: 'bg:open-with-fill', site: 'claude', text: 'Carried over lorem', autoSend: false })),
  ))[0]!;
  await expect.poll(() => composerText(claude), { timeout: 20_000 }).toBe('Carried over lorem');
  expect(await simSent(claude)).toEqual([]);
});

test('side panel builds a local handoff and opens it on another site', async ({ context, extPage, extensionId }) => {
  const { page, tabId } = await openSite(context, extPage, 'chatgptSim');
  await page.locator('#prompt-textarea').click();
  await page.keyboard.type('Plan a lorem trip. Never book hostels.');
  await page.keyboard.press('Enter');
  await expect.poll(() => simSent(page)).toHaveLength(1);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  await panel.getByRole('tab', { name: 'Cross-AI' }).click();
  await panel.getByRole('button', { name: 'Build summary' }).click();
  const summary = panel.getByRole('textbox', { name: 'Summary (edit freely)' });
  await expect(summary).toHaveValue(/## Goal\nPlan a lorem trip/, { timeout: 10_000 });
  await expect(summary).toHaveValue(/- Never book hostels\./);
  await panel.getByRole('combobox', { name: 'To' }).selectOption('claude');
  const claude = (await extensionOpened(context, ['https://claude.ai/new'], () => panel.getByRole('button', { name: 'Open in Claude' }).click()))[0]!;
  await expect.poll(() => composerText(claude), { timeout: 20_000 }).toContain('started on ChatGPT');
  await expect(panel.getByText('Recent handoffs')).toBeVisible();
});

test('broadcast sends to two sites and the compare page shows both replies', async ({ context, extPage }) => {
  const compare = context.waitForEvent('page', (p) => p.url().includes('/compare.html'));
  await extensionOpened(context, ['https://chatgpt.com/', 'https://claude.ai/new'], () =>
    extPage.evaluate(() => chrome.runtime.sendMessage({ type: 'bg:broadcast', sites: ['chatgpt', 'claude'], text: 'broadcast lorem', autoSend: true })),
  );
  const page = await compare;
  await expect(page.getByText('Reply to: broadcast lorem')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'ChatGPT' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Claude' })).toBeVisible();
});
