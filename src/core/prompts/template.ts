// Prompt templates (SPEC §6D). One syntax, `{{…}}`, documented in
// docs/prompts.md:
//   {{topic}}                    text field (asked once, printed everywhere it appears)
//   {{topic:default # help}}     with a default and help text
//   {{tone|formal|*casual|...}}  one choice; * marks the default, ... adds an "other" box
//   {{+parts|intro|*body|end}}   several choices, joined with ", "
//   {{!audience:experts}}        asked, but printed only where {{audience}} appears
//   {{=lang:British English}}    a fixed value, not asked and not printed here
//   {{file:Reference}}           a file slot; the file is attached, nothing is printed
//   {{date}} {{time}} {{datetime}} {{selection}}   filled automatically
//   \{{                          a literal "{{"
// An empty answer removes its placeholder, and the whole line when the
// placeholder was alone on it.

export type FieldKind = 'text' | 'choice' | 'multi' | 'file';

export interface Field {
  name: string;
  kind: FieldKind;
  default: string | string[];
  help: string;
  options: string[];
  /** Offers a free-text "other" box (choice fields). */
  other: boolean;
  /** Asked but not printed where it is declared. */
  hidden: boolean;
}

export interface Parsed {
  fields: Field[];
  constants: Record<string, string>;
  /** The template has anything to ask or fill. */
  hasVariables: boolean;
}

export type Values = Record<string, string | string[]>;

const BUILTINS = new Set(['date', 'time', 'datetime', 'selection']);
const TOKEN = /\\\{\{|\{\{([^{}]+?)\}\}/g;

interface Token {
  kind: FieldKind | 'const' | 'builtin' | 'ref';
  name: string;
  hidden: boolean;
  def: string | string[];
  help: string;
  options: string[];
  other: boolean;
}

function parseToken(raw: string): Token {
  let s = raw.trim();
  const t: Token = { kind: 'text', name: '', hidden: false, def: '', help: '', options: [], other: false };
  if (s.startsWith('=')) {
    const i = s.indexOf(':');
    return { ...t, kind: 'const', name: (i < 0 ? s.slice(1) : s.slice(1, i)).trim(), def: i < 0 ? '' : s.slice(i + 1).trim() };
  }
  if (/^file:/i.test(s)) return { ...t, kind: 'file', name: s.slice(5).trim() || 'File' };
  if (s.startsWith('!')) {
    t.hidden = true;
    s = s.slice(1).trim();
  }
  let multi = false;
  if (s.startsWith('+')) {
    multi = true;
    s = s.slice(1).trim();
  }
  if (s.includes('|')) {
    const [name, ...opts] = s.split('|').map((x) => x.trim());
    const defaults: string[] = [];
    const options: string[] = [];
    for (const o of opts) {
      if (o === '...') t.other = true;
      else if (o.startsWith('*')) {
        options.push(o.slice(1).trim());
        defaults.push(o.slice(1).trim());
      } else if (o) options.push(o);
    }
    return { ...t, kind: multi ? 'multi' : 'choice', name: name ?? '', options, def: multi ? defaults : (defaults[0] ?? '') };
  }
  const colon = s.indexOf(':');
  const name = (colon < 0 ? s : s.slice(0, colon)).trim();
  let def = colon < 0 ? '' : s.slice(colon + 1);
  let help = '';
  const hash = def.indexOf(' # ');
  if (hash >= 0) {
    help = def.slice(hash + 3).trim();
    def = def.slice(0, hash);
  }
  if (colon < 0 && !t.hidden && BUILTINS.has(name.toLowerCase())) return { ...t, kind: 'builtin', name: name.toLowerCase() };
  return { ...t, kind: colon < 0 && !t.hidden ? 'ref' : 'text', name, def: def.trim(), help };
}

function tokens(src: string): Array<{ start: number; end: number; tok: Token | null }> {
  const out: Array<{ start: number; end: number; tok: Token | null }> = [];
  for (const m of src.matchAll(TOKEN)) out.push({ start: m.index!, end: m.index! + m[0].length, tok: m[1] === undefined ? null : parseToken(m[1]) });
  return out;
}

export function parseTemplate(src: string): Parsed {
  const fields = new Map<string, Field>();
  const constants: Record<string, string> = {};
  let any = false;
  for (const { tok } of tokens(src)) {
    if (!tok || !tok.name) continue;
    any = true;
    if (tok.kind === 'builtin') continue;
    if (tok.kind === 'const') {
      constants[tok.name] = tok.def as string;
      continue;
    }
    const prev = fields.get(tok.name);
    // A bare {{name}} only creates a field when nothing richer declares it.
    if (prev && (tok.kind === 'ref' || prev.kind !== 'text' || prev.default || prev.help)) continue;
    if (tok.name in constants) continue;
    fields.set(tok.name, {
      name: tok.name,
      kind: tok.kind === 'ref' ? 'text' : (tok.kind as FieldKind),
      default: tok.def,
      help: tok.help,
      options: tok.options,
      other: tok.other,
      hidden: tok.hidden,
    });
  }
  for (const name of Object.keys(constants)) fields.delete(name);
  return { fields: [...fields.values()], constants, hasVariables: any };
}

/** Default answers for a parsed template's fields. */
export function defaultValues(p: Parsed): Values {
  return Object.fromEntries(p.fields.filter((f) => f.kind !== 'file').map((f) => [f.name, f.default]));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function renderTemplate(src: string, values: Values, ctx: { now?: Date; selection?: string } = {}): string {
  const p = parseTemplate(src);
  const now = ctx.now ?? new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const valueOf = (name: string): string => {
    if (name in p.constants) return p.constants[name]!;
    const v = values[name];
    if (Array.isArray(v)) return v.filter(Boolean).join(', ');
    return (v ?? '').trim();
  };
  const toks = tokens(src);
  let out = '';
  let last = 0;
  let emptied = false;
  for (const { start, end, tok } of toks) {
    out += src.slice(last, start);
    last = end;
    if (!tok) {
      out += '{{';
      continue;
    }
    let rep: string;
    if (tok.kind === 'builtin') rep = tok.name === 'date' ? date : tok.name === 'time' ? time : tok.name === 'datetime' ? `${date} ${time}` : (ctx.selection ?? '');
    else if (tok.kind === 'const' || tok.kind === 'file' || tok.hidden) rep = '';
    else rep = valueOf(tok.name);
    if (!rep) emptied = true;
    out += rep;
  }
  out += src.slice(last);
  if (!emptied) return out;
  // Drop lines that held nothing but placeholders which came out empty.
  const srcLines = src.split('\n');
  const outLines = out.split('\n');
  if (srcLines.length !== outLines.length) return out;
  return outLines
    .filter((line, i) => !(line.trim() === '' && srcLines[i]!.trim() !== '' && srcLines[i]!.replace(TOKEN, '').trim() === ''))
    .join('\n');
}

/** Fills a template that has no fields to ask (only built-ins and constants). */
export function needsForm(src: string): boolean {
  return parseTemplate(src).fields.length > 0;
}
