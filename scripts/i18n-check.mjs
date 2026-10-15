#!/usr/bin/env node
// Lists message keys used in src/ but missing from the English locale, and
// keys in the locale that nothing uses. Exits 1 on missing keys.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const en = JSON.parse(readFileSync(join(root, 'src/public/_locales/en/messages.json'), 'utf8'));
const used = new Set();
const prefixes = new Set();
const literals = new Set();
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) {
      const s = readFileSync(p, 'utf8');
      for (const m of s.matchAll(/\bt\(\s*'([a-z0-9_]+)'/g)) used.add(m[1]);
      for (const m of s.matchAll(/'([a-z][a-z0-9]*_[a-z0-9_]+)'/g)) literals.add(m[1]);
      for (const m of s.matchAll(/\bt\(\s*`([a-z0-9_]+)\$\{/g)) prefixes.add(m[1]);
      for (const m of s.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
    }
  }
};
walk(join(root, 'src'));
for (const f of ['wxt.config.ts']) for (const m of readFileSync(join(root, f), 'utf8').matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
const missing = [...used].filter((k) => !(k in en)).sort();
const unused = Object.keys(en).filter((k) => !used.has(k) && !literals.has(k) && ![...prefixes].some((p) => k.startsWith(p))).sort();
if (unused.length) console.log(`unused (${unused.length}): ${unused.join(', ')}`);
if (missing.length) {
  console.error(`missing (${missing.length}): ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`i18n: ok (${used.size} keys used, dynamic prefixes: ${[...prefixes].join(', ')})`);
