// Prompt history (SPEC §6D): every prompt sent on this site is remembered,
// and Up / Down in an empty composer (or one showing a history entry) cycle
// through them, newest first. Down past the newest restores the draft.
import type { SiteAdapter } from '../../adapters/types';
import { lib } from '../../core/library/client';

export function startHistory(adapter: SiteAdapter): () => void {
  let items: string[] | null = null;
  let index = -1;
  let shown = '';
  let draft = '';

  const offSend = adapter.onSend((text) => {
    void lib('addHistory', adapter.id, text);
    items = null;
    index = -1;
  });

  const show = async (i: number) => {
    index = i;
    shown = i < 0 ? draft : items![i]!;
    await adapter.fillComposer(shown);
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const el = adapter.getComposerElement();
    if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
    const now = adapter.getDraftText().trim();
    const browsing = index >= 0 && now === shown.trim();
    if (!browsing && (now || e.key === 'ArrowDown')) return;
    if (!browsing) {
      draft = '';
      index = -1;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    void (async () => {
      items ??= (await lib('history', adapter.id, 100)).map((h) => h.text);
      if (!items.length) return;
      if (e.key === 'ArrowUp') await show(Math.min(items.length - 1, index + 1));
      else if (index >= 0) await show(index - 1);
    })();
  };
  window.addEventListener('keydown', onKey, true);
  return () => {
    offSend();
    window.removeEventListener('keydown', onKey, true);
  };
}
