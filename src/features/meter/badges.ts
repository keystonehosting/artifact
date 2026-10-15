// Per-message token badge shown while hovering a message (SPEC §6A).
import { h } from 'preact';
import type { SiteAdapter } from '../../adapters/types';
import type { MeterState } from './model';
import { mountShadow, pageIsDark, type ShadowMount } from '../../ui/shadow';
import { formatTokens } from '../../core/meter/meter';
import { t } from '../../core/i18n/t';

export class MessageBadges {
  private mount: ShadowMount | null = null;

  constructor(
    private readonly adapter: SiteAdapter,
    private readonly state: () => MeterState | null,
  ) {}

  start(): () => void {
    this.mount = mountShadow('artifact-badge');
    document.body.append(this.mount.host);
    let current: Element | null = null;
    const onMove = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const anchors = this.adapter.getMessageAnchors();
      const hit = target ? anchors.find((a) => a.element.contains(target)) : undefined;
      if (!hit) {
        if (current) this.mount?.update(null);
        current = null;
        return;
      }
      if (hit.element === current) return;
      current = hit.element;
      const st = this.state();
      const cost = st?.messages.find((m) => m.id === hit.messageId) ?? st?.messages[hit.index];
      if (!cost) return;
      const r = hit.element.getBoundingClientRect();
      this.mount?.setTheme(pageIsDark());
      this.mount?.update(
        h('div', { class: 'badge', style: { top: `${Math.max(4, r.top + 4)}px`, left: `${Math.max(4, r.right - 96)}px` } }, `${st?.approximate ? '≈ ' : ''}${formatTokens(cost.tokens)} ${t('meter_tokens')}`),
      );
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      document.removeEventListener('mousemove', onMove);
      this.mount?.remove();
    };
  }
}
