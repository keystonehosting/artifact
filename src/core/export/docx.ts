// DOCX export: a real Office Open XML package written with fflate. Headings,
// lists, tables, code, quotes, links and embedded PNG/JPEG/GIF images.
// Math is kept as TeX source in a math style (Word's equation format,
// OMML, has no lossless TeX mapping; see docs/decisions.md D11).
// XML is produced through a tiny element builder, so every tag and attribute
// is escaped in one place.
import { zipSync, strToU8 } from 'fflate';
import type { Tokens, Token } from 'marked';
import type { Part } from '../schema/archive';
import type { ExportDocument } from './document';
import { marked } from './render';
import { normalizeLatexMath } from './ace-helpers';

export interface DocxImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface DocxFiles {
  image(attachmentId: string): DocxImage | null;
  attachmentName(attachmentId: string): string | null;
}

const NO_FILES: DocxFiles = { image: () => null, attachmentName: () => null };

// ---------- XML builder ----------

// eslint-disable-next-line no-control-regex -- XML 1.0 forbids these characters
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function esc(s: string): string {
  return s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type Attrs = Record<string, string | number | boolean | undefined> | null;
type Child = string | number | false | null | undefined | Child[];

/** Builds one element. String children are XML already (from x() or text()). */
function x(tag: string, attrs: Attrs = null, ...children: Child[]): string {
  let open = `<${tag}`;
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) open += ` ${k}="${esc(String(v))}"`;
  const inner = children.flat(Infinity as 1).filter((c): c is string => typeof c === 'string').join('');
  return inner ? `${open}>${inner}</${tag}>` : `${open}/>`;
}

const text = (s: string) => esc(s);
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Namespace URIs (ECMA-376).
const OX = 'http://schemas.openxmlformats.org/';
const NS = {
  w: `${OX}wordprocessingml/2006/main`,
  r: `${OX}officeDocument/2006/relationships`,
  wp: `${OX}drawingml/2006/wordprocessingDrawing`,
  a: `${OX}drawingml/2006/main`,
  pic: `${OX}drawingml/2006/picture`,
  ct: `${OX}package/2006/content-types`,
  pr: `${OX}package/2006/relationships`,
  cp: `${OX}package/2006/metadata/core-properties`,
};
const REL = {
  styles: `${NS.r}/styles`,
  numbering: `${NS.r}/numbering`,
  hyperlink: `${NS.r}/hyperlink`,
  image: `${NS.r}/image`,
  doc: `${NS.r}/officeDocument`,
  core: `${OX}package/2006/relationships/metadata/core-properties`,
};
const MIME = {
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
  main: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  styles: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
  numbering: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
};

// ---------- images ----------

/** Image size from PNG/JPEG/GIF headers, in pixels. */
export function imageSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49) {
    return { w: bytes[6]! | (bytes[7]! << 8), h: bytes[8]! | (bytes[9]! << 8) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1]!;
      const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: (bytes[i + 5]! << 8) | bytes[i + 6]!, w: (bytes[i + 7]! << 8) | bytes[i + 8]! };
      }
      i += 2 + len;
    }
  }
  return null;
}

const EMU_PER_PX = 9525;
const MAX_WIDTH_EMU = 6 * 914_400;

// ---------- document state ----------

class Builder {
  body: string[] = [];
  rels: string[] = [];
  media: Record<string, Uint8Array> = {};
  nums: string[] = [];
  private nextRel = 10;
  private nextNum = 0;
  private nextImg = 0;

  private rel(type: string, target: string, external = false): string {
    const id = `rId${++this.nextRel}`;
    this.rels.push(x('Relationship', { Id: id, Type: type, Target: target, TargetMode: external ? 'External' : undefined }));
    return id;
  }

  hyperlink(url: string): string {
    return this.rel(REL.hyperlink, url, true);
  }

