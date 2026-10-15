// Degradation warnings at the configured levels (default 75% and 90%).
// Each level fires once per chat as it is crossed; it can be snoozed for the
// chat or muted everywhere. M3 adds a Handoff action to the same toast.
import { h } from 'preact';
import type { SiteAdapter } from '../../adapters/types';
import type { Conversation } from '../../core/schema/archive';
import type { MeterState } from './model';
import { updateSettings, type Settings } from '../../core/settings/settings';
import { mountShadow, pageIsDark, type ShadowMount } from '../../ui/shadow';
import { t } from '../../core/i18n/t';

const SNOOZE_MS = 24 * 3600_000;

export type WarningAction = { label: string; run: () => void };

/** Extra actions other features add to the toast (Handoff in M3). */
export const warningActions: Array<(adapter: SiteAdapter, conv: Conversation) => WarningAction | null> = [];

export class WarningController {
  private fired = new Map<string, number>();
  private mount: ShadowMount | null = null;

  constructor(
    private readonly adapter: SiteAdapter,
    private readonly settings: () => Settings,
  ) {}

  check(conv: Conversation, state: MeterState): void {
    const s = this.settings();
    if (!s.features.warnings || s.warnings.muted || state.percent === null) return;
    const key = conv.id;
    if ((s.warnings.snoozed[key] ?? 0) > Date.now()) return;
    const levels = [...s.warnings.levels].sort((a, b) => a - b);
    const crossed = levels.filter((l) => state.percent! >= l).pop();
    const prev = this.fired.get(key) ?? 0;
    if (crossed === undefined || crossed <= prev) return;
    this.fired.set(key, crossed);
    this.show(conv, crossed, state);
  }

  private show(conv: Conversation, level: number, state: MeterState): void {
    this.dispose();
    this.mount = mountShadow('artifact-toast');
    this.mount.setTheme(pageIsDark());
    document.body.append(this.mount.host);
    const close = () => this.dispose();
    const actions: WarningAction[] = [
      ...warningActions.map((f) => f(this.adapter, conv)).filter((a): a is WarningAction => !!a),
      {
        label: t('warning_snooze'),
        run: () => {
          void updateSettings((s) => {
            s.warnings.snoozed[conv.id] = Date.now() + SNOOZE_MS;
          });
          close();
        },
      },
      {
        label: t('warning_mute'),
        run: () => {
          void updateSettings((s) => {
            s.warnings.muted = true;
          });
          close();
        },
      },
      { label: t('warning_dismiss'), run: close },
    ];
    const red = level >= 90;
    this.mount.update(
      h(
        'div',
        { class: `toast${red ? ' red' : ''}`, role: 'alert' },
        h('p', null, t(red ? 'warning_text_red' : 'warning_text', [String(Math.round(state.percent ?? level)), state.exchangesLeft === null ? '?' : String(state.exchangesLeft)])),
        h('div', { class: 'actions' }, ...actions.map((a) => h('button', { onClick: a.run }, a.label))),
      ),
    );
  }

  dispose(): void {
    this.mount?.remove();
    this.mount = null;
  }
}
