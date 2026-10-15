// Starts the in-page features enabled in Settings for this site, and
// restarts the ones whose settings change.
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { isTier1, type SiteInfo } from '../core/sites/sites';
import type { SiteAdapter } from '../adapters/types';
import type { Conversation } from '../core/schema/archive';
import { loadSettings, onSettingsChanged, type Settings } from '../core/settings/settings';
import { lib } from '../core/library/client';
import { t } from '../core/i18n/t';
import { MeterFeature } from './meter';
import { warningActions } from './meter/warnings';
import { PageState, startReader } from './page-state';
import { startIndexer } from './library/indexer';
import { SidebarTree } from './library/sidebar-tree';
import { MessageTools } from './library/message-tools';
import { Highlights } from './library/highlights';
import { FindBar } from './library/find';
import { setBlur, startBlurHotkey } from './library/blur';
import { resumeJump } from './library/jump';
import { DeepScan } from './library/deepscan';
import { Runner } from './prompts/runner';
import { Triggers } from './prompts/triggers';
import { Enhancer } from './prompts/enhancer';
import { ComposerBar } from './prompts/composer-bar';
import { startHistory } from './prompts/history';
import { startDrafts } from './prompts/drafts';
import { consumePendingFill } from './prompts/fill';
import { toast } from './prompts/toast';
import { Rtl, startSpeed, startWide } from './experience/layout';
import { Timeline } from './experience/timeline';
import { Collapser, startAutoContinue, startCodeCopy, startFinishAlert, startFormulaCopy } from './experience/replies';
import { localHandoffText, sendHandoff } from '../core/crossai/handoff';

/** Live feature objects the content-script message handlers act on. */
export interface Features {
  state: PageState;
  find: FindBar;
  scan: DeepScan;
  runner: Runner;
  triggers: Triggers;
  enhancer: Enhancer;
  rtl: Rtl;
  collapser: Collapser;
}

/** A feature that runs while `signature` returns a value; a different value restarts it. */
type Toggle = { name: string; signature(s: Settings): string | null; start(): () => void };

export function createFeatures(adapter: SiteAdapter): Features {
  const runner = new Runner(adapter);
  return {
    state: new PageState(adapter),
    find: new FindBar(adapter),
    scan: new DeepScan(adapter),
    runner,
    triggers: new Triggers(adapter, runner),
    enhancer: new Enhancer(adapter),
    rtl: new Rtl(adapter),
    collapser: new Collapser(adapter),
  };
}

const on = (b: boolean) => (b ? '1' : null);

/** Adds "Continue in a new chat" (a Local handoff to the same site) to the meter's warning. */
function registerHandoffAction(adapter: SiteAdapter, settings: () => Settings): void {
  if (warningActions.length || !isTier1(adapter.id)) return;
  const target = adapter.id;
  warningActions.push((a: SiteAdapter, conv: Conversation) =>
    a === adapter
      ? {
          label: t('handoff_continue_new'),
          run: () =>
            void (async () => {
              const s = settings();
              toast(t('handoff_building'));
              const summary = await localHandoffText(conv, s.handoff.budget);
              await sendHandoff({ conv, fromSite: adapter.id, target, mode: 'local', summary, autoSend: s.handoff.autoSend });
            })().catch((e: Error) => toast(e.message)),
        }
      : null,
  );
}

function queueKey(adapter: SiteAdapter, runner: Runner): () => void {
  // Ctrl/Cmd+Shift+Enter queues the composer text to send after the current reply.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !e.shiftKey || !(e.ctrlKey || e.metaKey)) return;
    const el = adapter.getComposerElement();
    if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
    const text = adapter.getDraftText().trim();
    if (!text) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void adapter.fillComposer('').then(() => {
      runner.enqueue(text);
      toast(t('queue_added'));
    });
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}

