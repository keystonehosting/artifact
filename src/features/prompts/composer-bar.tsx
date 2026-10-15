// A thin bar in normal flow just above the composer (above the meter), so it
// never covers the site's controls: prompts, chains, enhance, profile, text
// direction, a draft counter, and the progress of a running chain or queue.
import { useEffect, useState } from 'preact/hooks';
import type { SiteAdapter } from '../../adapters/types';
import type { Settings } from '../../core/settings/settings';
import { mountShadow, watchTheme, type ShadowMount } from '../../ui/shadow';
import { Icon } from '../../ui/icons';
import { t } from '../../core/i18n/t';
import type { Runner, RunState } from './runner';
import type { Triggers } from './triggers';
import type { Enhancer } from './enhancer';
import { toast } from './toast';

/** The profile block a new chat starts with (SPEC §6D universal profile). */
export function profileText(p: Settings['profile']): string {
  const parts: string[] = [];
  if (p.about.trim()) parts.push(`About me:\n${p.about.trim()}`);
  if (p.instructions.trim()) parts.push(`How I'd like you to respond:\n${p.instructions.trim()}`);
  return parts.join('\n\n');
}

export function countText(s: string): { chars: number; words: number } {
  const trimmed = s.trim();
  return { chars: trimmed.length, words: trimmed ? trimmed.split(/\s+/).length : 0 };
}

interface BarProps {
  adapter: SiteAdapter;
  runner: Runner;
  triggers: Triggers | null;
  enhancer: Enhancer | null;
  settings: () => Settings;
  rtl: { on: boolean; toggle(): void };
}

function RunStatus({ s, runner }: { s: RunState; runner: Runner }) {
  const step = t('run_step', [String(s.index + 1), String(s.total)]);
  const what = s.queue ? t('run_queue') : s.name;
  const phase = {
    sending: t('run_sending'),
    waiting: t('run_waiting'),
    paused: t('run_paused'),
    confirm: t('run_confirm'),
    timeout: t('run_timeout'),
    failed: t('run_failed'),
    done: t('run_done'),
    stopped: t('run_stopped'),
  }[s.phase];
  const live = !['done', 'stopped', 'timeout', 'failed'].includes(s.phase);
  return (
    <div class={`run ${s.phase}`} role="status" aria-live="polite">
      <span class="run-name">{what}</span>
      <span class="mono">{step}</span>
      {s.stepName ? <span class="muted">{s.stepName}</span> : null}
      <span class="muted">{phase}</span>
      {s.phase === 'confirm' || s.phase === 'paused' ? <button onClick={() => runner.resume()}>{t('run_continue')}</button> : null}
      {live && s.phase !== 'paused' && s.phase !== 'confirm' ? <button onClick={() => runner.pause()}>{t('run_pause')}</button> : null}
      {s.phase === 'timeout' || s.phase === 'failed' ? <button onClick={() => runner.retry()}>{t('run_retry')}</button> : null}
      {live ? <button onClick={() => runner.stop()}>{t('run_stop')}</button> : <button onClick={() => runner.dismiss()}>{t('common_close')}</button>}
    </div>
  );
}

function Bar(p: BarProps) {
  const [run, setRun] = useState<RunState | null>(p.runner.current);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(false);
  const [isNew, setIsNew] = useState(!p.adapter.detectConversation());
  useEffect(() => {
    const offRun = p.runner.subscribe(setRun);
    const onInput = () => setDraft(p.adapter.getDraftText());
    document.addEventListener('input', onInput, true);
    const offNav = p.adapter.onConversationChange((id) => setIsNew(!id));
    const timer = setInterval(onInput, 1500);
    return () => {
      offRun();
      offNav();
      clearInterval(timer);
      document.removeEventListener('input', onInput, true);
    };
  }, []);
  const s = p.settings();
  const profile = profileText(s.profile);
  const c = countText(draft);
  return (
    <div class="cbar">
      {p.triggers ? (
        <>
          <button class="tool" title={t('bar_prompts')} aria-label={t('bar_prompts')} onClick={() => p.triggers!.openList('prompt')}>
            <Icon name="note" />
          </button>
          <button class="tool" title={t('bar_chains')} aria-label={t('bar_chains')} onClick={() => p.triggers!.openList('chain')}>
            <Icon name="chain" />
          </button>
        </>
      ) : null}
      {p.enhancer ? (
        <span class="menu-wrap">
          <button class="tool" title={t('bar_enhance')} aria-label={t('bar_enhance')} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Icon name="sparkle" />
          </button>
          {menu ? (
            <ul class="menu" role="menu">
              {s.enhancer.presets.map((pr) => (
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      void p.enhancer!.begin(pr.text);
                    }}
                  >
                    {pr.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </span>
      ) : null}
      {isNew && profile ? (
        <button
          class="tool"
          title={t('bar_profile')}
          aria-label={t('bar_profile')}
          onClick={() => {
            const cur = p.adapter.getDraftText().trim();
            void p.adapter.fillComposer(cur ? `${profile}\n\n${cur}` : `${profile}\n\n`).then((ok) => !ok && toast(t('composer_not_found')));
          }}
        >
          <Icon name="person" />
        </button>
      ) : null}
      {s.experience.rtl ? (
        <button class="tool" aria-pressed={p.rtl.on} title={t('bar_rtl')} aria-label={t('bar_rtl')} onClick={() => p.rtl.toggle()}>
          <Icon name="rtl" />
        </button>
      ) : null}
      {run ? <RunStatus s={run} runner={p.runner} /> : null}
      {s.experience.counter && c.chars ? <span class="count mono muted">{t('bar_count', [String(c.words), String(c.chars)])}</span> : null}
    </div>
  );
}

export class ComposerBar {
  private mount: ShadowMount | null = null;

  constructor(private readonly props: BarProps) {}

  start(): () => void {
    this.mount = mountShadow('artifact-composer-bar', { inline: true });
    const offTheme = watchTheme((d) => this.mount?.setTheme(d));
    this.mount.update(<Bar {...this.props} />);
    const place = () => {
      const anchor = this.props.adapter.getComposerAnchor();
      if (!anchor?.parentElement || !this.mount) return;
      const meter = anchor.previousElementSibling?.tagName === 'ARTIFACT-METER' ? anchor.previousElementSibling : null;
      const target = meter ?? anchor;
      if (this.mount.host.nextElementSibling !== target) anchor.parentElement.insertBefore(this.mount.host, target);
    };
    let timer: number | undefined;
    const obs = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(place, 200);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    place();
    return () => {
      obs.disconnect();
      window.clearTimeout(timer);
      offTheme();
      this.mount?.remove();
      this.mount = null;
    };
  }
}
