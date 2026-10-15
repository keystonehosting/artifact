// In-page UI lives in closed Shadow DOM hosts (SPEC §9): the site's CSS can't
// reach in, ours can't leak out, and page scripts can't read our nodes.
import { render, type ComponentChild } from 'preact';
import pageCss from './page.css?inline';

export interface ShadowMount {
  host: HTMLElement;
  root: ShadowRoot;
  update(node: ComponentChild): void;
  setTheme(dark: boolean): void;
  remove(): void;
}

export function mountShadow(tag: string, opts: { inline?: boolean } = {}): ShadowMount {
  const host = document.createElement(tag);
  host.setAttribute('data-artifact', '');
  if (opts.inline) host.style.display = 'block';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = pageCss;
  root.append(style);
  const container = document.createElement('div');
  container.className = 'artifact-root';
  root.append(container);
  return {
    host,
    root,
    update: (node) => render(node, container),
    setTheme: (dark) => container.setAttribute('data-theme', dark ? 'dark' : 'light'),
    remove: () => {
      render(null, container);
      host.remove();
    },
  };
}

/** Whether the host page currently renders dark: class markers first, then background luminance. */
export function pageIsDark(doc: Document = document): boolean {
  const html = doc.documentElement;
  const cls = `${html.className} ${doc.body?.className ?? ''}`;
  if (/\bdark\b|dark-theme|theme-dark/.test(cls) || html.getAttribute('data-theme') === 'dark' || html.style.colorScheme === 'dark') return true;
  if (/\blight\b|light-theme|theme-light/.test(cls) || html.getAttribute('data-theme') === 'light') return false;
  const bg = getComputedStyle(doc.body ?? html).backgroundColor;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(bg);
  if (m && (m[4] === undefined || Number(m[4]) > 0.5)) {
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
  }
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Calls `cb` when the page's theme flips. */
export function watchTheme(cb: (dark: boolean) => void, doc: Document = document): () => void {
  let last = pageIsDark(doc);
  cb(last);
  const check = () => {
    const now = pageIsDark(doc);
    if (now !== last) {
      last = now;
      cb(now);
    }
  };
  const obs = new MutationObserver(check);
  obs.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
  if (doc.body) obs.observe(doc.body, { attributes: true, attributeFilter: ['class', 'style'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', check);
  return () => {
    obs.disconnect();
    mq.removeEventListener('change', check);
  };
}
