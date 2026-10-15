// Offscreen document (Chrome, Edge): hosts the tokenizer worker, because a
// service worker cannot start workers of its own, and writes to the clipboard
// for keyboard commands.
import { browser } from 'wxt/browser';
import { WorkerTokenizer } from '../../core/tokenizer/host';

const tokenizer = new WorkerTokenizer(() => new Worker(browser.runtime.getURL('/tokenizer-worker.js')));

browser.runtime.onMessage.addListener((msg: unknown, _s, sendResponse) => {
  const m = msg as { type?: string; texts?: string[]; text?: string };
  if (m?.type === 'offscreen:copy' && typeof m.text === 'string') {
    // Offscreen documents can't use the async Clipboard API without focus; a
    // selected textarea and execCommand is the documented pattern.
    const ta = document.createElement('textarea');
    ta.value = m.text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    sendResponse({ ok });
    return undefined;
  }
  if (m?.type !== 'offscreen:tokenize' || !Array.isArray(m.texts)) return undefined;
  tokenizer.count(m.texts).then((counts) => sendResponse({ counts }), (e: Error) => sendResponse({ error: e.message }));
  return true;
});
