import { describe, expect, it } from 'vitest';
import { defaultValues, needsForm, parseTemplate, renderTemplate } from '../../src/core/prompts/template';
import starter from '../../src/core/prompts/starter-pack.json';

const now = new Date(2026, 2, 4, 9, 5);

describe('prompt templates', () => {
  it('asks each variable once and prints it everywhere', () => {
    const src = 'Write about {{topic}}. Then summarize {{topic}} in {{length:3 lines # how long}}.';
    const p = parseTemplate(src);
    expect(p.fields.map((f) => [f.name, f.default, f.help])).toEqual([
      ['topic', '', ''],
      ['length', '3 lines', 'how long'],
    ]);
    expect(renderTemplate(src, { topic: 'tides', length: '2 lines' }, { now })).toBe('Write about tides. Then summarize tides in 2 lines.');
  });

  it('a later default upgrades an earlier bare reference', () => {
    const p = parseTemplate('{{x}} and {{x:fallback}}');
    expect(p.fields).toHaveLength(1);
    expect(p.fields[0]!.default).toBe('fallback');
  });

  it('supports single and multiple choice with defaults and an other box', () => {
    const src = 'Tone: {{tone|formal|*casual|...}}. Cover {{+parts|*intro|body|*end}}.';
    const p = parseTemplate(src);
    expect(p.fields[0]).toMatchObject({ kind: 'choice', options: ['formal', 'casual'], default: 'casual', other: true });
    expect(p.fields[1]).toMatchObject({ kind: 'multi', options: ['intro', 'body', 'end'], default: ['intro', 'end'] });
    expect(renderTemplate(src, defaultValues(p), { now })).toBe('Tone: casual. Cover intro, end.');
  });

  it('hidden fields are asked but printed only where referenced; constants are never asked', () => {
    const src = '{{!who:experts}}{{=lang:British English}}Explain for {{who}} in {{lang}}.';
    const p = parseTemplate(src);
    expect(p.fields.map((f) => f.name)).toEqual(['who']);
    expect(p.constants).toEqual({ lang: 'British English' });
    expect(renderTemplate(src, { who: 'children' }, { now })).toBe('Explain for children in British English.');
  });

  it('fills built-ins, keeps escapes, and drops lines left empty', () => {
    const src = 'Date {{date}} {{time}}\n{{notes}}\nText: {{selection}}\nLiteral \\{{x}}';
    expect(renderTemplate(src, { notes: '' }, { now, selection: 'abc' })).toBe('Date 2026-03-04 09:05\nText: abc\nLiteral {{x}}');
    expect(needsForm('Only {{date}} here')).toBe(false);
    expect(needsForm('{{file:Spec}} please review')).toBe(true);
    expect(renderTemplate('{{file:Spec}} please review', {}, { now })).toBe(' please review');
  });

  it('every starter prompt parses, and its license and source are recorded', () => {
    expect(starter.license).toBe('CC0-1.0');
    expect(starter.commit).toMatch(/^[0-9a-f]{40}$/);
    for (const item of starter.items) {
      const p = parseTemplate(item.body);
      expect(p.fields.every((f) => f.kind === 'text')).toBe(true);
      expect(renderTemplate(item.body, defaultValues(p), { now })).not.toContain('{{');
    }
  });
});
