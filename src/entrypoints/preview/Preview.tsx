// Full-page preview of a chat (SPEC §6F): reading view, Print / Save as PDF
// (rendered locally by the browser's print engine), PNG at 1x or 2x, and
// copy as Markdown. Images come from the source tab's content script.
import { useEffect, useRef, useState } from 'preact/hooks';
import html2canvas from 'html2canvas-pro';
import type { Conversation } from '../../core/schema/archive';
import { buildDocument, type ExportOptions } from '../../core/export/document';
import { toHtml, EXPORT_CSS } from '../../core/export/html';
import { toMarkdown } from '../../core/export/markdown';
import { takePreview, tabDownloader } from '../../core/export/runner';
import { formatFilename } from '../../core/util/filename';
import { SITES } from '../../core/sites/sites';
import { saveFile } from '../../core/export/download';
import { bytesToBase64 } from '../../core/util/bytes';
import { t } from '../../core/i18n/t';

// Chromium caps a canvas side at 32767 px; slice taller captures into parts.
const MAX_CANVAS = 32000;

export function Preview() {
  const [data, setData] = useState<{ conv: Conversation; options: ExportOptions } | null>(null);
  const [html, setHtml] = useState<string>('');
  const [status, setStatus] = useState('');
  const frame = useRef<HTMLDivElement>(null);
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  const action = params.get('action') ?? 'view';

  useEffect(() => {
    void (async () => {
      const got = await takePreview(params.get('key') ?? '');
      if (!got) return setStatus(t('preview_missing'));
      setData(got);
      document.title = got.conv.title;
      const doc = buildDocument(got.conv, got.options);
      const urls = new Map<string, string>();
      if (tab && got.options.includeImages) {
        const dl = tabDownloader(Number(tab), got.conv);
        for (const b of doc.branches)
          for (const m of b.messages)
            for (const p of m.parts) {
              if (p.type !== 'image' || urls.has(p.attachmentId)) continue;
              try {
                const f = await dl({ id: p.attachmentId });
                urls.set(p.attachmentId, `data:${f.mimeType};base64,${bytesToBase64(f.bytes)}`);
              } catch {
                // the reading view shows "not captured" for this image
              }
            }
      }
      const full = toHtml(doc, { attachmentHref: (id) => urls.get(id) ?? null, artifactHref: () => null });
      setHtml(/<main>([\s\S]*)<\/main>/.exec(full)?.[1] ?? '');
    })();
  }, []);

  useEffect(() => {
    if (!html || !data) return;
    if (action === 'pdf') setTimeout(() => window.print(), 300);
    if (action === 'png' || action === 'png2x') void png(action === 'png2x' ? 2 : 1);
  }, [html]);

  const base = data ? formatFilename(data.options.filenameTemplate, { platform: SITES[data.conv.site].name, title: data.conv.title, model: data.conv.model, id: data.conv.siteChatId }) : 'chat';

  async function png(scale: number) {
    const el = frame.current;
    if (!el) return;
    setStatus(t('preview_rendering'));
    const total = el.scrollHeight;
    const sliceCss = Math.floor(MAX_CANVAS / scale);
    const parts = Math.max(1, Math.ceil(total / sliceCss));
    for (let i = 0; i < parts; i++) {
      const canvas = await html2canvas(el, {
        scale,
        y: i * sliceCss,
        height: Math.min(sliceCss, total - i * sliceCss),
        windowHeight: total,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (blob) await saveFile(`${base}${scale > 1 ? ' @2x' : ''}${parts > 1 ? ` (${i + 1} of ${parts})` : ''}.png`, blob, 'image/png');
    }
    setStatus(t('preview_saved_png', String(parts)));
  }

  return (
    <div>
      <style>{EXPORT_CSS}{`.bar{position:sticky;top:0;z-index:1;display:flex;gap:6px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--line);background:var(--bg)}.bar .status{color:var(--fg2);font-size:12px;margin-left:auto}@media print{.bar{display:none}}`}</style>
      <div class="bar">
        <button class="primary" onClick={() => window.print()} disabled={!html}>{t('preview_print')}</button>
        <button onClick={() => png(1)} disabled={!html}>PNG</button>
        <button onClick={() => png(2)} disabled={!html}>PNG 2×</button>
        <button onClick={() => data && navigator.clipboard.writeText(toMarkdown(buildDocument(data.conv, data.options))).then(() => setStatus(t('export_copied')))} disabled={!data}>
          {t('export_copy_markdown')}
        </button>
        <span class="status" role="status">{status}</span>
      </div>
      <main ref={frame} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
