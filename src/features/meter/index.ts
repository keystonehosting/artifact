// Context meter (SPEC §6A): a pill above the composer with a hover
// breakdown, per-message token badges, threshold warnings, usage bars, and
// calibration where the site reports its own count.
import { h } from 'preact';
import { browser } from 'wxt/browser';
import type { SiteAdapter, UsageReport } from '../../adapters/types';
import type { Conversation } from '../../core/schema/archive';
import { mountShadow, watchTheme, type ShadowMount } from '../../ui/shadow';
import { MeterView } from './MeterView';
import { computeMeter, type MeterState } from './model';
import { TokenCache } from '../../core/tokenizer/client';
import { lookupLimit, type Plan } from '../../core/limits/limits';
import { applyCalibration, calibrationKey, isExact, updateCalibration, type Calibration } from '../../core/meter/calibration';
import type { Settings } from '../../core/settings/settings';
import { WarningController } from './warnings';
import { MessageBadges } from './badges';
import { recordSend } from '../usage/sendlog';

const CAL_KEY = 'calibration';

async function loadCalibration(key: string): Promise<Calibration | null> {
  const got = await browser.storage.local.get(CAL_KEY);
  const all = (got[CAL_KEY] ?? {}) as Record<string, Calibration>;
  return all[key] ?? null;
}

async function saveCalibration(key: string, cal: Calibration): Promise<void> {
  const got = await browser.storage.local.get(CAL_KEY);
  const all = (got[CAL_KEY] ?? {}) as Record<string, Calibration>;
  all[key] = cal;
  await browser.storage.local.set({ [CAL_KEY]: all });
}

export class MeterFeature {
  private mount: ShadowMount | null = null;
  private state: MeterState | null = null;
  private conv: Conversation | null = null;
  private usage: UsageReport | null = null;
  private plan: Plan | null = null;
  private draft = 0;
  private tokens = new TokenCache();
  private disposers: Array<() => void> = [];
  private refreshTimer: number | undefined;
  private draftTimer: number | undefined;
  private warnings: WarningController;
  private badges: MessageBadges;
  private wasStreaming = false;

  constructor(
    private readonly adapter: SiteAdapter,
    private settings: Settings,
  ) {
    this.warnings = new WarningController(adapter, () => this.settings);
    this.badges = new MessageBadges(adapter, () => this.state);
  }

  async start(): Promise<void> {
    this.mount = mountShadow('artifact-meter', { inline: true });
    this.disposers.push(watchTheme((dark) => this.mount?.setTheme(dark)));
    this.disposers.push(this.adapter.onHealthChange(() => this.render()));
    this.disposers.push(this.adapter.onConversationChange(() => this.schedule(300, true)));
    this.disposers.push(this.adapter.onStreamingDone(() => this.schedule(1500, true)));
    const placer = window.setInterval(() => {
      this.place();
      this.trackStreaming();
    }, 700);
    this.disposers.push(() => window.clearInterval(placer));
    const onInput = (e: Event) => {
      const anchor = this.adapter.getComposerAnchor();
      if (anchor && e.target instanceof Node && anchor.contains(e.target)) this.scheduleDraft();
    };
    document.addEventListener('input', onInput, true);
    this.disposers.push(() => document.removeEventListener('input', onInput, true));
    if (this.settings.features.messageTokens) this.disposers.push(this.badges.start());
    this.place();
    this.plan = (await this.adapter.getPlan?.().catch(() => null)) ?? null;
    await this.refresh(true);
    if (this.settings.features.usage) void this.refreshUsage();
  }

  updateSettings(s: Settings): void {
    this.settings = s;
    void this.refresh(false);
  }

  /** Keeps the pill directly above the composer, in normal flow. */
  private place(): void {
    if (!this.mount) return;
    const anchor = this.adapter.getComposerAnchor();
    if (!anchor?.parentElement) return;
    if (this.mount.host.nextElementSibling !== anchor) anchor.parentElement.insertBefore(this.mount.host, anchor);
  }

