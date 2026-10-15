// Cross-AI tab (SPEC §6I): carry the open chat forward to a new chat on any
// site, broadcast one prompt to several sites with a compare view, and the
// last 20 handoffs. Destinations get the text pre-filled; sending
// automatically is opt-in.
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ActiveTab } from './hooks';
import type { Settings } from '../../core/settings/settings';
import type { Conversation } from '../../core/schema/archive';
import { sendToTab } from '../../core/messaging/tabs';
import { handoffRequest, handoffSeed } from '../../core/crossai/carry';
import { localHandoffText, sendHandoff } from '../../core/crossai/handoff';
import { backgroundCount } from '../../core/tokenizer/client';
import { SITES, TIER1_SITES, isTier1, type Tier1SiteId } from '../../core/sites/sites';
import { NumberField, Section, Toggle } from '../components';
import { fmtDate, useLib } from './library';
import { t } from '../../core/i18n/t';

type Upd = (fn: (s: Settings) => void) => void;

function SiteSelect({ value, onChange, label }: { value: Tier1SiteId; onChange(v: Tier1SiteId): void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value as Tier1SiteId)}>
      {TIER1_SITES.map((s) => (
        <option value={s}>{SITES[s].name}</option>
      ))}
    </select>
  );
}

export function CrossAiPanel({ tab, settings, update }: { tab: ActiveTab | null; settings: Settings; update: Upd }) {
  return (
    <div class="content">
      <Handoff tab={tab} settings={settings} update={update} />
      <Broadcast settings={settings} update={update} />
      <RecentHandoffs />
    </div>
  );
}

function Handoff({ tab, settings, update }: { tab: ActiveTab | null; settings: Settings; update: Upd }) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [mode, setMode] = useState<'local' | 'chat'>(settings.handoff.mode === 'chat' ? 'chat' : 'local');
  const [target, setTarget] = useState<Tier1SiteId>(tab?.site && isTier1(tab.site.id) ? tab.site.id : 'chatgpt');
  const [summary, setSummary] = useState('');
  const [tokens, setTokens] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    setConv(null);
    setSummary('');
    if (!tab?.ready?.chatId) return;
    void sendToTab(tab.tabId, { type: 'content:read' }).then((r) => setConv(r.conversation), () => setConv(null));
  }, [tab?.tabId, tab?.ready?.chatId]);

  useEffect(() => {
    if (!summary) return setTokens(null);
    const timer = setTimeout(() => void backgroundCount([summary]).then(([n]) => setTokens(n ?? null), () => setTokens(null)), 400);
    return () => clearTimeout(timer);
  }, [summary]);

  const step = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    setDone('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!tab?.ready?.chatId || !tab.site) {
    return (
      <Section title={t('handoff_title')}>
        <p class="muted">{t('handoff_need_chat')}</p>
      </Section>
    );
  }
  const fromSite = tab.site.id;
  return (
    <Section title={t('handoff_title')}>
      <p class="hint muted">{t('handoff_hint')}</p>
      <div class="row" role="radiogroup" aria-label={t('handoff_mode')}>
        <label class="inline">
          <input type="radio" name="hmode" checked={mode === 'local'} onChange={() => setMode('local')} /> {t('handoff_mode_local')}
        </label>
        <label class="inline">
          <input type="radio" name="hmode" checked={mode === 'chat'} onChange={() => setMode('chat')} /> {t('handoff_mode_chat')}
        </label>
      </div>
      <p class="hint muted">{mode === 'local' ? t('handoff_local_hint') : t('handoff_chat_hint')}</p>
      {mode === 'local' ? (
        <>
          <NumberField label={t('handoff_budget')} value={settings.handoff.budget} min={300} max={50000} step={100} suffix={t('handoff_tokens')} onChange={(v) => update((s) => void (s.handoff.budget = v))} />
          <button disabled={!conv || !!busy} onClick={() => void step(t('handoff_building'), async () => setSummary(await localHandoffText(conv!, settings.handoff.budget)))}>
            {t('handoff_build')}
          </button>
        </>
      ) : (
        <div class="row">
          <button disabled={!!busy} onClick={() => void step(t('handoff_asking'), async () => {
            const r = await sendToTab(tab.tabId, { type: 'content:fill', text: handoffRequest() });
            if (!r.ok) throw new Error(t('composer_not_found'));
            setDone(t('handoff_chat_sent'));
          })}>
            {t('handoff_ask')}
          </button>
          <button disabled={!!busy} onClick={() => void step(t('handoff_reading'), async () => {
            const r = await sendToTab(tab.tabId, { type: 'content:last-reply' });
            if (r.streaming) throw new Error(t('handoff_still_streaming'));
            if (!r.reply) throw new Error(t('handoff_no_reply'));
            setSummary(r.reply);
          })}>
            {t('handoff_use_reply')}
          </button>
        </div>
      )}
      {busy ? <p class="muted" role="status">{busy}</p> : null}
      {summary ? (
        <>
          <label for="h-sum">{t('handoff_summary')}</label>
          <textarea id="h-sum" class="note" rows={12} value={summary} onInput={(e) => setSummary((e.target as HTMLTextAreaElement).value)} />
          <p class="muted mono">{tokens !== null ? t('handoff_token_count', String(tokens)) : ''}</p>
          <div class="row">
            <span>{t('handoff_to')}</span>
            <SiteSelect label={t('handoff_to')} value={target} onChange={setTarget} />
          </div>
          <Toggle label={t('handoff_autosend')} hint={t('handoff_autosend_hint')} checked={settings.handoff.autoSend} onChange={(v) => update((s) => void (s.handoff.autoSend = v))} />
          <div class="row">
            <button class="primary" disabled={!!busy} onClick={() => void step(t('handoff_opening'), async () => {
              await sendHandoff({ conv, fromSite, target, mode, summary, autoSend: settings.handoff.autoSend });
              update((s) => void (s.handoff.mode = mode));
              setDone(t('handoff_opened', SITES[target].name));
            })}>
              {t('handoff_open', SITES[target].name)}
            </button>
            <button onClick={() => void navigator.clipboard.writeText(handoffSeed(summary, { title: conv?.title ?? '', siteName: SITES[fromSite].name }, target !== fromSite))}>{t('compare_copy')}</button>
          </div>
        </>
      ) : null}
      {error ? <p class="status error" role="alert">{error}</p> : <p class="status" role="status">{done}</p>}
    </Section>
  );
}

