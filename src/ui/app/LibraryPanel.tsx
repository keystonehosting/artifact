// Library tab (SPEC §6B): bookmarks, highlights, message labels, chat notes,
// reminders and Smart Tags from every site in one place.
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ChatRow, TagRuleRow } from '../../core/db/db';
import { lib } from '../../core/library/client';
import { COLORS, COLOR_VALUES, type ColorName } from '../colors';
import { ConfirmButton, InlineEdit, Section, Tabs } from '../components';
import { Icon } from '../icons';
import { useResolvedDark } from './theme';
import { fmtDate, openChat, useLib } from './library';
import { t } from '../../core/i18n/t';
import { SITES, TIER1_SITES } from '../../core/sites/sites';

type View = 'bookmarks' | 'highlights' | 'labels' | 'notes' | 'reminders' | 'tags';

function useChats(ids: string[]): Map<string, ChatRow> {
  const [rows] = useLib('chatsById', [ids], [ids.join()]);
  return new Map((rows ?? []).map((r) => [r.id, r]));
}

function ColorFilter({ value, onChange }: { value: string; onChange(v: string): void }) {
  const dark = useResolvedDark();
  return (
    <div class="row" role="radiogroup" aria-label={t('library_color_filter')}>
      <button role="radio" aria-checked={!value} class={!value ? 'active' : ''} onClick={() => onChange('')}>
        {t('library_all_colors')}
      </button>
      {COLORS.map((c) => (
        <button role="radio" aria-checked={value === c} aria-label={t(`color_${c}`)} class="swatch" style={{ background: COLOR_VALUES[c][dark ? 'dark' : 'light'] }} onClick={() => onChange(value === c ? '' : c)} />
      ))}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  const dark = useResolvedDark();
  return <span class="dot" aria-label={t(`color_${color}`)} style={{ background: COLOR_VALUES[color as ColorName]?.[dark ? 'dark' : 'light'] }} />;
}

function ChatLink({ chat, chatId, messageId }: { chat: ChatRow | undefined; chatId: string; messageId?: string | null }) {
  const [err, setErr] = useState('');
  return (
    <>
      <button class="link" title={chat?.url ?? ''} onClick={() => void openChat({ id: chatId, url: chat?.url ?? null }, messageId ?? null).catch((e: Error) => setErr(e.message))}>
        {chat?.title ?? chatId}
      </button>
      <span class="site-tag">{chat ? SITES[chat.site]?.name : chatId.split(':')[0]}</span>
      {err ? <span class="status error">{err}</span> : null}
    </>
  );
}

function NoteField({ value, onSave }: { value: string; onSave(v: string): void }) {
  return (
    <textarea
      class="note"
      rows={2}
      aria-label={t('library_note')}
      placeholder={t('library_note')}
      value={value}
      onBlur={(e) => {
        const v = (e.target as HTMLTextAreaElement).value;
        if (v !== value) onSave(v);
      }}
    />
  );
}

export function LibraryPanel() {
  const [view, setView] = useState<View>('bookmarks');
  return (
    <div class="content">
      <Tabs<View>
        tabs={[
          ['bookmarks', t('library_bookmarks')],
          ['highlights', t('library_highlights')],
          ['labels', t('library_labels')],
          ['notes', t('library_notes')],
          ['reminders', t('library_reminders')],
          ['tags', t('library_tags')],
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'bookmarks' && <Bookmarks />}
      {view === 'highlights' && <Highlights />}
      {view === 'labels' && <Labels />}
      {view === 'notes' && <Notes />}
      {view === 'reminders' && <Reminders />}
      {view === 'tags' && <Tags />}
      <Section title={t('vault_title')}>
        <p class="hint muted">{t('vault_hint')}</p>
        <div class="row">
          {(['artifacts', 'media', 'snippets'] as const).map((v) => (
            <button onClick={() => void browser.tabs.create({ url: browser.runtime.getURL(`/vault.html?view=${v}`) })}>{t(`vault_${v}`)}</button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Bookmarks() {
  const [rows] = useLib('bookmarks', []);
  const [color, setColor] = useState('');
  const [q, setQ] = useState('');
  const list = (rows ?? []).filter((b) => (!color || b.color === color) && (!q || `${b.snippet} ${b.note}`.toLowerCase().includes(q.toLowerCase())));
  const chats = useChats(list.map((b) => b.chatId));
  return (
    <Section title={t('library_bookmarks_count', String(list.length))}>
      <input type="search" aria-label={t('library_filter')} placeholder={t('library_filter')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <ColorFilter value={color} onChange={setColor} />
      {list.length === 0 ? <p class="muted">{t('library_bookmarks_empty')}</p> : null}
      <ul class="cards">
        {list.map((b) => (
          <li>
            <div class="row">
              <Swatch color={b.color} />
              <ChatLink chat={chats.get(b.chatId)} chatId={b.chatId} messageId={b.messageId} />
              <span class="muted when">{fmtDate(b.createdAt)}</span>
            </div>
            <p class="snip">{b.snippet}</p>
            <NoteField value={b.note} onSave={(note) => void lib('updateBookmark', b.id, { note })} />
            <ConfirmButton label={t('common_delete')} confirmLabel={t('library_delete_bookmark')} onConfirm={() => void lib('deleteBookmark', b.id)} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Highlights() {
  const [rows] = useLib('highlights', []);
  const [color, setColor] = useState('');
  const [q, setQ] = useState('');
  const list = (rows ?? []).filter((h) => (!color || h.color === color) && (!q || `${h.quote} ${h.note}`.toLowerCase().includes(q.toLowerCase())));
  const chats = useChats(list.map((h) => h.chatId));
  const dark = useResolvedDark();
  return (
    <Section title={t('library_highlights_count', String(list.length))}>
      <input type="search" aria-label={t('library_filter')} placeholder={t('library_filter')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <ColorFilter value={color} onChange={setColor} />
      {list.length === 0 ? <p class="muted">{t('library_highlights_empty')}</p> : null}
      <ul class="cards">
        {list.map((h) => (
          <li>
            <div class="row">
              <ChatLink chat={chats.get(h.chatId)} chatId={h.chatId} messageId={h.messageId} />
              <span class="muted when">{fmtDate(h.createdAt)}</span>
            </div>
            <blockquote class="quote" style={{ borderLeftColor: COLOR_VALUES[h.color as ColorName]?.[dark ? 'dark' : 'light'] }}>
              {h.quote}
            </blockquote>
            <NoteField value={h.note} onSave={(note) => void lib('updateHighlight', h.id, { note })} />
            <div class="row">
              {COLORS.map((c) => (
                <button class="swatch" role="radio" aria-checked={h.color === c} aria-label={t(`color_${c}`)} style={{ background: COLOR_VALUES[c][dark ? 'dark' : 'light'] }} onClick={() => void lib('updateHighlight', h.id, { color: c })} />
              ))}
              <ConfirmButton label={t('common_delete')} confirmLabel={t('library_delete_highlight')} onConfirm={() => void lib('deleteHighlight', h.id)} />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Labels() {
  const [rows] = useLib('labels', []);
  const [color, setColor] = useState('');
  const all = rows ?? [];
  const list = all.filter((l) => !color || l.color === color);
  const chats = useChats(list.map((l) => l.chatId));
  const counts = COLORS.map((c) => [c, all.filter((l) => l.color === c).length] as const);
  return (
    <Section title={t('library_labels_count', String(all.length))}>
      <table class="dense">
        <tbody>
          {counts.map(([c, n]) => (
            <tr>
              <th>
                <Swatch color={c} /> {t(`color_${c}`)}
              </th>
              <td class="num">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ColorFilter value={color} onChange={setColor} />
      {list.length === 0 ? <p class="muted">{t('library_labels_empty')}</p> : null}
      <ul class="plain">
        {list.map((l) => (
          <li class="row">
            <Swatch color={l.color} />
            <ChatLink chat={chats.get(l.chatId)} chatId={l.chatId} messageId={l.messageId} />
            <span class="muted when">{fmtDate(l.createdAt)}</span>
            <button class="icon" aria-label={t('library_remove_label')} onClick={() => void lib('deleteLabel', l.id)}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Notes() {
  const [rows] = useLib('notes', []);
  const list = rows ?? [];
  const chats = useChats(list.map((n) => n.chatId));
  return (
    <Section title={t('library_notes_count', String(list.length))}>
      {list.length === 0 ? <p class="muted">{t('library_notes_empty')}</p> : null}
      <ul class="cards">
        {list.map((n) => (
          <li>
            <div class="row">
              <ChatLink chat={chats.get(n.chatId)} chatId={n.chatId} />
              <span class="muted when">{fmtDate(n.updatedAt)}</span>
            </div>
            <NoteField value={n.text} onSave={(text) => void lib('setNote', n.chatId, text)} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Reminders() {
  const [rows] = useLib('reminders', []);
  const [showDone, setShowDone] = useState(false);
  const list = (rows ?? []).filter((r) => showDone || !r.done);
  const chats = useChats(list.map((r) => r.chatId));
  return (
    <Section title={t('library_reminders_count', String(list.length))}>
      <label class="inline">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone((e.target as HTMLInputElement).checked)} /> {t('library_show_done')}
      </label>
      {list.length === 0 ? <p class="muted">{t('library_reminders_empty')}</p> : null}
      <ul class="plain">
        {list.map((r) => (
          <li class={`row${r.done ? ' done' : ''}`}>
            <span class="mono when">{new Date(r.dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <ChatLink chat={chats.get(r.chatId)} chatId={r.chatId} />
            {r.note ? <span class="muted">{r.note}</span> : null}
            {!r.done ? <button onClick={() => void lib('completeReminder', r.id)}>{t('reminder_done')}</button> : null}
            <button class="icon" aria-label={t('common_delete')} onClick={() => void lib('deleteReminder', r.id)}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Tags() {
  const [tags] = useLib('tags', []);
  const [rules] = useLib('rules', []);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const run = (p: Promise<unknown>) => p.then(() => setError(''), (e: Error) => setError(e.message));
  return (
    <>
      <Section title={t('library_tags_count', String(tags?.length ?? 0))}>
        {tags?.length === 0 ? <p class="muted">{t('library_tags_empty')}</p> : null}
        <ul class="plain">
          {(tags ?? []).map((tg) => (
            <li>
              <div class="row">
                <button class="link" aria-expanded={open === tg.name} onClick={() => setOpen(open === tg.name ? null : tg.name)}>
                  {tg.name}
                </button>
                <span class="muted mono">{t('library_tag_counts', [String(tg.manual), String(tg.auto)])}</span>
                <InlineEdit label={t('library_tag_rename')} initial={tg.name} onSave={(to) => void run(lib('renameTag', tg.name, to))}>
                  {t('folder_rename')}
                </InlineEdit>
                <ConfirmButton label={t('common_delete')} confirmLabel={t('library_tag_delete_confirm', tg.name)} onConfirm={() => void run(lib('deleteTag', tg.name))} />
              </div>
              {open === tg.name ? <TagChats tag={tg.name} /> : null}
            </li>
          ))}
        </ul>
        {error ? <p class="status error" role="alert">{error}</p> : null}
      </Section>
      <Section title={t('rules_title')}>
        <p class="muted">{t('rules_hint')}</p>
        <ul class="plain">
          {(rules ?? []).map((r) => (
            <RuleRow rule={r} run={run} />
          ))}
        </ul>
        <RuleEditor run={run} />
      </Section>
    </>
  );
}

function TagChats({ tag }: { tag: string }) {
  const [res] = useLib('chats', [{ tag, limit: 200 }], [tag]);
  return (
    <ul class="plain nested">
      {(res?.rows ?? []).map((c) => (
        <li class="row">
          <ChatLink chat={c} chatId={c.id} />
          {c.autoTags.includes(tag) && !c.tags.includes(tag) ? <span class="muted">{t('library_tag_auto')}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function RuleRow({ rule, run }: { rule: TagRuleRow; run(p: Promise<unknown>): Promise<void> }) {
  return (
    <li class="row">
      <label class="inline">
        <input type="checkbox" checked={!!rule.enabled} onChange={(e) => void run(lib('saveRule', { ...rule, enabled: (e.target as HTMLInputElement).checked ? 1 : 0 }))} />
        <strong>{rule.tag}</strong>
      </label>
      <span class="muted">
        {t(rule.match === 'all' ? 'rules_all_of' : 'rules_any_of')} {rule.terms.join(', ')}
      </span>
      {rule.builtin ? <span class="muted">{t('rules_builtin')}</span> : <button class="icon" aria-label={t('common_delete')} onClick={() => void run(lib('deleteRule', rule.id))}><Icon name="close" size={12} /></button>}
    </li>
  );
}

function RuleEditor({ run }: { run(p: Promise<unknown>): Promise<void> }) {
  const [tag, setTag] = useState('');
  const [terms, setTerms] = useState('');
  const [match, setMatch] = useState<'any' | 'all'>('any');
  const [title, setTitle] = useState(true);
  const [content, setContent] = useState(true);
  const [sites, setSites] = useState<string[]>([]);
  const list = terms.split(',').map((s) => s.trim()).filter(Boolean);
  const ok = tag.trim() && list.length && (title || content);
  return (
    <details>
      <summary>{t('rules_add')}</summary>
      <div class="field">
        <label for="r-tag">{t('rules_tag')}</label>
        <input id="r-tag" type="text" value={tag} onInput={(e) => setTag((e.target as HTMLInputElement).value)} />
      </div>
      <div class="field">
        <label for="r-terms">{t('rules_terms')}</label>
        <input id="r-terms" type="text" value={terms} placeholder={t('search_terms_hint')} onInput={(e) => setTerms((e.target as HTMLInputElement).value)} />
      </div>
      <div class="row">
        <select aria-label={t('rules_match')} value={match} onChange={(e) => setMatch((e.target as HTMLSelectElement).value as 'any' | 'all')}>
          <option value="any">{t('search_mode_any')}</option>
          <option value="all">{t('search_mode_all')}</option>
        </select>
        <label class="inline">
          <input type="checkbox" checked={title} onChange={(e) => setTitle((e.target as HTMLInputElement).checked)} /> {t('rules_in_title')}
        </label>
        <label class="inline">
          <input type="checkbox" checked={content} onChange={(e) => setContent((e.target as HTMLInputElement).checked)} /> {t('rules_in_content')}
        </label>
      </div>
      <fieldset class="row">
        <legend class="muted">{t('rules_sites')}</legend>
        {TIER1_SITES.map((s) => (
          <label class="inline">
            <input type="checkbox" checked={sites.includes(s)} onChange={(e) => setSites((e.target as HTMLInputElement).checked ? [...sites, s] : sites.filter((x) => x !== s))} /> {SITES[s].name}
          </label>
        ))}
      </fieldset>
      <button
        class="primary"
        disabled={!ok}
        onClick={() =>
          void run(
            lib('saveRule', {
              tag: tag.trim(),
              terms: list,
              match,
              fields: [...(title ? (['title'] as const) : []), ...(content ? (['content'] as const) : [])],
              sites: sites as TagRuleRow['sites'],
              enabled: 1,
              builtin: 0,
            }),
          ).then(() => {
            setTag('');
            setTerms('');
          })
        }
      >
        {t('rules_save')}
      </button>
    </details>
  );
}
