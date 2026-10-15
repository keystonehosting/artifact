import { test, expect, openSite, accessibleNames, patchSettings, simSent } from './fixtures';

test('wide mode lifts the chat column width and turns off cleanly', async ({ context, extPage }) => {
  await patchSettings(extPage, { experience: { wide: true, wideWidth: 100 } });
  const { page } = await openSite(context, extPage, 'chatgptSim');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('main')!).maxWidth), { timeout: 10_000 }).toBe('100%');
  await patchSettings(extPage, { experience: { wide: false } });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('main')!).maxWidth), { timeout: 10_000 }).toBe('640px');
});

test('timeline marks each message and collapse-all folds them', async ({ context, extPage }) => {
  const { page } = await openSite(context, extPage, 'chatgptLive');
  await expect.poll(() => accessibleNames(page, /^Message \d+:/), { timeout: 15_000 }).toHaveLength(2);
  await page.locator('[data-message-id="u1"] div').click();
  await page.keyboard.press('Alt+Shift+E');
  await expect(page.locator('[data-artifact-collapsed]')).toHaveCount(2);
  await page.keyboard.press('Alt+Shift+E');
  await expect(page.locator('[data-artifact-collapsed]')).toHaveCount(0);
});

test('auto-continue presses Continue once when a reply is cut off', async ({ context, extPage }) => {
  await patchSettings(extPage, { experience: { autoContinue: true, autoContinueMax: 2 } });
  const { page } = await openSite(context, extPage, 'chatgptSim');
  await page.locator('#prompt-textarea').click();
  await page.keyboard.type('please truncate');
  await page.keyboard.press('Enter');
  await expect.poll(() => simSent(page)).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { simContinued?: number }).simContinued ?? 0), { timeout: 10_000 }).toBe(1);
});

test('speed mode marks older messages for lazy rendering', async ({ context, extPage }) => {
  await patchSettings(extPage, { experience: { speed: true } });
  const { page } = await openSite(context, extPage, 'chatgptSim');
  const box = page.locator('#prompt-textarea');
  for (let i = 0; i < 4; i++) {
    await box.click();
    await page.keyboard.type(`turn ${i}`);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('[data-message-author-role="assistant"]').count(), { timeout: 5_000 }).toBe(i + 1);
  }
  // 8 messages, the newest 6 stay live.
  await expect.poll(() => page.locator('[data-artifact-speed]').count(), { timeout: 5_000 }).toBe(2);
});
