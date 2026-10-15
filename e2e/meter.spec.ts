import { test, expect, openSite, accessibleNames } from './fixtures';

test('meter pill appears above the composer with an o200k count', async ({ context, extPage }) => {
  const { page } = await openSite(context, extPage, 'chatgptLive');
  await expect(page.locator('artifact-meter')).toHaveCount(1, { timeout: 15_000 });
  // The pill sits in normal flow directly before the composer form.
  const next = await page.evaluate(() => document.querySelector('artifact-meter')?.nextElementSibling?.tagName);
  expect(next).toBe('FORM');
  await expect.poll(() => accessibleNames(page, /^Context meter:/), { timeout: 15_000 }).toHaveLength(1);
  const [label] = await accessibleNames(page, /^Context meter:/);
  // No plan is detectable on fixtures, so the limit shows as unknown, never guessed.
  expect(label).toMatch(/^Context meter: \d+(\.\d+k)? \/ unknown$/);
});

test('draft tokens update while typing', async ({ context, extPage }) => {
  const { page } = await openSite(context, extPage, 'chatgptLive');
  await expect.poll(() => accessibleNames(page, /^Context meter:/), { timeout: 15_000 }).toHaveLength(1);
  const before = (await accessibleNames(page, /^Context meter:/))[0]!;
  await page.locator('#prompt-textarea').click();
  await page.keyboard.type('Lorem ipsum dolor sit amet consectetur adipiscing elit');
  await expect.poll(async () => (await accessibleNames(page, /^Context meter:/))[0], { timeout: 10_000 }).not.toBe(before);
});