  private trackStreaming(): void {
    const now = this.adapter.isStreaming();
    if (now && !this.wasStreaming) {
      void this.adapter.getModel().then((m) => recordSend(this.adapter.id, m.slug ?? m.label ?? null));
    }
    this.wasStreaming = now;
  }

  private schedule(ms: number, reread: boolean): void {
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => void this.refresh(reread), ms);
  }

  private scheduleDraft(): void {
    window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(async () => {
      const text = this.adapter.getDraftText();
      this.draft = text.trim() ? ((await this.count([text]))[0] ?? 0) : 0;
      await this.refresh(false);
    }, 300);
  }

  private async count(texts: string[]): Promise<number[]> {
    const raw = await this.tokens.counts(texts);
    if (isExact(this.adapter.id)) return raw;
    const cal = await loadCalibration(calibrationKey(this.adapter.id));
    return raw.map((n) => applyCalibration(n, cal));
  }

  async refresh(reread: boolean): Promise<void> {
    try {
      if (reread || !this.conv) {
        const read = await this.adapter.readConversation();
        this.conv = read?.value ?? null;
        if (this.settings.features.usage) void this.refreshUsage();
      }
      if (!this.conv) {
        this.state = null;
        return this.render();
      }
      const site = this.adapter.siteTokenCount?.() ?? null;
      if (site && this.adapter.capabilities.reportsTokenCount) await this.calibrate(site.used);
      const model = this.conv.model ?? (await this.adapter.getModel()).slug;
      const planSetting = this.settings.plans[this.adapter.id];
      const plan = (planSetting && planSetting !== 'auto' ? planSetting : this.plan ?? 'unknown') as Plan;
      const limit = lookupLimit({
        site: this.adapter.id,
        model: model ?? null,
        plan,
        siteReported: site?.limit ?? null,
        overrides: this.settings.limitOverrides,
      });
      this.state = await computeMeter({
        conv: this.conv,
        count: (texts) => this.count(texts),
        limit,
        approximate: !isExact(this.adapter.id) || this.conv.source.approximate,
        thresholds: this.settings.meter,
        draft: this.settings.meter.showDraft ? this.draft : 0,
        siteUsed: site?.used ?? null,
      });
      if (site) this.state.approximate = false;
      this.warnings.check(this.conv, this.state);
    } catch (e) {
      console.warn('Artifact meter:', (e as Error).message);
    }
    this.render();
  }

  /** Learns the provider factor by comparing our raw o200k count with the site's count. */
  private async calibrate(siteUsed: number): Promise<void> {
    if (!this.conv) return;
    const raw = await this.tokens.counts(
      Object.values(this.conv.messages)
        .filter((m) => !m.hidden)
        .map((m) => m.parts.map((p) => (p.type === 'text' ? p.text : p.type === 'code' ? p.code : '')).join('\n')),
    );
    const ours = raw.reduce((a, b) => a + b, 0);
    const key = calibrationKey(this.adapter.id);
    const next = updateCalibration(await loadCalibration(key), ours, siteUsed);
    if (next) await saveCalibration(key, next);
  }

  private async refreshUsage(): Promise<void> {
    if (!this.adapter.capabilities.usage || !this.adapter.getUsage) return;
    this.usage = await this.adapter.getUsage().catch(() => null);
    this.render();
  }

  private jump(messageId: string, index: number): void {
    const anchors = this.adapter.getMessageAnchors();
    const el = anchors.find((a) => a.messageId === messageId)?.element ?? anchors[index]?.element;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private render(): void {
    if (!this.mount) return;
    this.mount.update(
      h(MeterView, {
        state: this.settings.features.meter ? this.state : null,
        health: this.adapter.health(),
        usage: this.settings.features.usage ? this.usage : null,
        showDraft: this.settings.meter.showDraft,
        onJump: (id, i) => this.jump(id, i),
      }),
    );
  }

  stop(): void {
    for (const off of this.disposers.splice(0)) off();
    window.clearTimeout(this.refreshTimer);
    window.clearTimeout(this.draftTimer);
    this.warnings.dispose();
    this.mount?.remove();
    this.mount = null;
  }
}
