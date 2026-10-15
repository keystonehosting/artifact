#!/usr/bin/env node
// Leak check for the public Artifact repo (SPEC §0.1, §11).
//
// Hashes every 64-character window (whitespace removed) of the closed
// reference files kept in the private TEMP repo and fails if any window
// appears in content that is about to be pushed. Also fails on strings that
// only the closed references use (their server hostnames and AI Toolbox
// locale keys).
//
// Usage:
//   node scripts/leak-check.mjs            pre-push mode, reads refs on stdin
//   node scripts/leak-check.mjs --all      every blob reachable from any ref
//   node scripts/leak-check.mjs --worktree tracked + untracked working files
//
// The reference directory defaults to ../TEMP/artifact next to this repo and
// can be set with ARTIFACT_REF_DIR. If it is missing the check fails closed.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, basename, extname } from 'node:path';

const WINDOW = 64;
const MIN_DISTINCT = 12;
const P1 = 33554393;
const P2 = 33554383;
const B1 = 131;
const B2 = 137;
const SHIFT = 33554432; // 2^25, so h1 * SHIFT + h2 < 2^50 stays exact

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const refDir = resolve(process.env.ARTIFACT_REF_DIR || join(repoRoot, '..', 'TEMP', 'artifact'));

// Closed-source references. ACE (MPL-2.0), Loominary and Claude Counter (MIT)
// are open source and may be reused with notices, so they are not hashed.
const CLOSED = [
  { dir: 'ai-toolbox', match: () => true },
  { dir: 'youraiscroll', match: () => true },
  { dir: 'userscripts', match: (name) => name.startsWith('My Prompt') },
];

// Open-source libraries bundled inside the closed builds.
const THIRD_PARTY = /(katex|prism|purify|dompurify|highlight|hljs|mermaid|marked|turndown|jszip|fflate|pdf\.?js|pdfmake|jspdf|html2canvas|o200k|tiktoken|gpt-tokenizer|preact|react|lodash|dayjs|moment|fuse|minisearch|dexie|zod)/i;
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.ogg', '.wav', '.m4a', '.mp4', '.webm', '.pdf', '.zip', '.wasm']);

