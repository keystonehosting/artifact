// The open chat's library card on the Dashboard: pin, tags, folders, notes
// pane, continue-later reminders, and the page tools (find, privacy blur).
import { useEffect, useState } from 'preact/hooks';
import type { ActiveTab } from './hooks';
import type { FolderNode } from '../../core/library/folders';
import { lib } from '../../core/library/client';
import { sendToTab } from '../../core/messaging/tabs';
import { Section } from '../components';
import { Icon } from '../icons';
import { useLib } from './library';
import { t } from '../../core/i18n/t';

function flat(nodes: FolderNode[], out: FolderNode[] = []): FolderNode[] {
  for (const n of nodes) {
    out.push(n);
    flat(n.children, out);
  }
  return out;
}

/** Local datetime-local value one day from now at the same minute. */
function tomorrow(): string {
  const d = new Date(Date.now() + 86_400_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ThisChat({ tab }: { tab: ActiveTab }) {
  const chatId = tab.site && tab.ready?.chatId ? `${tab.site.id}:${tab.ready.chatId}` : null;
  const [info] = useLib('chat', [chatId ?? ''], [chatId]);
  const [tree] = useLib('folderTree', ['az']);
  const [note, setNote] = useState('');
  const [tagText, setTagText] = useState('');
  const [folderId, setFolderId] = useState('');
  const [due, setDue] = useState(tomorrow);
  const [remNote, setRemNote] = useState('');
  const [error, setError] = useState('');
  const [blurred, setBlurred] = useState(false);

  useEffect(() => setNote(info?.note ?? ''), [info?.note, chatId]);
  if (!chatId) return null;
  const run = (p: Promise<unknown>) => p.then(() => setError(''), (e: Error) => setError(e.message));
  const row = info?.row ?? null;
  const filed = new Set((info?.folders ?? []).map((f) => f.id));

  return (
    <Section
      title={t('this_chat')}
      aside={
        <div class="inline">
          <button aria-label={t('command_find')} title={t('command_find')} onClick={() => void run(sendToTab(tab.tabId, { type: 'content:find' }))}>
            <Icon name="search" size={12} />
          </button>
          <button
            aria-pressed={blurred}
            aria-label={t('command_blur')}
            title={t('command_blur')}
            onClick={() => void sendToTab(tab.tabId, { type: 'content:blur' }).then((r) => setBlurred(r.on), (e: Error) => setError(e.message))}
          >
            <Icon name="eye" size={12} />
          </button>
        </div>
      }
    >
      {!row ? <p class="muted">{t('this_chat_not_stored')}</p> : null}
      {row ? (
        <>
          <div class="row">
            <button aria-pressed={!!row.pinned} onClick={() => void run(lib('updateChat', chatId, { pinned: row.pinned ? 0 : 1 }))}>
              <Icon name="pin" size={12} /> {row.pinned ? t('chat_unpin') : t('chat_pin')}
            </button>
          </div>

          <h3>{t('library_tags')}</h3>
          <div class="row">
            {row.tags.map((tg) => (
              <span class="chip">
                {tg}
                <button class="icon" aria-label={t('tag_remove', tg)} onClick={() => void run(lib('setChatTags', [chatId], [], [tg]))}>
                  <Icon name="close" size={10} />
                </button>
              </span>
            ))}
            {row.autoTags.filter((tg) => !row.tags.includes(tg)).map((tg) => (
              <span class="chip auto" title={t('library_tag_auto')}>
                {tg}
              </span>
            ))}
            <input
              type="text"
              class="short"
              aria-label={t('tag_add')}
              placeholder={t('tag_add')}
              value={tagText}
              onInput={(e) => setTagText((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                const v = tagText.trim();
                if (e.key === 'Enter' && v) void run(lib('setChatTags', [chatId], [v], [])).then(() => setTagText(''));
              }}
            />
          </div>

          <h3>{t('folders_title')}</h3>
          <div class="row">
            {(info?.folders ?? []).map((f) => (
              <span class="chip">
                <Icon name="folder" size={11} /> {f.name}
                <button class="icon" aria-label={t('folders_remove_named', f.name)} onClick={() => void run(lib('removeFromFolder', f.id, [chatId]))}>
                  <Icon name="close" size={10} />
                </button>
              </span>
            ))}
            <select aria-label={t('folders_add_to')} value={folderId} onChange={(e) => setFolderId((e.target as HTMLSelectElement).value)}>
              <option value="">{t('folders_add_to')}</option>
              {flat(tree ?? [])
                .filter((f) => !filed.has(f.id))
                .map((f) => (
                  <option value={f.id}>{`${'  '.repeat(f.depth)}${f.name}`}</option>
                ))}
            </select>
            <button disabled={!folderId} onClick={() => void run(lib('addToFolder', folderId, [chatId])).then(() => setFolderId(''))}>
              {t('common_add')}
            </button>
          </div>
        </>
      ) : null}

      <h3>{t('library_note')}</h3>
      <textarea
        class="note"
        rows={4}
        aria-label={t('library_note')}
        value={note}
        onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        onBlur={() => note !== (info?.note ?? '') && void run(lib('setNote', chatId, note))}
      />

      <h3>{t('library_reminders')}</h3>
      {(info?.reminders ?? [])
        .filter((r) => !r.done)
        .map((r) => (
          <div class="row">
            <span class="mono">{new Date(r.dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            {r.note ? <span class="muted">{r.note}</span> : null}
            <button class="icon" aria-label={t('common_delete')} onClick={() => void run(lib('deleteReminder', r.id))}>
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      <div class="row">
        <input type="datetime-local" aria-label={t('reminder_when')} value={due} onInput={(e) => setDue((e.target as HTMLInputElement).value)} />
        <input type="text" class="short" aria-label={t('reminder_note')} placeholder={t('reminder_note')} value={remNote} onInput={(e) => setRemNote((e.target as HTMLInputElement).value)} />
        <button
          disabled={!due || !row}
          onClick={() => {
            const at = Date.parse(due);
            if (Number.isNaN(at) || at <= Date.now()) return setError(t('reminder_future'));
            void run(lib('addReminder', { chatId, dueAt: at, note: remNote.trim() })).then(() => setRemNote(''));
          }}
        >
          {t('reminder_add')}
        </button>
      </div>
      {error ? <p class="status error" role="alert">{error}</p> : null}
    </Section>
  );
}