  /** A new list instance (numbering restarts) of bullets (1) or decimals (2). */
  list(ordered: boolean): number {
    const id = ++this.nextNum;
    this.nums.push(
      x(
        'w:num',
        { 'w:numId': id },
        x('w:abstractNumId', { 'w:val': ordered ? 2 : 1 }),
        ordered && x('w:lvlOverride', { 'w:ilvl': 0 }, x('w:startOverride', { 'w:val': 1 })),
      ),
    );
    return id;
  }

  image(img: DocxImage, alt: string): string | null {
    const size = imageSize(img.bytes);
    const ext = /png/.test(img.mimeType) ? 'png' : /gif/.test(img.mimeType) ? 'gif' : /jpe?g/.test(img.mimeType) ? 'jpeg' : null;
    if (!size || !ext || !size.w || !size.h) return null;
    const n = ++this.nextImg;
    const name = `image${n}.${ext}`;
    this.media[`word/media/${name}`] = img.bytes;
    const rid = this.rel(REL.image, `media/${name}`);
    const cx = Math.min(MAX_WIDTH_EMU, size.w * EMU_PER_PX);
    const cy = Math.round((cx / (size.w * EMU_PER_PX)) * size.h * EMU_PER_PX);
    const picture = x(
      'pic:pic',
      { 'xmlns:pic': NS.pic },
      x('pic:nvPicPr', null, x('pic:cNvPr', { id: n, name }), x('pic:cNvPicPr')),
      x('pic:blipFill', null, x('a:blip', { 'r:embed': rid }), x('a:stretch', null, x('a:fillRect'))),
      x('pic:spPr', null, x('a:xfrm', null, x('a:off', { x: 0, y: 0 }), x('a:ext', { cx, cy })), x('a:prstGeom', { prst: 'rect' }, x('a:avLst'))),
    );
    const inline = x(
      'wp:inline',
      null,
      x('wp:extent', { cx, cy }),
      x('wp:docPr', { id: n, name, descr: alt }),
      x('a:graphic', { 'xmlns:a': NS.a }, x('a:graphicData', { uri: NS.pic }, picture)),
    );
    return x('w:p', null, x('w:r', null, x('w:drawing', null, inline)));
  }
}

// ---------- runs and paragraphs ----------

interface RunStyle {
  b?: boolean;
  i?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
  math?: boolean;
}

function run(s: string, style: RunStyle): string {
  const props = [
    style.b && x('w:b'),
    style.i && x('w:i'),
    style.strike && x('w:strike'),
    style.code && x('w:rStyle', { 'w:val': 'InlineCode' }),
    style.link && x('w:rStyle', { 'w:val': 'Hyperlink' }),
    style.math && x('w:rStyle', { 'w:val': 'MathText' }),
  ].filter((p): p is string => typeof p === 'string');
  const rPr = props.length ? x('w:rPr', null, props) : '';
  return s
    .split('\n')
    .map((line, i) => x('w:r', null, rPr, i > 0 && x('w:br'), x('w:t', { 'xml:space': 'preserve' }, text(line))))
    .join('');
}

function link(b: Builder, url: string, inner: string): string {
  return x('w:hyperlink', { 'r:id': b.hyperlink(url) }, inner);
}

function para(content: string, style?: string, numId?: number, level = 0): string {
  const pPr = style || numId ? x('w:pPr', null, style && x('w:pStyle', { 'w:val': style }), numId && x('w:numPr', null, x('w:ilvl', { 'w:val': level }), x('w:numId', { 'w:val': numId }))) : '';
  return x('w:p', null, pPr, content);
}

function codeBlock(code: string): string {
  return code
    .split('\n')
    .map((line) => para(run(line || ' ', {}), 'CodeBlock'))
    .join('');
}

