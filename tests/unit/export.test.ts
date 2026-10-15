import { describe, expect, it } from 'vitest';
import { sampleConversation } from './sample';
import { buildDocument } from '../../src/core/export/document';
import { toMarkdown } from '../../src/core/export/markdown';
import { toText } from '../../src/core/export/text';
import { buildArchive, fromExportedConversation, parseArchive, toJson } from '../../src/core/export/json';

const files = {
  attachmentPath: (id: string) => (id === 'img1' ? 'files/chart.png' : id === 'f1' ? 'files/notes.pdf' : null),
  artifactPath: (id: string) => (id === 'art1' ? 'artifacts/Demo page.html' : null),
};

describe('Markdown export', () => {
  it('writes frontmatter, the active branch, code with a safe fence, math and file links', () => {
    const md = toMarkdown(buildDocument(sampleConversation()), files, new Date('2026-02-01T00:00:00Z'));
    expect(md).toMatchSnapshot();
    expect(md.startsWith('---\ntitle: "Lorem ipsum: dolor"\nsite: "Claude"\n')).toBe(true);
    expect(md).toContain('````ts\nconst a = "```";\n````');
    expect(md).toContain('$x^2$');
    expect(md).toContain('$$\nE = mc^2\n$$');
    expect(md).toContain('![chart](files/chart.png)');
    expect(md).toContain('- Attachment: [notes.pdf](files/notes.pdf)');
    expect(md).toContain('[Artifact](artifacts/Demo%20page.html)');
    expect(md).toContain('Duis aute irure?');
    expect(md).not.toContain('Ut enim ad minim?');
    expect(md).not.toContain('Consectetur.');
  });

  it('adds other branches, numbering, a ToC and thinking on request', () => {
    const md = toMarkdown(
      buildDocument(sampleConversation(), { branches: 'all', numbering: 'per-turn', includeToc: true, includeThinking: true }),
      files,
    );
    expect(md).toContain('## Branch 2');
    expect(md).toContain('Ut enim ad minim?');
    expect(md).toContain('## User [1]');
    expect(md).toContain('## Contents');
    expect(md).toContain('> **Thinking**');
  });

  it('exports only selected messages', () => {
    const md = toMarkdown(buildDocument(sampleConversation(), { selection: ['a2b'] }));
    expect(md).toContain('Excepteur sint.');
    expect(md).not.toContain('Lorem ipsum dolor sit amet?');
  });
});

describe('Text export', () => {
  it('is readable plain text', () => {
    const txt = toText(buildDocument(sampleConversation()));
    expect(txt).toContain('Lorem ipsum: dolor\n==================');
    expect(txt).toContain('    const a = "```";');
    expect(txt).not.toContain("**");
  });
});

describe('JSON archive', () => {
  it('round-trips through the schema', () => {
    const conv = sampleConversation();
    const json = toJson(buildArchive([conv], '1.2.3'));
    const parsed = parseArchive(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.archive.generator.version).toBe('1.2.3');
    const back = fromExportedConversation(parsed.archive.conversations[0]!);
    expect(back).toEqual(conv);
    expect(parsed.archive.conversations[0]!.activeBranch.map((m) => m.id)).toEqual(['u1', 'a1', 'u2b', 'a2b']);
    expect(parsed.archive.conversations[0]!.source_ace).toEqual({ platform: 'Claude', url: conv.url, title: conv.title });
  });

  it('rejects other files with a reason', () => {
    expect(parseArchive('nope')).toMatchObject({ ok: false });
    const res = parseArchive(JSON.stringify({ schemaVersion: 2 }));
    expect(res.ok).toBe(false);
  });
});
