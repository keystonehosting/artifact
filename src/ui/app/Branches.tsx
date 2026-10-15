// Branch tree map and diff (SPEC §6E): every edit and regeneration of the
// open chat as a tree. Messages on the branch shown on the page jump there;
// any two replies can be compared word by word.
import { useState } from 'preact/hooks';
import type { Conversation, Message } from '../../core/schema/archive';
import { activeBranch, forkPoints, messageText } from '../../core/model/tree';
import { diffWords } from '../../core/text/diff';
import { sendToTab } from '../../core/messaging/tabs';
import { Section } from '../components';
import { t } from '../../core/i18n/t';

function snip(m: Message): string {
  return messageText(m).replace(/\s+/g, ' ').trim().slice(0, 90) || '…';
}

export function Branches({ conv, tabId }: { conv: Conversation; tabId: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [error, setError] = useState('');
  const active = new Set(activeBranch(conv).map((m) => m.id));
  const forks = forkPoints(conv).length;
  if (!forks) return null;

  const toggle = (id: string) => setPick(pick.includes(id) ? pick.filter((x) => x !== id) : [...pick.slice(-1), id]);
  const node = (id: string): preact.JSX.Element | null => {
    const m = conv.messages[id];
    if (!m) return null;
    // Hidden messages (system and tool plumbing) pass their children up.
    const kids = m.childIds;
    if (m.hidden) return <>{kids.map((c) => node(c))}</>;
    const onActive = active.has(m.id);
    return (
      <li>
        <div class={`bnode ${m.role}${onActive ? ' active' : ''}`}>
          {m.role === 'assistant' ? <input type="checkbox" aria-label={t('branches_compare_pick')} checked={pick.includes(m.id)} onChange={() => toggle(m.id)} /> : <span class="spacer" />}
          <button
            class="link"
            title={onActive ? t('branches_jump') : t('branches_show')}
            onClick={() => {
              if (onActive) void sendToTab(tabId, { type: 'content:jump', chatId: conv.id, messageId: m.id, url: conv.url }).catch((e: Error) => setError(e.message));
              else setOpen(open === m.id ? null : m.id);
            }}
          >
            <span class="role">{t(`role_${m.role}`)}</span> {snip(m)}
          </button>
          {kids.length > 1 ? <span class="muted">{t('branches_versions', String(kids.length))}</span> : null}
        </div>
        {open === m.id ? <pre class="bfull">{messageText(m)}</pre> : null}
        {kids.length ? <ul>{kids.map((c) => node(c))}</ul> : null}
      </li>
    );
  };

  const [a, b] = pick.map((id) => conv.messages[id]).filter((m): m is Message => !!m);
  const ops = a && b ? diffWords(messageText(a), messageText(b)) : null;
  return (
    <Section title={t('branches_title', String(forks))}>
      <p class="hint muted">{t('branches_hint')}</p>
      <ul class="btree" role="tree">
        {conv.rootIds.map((r) => node(r))}
      </ul>
      {error ? <p class="status error">{error}</p> : null}
      {ops ? (
        <>
          <h3>{t('branches_diff')}</h3>
          <div class="diff2">
            <div>{ops.map((o) => (o.type === 'eq' ? o.text : o.type === 'del' ? <mark class="del">{o.text}</mark> : null))}</div>
            <div>{ops.map((o) => (o.type === 'eq' ? o.text : o.type === 'ins' ? <mark class="ins">{o.text}</mark> : null))}</div>
          </div>
        </>
      ) : pick.length === 1 ? (
        <p class="muted">{t('branches_pick_second')}</p>
      ) : null}
    </Section>
  );
}