function inline(tokens: Token[] | undefined, b: Builder, s: RunStyle = {}): string {
  if (!tokens) return '';
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
      case 'escape':
        out += 'tokens' in t && t.tokens ? inline(t.tokens, b, s) : run((t as Tokens.Text).text, s);
        break;
      case 'strong':
        out += inline((t as Tokens.Strong).tokens, b, { ...s, b: true });
        break;
      case 'em':
        out += inline((t as Tokens.Em).tokens, b, { ...s, i: true });
        break;
      case 'del':
        out += inline((t as Tokens.Del).tokens, b, { ...s, strike: true });
        break;
      case 'codespan':
        out += run((t as Tokens.Codespan).text, { ...s, code: true });
        break;
      case 'br':
        out += x('w:r', null, x('w:br'));
        break;
      case 'link': {
        const l = t as Tokens.Link;
        out += link(b, l.href, inline(l.tokens, b, { ...s, link: true }));
        break;
      }
      case 'image':
        out += run(`[${(t as Tokens.Image).text || 'image'}]`, s);
        break;
      case 'mathInline':
        out += run((t as Tokens.Generic).text as string, { math: true });
        break;
      default:
        out += run(t.raw, s);
    }
  }
  return out;
}

function blocks(tokens: Token[], b: Builder, level = 0, quote = false): string {
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': {
        const h = t as Tokens.Heading;
        out += para(inline(h.tokens, b), `Heading${Math.min(6, h.depth + 2)}`);
        break;
      }
      case 'paragraph':
        out += para(inline((t as Tokens.Paragraph).tokens, b), quote ? 'Quote' : undefined);
        break;
      case 'code':
        out += codeBlock((t as Tokens.Code).text);
        break;
      case 'blockquote':
        out += blocks((t as Tokens.Blockquote).tokens, b, level, true);
        break;
      case 'list': {
        const l = t as Tokens.List;
        const id = b.list(l.ordered);
        for (const item of l.items) {
          const [first, ...rest] = item.tokens;
          const head = first && 'tokens' in first && first.tokens ? inline(first.tokens, b) : first ? run(first.raw.trim(), {}) : '';
          const box = item.task ? run(item.checked ? '☑ ' : '☐ ', {}) : '';
          out += para(box + head, 'ListParagraph', id, Math.min(level, 8));
          out += blocks(rest, b, level + 1, quote);
        }
        break;
      }
      case 'table': {
        const tb = t as Tokens.Table;
        const cell = (c: Tokens.TableCell, header: boolean) =>
          x('w:tc', null, x('w:tcPr', null, x('w:tcW', { 'w:w': 0, 'w:type': 'auto' })), para(inline(c.tokens, b, header ? { b: true } : {})));
        out += x(
          'w:tbl',
          null,
          x('w:tblPr', null, x('w:tblStyle', { 'w:val': 'TableGrid' }), x('w:tblW', { 'w:w': 0, 'w:type': 'auto' })),
          x('w:tr', null, tb.header.map((c) => cell(c, true))),
          tb.rows.map((r) => x('w:tr', null, r.map((c) => cell(c, false)))),
        );
        out += para('');
        break;
      }
      case 'hr':
        out += para('', 'Rule');
        break;
      case 'mathBlock':
        out += para(run((t as Tokens.Generic).text as string, { math: true }), 'MathBlock');
        break;
      case 'space':
        break;
      case 'html':
        out += para(run((t as Tokens.HTML).text, {}));
        break;
      default:
        if ('tokens' in t && t.tokens) out += para(inline(t.tokens, b));
        else if (t.raw.trim()) out += para(run(t.raw, {}));
    }
  }
  return out;
}