function fail(msg) {
  console.error(`leak-check: ${msg}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

function normalize(text) {
  return text.replace(/\s+/g, '');
}

let pow1 = 1;
let pow2 = 1;
for (let i = 0; i < WINDOW - 1; i++) {
  pow1 = (pow1 * B1) % P1;
  pow2 = (pow2 * B2) % P2;
}

// Calls emit(key, start) for each qualifying window of the normalized text.
function forEachWindow(s, emit) {
  if (s.length < WINDOW) return;
  const counts = new Uint16Array(65536);
  let distinct = 0;
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (i >= WINDOW) {
      const o = s.charCodeAt(i - WINDOW);
      h1 = (h1 - ((o * pow1) % P1) + P1) % P1;
      h2 = (h2 - ((o * pow2) % P2) + P2) % P2;
      if (--counts[o] === 0) distinct--;
    }
    h1 = (h1 * B1 + c) % P1;
    h2 = (h2 * B2 + c) % P2;
    if (counts[c]++ === 0) distinct++;
    if (i >= WINDOW - 1 && distinct >= MIN_DISTINCT) emit(h1 * SHIFT + h2, i - WINDOW + 1);
  }
}

function isText(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return true;
}

// ---------- reference index ----------

if (!existsSync(refDir)) {
  fail(`reference directory not found: ${refDir}\n` +
    'Clone keystonehosting/TEMP next to this repo (or set ARTIFACT_REF_DIR). The check fails closed without it.');
}

const closedFiles = [];
for (const { dir, match } of CLOSED) {
  const root = join(refDir, dir);
  if (!existsSync(root)) fail(`missing reference folder ${root}`);
  for (const f of walk(root)) {
    const name = basename(f);
    if (!match(name)) continue;
    if (BINARY_EXT.has(extname(name).toLowerCase())) continue;
    if (THIRD_PARTY.test(relative(root, f))) continue;
    closedFiles.push(f);
  }
}

let total = 0;
const closedTexts = [];
for (const f of closedFiles) {
  const buf = readFileSync(f);
  if (!isText(buf)) continue;
  const s = normalize(buf.toString('utf8'));
  closedTexts.push({ file: relative(refDir, f), s });
  total += Math.max(0, s.length - WINDOW + 1);
}

let refHashes = new Float64Array(total);
let n = 0;
for (const { s } of closedTexts) forEachWindow(s, (k) => { refHashes[n++] = k; });
refHashes = refHashes.subarray(0, n).sort();

// Drop windows that also occur in open material: those are not closed code.
// The closed builds bundle open-source libraries, common CSS and the AI sites'
// own markup and icons, all of which legitimately appear here too.
//   1. ACE (MPL-2.0) as imported: every blob of the commit tagged `ace-import`.
//   2. Runtime dependencies in node_modules (package.json "dependencies").
//   3. License texts anywhere in node_modules.
//   4. Window hashes listed in scripts/leak-allow.json "windows" (each entry is
//      the SHA-256 of a normalized 64-char window plus a reason), reviewed by hand.
const removed = new Uint8Array(refHashes.length);
function indexOf(arr, key) {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = arr[mid];
    if (v < key) lo = mid + 1;
    else if (v > key) hi = mid - 1;
    else return mid;
  }
  return -1;
}
function subtract(text) {
  forEachWindow(normalize(text), (k) => {
    let i = indexOf(refHashes, k);
    if (i < 0) return;
    while (i > 0 && refHashes[i - 1] === k) i--;
    while (i < refHashes.length && refHashes[i] === k) removed[i++] = 1;
  });
}
const TEXT_EXT = /\.(m?js|cjs|ts|css|html?|json|svg|txt|md|map)$/i;
let openFiles = 0;
const openTokens = new Set(); // identifiers ACE already uses are not reference-only
try {
  const tree = execFileSync('git', ['ls-tree', '-r', '-z', 'ace-import^{tree}'], { encoding: 'utf8', maxBuffer: 1 << 30 });
  for (const entry of tree.split('\0')) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.*)$/.exec(entry);
    if (!m) continue;
    const buf = execFileSync('git', ['cat-file', 'blob', m[1]], { maxBuffer: 1 << 30 });
    if (!isText(buf)) continue;
    const text = buf.toString('utf8');
    subtract(text);
    for (const t of text.match(/[A-Za-z0-9_$]{10,}/g) || []) openTokens.add(t);
    openFiles++;
  }
} catch {
  // No ace-import tag in this clone: nothing to subtract from ACE.
}
const nm = join(repoRoot, 'node_modules');
if (existsSync(nm)) {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  for (const dep of Object.keys(pkg.dependencies || {})) {
    const dir = join(nm, dep);
    if (!existsSync(dir)) continue;
    for (const f of walk(dir)) {
      if (!TEXT_EXT.test(f) || statSync(f).size > 4 * 1024 * 1024) continue;
      subtract(readFileSync(f, 'utf8'));
      openFiles++;
    }
  }
  const collect = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory() && depth < 3 && !e.name.startsWith('.')) collect(p, depth + 1);
      else if (e.isFile() && /^(licen[cs]e|copying|notice)/i.test(e.name)) { subtract(readFileSync(p, 'utf8')); openFiles++; }
    }
  };
  collect(nm, 0);
}
const allowPath = join(repoRoot, 'scripts', 'leak-allow.json');
const allow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : {};
const allowedWindows = new Set(Object.keys(allow.windows || {}));

// Reference-only strings.
const hostStrings = [['infi', 'dev'].join('-'), ['youraiscroll', 'com'].join('.')];
const localeKeys = new Set();
const flatten = (obj, prefix = '') => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !('message' in v)) flatten(v, path);
    else {
      if (k.length >= 10) localeKeys.add(k);
      if (path !== k && path.length >= 10) localeKeys.add(path);
    }
  }
};
for (const p of [join(refDir, 'ai-toolbox', 'locales', 'en.json'), join(refDir, 'ai-toolbox', '_locales', 'en', 'messages.json')]) {
  if (existsSync(p)) flatten(JSON.parse(readFileSync(p, 'utf8')));
}
for (const k of Object.keys(allow.localeKeys || {})) localeKeys.delete(k);
for (const k of [...localeKeys]) if (openTokens.has(k)) localeKeys.delete(k);
// Finds locale keys by tokenizing identifiers (and dotted paths) instead of
// one giant regex, which is far too slow on large fixture files.
function findLocaleKeys(text) {
  const found = new Set();
  if (!localeKeys.size) return found;
  const re = /[A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)*/g;
  let m;
  while ((m = re.exec(text))) {
    const tok = m[0];
    if (tok.length < 10) continue;
    if (localeKeys.has(tok)) { found.add(tok); continue; }
    if (!tok.includes('.')) continue;
    const parts = tok.split('.');
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j <= parts.length; j++) {
        const sub = parts.slice(i, j).join('.');
        if (sub.length >= 10 && localeKeys.has(sub)) found.add(sub);
      }
    }
  }
  return found;
}

// ---------- what to scan ----------

const mode = process.argv.includes('--all') ? 'all' : process.argv.includes('--worktree') ? 'worktree' : 'push';
const items = []; // { label, path, read() }

function gitBlobs(revArgs) {
  const out = execFileSync('git', ['rev-list', '--objects', ...revArgs], { encoding: 'utf8', maxBuffer: 1 << 30 });
  const seen = new Map();
  for (const line of out.split('\n')) {
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const sha = line.slice(0, sp);
    const path = line.slice(sp + 1);
    if (!seen.has(sha)) seen.set(sha, path);
  }
  if (!seen.size) return;
  const types = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype)'], {
    input: [...seen.keys()].join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 30,
  });
  for (const line of types.split('\n')) {
    const [sha, type] = line.split(' ');
    if (type !== 'blob') continue;
    const path = seen.get(sha);
    items.push({ label: `${path} (${sha.slice(0, 10)})`, path, read: () => execFileSync('git', ['cat-file', 'blob', sha], { maxBuffer: 1 << 30 }) });
  }
}

if (mode === 'all') {
  gitBlobs(['--all']);
} else if (mode === 'worktree') {
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const f of files) {
    const abs = join(repoRoot, f);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    items.push({ label: f, path: f, read: () => readFileSync(abs) });
  }
} else {
  const input = readFileSync(0, 'utf8');
  const zero = /^0+$/;
  for (const line of input.split('\n')) {
    const [, localSha] = line.trim().split(/\s+/);
    if (!localSha || zero.test(localSha)) continue;
    gitBlobs([localSha, '--not', '--remotes']);
  }
}

// ---------- scan ----------

const problems = [];
let scanned = 0;
const self = 'scripts/leak-check.mjs';
for (const item of items) {
  if (item.path === self || item.path === 'scripts/leak-allow.json') continue;
  const buf = item.read();
  if (!isText(buf)) continue;
  scanned++;
  const text = buf.toString('utf8');

  const s = normalize(text);
  const hits = [];
  forEachWindow(s, (k, start) => {
    let i = indexOf(refHashes, k);
    if (i < 0) return;
    while (i > 0 && refHashes[i - 1] === k) i--;
    let live = false;
    while (i < refHashes.length && refHashes[i] === k) if (!removed[i++]) live = true;
    if (!live) return;
    const w = s.slice(start, start + WINDOW);
    if (allowedWindows.size && allowedWindows.has(createHash('sha256').update(w).digest('hex'))) return;
    hits.push(w);
  });
  if (hits.length) {
    // Confirm exactly against the reference text before reporting.
    const confirmed = new Set();
    for (const w of [...new Set(hits)].slice(0, 25)) {
      const ref = closedTexts.find((t) => t.s.includes(w));
      if (ref) confirmed.add(ref.file);
    }
    if (confirmed.size) {
      problems.push(`${item.label}: ${hits.length} 64-char window(s) match closed reference file(s): ${[...confirmed].join(', ')}`);
      // The windows come from the file being pushed (this repo), so printing them reveals nothing closed.
      if (process.env.LEAK_CHECK_VERBOSE) for (const w of [...new Set(hits)].slice(0, 40)) problems.push(`      ${w}`);
    }
  }

  if (!/\.md$/i.test(item.path)) {
    for (const h of hostStrings) if (text.includes(h)) problems.push(`${item.label}: contains a closed-reference server hostname`);
  }
  const found = findLocaleKeys(text);
  if (found.size) problems.push(`${item.label}: contains ${found.size} AI Toolbox locale key(s): ${[...found].slice(0, 10).join(', ')}`);
}

if (problems.length) {
  console.error(`leak-check: FAILED (${problems.length} problem(s))`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Remove the matching content before pushing. See AGENTS.md, "Leak check".');
  process.exit(1);
}
console.log(`leak-check: ok (${scanned} file(s) scanned against ${closedFiles.length} closed reference file(s), ${refHashes.length} windows, ${openFiles} open file(s) subtracted, ${localeKeys.size} locale keys)`);