function Broadcast({ settings, update }: { settings: Settings; update: Upd }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const sites = settings.broadcast.sites;
  return (
    <Section title={t('broadcast_title')}>
      <p class="hint muted">{t('broadcast_hint')}</p>
      <textarea class="note" rows={4} aria-label={t('broadcast_prompt')} placeholder={t('broadcast_prompt')} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <fieldset class="row">
        <legend class="muted">{t('search_sites')}</legend>
        {TIER1_SITES.map((s) => (
          <label class="inline">
            <input type="checkbox" checked={sites.includes(s)} onChange={(e) => update((x) => void (x.broadcast.sites = (e.target as HTMLInputElement).checked ? [...sites, s] : sites.filter((y) => y !== s)))} /> {SITES[s].name}
          </label>
        ))}
      </fieldset>
      <Toggle label={t('broadcast_autosend')} hint={t('broadcast_autosend_hint')} checked={settings.broadcast.autoSend} onChange={(v) => update((s) => void (s.broadcast.autoSend = v))} />
      <button
        class="primary"
        disabled={!text.trim() || !sites.length}
        onClick={() =>
          void browser.runtime.sendMessage({ type: 'bg:broadcast', sites, text, autoSend: settings.broadcast.autoSend }).then(
            (r: { job?: unknown; error?: string }) => setError(r?.error ?? ''),
            (e: Error) => setError(e.message),
          )
        }
      >
        {t('broadcast_go', String(sites.length))}
      </button>
      {error ? <p class="status error" role="alert">{error}</p> : null}
    </Section>
  );
}

function RecentHandoffs() {
  const [rows] = useLib('handoffs', []);
  if (!rows?.length) return null;
  return (
    <Section title={t('handoff_recent')}>
      <ul class="cards">
        {rows.map((h) => (
          <li>
            <div class="row">
              <strong class="grow">{h.fromTitle || t('finished_untitled')}</strong>
              <span class="muted">
                {SITES[h.fromSite]?.name} → {SITES[h.targetSite]?.name} · {t(`handoff_mode_${h.mode}`)}
              </span>
              <span class="muted when">{fmtDate(h.at)}</span>
            </div>
            <div class="row">
              <button onClick={() => void browser.runtime.sendMessage({ type: 'bg:open-with-fill', site: h.targetSite, text: h.text, autoSend: false })}>{t('handoff_reopen')}</button>
              <button onClick={() => void navigator.clipboard.writeText(h.text)}>{t('compare_copy')}</button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
