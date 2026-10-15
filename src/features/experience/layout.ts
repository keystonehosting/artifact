// Wide mode, speed mode and right-to-left text (SPEC §6E). None of them
// depends on a site's class names: wide mode lifts the max-width of the
// containers around the messages and composer, speed mode lets the browser
// skip rendering messages that are off screen, and RTL sets the direction of
// the composer and message text. Each change is marked and fully undone.
import type { SiteAdapter } from '../../adapters/types';

const WIDE = 'data-artifact-wide';
const SPEED = 'data-artifact-speed';
const RTL = 'data-artifact-rtl';

function observe(fn: () => void, ms = 250): () => void {
  let timer: number | undefined;
  const obs = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  fn();
  return () => {
    obs.disconnect();
    window.clearTimeout(timer);
  };
}

function style(id: string, css: string): () => void {
  const el = document.createElement('style');
  el.setAttribute('data-artifact', id);
  el.textContent = css;
  (document.head ?? document.documentElement).append(el);
  return () => el.remove();
}

/** Containers between `el` and the page body that cap their width in pixels. */
function cappedAncestors(el: Element, limitPx: number): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let cur = el.parentElement, depth = 0; cur && cur !== document.body && depth < 14; cur = cur.parentElement, depth++) {
    const max = getComputedStyle(cur).maxWidth;
    if (max.endsWith('px') && parseFloat(max) < limitPx) out.push(cur);
  }
  return out;
}

export function startWide(adapter: SiteAdapter, percent: number): () => void {
  const apply = () => {
    const targets = [...adapter.getMessageAnchors().slice(-30).map((a) => a.element), adapter.getComposerAnchor()].filter((e): e is Element => !!e);
    const limit = (window.innerWidth * percent) / 100;
    for (const t of targets) {
      for (const c of cappedAncestors(t, limit)) {
        if (!c.hasAttribute(WIDE)) c.setAttribute(WIDE, c.style.maxWidth);
        c.style.setProperty('max-width', `${percent}%`, 'important');
      }
    }
  };
  const off = observe(apply, 400);
  window.addEventListener('resize', apply);
  return () => {
    off();
    window.removeEventListener('resize', apply);
    for (const el of document.querySelectorAll<HTMLElement>(`[${WIDE}]`)) {
      el.style.removeProperty('max-width');
      const prev = el.getAttribute(WIDE);
      if (prev) el.style.maxWidth = prev;
      el.removeAttribute(WIDE);
    }
  };
}

/** Keeps the newest few messages fully rendered; older ones render only when scrolled near. */
export function startSpeed(adapter: SiteAdapter, keepLive = 6): () => void {
  const offStyle = style('speed', `[${SPEED}] { content-visibility: auto; contain-intrinsic-size: auto 600px; }`);
  const apply = () => {
    const anchors = adapter.getMessageAnchors();
    anchors.forEach((a, i) => {
      const live = i >= anchors.length - keepLive;
      if (live) a.element.removeAttribute(SPEED);
      else if (!a.element.hasAttribute(SPEED)) a.element.setAttribute(SPEED, '');
    });
  };
  const off = observe(apply, 500);
  return () => {
    off();
    offStyle();
    for (const el of document.querySelectorAll(`[${SPEED}]`)) el.removeAttribute(SPEED);
  };
}

export class Rtl {
  on = false;
  private stop: (() => void) | null = null;

  constructor(private readonly adapter: SiteAdapter) {}

  set(on: boolean): void {
    this.on = on;
    this.stop?.();
    this.stop = null;
    if (!on) return;
    // Math and code stay left-to-right inside right-to-left text.
    const offStyle = style('rtl', `[${RTL}] { direction: rtl; text-align: start; } [${RTL}] .katex, [${RTL}] .katex-display, [${RTL}] pre, [${RTL}] code { direction: ltr; unicode-bidi: isolate; }`);
    const apply = () => {
      for (const a of this.adapter.getMessageAnchors()) if (!a.element.hasAttribute(RTL)) a.element.setAttribute(RTL, '');
      const c = this.adapter.getComposerElement();
      if (c && !c.hasAttribute(RTL)) c.setAttribute(RTL, '');
    };
    const off = observe(apply, 300);
    this.stop = () => {
      off();
      offStyle();
      for (const el of document.querySelectorAll(`[${RTL}]`)) el.removeAttribute(RTL);
    };
  }

  dispose(): void {
    this.set(false);
  }
}
