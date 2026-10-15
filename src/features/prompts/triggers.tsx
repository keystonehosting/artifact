// Composer triggers (SPEC §6D, §6I): `//` inserts a saved prompt, `..` runs
// a chain, `@@` pulls in another chat as context. Typing after the trigger
// filters the list; arrows move, Enter/Tab picks, Escape closes. Pasted text
// never opens the list. Nothing is sent unless a prompt is set to send.
import { browser } from 'wxt/browser';
import type { SiteAdapter } from '../../adapters/types';
import type { ChainRow, ChatRow, PromptRow } from '../../core/db/db';
import { lib } from '../../core/library/client';
import { mountShadow, pageIsDark, type ShadowMount } from '../../ui/shadow';
import { parseTemplate, renderTemplate, type Parsed } from '../../core/prompts/template';
import { mentionBlock } from '../../core/crossai/carry';
import { SITES } from '../../core/sites/sites';
import { t } from '../../core/i18n/t';
import { applyPrompt } from './insert';
import { askVariables } from './var-form';
import { toast } from './toast';
import type { Runner } from './runner';

type Kind = 'prompt' | 'chain' | 'mention';
type Item = { kind: 'prompt'; row: PromptRow } | { kind: 'chain'; row: ChainRow } | { kind: 'mention'; row: ChatRow };

const RECENT_MENTIONS = 'mentions:recent';
const MAX_ITEMS = 50;

/** Finds an open trigger at the end of the composer text. */
export function findTrigger(text: string): { kind: Kind; query: string; before: string } | null {
  const mention = /(^|\s)@@([^\n@]{0,49})$/.exec(text);
  if (mention) return { kind: 'mention', query: mention[2]!, before: text.slice(0, mention.index + mention[1]!.length) };
  const m = /(^|\s)(\/\/|\.\.)([^\s/.]*)$/.exec(text);
  if (!m) return null;
  return { kind: m[2] === '//' ? 'prompt' : 'chain', query: m[3]!, before: text.slice(0, m.index + m[1]!.length) };
}

const norm = (s: string) => s.toLowerCase().replace(/[-_]+/g, ' ');

function label(i: Item): string {
  return i.kind === 'mention' ? i.row.title : i.row.name;
}

function ago(ms: number | null): string {
  if (!ms) return '';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return t('ago_today');
  if (days === 1) return t('ago_yesterday');
  if (days < 30) return t('ago_days', String(days));
  return new Date(ms).toLocaleDateString();
}

export class Triggers {
  private mount: ShadowMount | null = null;
  private open: { kind: Kind; query: string; before: string } | null = null;
  private items: Item[] = [];
  private active = 0;
  private pastedAt = 0;
  private cache: { prompts: PromptRow[]; chains: ChainRow[]; chats: ChatRow[]; recent: string[] } | null = null;

  constructor(
    private readonly adapter: SiteAdapter,
    private readonly runner: Runner,
  ) {}

