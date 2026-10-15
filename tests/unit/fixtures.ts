import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURES = join(__dirname, '..', 'fixtures');

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

/** Parses an HTML fixture into a Document whose location is `url`. */
export function fixtureDocument(name: string, url: string): Document {
  const doc = document.implementation.createHTMLDocument('fixture');
  // Scripts, frames and stylesheets are irrelevant to readers and make happy-dom try to load them.
  doc.documentElement.innerHTML = fixture(name)
    .replace(/^<!doctype[^>]*>/i, '')
    .replace(/<(script|iframe|noscript)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<link\b[^>]*>/gi, '');
  Object.defineProperty(doc, 'location', { value: new URL(url), configurable: true });
  return doc;
}
