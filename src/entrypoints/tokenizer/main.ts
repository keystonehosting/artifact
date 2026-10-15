// Offscreen document (Chrome, Edge): hosts the tokenizer worker, because a
// service worker cannot start workers of its own.
import { browser } from 'wxt/browser';
import { WorkerTokenizer } from '../../core/tokenizer/host';

const tokenizer = new WorkerTokenizer(() => new Worker(browser.runtime.getURL('/tokenizer-worker.js')));

browser.runtime.onMessage.addListener((msg: unknown, _s, sendResponse) => {
  const m = msg as { type?: string; texts?: string[] };
  if (m?.type !== 'offscreen:tokenize' || !Array.isArray(m.texts)) return undefined;
  tokenizer.count(m.texts).then((counts) => sendResponse({ counts }), (e: Error) => sendResponse({ error: e.message }));
  return true;
});