  start(): () => void {
    const onInput = (e: Event) => {
      const el = this.adapter.getComposerElement();
      if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      // Let the editor apply the keystroke first.
      setTimeout(() => void this.check(), 0);
    };
    const onPaste = () => (this.pastedAt = Date.now());
    const onKey = (e: KeyboardEvent) => this.key(e);
    const onMsg = (m: unknown) => {
      if ((m as { type?: string })?.type === 'lib:changed') this.cache = null;
    };
    document.addEventListener('input', onInput, true);
    document.addEventListener('paste', onPaste, true);
    window.addEventListener('keydown', onKey, true);
    browser.runtime.onMessage.addListener(onMsg);
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('paste', onPaste, true);
      window.removeEventListener('keydown', onKey, true);
      browser.runtime.onMessage.removeListener(onMsg);
      this.close();
    };
  }

  private async load(): Promise<NonNullable<Triggers['cache']>> {
    if (!this.cache) {
      const [prompts, chains, chats, recent] = await Promise.all([lib('prompts', 'recent'), lib('chains'), lib('chats', { sort: 'opened', limit: 300 }), lib('kvGet', RECENT_MENTIONS)]);
      this.cache = { prompts, chains, chats: chats.rows, recent: (recent as string[] | null) ?? [] };
    }
    return this.cache;
  }

  private async check(): Promise<void> {
    const text = this.adapter.getDraftText();
    const trig = findTrigger(text);
    // Pasted text that starts with a trigger is the user's content, not a command.
    if (!trig || (Date.now() - this.pastedAt < 400 && !this.open)) return this.close();
    const c = await this.load();
    const q = norm(trig.query.trim());
    let items: Item[];
    if (trig.kind === 'prompt') items = c.prompts.map((row) => ({ kind: 'prompt' as const, row }));
    else if (trig.kind === 'chain') items = c.chains.map((row) => ({ kind: 'chain' as const, row }));
    else {
      const here = `${this.adapter.id}:${this.adapter.detectConversation() ?? ''}`;
      const rank = (r: ChatRow) => {
        const i = c.recent.indexOf(r.id);
        return i < 0 ? 99 : i;
      };
      items = c.chats
        .filter((r) => r.id !== here && r.indexedAt)
        .sort((a, b) => rank(a) - rank(b))
        .map((row) => ({ kind: 'mention' as const, row }));
    }
    this.items = items.filter((i) => !q || norm(label(i)).includes(q)).slice(0, MAX_ITEMS);
    if (!this.open || this.open.kind !== trig.kind) this.active = 0;
    this.active = Math.min(this.active, Math.max(0, this.items.length - 1));
    this.open = trig;
    this.render();
  }

  private key(e: KeyboardEvent): void {
    if (!this.open) return;
    const el = this.adapter.getComposerElement();
    if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
    const n = this.items.length;
    const handled = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    if (e.key === 'ArrowDown' && n) {
      handled();
      this.active = (this.active + 1) % n;
      this.render();
    } else if (e.key === 'ArrowUp' && n) {
      handled();
      this.active = (this.active - 1 + n) % n;
      this.render();
    } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && n) {
      handled();
      void this.pick(this.items[this.active]!);
    } else if (e.key === 'Escape') {
      handled();
      this.close();
    }
  }

  /** Opens a list from a button, keeping the whole draft in front of the pick. */
  openList(kind: Kind): void {
    const draft = this.adapter.getDraftText();
    this.open = { kind, query: '', before: draft.trim() ? `${draft.replace(/\s+$/, '')} ` : '' };
    void this.load().then(() => {
      if (this.open?.kind !== kind) return;
      const c = this.cache!;
      this.items = (kind === 'prompt' ? c.prompts.map((row) => ({ kind, row })) : c.chains.map((row) => ({ kind: 'chain' as const, row }))).slice(0, MAX_ITEMS) as Item[];
      this.active = 0;
      this.render();
      this.adapter.getComposerElement()?.focus();
    });
  }

  close(): void {
    this.open = null;
    this.mount?.remove();
    this.mount = null;
  }

  private async pick(item: Item): Promise<void> {
    const before = this.open?.before ?? '';
    this.close();
    try {
      if (item.kind === 'prompt') {
        await this.adapter.fillComposer(before);
        await applyPrompt(this.adapter, item.row, { before });
      } else if (item.kind === 'chain') await this.runChain(item.row, before);
      else await this.mention(item.row, before);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async runChain(chain: ChainRow, before = ''): Promise<void> {
    // One form for every variable in every step; a name shared by steps is asked once.
    const merged: Parsed = { fields: [], constants: {}, hasVariables: false };
    for (const s of chain.steps) {
      const p = parseTemplate(s.text);
      for (const f of p.fields) if (!merged.fields.some((x) => x.name === f.name)) merged.fields.push(f);
      Object.assign(merged.constants, p.constants);
    }
    let values = {};
    if (merged.fields.length) {
      const r = await askVariables(chain.name, merged);
      if (!r) return;
      values = r.values;
    }
    const steps = chain.steps.map((s, i) => ({ ...s, text: `${i === 0 && before.trim() ? `${before.trim()} ` : ''}${renderTemplate(s.text, values)}` }));
    void lib('useChain', chain.id);
    this.runner.start(chain.name, steps);
  }

  private async mention(chat: ChatRow, before: string): Promise<void> {
    const conv = await lib('conversation', chat.id);
    if (!conv) {
      await this.adapter.fillComposer(before);
      toast(t('mention_not_stored'));
      return;
    }
    const block = mentionBlock(conv, SITES[chat.site]?.name ?? chat.site);
    await this.adapter.fillComposer(`${before}${before && !before.endsWith('\n') ? '\n' : ''}${block}\n`);
    const recent = ((await lib('kvGet', RECENT_MENTIONS)) as string[] | null) ?? [];
    void lib('kvSet', RECENT_MENTIONS, [chat.id, ...recent.filter((x) => x !== chat.id)].slice(0, 5));
  }

  private render(): void {
    const anchor = this.adapter.getComposerAnchor() ?? this.adapter.getComposerElement();
    if (!this.open || !anchor) return this.close();
    if (!this.mount) {
      this.mount = mountShadow('artifact-picker');
      document.body.append(this.mount.host);
    }
    this.mount.setTheme(pageIsDark());
    const r = anchor.getBoundingClientRect();
    const kind = this.open.kind;
    const empty = kind === 'prompt' ? t('picker_no_prompts') : kind === 'chain' ? t('picker_no_chains') : t('picker_no_chats');
    const title = kind === 'prompt' ? t('picker_prompts') : kind === 'chain' ? t('picker_chains') : t('picker_mentions');
    this.mount.update(
      <div class="picker" style={{ left: `${Math.max(8, r.left)}px`, bottom: `${Math.max(8, innerHeight - r.top + 6)}px`, width: `${Math.min(Math.max(280, r.width), 520)}px` }}>
        <div class="picker-head">{title}</div>
        {this.items.length === 0 ? <p class="muted picker-empty">{empty}</p> : null}
        <ul role="listbox" aria-label={title}>
          {this.items.map((item, i) => (
            <li
              role="option"
              aria-selected={i === this.active}
              class={i === this.active ? 'on' : ''}
              ref={(el) => {
                if (i === this.active) el?.scrollIntoView({ block: 'nearest' });
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void this.pick(item)}
            >
              <span class="name">{label(item)}</span>
              <span class="muted meta">
                {item.kind === 'prompt'
                  ? `${item.row.category}${item.row.uses ? ` · ${t('picker_uses', String(item.row.uses))}` : ''}`
                  : item.kind === 'chain'
                    ? t('picker_steps', String(item.row.steps.length))
                    : `${SITES[item.row.site]?.name ?? item.row.site} · ${ago(item.row.lastOpenedAt ?? item.row.indexedAt)} · ${t('picker_messages', String(item.row.messageCount))}`}
              </span>
            </li>
          ))}
        </ul>
      </div>,
    );
  }
}
