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

export const SITE_FIXTURES: Record<string, { url: string; file: string; keepScripts?: boolean }> = {
  chatgpt: { url: 'https://chatgpt.com/c/68f0a1b2-0000-4000-8000-000000000002', file: 'sites/chatgpt-chat.html' },
  claude: { url: 'https://claude.ai/chat/11111111-1111-4111-8111-111111111111', file: 'sites/claude-chat.html' },
  gemini: { url: 'https://gemini.google.com/app/e87b6c6ac16404a5', file: 'sites/gemini-chat.html' },
  grok: { url: 'https://grok.com/c/22222222-2222-4222-8222-222222222222', file: 'sites/grok-chat.html' },
  aistudio: { url: 'https://aistudio.google.com/prompts/1AbCdEfGhIjK', file: 'synthetic/aistudio-chat.html' },
  chatgptLive: { url: 'https://chatgpt.com/c/68f0a1b2-0000-4000-8000-000000000001?live=1', file: 'synthetic/chatgpt-live.html', keepScripts: true },
};

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Fake site API responses served at real URLs (never the network). */
export const API_FIXTURES: Array<{ match: RegExp; contentType: string; body: () => string | Buffer }> = [
  { match: /^https:\/\/chatgpt\.com\/backend-api\/conversation\/68f0a1b2-0000-4000-8000-000000000001$/, contentType: 'application/json', body: () => readFileSync(join(FIXTURES, 'payloads/chatgpt-conversation.json'), 'utf8') },
  { match: /^https:\/\/chatgpt\.com\/api\/auth\/session/, contentType: 'application/json', body: () => JSON.stringify({ accessToken: 'test-token-for-e2e-only' }) },
  { match: /^https:\/\/chatgpt\.com\/backend-api\/files\/file-BBB\/download$/, contentType: 'application/json', body: () => JSON.stringify({ download_url: 'https://files.oaiusercontent.com/file-xyz?sig=1', file_name: 'notes.pdf' }) },
  { match: /^https:\/\/chatgpt\.com\/backend-api\/files\/file-AAA\/download$/, contentType: 'application/json', body: () => JSON.stringify({ download_url: 'https://files.oaiusercontent.com/file-img?sig=1', file_name: 'photo.png' }) },
  { match: /^https:\/\/files\.oaiusercontent\.com\/file-xyz/, contentType: 'application/pdf', body: () => Buffer.from('%PDF-1.4 lorem ipsum test file\n%%EOF\n') },
  { match: /^https:\/\/files\.oaiusercontent\.com\/file-img/, contentType: 'image/png', body: () => Buffer.from(PNG_1X1, 'base64') },
];

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
        const raw = readFileSync(join(FIXTURES, hit.file), 'utf8');
        const html = hit.keepScripts ? raw : raw.replace(/<script\b[\s\S]*?<\/script>/gi, '');
        return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      }
      const api = API_FIXTURES.find((a) => a.match.test(url));
      if (api) return route.fulfill({ status: 200, contentType: api.contentType, body: api.body() });
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

/** Accessible names inside Artifact's closed shadow roots (Playwright locators can't enter them). */
export async function accessibleNames(page: Page, pattern: RegExp): Promise<string[]> {
  const snap = await page.accessibility.snapshot({ interestingOnly: false });
  const out: string[] = [];
  const walk = (n: { name?: string; children?: unknown[] } | null | undefined) => {
    if (!n) return;
    if (n.name && pattern.test(n.name)) out.push(n.name);
    for (const c of n.children ?? []) walk(c as typeof n);
  };
  walk(snap as { name?: string; children?: unknown[] } | null);
  return out;
}

/** Calls the background library API from an extension page. */
export async function libCall<T>(extPage: Page, fn: string, ...args: unknown[]): Promise<T> {
  return extPage.evaluate(
    async ({ fn, args }) => {
      const r = (await chrome.runtime.sendMessage({ type: 'lib:call', fn, args })) as { ok: boolean; value?: unknown; error?: string };
      if (!r.ok) throw new Error(r.error);
      return r.value;
    },
    { fn, args },
  ) as Promise<T>;
}
