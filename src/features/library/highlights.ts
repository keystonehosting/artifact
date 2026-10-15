// Highlights (SPEC §6B): select text in a reply, pick a color, optionally a
// note. Saved highlights are re-found on the page by their quote and context
// and drawn with the CSS Custom Highlight API.
import { h } from 'preact';
import type { SiteAdapter } from '../../adapters/types';
import { mountShadow, pageIsDark, type ShadowMount } from '../../ui/shadow';
import { lib } from '../../core/library/client';
import type { PageState } from '../page-state';
import { COLORS, COLOR_VALUES, type ColorName } from '../../ui/colors';
import { contextOf, ensureHighlightStyles, findQuote, setHighlight } from './text-ranges';
import { t } from '../../core/i18n/t';
import { Icon } from '../../ui/icons';
import type { HighlightRow } from '../../core/db/db';

export class Highlights {
  private mount: ShadowMount | null = null;
  private rows: HighlightRow[] = [];
  private pending: { range: Range; anchorIndex: number; messageId: string | null; el: Element } | null = null;
  private redrawTimer: number | undefined;

  constructor(
    private readonly adapter: SiteAdapter,
    private readonly state: PageState,
  ) {}

  start(): () => void {
    this.mount = mountShadow('artifact-highlight');
    document.body.append(this.mount.host);
    const onUp = () => setTimeout(() => this.onSelection(), 0);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keyup', onUp);
    const offState = this.state.subscribe(() => void this.reload());
    const obs = new MutationObserver(() => this.scheduleRedraw());
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    void this.reload();
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keyup', onUp);
      offState();
      obs.disconnect();
      for (const c of COLORS) setHighlight(`artifact-${c}`, []);
      this.mount?.remove();
    };
  }

  private async reload(): Promise<void> {
    const chatId = this.state.chatId();
    this.rows = chatId ? await lib('highlights', chatId) : [];
    this.redraw();
  }

  private scheduleRedraw(): void {
    window.clearTimeout(this.redrawTimer);
    this.redrawTimer = window.setTimeout(() => this.redraw(), 500);
  }

  private redraw(): void {
    const dark = pageIsDark();
    ensureHighlightStyles(COLORS.map((c) => `::highlight(artifact-${c}){background-color:${COLOR_VALUES[c][dark ? 'dark' : 'light']};color:inherit}`).join('\n'));
    const anchors = this.adapter.getMessageAnchors();
    const byColor = new Map<string, Range[]>();
    for (const row of this.rows) {
      const anchor = anchors.find((a) => this.state.messageFor(a)?.id === row.messageId);
      const range = anchor && findQuote(anchor.element, row.quote, row.prefix, row.suffix);
      if (!range) continue;
      byColor.set(row.color, [...(byColor.get(row.color) ?? []), range]);
    }
    for (const c of COLORS) setHighlight(`artifact-${c}`, byColor.get(c) ?? []);
  }

  private onSelection(): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return this.hide();
    const range = sel.getRangeAt(0);
    const text = range.toString().trim();
    if (text.length < 2) return this.hide();
    const anchors = this.adapter.getMessageAnchors();
    const idx = anchors.findIndex((a) => a.element.contains(range.commonAncestorContainer));
    if (idx < 0) return this.hide();
    const a = anchors[idx]!;
    this.pending = { range: range.cloneRange(), anchorIndex: a.index, messageId: a.messageId, el: a.element };
    const r = range.getBoundingClientRect();
    const dark = pageIsDark();
    this.mount?.setTheme(dark);
    this.mount?.update(
      h(
        'div',
        { class: 'hl-pop', style: { top: `${Math.max(4, r.top - 36)}px`, left: `${Math.max(4, r.left)}px` }, role: 'toolbar', 'aria-label': t('highlight_label') },
        h(Icon, { name: 'highlight' }),
        COLORS.map((c) =>
          h('button', { class: 'swatch', style: { background: COLOR_VALUES[c][dark ? 'dark' : 'light'] }, 'aria-label': t('highlight_with', t(`color_${c}`)), onMouseDown: (e: Event) => e.preventDefault(), onClick: () => void this.save(c) }),
        ),
      ),
    );
  }

  private hide(): void {
    this.pending = null;
    this.mount?.update(null);
  }

  private async save(color: ColorName): Promise<void> {
    const p = this.pending;
    const chatId = this.state.chatId();
    const msg = p && this.state.messageFor({ messageId: p.messageId, index: p.anchorIndex });
    if (!p || !chatId || !msg) return this.hide();
    const { prefix, suffix } = contextOf(p.el, p.range);
    await lib('addHighlight', { chatId, messageId: msg.id, site: this.adapter.id, quote: p.range.toString(), prefix, suffix, color, note: '' });
    document.getSelection()?.removeAllRanges();
    this.hide();
    await this.reload();
  }
}
