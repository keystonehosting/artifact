// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { sampleConversation } from './sample';
import { buildDocument } from '../../src/core/export/document';
import { toHtml } from '../../src/core/export/html';
import { toDocx, imageSize } from '../../src/core/export/docx';
import { buildBundle, artifactExtension } from '../../src/core/export/bundle';
import { obsidianUri } from '../../src/core/export/obsidian';
import { markdownToHtml } from '../../src/core/export/render';
import DOMPurify from 'dompurify';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const at = new Date('2026-02-01T00:00:00Z');

describe('HTML export', () => {
  it('is a standalone, script-free document with MathML', () => {
    const html = toHtml(buildDocument(sampleConversation()), { attachmentHref: (id) => (id === 'img1' ? 'files/chart.png' : null), artifactHref: () => 'artifacts/Demo page.html' }, at);
    expect(html).toMatchSnapshot();
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<math');
    expect(html).toContain('<img src="files/chart.png" alt="chart">');
    expect(html).toContain('const a = &quot;```&quot;;');
  });

  it('sanitizes chat HTML', () => {
    expect(DOMPurify.isSupported).toBe(true);
    const out = markdownToHtml('hi <img src=x onerror="alert(1)"> <script>alert(2)</script> [a](javascript:alert(3))');
    expect(out).not.toMatch(/onerror|<script|javascript:/i);
  });
});

describe('DOCX export', () => {
  it('writes a valid OOXML package with headings, code and an embedded image', () => {
    const bytes = toDocx(buildDocument(sampleConversation()), { image: (id) => (id === 'img1' ? { bytes: PNG, mimeType: 'image/png' } : null), attachmentName: () => null }, at);
    const zip = unzipSync(bytes);
    expect(Object.keys(zip).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/media/image1.png', 'word/numbering.xml', 'word/styles.xml'].sort(),
    );
    const doc = strFromU8(zip['word/document.xml']!);
    expect(doc).toContain('<w:pStyle w:val="Title"/>');
    expect(doc).toContain('Lorem ipsum: dolor');
    expect(doc).toContain('<w:pStyle w:val="CodeBlock"/>');
    expect(doc).toContain('r:embed=');
    expect(doc).not.toContain('Ut enim ad minim?');
    expect(() => new DOMParser().parseFromString(doc, 'application/xml')).not.toThrow();
    expect(new DOMParser().parseFromString(doc, 'application/xml').querySelector('parsererror')).toBeNull();
  });

  it('reads image sizes from headers', () => {
    expect(imageSize(PNG)).toEqual({ w: 1, h: 1 });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('ZIP bundle with real files', () => {
  it('writes the document, the files, the artifact with versions, and reports failures', async () => {
    const conv = sampleConversation();
    const out = await buildBundle({
      conv,
      format: 'md',
      options: { ...buildDocument(conv).options, filenameTemplate: '{title}' },
      version: '9.9.9',
      now: at,
      download: async (a) => {
        if (a.id === 'f1') throw new Error('HTTP 404');
        return { name: 'chart.png', mimeType: 'image/png', bytes: PNG };
      },
    });
    expect(out.filename).toBe('Lorem ipsum dolor.zip');
    const zip = unzipSync(out.bytes);
    const names = Object.keys(zip).sort();
    expect(names).toEqual([
      'Lorem ipsum dolor/Lorem ipsum dolor.md',
      'Lorem ipsum dolor/MISSING_FILES.txt',
      'Lorem ipsum dolor/artifacts/Demo page.html',
      'Lorem ipsum dolor/artifacts/versions/Demo page.v1.html',
      'Lorem ipsum dolor/files/chart.png',
    ]);
    expect(strFromU8(zip['Lorem ipsum dolor/artifacts/Demo page.html']!)).toBe('<p>v2</p>');
    const md = strFromU8(zip['Lorem ipsum dolor/Lorem ipsum dolor.md']!);
    expect(md).toContain('![chart](files/chart.png)');
    expect(md).toContain('- Attachment: notes.pdf (HTTP 404)');
    expect(strFromU8(zip['Lorem ipsum dolor/MISSING_FILES.txt']!)).toContain('notes.pdf: HTTP 404');
    expect(out.failures).toEqual([{ name: 'notes.pdf', reason: 'HTTP 404' }]);
  });

  it('saves a single file when there is nothing to bundle', async () => {
    const conv = sampleConversation();
    const out = await buildBundle({
      conv,
      format: 'txt',
      options: { ...buildDocument(conv).options, includeImages: false, includeFiles: false, includeArtifacts: false, filenameTemplate: '{title}' },
      version: '1',
      download: async () => Promise.reject(new Error('not called')),
    });
    expect(out.filename).toBe('Lorem ipsum dolor.txt');
    expect(strFromU8(out.bytes)).toContain('Lorem ipsum: dolor');
  });

  it('names artifact files by type and language', () => {
    expect(artifactExtension({ type: 'application/vnd.ant.react', title: 'App' })).toBe('jsx');
    expect(artifactExtension({ type: 'text/x-python', title: 'x' })).toBe('py');
    expect(artifactExtension({ type: 'application/vnd.ant.code', language: 'rust', title: 'x' })).toBe('rs');
    expect(artifactExtension({ type: 'text/markdown', title: 'notes.txt' })).toBe('txt');
  });
});

describe('Obsidian', () => {
  it('builds a new-note URI, falling back to the clipboard for long notes', () => {
    expect(obsidianUri('Vault', 'AI Chats', 'A/B: c', '# hi')).toBe('obsidian://new?vault=Vault&file=AI%20Chats%2FAB%20c&content=%23%20hi');
    expect(obsidianUri('V', '', 'n', 'x'.repeat(40_000))).toContain('clipboard=true');
  });
});
