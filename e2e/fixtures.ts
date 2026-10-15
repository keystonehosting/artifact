// Loads the built Chrome extension into Chromium and serves local fixture
// pages at the real site URLs, so content scripts inject as they would live.
// Every other request is aborted: e2e never touches the network.
import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const EXT = join(HERE, '..', '.output', 'chrome-mv3');
const FIXTURES = join(HERE, '..', 'tests', 'fixtures');

export const SITE_FIXTURES: Record<string, { url: string; file: string }> = {
  chatgpt: { url: 'https://chatgpt.com/c/68f0a1b2-0000-4000-8000-000000000001', file: 'sites/chatgpt-chat.html' },
  claude: { url: 'https://claude.ai/chat/11111111-1111-4111-8111-111111111111', file: 'sites/claude-chat.html' },
  gemini: { url: 'https://gemini.google.com/app/e87b6c6ac16404a5', file: 'sites/gemini-chat.html' },
  grok: { url: 'https://grok.com/c/22222222-2222-4222-8222-222222222222', file: 'sites/grok-chat.html' },
  aistudio: { url: 'https://aistudio.google.com/prompts/1AbCdEfGhIjK', file: 'synthetic/aistudio-chat.html' },
};

type Fixtures = { context: BrowserContext; extensionId: string; worker: Worker; extPage: Page };

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('chrome-extension://')) return route.continue();
      const hit = Object.values(SITE_FIXTURES).find((f) => url.split('#')[0] === f.url);
      if (hit && route.request().resourceType() === 'document') {
        const html = readFileSync(join(FIXTURES, hit.file), 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');
        return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      }
      return route.abort();
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  extPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await use(page);
  },
});

export const expect = test.expect;

/** Opens a fixture site page and returns its tab id as seen by the extension. */
export async function openSite(context: BrowserContext, extPage: Page, site: keyof typeof SITE_FIXTURES): Promise<{ page: Page; tabId: number }> {
  const page = await context.newPage();
  const { url } = SITE_FIXTURES[site]!;
  await page.goto(url);
  const tabId = await extPage.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({ url: u });
    return tabs[0]!.id!;
  }, url);
  return { page, tabId };
}

/** Sends a content-script message from the extension page, retrying until the script is ready. */
export async function sendToTab<T>(extPage: Page, tabId: number, msg: unknown): Promise<T> {
  return extPage.evaluate(
    async ({ tabId, msg }) => {
      for (let i = 0; i < 50; i++) {
        try {
          return await chrome.tabs.sendMessage(tabId, msg);
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      throw new Error('content script did not answer');
    },
    { tabId, msg },
  ) as Promise<T>;
}