export async function startFeatures(site: SiteInfo, adapter: SiteAdapter, ctx: ContentScriptContext, f: Features): Promise<void> {
  let settings: Settings = await loadSettings();
  let meter: MeterFeature | null = null;
  const siteOn = () => settings.sites[site.id] !== false;
  const x = () => settings.experience;

  const toggles: Toggle[] = [
    // The meter reads the chat itself; otherwise library features need their own reads.
    { name: 'reader', signature: (s) => on(!(s.features.meter || s.features.usage) && (s.features.library || s.features.messageTools || s.features.highlights)), start: () => startReader(adapter) },
    { name: 'indexer', signature: (s) => on(s.features.library), start: () => startIndexer(adapter) },
    { name: 'sidebar', signature: (s) => on(s.features.sidebarFolders && adapter.capabilities.sidebarFolders), start: () => new SidebarTree(adapter).start() },
    { name: 'collapse', signature: (s) => on(s.experience.collapse), start: () => f.collapser.start() },
    { name: 'tools', signature: (s) => (s.features.messageTools ? `t:${s.experience.collapse}` : null), start: () => new MessageTools(adapter, f.state, x().collapse ? f.collapser : null).start() },
    { name: 'highlights', signature: (s) => on(s.features.highlights), start: () => new Highlights(adapter, f.state).start() },
    { name: 'find', signature: (s) => on(s.features.find), start: () => f.find.start() },
    {
      name: 'blur',
      signature: (s) => on(s.features.blur),
      start: () => {
        const off = startBlurHotkey(adapter);
        return () => {
          off();
          setBlur(adapter, false);
        };
      },
    },
    // Triggers before history, so an open list gets the arrow keys first.
    { name: 'triggers', signature: (s) => on(s.prompts.triggers), start: () => f.triggers.start() },
    { name: 'history', signature: (s) => on(s.prompts.history), start: () => startHistory(adapter) },
    { name: 'enhancer', signature: () => '1', start: () => f.enhancer.start() },
    { name: 'queue-key', signature: (s) => on(s.prompts.queueKey), start: () => queueKey(adapter, f.runner) },
    {
      name: 'bar',
      signature: (s) => `b:${s.prompts.triggers}`,
      start: () =>
        new ComposerBar({
          adapter,
          runner: f.runner,
          triggers: settings.prompts.triggers ? f.triggers : null,
          enhancer: f.enhancer,
          settings: () => settings,
          rtl: {
            get on() {
              return f.rtl.on;
            },
            toggle: () => {
              f.rtl.set(!f.rtl.on);
              void lib('kvSet', `rtl:${adapter.id}`, f.rtl.on);
            },
          },
        }).start(),
    },
    { name: 'drafts', signature: (s) => (s.experience.drafts ? `d:${s.experience.keepAlive}` : null), start: () => startDrafts(adapter, { keepAlive: x().keepAlive }) },
    {
      name: 'rtl',
      signature: (s) => on(s.experience.rtl),
      start: () => {
        void lib('kvGet', `rtl:${adapter.id}`).then((v) => v === true && f.rtl.set(true));
        return () => f.rtl.dispose();
      },
    },
    { name: 'wide', signature: (s) => (s.experience.wide ? `w:${s.experience.wideWidth}` : null), start: () => startWide(adapter, x().wideWidth) },
    { name: 'speed', signature: (s) => on(s.experience.speed), start: () => startSpeed(adapter) },
    { name: 'timeline', signature: (s) => on(s.experience.timeline), start: () => new Timeline(adapter).start() },
    { name: 'formula', signature: (s) => on(s.experience.formulaCopy), start: () => startFormulaCopy() },
    { name: 'code-copy', signature: (s) => on(s.experience.codeCopy), start: () => startCodeCopy(adapter) },
    { name: 'continue', signature: (s) => (s.experience.autoContinue ? `c:${s.experience.autoContinueMax}` : null), start: () => startAutoContinue(adapter, x().autoContinueMax) },
    {
      name: 'finish',
      signature: (s) => (s.experience.finishAlert ? `f:${s.experience.finishSound}:${s.experience.finishMinSeconds}` : null),
      start: () => startFinishAlert(adapter, { sound: x().finishSound, minSeconds: x().finishMinSeconds }),
    },
  ];
  const running = new Map<string, { sig: string; stop: () => void }>();

  const apply = async () => {
    for (const tg of toggles) {
      const sig = siteOn() ? tg.signature(settings) : null;
      const cur = running.get(tg.name);
      if (cur && cur.sig === sig) continue;
      if (cur) {
        cur.stop();
        running.delete(tg.name);
      }
      if (sig !== null) running.set(tg.name, { sig, stop: tg.start() });
    }
    const wantMeter = siteOn() && (settings.features.meter || settings.features.usage);
    if (wantMeter && !meter) {
      meter = new MeterFeature(adapter, settings);
      await meter.start();
    } else if (!wantMeter && meter) {
      meter.stop();
      meter = null;
    } else meter?.updateSettings(settings);
  };

  // Applies run one after another; a change that arrives during startup is applied after it.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = () => (queue = queue.then(apply, apply));
  const off = onSettingsChanged((s) => {
    settings = s;
    void enqueue();
  });
  registerHandoffAction(adapter, () => settings);
  const offJump = resumeJump(adapter, f.state);
  await enqueue();
  if (siteOn()) void consumePendingFill(adapter);
  ctx.onInvalidated(() => {
    off();
    offJump();
    f.scan.stop();
    f.runner.stop();
    for (const r of running.values()) r.stop();
    meter?.stop();
  });
}
