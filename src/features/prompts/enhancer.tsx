// Prompt enhancer, "current chat" mode (SPEC §6D): the chosen preset and the
// draft go into the composer for the user to send in this chat. When the
// reply finishes, a before/after view offers the rewritten prompt. Nothing
// is sent by Artifact.
import { useState } from 'preact/hooks';
import type { SiteAdapter } from '../../adapters/types';
import { mountShadow, pageIsDark } from '../../ui/shadow';
import { activeBranch, messageText } from '../../core/model/tree';
import { diffWords, type DiffOp } from '../../core/text/diff';
import { t } from '../../core/i18n/t';
import { toast } from './toast';

const FENCE = '"""';

/** The message the enhancer puts in the composer. */
export function enhanceRequest(instruction: string, draft: string): string {
  return `${instruction.trim()}\n\n${FENCE}\n${draft.trim()}\n${FENCE}`;
}

/** The rewritten prompt from a reply: drops a wrapping fence or quotes the model may add. */
export function extractEnhanced(reply: string): string {
  let s = reply.trim();
  const fenced = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(s) ?? /^"""\n?([\s\S]*?)\n?"""$/.exec(s);
  if (fenced) s = fenced[1]!.trim();
  if (s.length > 1 && /^["“]/.test(s) && /["”]$/.test(s)) s = s.slice(1, -1).trim();
  return s;
}

function Side({ ops, side }: { ops: DiffOp[]; side: 'del' | 'ins' }) {
  return (
    <div class="diff-side">
      {ops.map((o) => (o.type === 'eq' ? o.text : o.type === side ? <mark class={side}>{o.text}</mark> : null))}
    </div>
  );
}

function Review({ before, after, done }: { before: string; after: string; done(text: string | null): void }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(after);
  const ops = diffWords(before, text);
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && done(null)}>
      <div class="modal wide" role="dialog" aria-modal="true" aria-label={t('enhance_review')} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Escape' && done(null))}>
        <h2>{t('enhance_review')}</h2>
        <div class="diff">
          <div>
            <h3>{t('enhance_original')}</h3>
            <Side ops={ops} side="del" />
          </div>
          <div>
            <h3>{t('enhance_enhanced')}</h3>
            {edit ? <textarea rows={10} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} /> : <Side ops={ops} side="ins" />}
          </div>
        </div>
        <div class="actions">
          <button type="button" onClick={() => setEdit(!edit)}>
            {edit ? t('enhance_show_diff') : t('enhance_edit')}
          </button>
          <button type="button" onClick={() => done(before)}>
            {t('enhance_keep')}
          </button>
          <button type="button" class="primary" onClick={() => done(text)}>
            {t('enhance_use')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function reviewEnhancement(before: string, after: string): Promise<string | null> {
  return new Promise((resolve) => {
    const m = mountShadow('artifact-enhance');
    document.body.append(m.host);
    m.setTheme(pageIsDark());
    m.update(
      <Review
        before={before}
        after={after}
        done={(v) => {
          m.remove();
          resolve(v);
        }}
      />,
    );
  });
}

export class Enhancer {
  private pending: { original: string; request: string; sent: boolean } | null = null;
  private offs: Array<() => void> = [];

  constructor(private readonly adapter: SiteAdapter) {}

  start(): () => void {
    this.offs.push(
      this.adapter.onSend((text) => {
        // Editors normalize whitespace differently, so compare word sequences.
        const words = (x: string) => x.replace(/\s+/g, ' ').trim();
        if (this.pending && words(text) === words(this.pending.request)) this.pending.sent = true;
      }),
      this.adapter.onStreamingDone(() => void this.finish()),
      this.adapter.onConversationChange(() => (this.pending = null)),
    );
    return () => this.offs.forEach((f) => f());
  }

  async begin(instruction: string): Promise<void> {
    const original = this.adapter.getDraftText();
    if (!original.trim()) return toast(t('enhance_empty'));
    const request = enhanceRequest(instruction, original);
    if (!(await this.adapter.fillComposer(request))) return toast(t('composer_not_found'));
    this.pending = { original, request, sent: false };
    toast(t('enhance_send_hint'));
  }

  private async finish(): Promise<void> {
    const p = this.pending;
    if (!p?.sent) return;
    this.pending = null;
    const read = await this.adapter.readConversation();
    const msgs = read ? activeBranch(read.value).filter((m) => !m.hidden) : [];
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== 'assistant') return;
    const chosen = await reviewEnhancement(p.original, extractEnhanced(messageText(last)));
    if (chosen !== null) await this.adapter.fillComposer(chosen);
  }
}
