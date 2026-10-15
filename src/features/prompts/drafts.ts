// Draft autosave and session keep-alive (SPEC §6E). The composer text is
// saved per chat as the user types and restored into an empty composer when
// the chat opens again. Going offline, or the site refusing the session,
// shows a notice; the draft is already safe, so a reload loses nothing.
import type { SiteAdapter } from '../../adapters/types';
import { lib } from '../../core/library/client';
import { HookBridge } from '../../core/intercept/bridge';
import { t } from '../../core/i18n/t';
import { toast } from './toast';

const MAX_AGE = 14 * 86_400_000;

export function startDrafts(adapter: SiteAdapter, opts: { keepAlive: boolean }): () => void {
  const key = () => `${adapter.id}:${adapter.detectConversation() ?? 'new'}`;
  let timer: number | undefined;
  let lastSaved = '';
  let restoring = false;

  const save = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const text = adapter.getDraftText();
      if (text === lastSaved) return;
      lastSaved = text;
      void lib('setDraft', key(), text);
    }, 800);
  };

  const restore = async () => {
    if (restoring) return;
    restoring = true;
    try {
      const k = key();
      const d = await lib('draft', k);
      if (!d || Date.now() - d.updatedAt > MAX_AGE) return;
      // Wait for the composer, but never overwrite something the user (or the site) put there.
      for (let i = 0; i < 40 && !adapter.getComposerElement(); i++) await new Promise((r) => setTimeout(r, 250));
      if (k !== key() || adapter.getDraftText().trim()) return;
      if (await adapter.fillComposer(d.text)) {
        lastSaved = d.text;
        toast(t('draft_restored'), [{ label: t('draft_discard'), run: () => void adapter.fillComposer('').then(() => lib('setDraft', k, '')) }]);
      }
    } finally {
      restoring = false;
    }
  };

  const onInput = (e: Event) => {
    const el = adapter.getComposerElement();
    if (el && e.target instanceof Node && el.contains(e.target)) save();
  };
  document.addEventListener('input', onInput, true);
  const offSend = adapter.onSend(() => {
    window.clearTimeout(timer);
    lastSaved = '';
    void lib('setDraft', key(), '');
  });
  const offChange = adapter.onConversationChange(() => void restore());
  void restore();

  const offs: Array<() => void> = [];
  if (opts.keepAlive) {
    const offline = () => toast(t('keepalive_offline'));
    const online = () => {
      toast(t('keepalive_online'));
      void restore();
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    const bridge = new HookBridge(window);
    let warned = 0;
    const offBridge = bridge.subscribe((c) => {
      if (c.kind !== 'session.expired' || Date.now() - warned < 60_000) return;
      warned = Date.now();
      // Save right now, not after the debounce, before offering the reload.
      void lib('setDraft', key(), adapter.getDraftText()).then(() =>
        toast(t('keepalive_session'), [{ label: t('keepalive_reload'), run: () => location.reload() }]),
      );
    });
    offs.push(() => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      offBridge();
      bridge.dispose();
    });
  }

  return () => {
    window.clearTimeout(timer);
    document.removeEventListener('input', onInput, true);
    offSend();
    offChange();
    for (const off of offs) off();
  };
}
