// Picks up text another Artifact feature left for this tab (a handoff, a
// broadcast, a right-click prompt) and puts it in the composer once the
// composer exists. Sends only when that feature was set to send.
import { browser } from 'wxt/browser';
import type { SiteAdapter } from '../../adapters/types';
import type { PendingFill } from '../../core/crossai/hub';
import { lib } from '../../core/library/client';
import { t } from '../../core/i18n/t';
import { applyPrompt } from './insert';
import { toast } from './toast';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function consumePendingFill(adapter: SiteAdapter): Promise<void> {
  const res = (await browser.runtime.sendMessage({ type: 'bg:take-fill' }).catch(() => null)) as { fill: PendingFill | null } | null;
  const fill = res?.fill;
  if (!fill) return;
  // Sites render the composer a moment after load; keep trying for 15 s.
  for (let i = 0; i < 60 && !adapter.getComposerElement(); i++) await sleep(250);
  if (fill.promptId) {
    const prompt = await lib('prompt', fill.promptId);
    if (!prompt) return toast(t('prompt_missing'));
    await applyPrompt(adapter, prompt, { selection: fill.selection, send: fill.autoSend });
    return;
  }
  const text = fill.text ?? '';
  for (let i = 0; i < 20; i++) {
    if (await adapter.fillComposer(text)) {
      if (fill.autoSend) {
        await sleep(300);
        await adapter.submit();
      }
      return;
    }
    await sleep(400);
  }
  // Last resort: the text stays available to paste.
  toast(t('fill_failed'), [{ label: t('fill_copy'), run: () => void navigator.clipboard.writeText(text) }]);
}
