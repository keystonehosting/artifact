import { describe, expect, it } from 'vitest';
import { htmlToParts } from '../../src/core/dom/html-to-parts';

function el(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('htmlToParts', () => {
  it('converts prose, lists, links and tables to Markdown', () => {
    const parts = htmlToParts(
      el('<p>Hello <strong>bold</strong> and <a href="https://x.test">link</a>.</p><ul><li>one</li><li>two<ol><li>nested</li></ol></li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2|3</td></tr></table>'),
    );
    expect(parts).toHaveLength(1);
    const text = parts[0]!.type === 'text' ? parts[0]!.text : '';
    expect(text).toContain('Hello **bold** and [link](https://x.test).');
    expect(text).toContain('- one\n- two\n  1. nested');
    expect(text).toContain('| A | B |\n| --- | --- |\n| 1 | 2\\|3 |');
  });

  it('extracts code blocks with their language', () => {
    const parts = htmlToParts(el('<p>Code:</p><pre><code class="language-python">print(1)\n</code></pre><p>after</p>'));
    expect(parts.map((p) => p.type)).toEqual(['text', 'code', 'text']);
    expect(parts[1]).toEqual({ type: 'code', language: 'python', code: 'print(1)' });
  });

  it('extracts KaTeX math from its TeX annotation', () => {
    const katex = (tex: string) =>
      `<span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span><span class="katex-html">garbage</span></span>`;
    const parts = htmlToParts(el(`<p>Inline ${katex('x^2')} here.</p><div class="katex-display">${katex('\\int_0^1 f')}</div>`));
    expect(parts[0]).toEqual({ type: 'text', text: 'Inline $x^2$ here.' });
    expect(parts[1]).toEqual({ type: 'math', tex: '\\int_0^1 f', display: true });
  });

  it('skips buttons and hidden elements', () => {
    const parts = htmlToParts(el('<p>keep<button>Copy</button><span aria-hidden="true">x</span></p>'));
    expect(parts).toEqual([{ type: 'text', text: 'keep' }]);
  });

  it('emits image parts when the caller maps them to attachments', () => {
    const parts = htmlToParts(el('<p>see</p><img src="https://img.test/a.png" alt="chart">'), { onImage: () => 'att-1' });
    expect(parts[1]).toEqual({ type: 'image', attachmentId: 'att-1', alt: 'chart' });
  });
});