function partXml(p: Part, b: Builder, files: DocxFiles): string {
  switch (p.type) {
    case 'text':
      return blocks(marked.lexer(normalizeLatexMath(p.text)), b);
    case 'code':
      return (p.language ? para(run(p.language, { i: true }), 'CodeLabel') : '') + codeBlock(p.code);
    case 'math':
      return para(run(p.tex, { math: true }), p.display ? 'MathBlock' : undefined);
    case 'tool_call':
      return para(run(`Tool: ${p.name}`, { b: true })) + (p.input ? codeBlock(p.input) : '') + (p.output ? para(run('Result', { i: true })) + codeBlock(p.output) : '');
    case 'citation':
      return para(link(b, p.url, run(p.title ?? p.url, { link: true })));
    case 'thinking':
      return para(run('Thinking', { i: true })) + blocks(marked.lexer(p.text), b, 0, true);
    case 'image': {
      const img = files.image(p.attachmentId);
      return (img && b.image(img, p.alt ?? '')) || para(run(`[image${p.alt ? `: ${p.alt}` : ''}]`, { i: true }));
    }
    case 'artifact_ref':
      return '';
  }
}

// ---------- styles and numbering ----------

interface StyleDef {
  id: string;
  name: string;
  kind?: 'paragraph' | 'character' | 'table';
  pPr?: string[];
  rPr?: string[];
  next?: string;
}

const MONO = x('w:rFonts', { 'w:ascii': 'Consolas', 'w:hAnsi': 'Consolas', 'w:cs': 'Consolas' });
const BORDER = 'C8CCD0';
const SHADE = x('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': 'F2F3F4' });

const STYLE_DEFS: StyleDef[] = [
  { id: 'Normal', name: 'Normal' },
  { id: 'Title', name: 'Title', pPr: [x('w:spacing', { 'w:after': 80 })], rPr: [x('w:b'), x('w:sz', { 'w:val': 40 })] },
  { id: 'Subtitle', name: 'Subtitle', rPr: [x('w:color', { 'w:val': '595959' }), x('w:sz', { 'w:val': 18 })] },
  ...[32, 26, 24, 22, 22, 22].map((sz, i) => ({
    id: `Heading${i + 1}`,
    name: `heading ${i + 1}`,
    next: 'Normal',
    pPr: [x('w:keepNext'), x('w:spacing', { 'w:before': i < 2 ? 240 : 160, 'w:after': 80 }), x('w:outlineLvl', { 'w:val': i })],
    rPr: [x('w:b'), x('w:sz', { 'w:val': sz }), i === 1 ? x('w:color', { 'w:val': '1F6B5C' }) : ''],
  })),
  { id: 'CodeBlock', name: 'Code Block', pPr: [x('w:spacing', { 'w:after': 0, 'w:line': 240, 'w:lineRule': 'auto' }), SHADE], rPr: [MONO, x('w:sz', { 'w:val': 18 })] },
  { id: 'CodeLabel', name: 'Code Label', pPr: [x('w:spacing', { 'w:before': 120, 'w:after': 0 })], rPr: [x('w:color', { 'w:val': '6B727B' }), x('w:sz', { 'w:val': 16 })] },
  { id: 'Quote', name: 'Quote', pPr: [x('w:ind', { 'w:left': 360 }), x('w:pBdr', null, x('w:left', { 'w:val': 'single', 'w:sz': 12, 'w:space': 8, 'w:color': BORDER }))], rPr: [x('w:color', { 'w:val': '4A5058' })] },
  { id: 'ListParagraph', name: 'List Paragraph', pPr: [x('w:spacing', { 'w:after': 40 })] },
  { id: 'MathBlock', name: 'Math Block', pPr: [x('w:jc', { 'w:val': 'center' })] },
  { id: 'Rule', name: 'Rule', pPr: [x('w:pBdr', null, x('w:bottom', { 'w:val': 'single', 'w:sz': 6, 'w:space': 1, 'w:color': BORDER }))] },
  { id: 'InlineCode', name: 'Inline Code', kind: 'character', rPr: [MONO, x('w:sz', { 'w:val': 20 }), SHADE] },
  { id: 'MathText', name: 'Math Text', kind: 'character', rPr: [x('w:rFonts', { 'w:ascii': 'Cambria Math', 'w:hAnsi': 'Cambria Math' }), x('w:i')] },
  { id: 'Hyperlink', name: 'Hyperlink', kind: 'character', rPr: [x('w:color', { 'w:val': '1F6B5C' }), x('w:u', { 'w:val': 'single' })] },
];

