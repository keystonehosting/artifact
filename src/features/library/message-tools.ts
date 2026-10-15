// Hover toolbar on each message: bookmark and colored label (SPEC §6B).
// Sits in the gutter left of the message, so it never covers the site's
// own message actions.
import { h } from 'preact';
import type { SiteAdapter } from '../../adapters/types';
import { mountShadow, pageIsDark, type ShadowMount } from '../../ui/shadow';
import { lib } from '../../core/library/client';
import { messageText } from '../../core/model/tree';
import type { PageState } from '../page-state';
import { COLORS, COLOR_VALUES, type ColorName } from '../../ui/colors';
import { t } from '../../core/i18n/t';
import { Icon } from '../../ui/icons';
import type { BookmarkRow, LabelRow } from '../../core/db/db';

export class MessageTools {
  private mount: ShadowMount | null = null;
  private current: { el: Element; messageId: string } | null = null;
  private bookmarks: BookmarkRow[] = [];
  private labels: LabelRow[] = [];
  private pickerFor: 'label' | 'bookmark' | null = null;
  private hideTimer: number | undefined;

  constructor(
    private readonly adapter: SiteAdapter,
    private readonly state: PageState,
  ) {}

  start(): () => void {
    this.mount = mountShadow('artifact-message-tools');
    document.body.append(this.mount.host);
    const onMove = (e: MouseEvent) => this.track(e);
    document.addEventListener('mousemove', onMove, { passive: true });
    const offState = this.state.subscribe(() => void this.reload());
    void this.reload();
    return () => {
      document.removeEventListener('mousemove', onMove);
      offState();
      this.mount?.remove();
    };
  }

  private async reload(): Promise<void> {
    const chatId = this.state.chatId();
    if (!chatId) return;
    [this.bookmarks, this.labels] = await Promise.all([lib('bookmarks', chatId), lib('labels', chatId)]);
    this.render();
  }

  private track(e: MouseEvent): void {
    const target = e.target instanceof Element ? e.target : null;
    if (target && this.mount?.host.contains(target)) return;
    const hit = target ? this.adapter.getMessageAnchors().find((a) => a.element.contains(target)) : undefined;
    const msg = hit ? this.state.messageFor(hit) : null;
    if (!hit || !msg) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = window.setTimeout(() => {
        if (this.pickerFor) return;
        this.current = null;
        this.render();
      }, 400);
      return;
    }
    window.clearTimeout(this.hideTimer);
    if (this.current?.el === hit.element) return;
    this.current = { el: hit.element, messageId: msg.id };
    this.pickerFor = null;
    this.render();
  }

  private async bookmark(color: ColorName): Promise<void> {
    const chatId = this.state.chatId();
    const msg = this.current && this.state.conv?.messages[this.current.messageId];
    if (!chatId || !msg) return;
    const existing = this.bookmarks.find((b) => b.messageId === msg.id);
    if (existing && existing.color === color) await lib('deleteBookmark', existing.id);
    else await lib('addBookmark', { chatId, messageId: msg.id, site: this.adapter.id, color, note: existing?.note ?? '', snippet: messageText(msg).replace(/\s+/g, ' ').slice(0, 200) });
    this.pickerFor = null;
    await this.reload();
  }

  private async label(color: ColorName): Promise<void> {
    const chatId = this.state.chatId();
    if (!chatId || !this.current) return;
    const existing = this.labels.find((l) => l.messageId === this.current!.messageId && l.color === color);
    if (existing) await lib('deleteLabel', existing.id);
    else await lib('addLabel', { chatId, messageId: this.current.messageId, color, text: '' });
    this.pickerFor = null;
    await this.reload();
  }

  private render(): void {
    if (!this.mount) return;
    const dark = pageIsDark();
    this.mount.setTheme(dark);
    if (!this.current) return this.mount.update(null);
    const r = this.current.el.getBoundingClientRect();
    const left = r.left > 44 ? r.left - 36 : r.left + 4;
    const mid = this.current.messageId;
    const bm = this.bookmarks.find((b) => b.messageId === mid);
    const lbls = this.labels.filter((l) => l.messageId === mid);
    const swatches = (kind: 'label' | 'bookmark') =>
      h(
        'div',
        { class: 'swatches', role: 'menu' },
        COLORS.map((c) =>
          h('button', {
            class: 'swatch',
            role: 'menuitemcheckbox',
            'aria-checked': kind === 'label' ? lbls.some((l) => l.color === c) : bm?.color === c,
            'aria-label': t(`color_${c}`),
            style: { background: COLOR_VALUES[c][dark ? 'dark' : 'light'] },
            onClick: () => void (kind === 'label' ? this.label(c) : this.bookmark(c)),
          }),
        ),
      );
    this.mount.update(
      h(
        'div',
        { class: 'msg-tools', style: { top: `${Math.max(4, r.top + 4)}px`, left: `${Math.max(4, left)}px` } },
        h('button', { class: `tool${bm ? ' on' : ''}`, 'aria-label': t('tools_bookmark'), title: t('tools_bookmark'), onClick: () => ((this.pickerFor = this.pickerFor === 'bookmark' ? null : 'bookmark'), this.render()) }, h(Icon, { name: bm ? 'bookmarkFill' : 'bookmark' })),
        h('button', { class: 'tool', 'aria-label': t('tools_label'), title: t('tools_label'), onClick: () => ((this.pickerFor = this.pickerFor === 'label' ? null : 'label'), this.render()) },
          lbls.length ? h('span', { class: 'dots' }, lbls.map((l) => h('i', { style: { background: COLOR_VALUES[l.color as ColorName]?.[dark ? 'dark' : 'light'] } }))) : h(Icon, { name: 'tag' })),
        this.pickerFor && swatches(this.pickerFor),
      ),
    );
  }
}
