/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Derived from ACE content/transfer/injector.js and platform-inputs.js
 * (Covai-Labs/ace@671dfc8, MPL-2.0). Changes: TypeScript, per-adapter
 * selector lists, file attachment via synthetic paste/drop, draft reading. */

export const GENERIC_COMPOSER_SELECTORS = [
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"]',
  'textarea:not([aria-hidden="true"]):not([tabindex="-1"])',
];

export const BLOCKER_SELECTORS = [
  'div[role="dialog"][aria-modal="true"]',
  '#onetrust-banner-sdk',
  '#onetrust-pc-sdk:not([hidden])',
];

export function isVisible(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) return false;
  const style = el.getAttribute('style') ?? '';
  if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) return false;
  const win = el.ownerDocument.defaultView;
  if (win) {
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  }
  return true;
}

function isMeasuringMirror(el: Element): boolean {
  if (el.getAttribute('tabindex') === '-1' && el.getAttribute('aria-hidden') === 'true') return true;
  return /\bql-clipboard\b/.test(el.className.toString());
}

export function isEditable(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return !el.disabled && !el.readOnly;
  return (el as HTMLElement).isContentEditable || el.getAttribute('contenteditable') === 'true';
}

export function findComposer(doc: Document, selectors: readonly string[]): HTMLElement | null {
  for (const sel of [...selectors, ...GENERIC_COMPOSER_SELECTORS]) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = doc.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (const el of Array.from(nodes)) {
      if (isMeasuringMirror(el)) continue;
      if (isEditable(el) && isVisible(el)) return el as HTMLElement;
    }
  }
  return null;
}

export function readComposer(el: HTMLElement | null): string {
  if (!el) return '';
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return (el.innerText || el.textContent || '').replace(/\u200b/g, '');
}

function setNativeValue(el: HTMLTextAreaElement | HTMLInputElement, text: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, text);
  else el.value = text;
}

function fireInput(el: HTMLElement, text: string): void {
  const win = el.ownerDocument.defaultView ?? window;
  el.dispatchEvent(new win.InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}

/** Replaces the composer's content with `text`. Returns true when the text reads back. */
export function fillComposerElement(el: HTMLElement, text: string): boolean {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    setNativeValue(el, text);
    fireInput(el, text);
    return verifyContent(el, text);
  }
  const doc = el.ownerDocument;
  doc.getSelection()?.selectAllChildren(el);
  let inserted = false;
  // Gecko truncates insertText at the first newline; insertHTML with <br> keeps lines.
  if (text.includes('\n')) {
    const html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\r?\n/g, '<br>');
    try {
      inserted = doc.execCommand('insertHTML', false, html);
    } catch {
      inserted = false;
    }
  }
  if (!inserted) {
    try {
      inserted = doc.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }
  }
  if (!inserted) {
    el.replaceChildren();
    for (const chunk of text.split('\n\n')) {
      const p = doc.createElement('p');
      chunk.split('\n').forEach((line, i, all) => {
        p.append(doc.createTextNode(line));
        if (i < all.length - 1) p.append(doc.createElement('br'));
      });
      el.append(p);
    }
  }
  fireInput(el, text);
  return verifyContent(el, text);
}

/** Attaches files by dispatching a synthetic paste, then a drop, on the composer. */
export function attachFiles(el: HTMLElement, files: File[]): boolean {
  if (!files.length) return true;
  const win = el.ownerDocument.defaultView ?? window;
  const dt = new win.DataTransfer();
  for (const f of files) dt.items.add(f);
  const paste = new win.ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
  el.dispatchEvent(paste);
  if (paste.defaultPrevented) return true;
  const drop = new win.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
  el.dispatchEvent(drop);
  return drop.defaultPrevented;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export function verifyContent(el: HTMLElement, text: string): boolean {
  const got = norm(readComposer(el));
  const want = norm(text);
  if (!want) return !got;
  if (!got) return false;
  if (got.includes(want.slice(0, 200))) return true;
  const probe = want.slice(0, 200).split(' ').filter((w) => w.length > 3);
  if (!probe.length) return false;
  const hits = probe.filter((w) => got.includes(w)).length;
  return hits / probe.length > 0.5;
}

export function findBlocker(doc: Document): Element | null {
  for (const sel of BLOCKER_SELECTORS) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      if (isVisible(el) && !el.closest('[aria-hidden="true"], [hidden]')) return el;
    }
  }
  return null;
}

/** Clicks the first enabled send button, or presses Enter in the composer. */
export function clickSend(doc: Document, composer: HTMLElement | null, selectors: readonly string[]): boolean {
  for (const sel of selectors) {
    const btn = doc.querySelector<HTMLButtonElement>(sel);
    if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
      btn.click();
      return true;
    }
  }
  if (!composer) return false;
  const win = doc.defaultView ?? window;
  const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  composer.dispatchEvent(new win.KeyboardEvent('keydown', opts));
  composer.dispatchEvent(new win.KeyboardEvent('keyup', opts));
  return true;
}