function stylesXml(): string {
  const side = (tag: string) => x(tag, { 'w:val': 'single', 'w:sz': 4, 'w:color': BORDER });
  const defs = STYLE_DEFS.map((d) =>
    x(
      'w:style',
      { 'w:type': d.kind ?? 'paragraph', 'w:styleId': d.id, 'w:default': d.id === 'Normal' ? 1 : undefined },
      x('w:name', { 'w:val': d.name }),
      (d.kind ?? 'paragraph') === 'paragraph' && d.id !== 'Normal' && x('w:basedOn', { 'w:val': 'Normal' }),
      d.next && x('w:next', { 'w:val': d.next }),
      d.pPr?.length && x('w:pPr', null, d.pPr),
      d.rPr?.length && x('w:rPr', null, d.rPr),
    ),
  );
  const table = x(
    'w:style',
    { 'w:type': 'table', 'w:styleId': 'TableGrid' },
    x('w:name', { 'w:val': 'Table Grid' }),
    x(
      'w:tblPr',
      null,
      x('w:tblBorders', null, ['w:top', 'w:left', 'w:bottom', 'w:right', 'w:insideH', 'w:insideV'].map(side)),
      x('w:tblCellMar', null, x('w:left', { 'w:w': 80, 'w:type': 'dxa' }), x('w:right', { 'w:w': 80, 'w:type': 'dxa' })),
    ),
  );
  const defaults = x(
    'w:docDefaults',
    null,
    x('w:rPrDefault', null, x('w:rPr', null, x('w:rFonts', { 'w:ascii': 'Calibri', 'w:hAnsi': 'Calibri', 'w:eastAsia': 'Calibri', 'w:cs': 'Calibri' }), x('w:sz', { 'w:val': 22 }))),
    x('w:pPrDefault', null, x('w:pPr', null, x('w:spacing', { 'w:after': 120, 'w:line': 276, 'w:lineRule': 'auto' }))),
  );
  return DECL + x('w:styles', { 'xmlns:w': NS.w }, defaults, defs, table);
}

function numberingXml(nums: string[]): string {
  const abstract = (id: number, fmt: 'bullet' | 'decimal') =>
    x(
      'w:abstractNum',
      { 'w:abstractNumId': id },
      x('w:multiLevelType', { 'w:val': 'hybridMultilevel' }),
      Array.from({ length: 9 }, (_, i) =>
        x(
          'w:lvl',
          { 'w:ilvl': i },
          x('w:start', { 'w:val': 1 }),
          x('w:numFmt', { 'w:val': fmt }),
          x('w:lvlText', { 'w:val': fmt === 'bullet' ? ['•', '◦', '▪'][i % 3]! : `%${i + 1}.` }),
          x('w:lvlJc', { 'w:val': 'left' }),
          x('w:pPr', null, x('w:ind', { 'w:left': 360 * (i + 2), 'w:hanging': 360 })),
        ),
      ),
    );
  return DECL + x('w:numbering', { 'xmlns:w': NS.w }, abstract(1, 'bullet'), abstract(2, 'decimal'), nums);
}

// ---------- package ----------

