// Find in this chat (SPEC §6C): Ctrl/Cmd+Shift+F, or the browser command.
// Searches the rendered messages, highlights every match, steps through them.
import { h } from 'preact';
import type { SiteAdapter } from '../../adapters/types';
import { mountShadow, pageIsDark, type ShadowMount } from '../../ui/shadow';
import { ensureHighlightStyles, findAll, setHighlight } from './text-ranges';
import { t } from '../../core/i18n/t';
import { Icon } from '../../ui/icons';

export class FindBar {
  private mount: ShadowMount | null = null;
  private open = false;
  private query = '';
  private ranges: Range[] = [];
  private pos = 0;

  constructor(private readonly adapter: SiteAdapter) {}

  start(): () => void {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.toggle(true);
      } else if (e.key === 'Escape' && this.open) this.toggle(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      this.toggle(false);
    };
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(on = !this.open): void {
    this.open = on;
    if (!on) {
      setHighlight('artifact-find', []);
      setHighlight('artifact-find-current', []);
      this.mount?.remove();
      this.mount = null;
      return;
    }
    if (!this.mount) {
      this.mount = mountShadow('artifact-find');
      document.body.append(this.mount.host);
    }
    this.render(true);
  }

  private search(q: string): void {
    this.query = q;
    const ranges: Range[] = [];
    for (const a of this.adapter.getMessageAnchors()) ranges.push(...findAll(a.element, q));
    this.ranges = ranges;
    this.pos = 0;
    this.show();
  }

  private step(d: number): void {
    if (!this.ranges.length) return;
    this.pos = (this.pos + d + this.ranges.length) % this.ranges.length;
    this.show();
  }

  private show(): void {
    const dark = pageIsDark();
    ensureHighlightStyles(
      `::highlight(artifact-find){background-color:${dark ? '#5a4a10' : '#fbe7a1'}}::highlight(artifact-find-current){background-color:${dark ? '#b8862a' : '#f2b233'};color:#000}`,
    );
    setHighlight('artifact-find', this.ranges);
    const cur = this.ranges[this.pos];
    setHighlight('artifact-find-current', cur ? [cur] : []);
    cur?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.render(false);
  }

  private render(focus: boolean): void {
    if (!this.mount) return;
    this.mount.setTheme(pageIsDark());
    const count = this.query ? (this.ranges.length ? t('find_position', [String(this.pos + 1), String(this.ranges.length)]) : t('find_none')) : '';
    this.mount.update(
      h(
        'div',
        { class: 'find', role: 'search' },
        h('input', {
          type: 'search',
          'aria-label': t('find_label'),
          placeholder: t('find_label'),
          value: this.query,
          ref: (el: HTMLInputElement | null) => focus && el?.focus(),
          onInput: (e: Event) => this.search((e.target as HTMLInputElement).value),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter') this.step(e.shiftKey ? -1 : 1);
            if (e.key === 'Escape') this.toggle(false);
          },
        }),
        h('span', { class: 'count', role: 'status' }, count),
        h('button', { 'aria-label': t('find_prev'), onClick: () => this.step(-1) }, h(Icon, { name: 'up' })),
        h('button', { 'aria-label': t('find_next'), onClick: () => this.step(1) }, h(Icon, { name: 'down' })),
        h('button', { 'aria-label': t('find_close'), onClick: () => this.toggle(false) }, h(Icon, { name: 'close' })),
      ),
    );
  }
}
