// Timeline navigator (SPEC §6E): a slim rail at the right edge with one mark
// per message, placed by where the message sits in the thread. Click a mark
// to jump; the marks in view are highlighted. Your messages are filled.
import type { SiteAdapter } from '../../adapters/types';
import { mountShadow, watchTheme, type ShadowMount } from '../../ui/shadow';
import { t } from '../../core/i18n/t';

function scroller(el: Element): Element {
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    const o = getComputedStyle(cur).overflowY;
    if ((o === 'auto' || o === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur;
  }
  return document.scrollingElement ?? document.documentElement;
}

function snippet(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export class Timeline {
  private mount: ShadowMount | null = null;
  private box: Element | null = null;

  constructor(private readonly adapter: SiteAdapter) {}

  start(): () => void {
    this.mount = mountShadow('artifact-timeline');
    document.body.append(this.mount.host);
    const offTheme = watchTheme((d) => this.mount?.setTheme(d));
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.render());
    };
    let timer: number | undefined;
    const obs = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(schedule, 300);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      obs.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      offTheme();
      this.mount?.remove();
      this.mount = null;
    };
  }

  private render(): void {
    if (!this.mount) return;
    const anchors = this.adapter.getMessageAnchors();
    if (anchors.length < 2) return this.mount.update(null);
    this.box = scroller(anchors[0]!.element);
    const box = this.box;
    const total = Math.max(1, box.scrollHeight);
    const boxTop = box === document.scrollingElement ? 0 : box.getBoundingClientRect().top;
    const viewTop = box.scrollTop;
    const viewBottom = viewTop + box.clientHeight;
    const marks = anchors.map((a) => {
      const top = a.element.getBoundingClientRect().top - boxTop + box.scrollTop;
      return { a, at: top / total, inView: top + a.element.getBoundingClientRect().height > viewTop && top < viewBottom };
    });
    this.mount.update(
      <nav class="timeline" aria-label={t('timeline_label')}>
        {marks.map((m, i) => (
          <button
            class={`mark ${m.a.role === 'user' ? 'user' : 'reply'}${m.inView ? ' on' : ''}`}
            style={{ top: `${(m.at * 100).toFixed(2)}%` }}
            aria-label={t('timeline_mark', [String(i + 1), snippet(m.a.element)])}
            title={snippet(m.a.element)}
            onClick={() => m.a.element.scrollIntoView({ block: 'start', behavior: 'smooth' })}
          />
        ))}
      </nav>,
    );
  }
}