export function toDocx(doc: ExportDocument, files: DocxFiles = NO_FILES, exportedAt = new Date()): Uint8Array {
  const b = new Builder();
  const c = doc.conversation;
  const meta = [doc.siteName, c.model ?? '', c.createdAt ? `created ${c.createdAt.slice(0, 10)}` : '', `exported ${exportedAt.toISOString().slice(0, 16).replace('T', ' ')}`].filter(Boolean).join(' · ');
  b.body.push(para(run(doc.title, {}), 'Title'));
  b.body.push(para(run(meta, {}) + (doc.options.includeSourceLink && c.url ? run(' · ', {}) + link(b, c.url, run('source', { link: true })) : ''), 'Subtitle'));
  for (const branch of doc.branches) {
    if (branch.index > 0) b.body.push(para(run(`Branch ${branch.index + 1}`, {}), 'Heading1'));
    for (const m of branch.messages) {
      const head = `${m.label}${m.number !== null ? ` [${m.number}]` : ''}${m.message.role === 'assistant' && m.message.model ? ` (${m.message.model})` : ''}${m.timestamp ? ` — ${m.timestamp}` : ''}`;
      b.body.push(para(run(head, {}), 'Heading2'));
      for (const p of m.parts) b.body.push(partXml(p, b, files));
      for (const a of m.attachments) {
        if (m.parts.some((p) => p.type === 'image' && p.attachmentId === a.id)) continue;
        b.body.push(para(run(`Attachment: ${files.attachmentName(a.id) ?? a.name}`, { i: true })));
      }
      for (const a of m.artifacts) b.body.push(para(run(`Artifact: ${a.title}`, { i: true })));
    }
  }
  if (doc.options.includeCredit) b.body.push(para(run('Exported with Artifact', { i: true })));

  const sect = x(
    'w:sectPr',
    null,
    x('w:pgSz', { 'w:w': 12240, 'w:h': 15840 }),
    x('w:pgMar', { 'w:top': 1080, 'w:right': 1080, 'w:bottom': 1080, 'w:left': 1080, 'w:header': 720, 'w:footer': 720, 'w:gutter': 0 }),
  );
  const documentXml = DECL + x('w:document', { 'xmlns:w': NS.w, 'xmlns:r': NS.r, 'xmlns:wp': NS.wp, 'xmlns:a': NS.a, 'xmlns:pic': NS.pic }, x('w:body', null, b.body, sect));
  const docRels =
    DECL +
    x(
      'Relationships',
      { xmlns: NS.pr },
      x('Relationship', { Id: 'rId1', Type: REL.styles, Target: 'styles.xml' }),
      x('Relationship', { Id: 'rId2', Type: REL.numbering, Target: 'numbering.xml' }),
      b.rels,
    );
  const types =
    DECL +
    x(
      'Types',
      { xmlns: NS.ct },
      x('Default', { Extension: 'rels', ContentType: MIME.rels }),
      x('Default', { Extension: 'xml', ContentType: 'application/xml' }),
      ['png', 'jpeg', 'gif'].map((e) => x('Default', { Extension: e, ContentType: `image/${e}` })),
      x('Override', { PartName: '/word/document.xml', ContentType: MIME.main }),
      x('Override', { PartName: '/word/styles.xml', ContentType: MIME.styles }),
      x('Override', { PartName: '/word/numbering.xml', ContentType: MIME.numbering }),
      x('Override', { PartName: '/docProps/core.xml', ContentType: MIME.core }),
    );
  const pkgRels =
    DECL +
    x(
      'Relationships',
      { xmlns: NS.pr },
      x('Relationship', { Id: 'rId1', Type: REL.doc, Target: 'word/document.xml' }),
      x('Relationship', { Id: 'rId2', Type: REL.core, Target: 'docProps/core.xml' }),
    );
  const core =
    DECL +
    x(
      'cp:coreProperties',
      { 'xmlns:cp': NS.cp, 'xmlns:dc': 'http://purl.org/dc/elements/1.1/', 'xmlns:dcterms': 'http://purl.org/dc/terms/', 'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance' },
      x('dc:title', null, text(doc.title)),
      x('dc:creator', null, 'Artifact'),
      x('dcterms:created', { 'xsi:type': 'dcterms:W3CDTF' }, exportedAt.toISOString()),
    );
  return zipSync({
    '[Content_Types].xml': strToU8(types),
    '_rels/.rels': strToU8(pkgRels),
    'docProps/core.xml': strToU8(core),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(stylesXml()),
    'word/numbering.xml': strToU8(numberingXml(b.nums)),
    'word/_rels/document.xml.rels': strToU8(docRels),
    ...b.media,
  });
}
