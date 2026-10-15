// Sandboxed renderer for artifacts (SPEC §8): runs in the extension's
// sandbox (an opaque origin with no extension APIs), so an artifact's own
// scripts can run without reaching Artifact or the user's data. The parent
// sends one artifact by postMessage; nothing is sent back except the height.
interface RenderMsg {
  type: 'artifact-render';
  kind: 'html' | 'svg' | 'mermaid' | 'markdown' | 'text';
  content: string;
}

const out = document.getElementById('out')!;

function frame(html: string): void {
  const f = document.createElement('iframe');
  // The inner frame keeps scripts but no same-origin access, popups or top navigation.
  f.setAttribute('sandbox', 'allow-scripts allow-forms');
  f.srcdoc = html;
  out.replaceChildren(f);
}

async function render(m: RenderMsg): Promise<void> {
  out.className = '';
  if (m.kind === 'html') return frame(m.content);
  if (m.kind === 'svg') return frame(`<!doctype html><body style="margin:0">${m.content}</body>`);
  out.className = 'doc';
  if (m.kind === 'mermaid') {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    try {
      const { svg } = await mermaid.render(`m${Date.now()}`, m.content);
      out.innerHTML = svg;
    } catch (e) {
      out.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'err';
      p.textContent = (e as Error).message;
      const pre = document.createElement('pre');
      pre.textContent = m.content;
      out.append(p, pre);
    }
    return;
  }
  if (m.kind === 'markdown') {
    const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
    out.innerHTML = DOMPurify.sanitize(marked.parse(m.content, { async: false }) as string);
    return;
  }
  const pre = document.createElement('pre');
  pre.textContent = m.content;
  out.replaceChildren(pre);
}

window.addEventListener('message', (e) => {
  const m = e.data as Partial<RenderMsg> | null;
  if (!m || m.type !== 'artifact-render' || typeof m.content !== 'string') return;
  void render(m as RenderMsg);
});
// Tell the parent it can send.
window.parent.postMessage({ type: 'artifact-render-ready' }, '*');
