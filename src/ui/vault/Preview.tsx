// Artifact preview. Chrome and Edge render inside the extension's sandbox
// page, where an artifact's own scripts can run in an opaque origin. Firefox
// has no extension sandbox pages, so HTML there renders with scripts off.
import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { markdownToHtml } from '../../core/export/render';
import { t } from '../../core/i18n/t';

export type PreviewKind = 'html' | 'svg' | 'mermaid' | 'markdown' | 'text';

const SANDBOX = import.meta.env.BROWSER !== 'firefox';

export function previewKind(type: string, language: string | null): PreviewKind {
  if (type === 'text/html') return 'html';
  if (type === 'image/svg+xml' || language === 'svg') return 'svg';
  if (type === 'application/vnd.ant.mermaid' || language === 'mermaid') return 'mermaid';
  if (type === 'text/markdown' || language === 'markdown' || type === 'document') return 'markdown';
  return 'text';
}

export function ArtifactPreview({ kind, content }: { kind: PreviewKind; content: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!SANDBOX) return;
    const on = (e: MessageEvent) => {
      if (e.source === ref.current?.contentWindow && (e.data as { type?: string })?.type === 'artifact-render-ready') setReady(true);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  useEffect(() => {
    if (SANDBOX && ready) ref.current?.contentWindow?.postMessage({ type: 'artifact-render', kind, content }, '*');
  }, [ready, kind, content]);

  if (SANDBOX) return <iframe ref={ref} class="preview-frame" title={t('vault_preview')} src={browser.runtime.getURL('/render.html')} />;
  if (kind === 'html' || kind === 'svg') return <iframe class="preview-frame" title={t('vault_preview')} sandbox="" srcdoc={kind === 'svg' ? `<body style="margin:0">${content}</body>` : content} />;
  if (kind === 'markdown') return <div class="preview-doc" dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />;
  return (
    <>
      {kind === 'mermaid' ? <p class="muted">{t('vault_mermaid_firefox')}</p> : null}
      <pre class="preview-doc">{content}</pre>
    </>
  );
}
