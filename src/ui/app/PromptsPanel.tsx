// Prompts tab (SPEC §6D): the prompt library with variables and files,
// chains, the send queue, prompt history and the file library. "Use" and
// "Run" act on the AI site in the active tab.
import { useState } from 'preact/hooks';
import type { ActiveTab } from './hooks';
import type { ChainRow, ChainStep, PromptRow } from '../../core/db/db';
import { lib } from '../../core/library/client';
import { sendToTab } from '../../core/messaging/tabs';
import { saveFile } from '../../core/export/download';
import { parseTemplate } from '../../core/prompts/template';
import { CATEGORIES, splitSteps, type PromptSort } from '../../core/prompts/service';
import { bytesToBase64 } from '../../core/util/bytes';
import { ConfirmButton, Section, Tabs, Toggle } from '../components';
import { Icon } from '../icons';
import { fmtDate, useLib } from './library';
import { t } from '../../core/i18n/t';
import { SITES } from '../../core/sites/sites';
import starter from '../../core/prompts/starter-pack.json';

type View = 'prompts' | 'chains' | 'queue' | 'history' | 'files';

function useRun() {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const run = (p: Promise<unknown>, done = '') =>
    p.then(
      () => {
        setErr('');
        setMsg(done);
      },
      (e: Error) => setErr(e.message),
    );
  const status = err ? <p class="status error" role="alert">{err}</p> : <p class="status" role="status">{msg}</p>;
  return { run, status };
}

export function PromptsPanel({ tab }: { tab: ActiveTab | null }) {
  const [view, setView] = useState<View>('prompts');
  return (
    <div class="content">
      <Tabs<View>
        tabs={[
          ['prompts', t('prompts_tab_prompts')],
          ['chains', t('prompts_tab_chains')],
          ['queue', t('prompts_tab_queue')],
          ['history', t('prompts_tab_history')],
          ['files', t('prompts_tab_files')],
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'prompts' && <Prompts tab={tab} />}
      {view === 'chains' && <Chains tab={tab} />}
      {view === 'queue' && <Queue tab={tab} />}
      {view === 'history' && <History />}
      {view === 'files' && <Files />}
    </div>
  );
}

function needSite(tab: ActiveTab | null): string | null {
  return tab?.ready ? null : t('prompts_need_site');
}

function Prompts({ tab }: { tab: ActiveTab | null }) {
  const [sort, setSort] = useState<PromptSort>('recent');
  const [rows] = useLib('prompts', [sort], [sort]);
  const [today] = useLib('promptOfTheDay', []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<Partial<PromptRow> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { run, status } = useRun();
  const all = rows ?? [];
  const cats = [...new Set([...CATEGORIES, ...all.map((p) => p.category)])];
  const list = all.filter((p) => (!cat || p.category === cat) && (!q || `${p.name} ${p.body}`.toLowerCase().includes(q.toLowerCase())));
  const use = (p: PromptRow) => {
    const why = needSite(tab);
    if (why) return void run(Promise.reject(new Error(why)));
    void run(sendToTab(tab!.tabId, { type: 'content:insert-prompt', promptId: p.id }), t('prompts_inserted'));
  };
  const importFile = async (f: File) => {
    const r = await lib('importPrompts', await f.text(), f.name);
    return t('prompts_imported', [String(r.prompts), String(r.chains)]);
  };

  if (editing) return <PromptEditor initial={editing} done={() => setEditing(null)} />;
  return (
    <>
      {today ? (
        <Section title={t('prompts_of_the_day')}>
          <div class="row">
            <strong>{today.name}</strong>
            <span class="muted">{today.category}</span>
            <button onClick={() => use(today)}>{t('prompts_use')}</button>
          </div>
        </Section>
      ) : null}
      <Section
        title={t('prompts_count', String(all.length))}
        aside={
          <button class="primary" onClick={() => setEditing({ name: '', body: '', category: 'general' })}>
            <Icon name="plus" size={12} /> {t('prompts_new')}
          </button>
        }
      >
        <div class="row">
          <input type="search" aria-label={t('library_filter')} placeholder={t('library_filter')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <select aria-label={t('prompts_category')} value={cat} onChange={(e) => setCat((e.target as HTMLSelectElement).value)}>
            <option value="">{t('prompts_all_categories')}</option>
            {cats.map((c) => (
              <option value={c}>{c}</option>
            ))}
          </select>
          <select aria-label={t('prompts_sort')} value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as PromptSort)}>
            <option value="recent">{t('prompts_sort_recent')}</option>
            <option value="used">{t('prompts_sort_used')}</option>
            <option value="newest">{t('prompts_sort_newest')}</option>
            <option value="az">{t('sort_az')}</option>
            <option value="za">{t('sort_za')}</option>
          </select>
        </div>
        {selected.size ? (
          <div class="row bulk">
            <span>{t('folders_selected', String(selected.size))}</span>
            <ConfirmButton label={t('common_delete')} confirmLabel={t('prompts_delete_many', String(selected.size))} onConfirm={() => void run(lib('deletePrompts', [...selected])).then(() => setSelected(new Set()))} />
            <button onClick={() => void lib('exportPrompts', [...selected]).then((json) => saveFile('artifact-prompts.json', json, 'application/json'))}>{t('prompts_export')}</button>
          </div>
        ) : null}
        {all.length === 0 ? <p class="muted">{t('prompts_empty')}</p> : null}
        <ul class="plain prompt-list">
          {list.map((p) => {
            const vars = parseTemplate(p.body).fields.length;
            return (
              <li>
                <div class="row">
                  <input type="checkbox" aria-label={t('folders_select', p.name)} checked={selected.has(p.id)} onChange={(e) => {
                    const next = new Set(selected);
                    if ((e.target as HTMLInputElement).checked) next.add(p.id);
                    else next.delete(p.id);
                    setSelected(next);
                  }} />
                  <button class="icon" aria-pressed={!!p.favorite} aria-label={p.favorite ? t('prompts_unfavorite') : t('prompts_favorite')} onClick={() => void run(lib('savePrompt', { ...p, favorite: p.favorite ? 0 : 1 }))}>
                    <Icon name="star" size={12} />
                  </button>
                  <strong class="grow">{p.name}</strong>
                  <span class="muted">{p.category}</span>
                  {vars ? <span class="muted">{t('prompts_vars', String(vars))}</span> : null}
                  <span class="muted mono">{p.uses}</span>
                </div>
                <p class="snip mono">{p.body.slice(0, 160)}</p>
                <div class="row">
                  <button onClick={() => use(p)}>{t('prompts_use')}</button>
                  <button onClick={() => setEditing(p)}>{t('prompts_edit')}</button>
                  <button onClick={() => void run(lib('savePrompt', { ...p, id: undefined, name: `${p.name} (2)`.slice(0, 100), source: null }))}>{t('prompts_duplicate')}</button>
                  <button aria-pressed={!!p.pinned} onClick={() => void run(lib('savePrompt', { ...p, pinned: p.pinned ? 0 : 1 }))}>{p.pinned ? t('chat_unpin') : t('chat_pin')}</button>
                  <ConfirmButton label={t('common_delete')} confirmLabel={t('prompts_delete_one', p.name)} onConfirm={() => void run(lib('deletePrompts', [p.id]))} />
                </div>
              </li>
            );
          })}
        </ul>
        {status}
      </Section>
      <Section title={t('prompts_import_title')}>
        <div class="row">
          <label class="button-like">
            {t('prompts_import')}
            <input type="file" accept=".json,.txt,.md" class="sr-only" onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) void importFile(f).then((m) => run(Promise.resolve(), m), (err: Error) => run(Promise.reject(err)));
            }} />
          </label>
          <button onClick={() => void lib('exportPrompts').then((json) => saveFile('artifact-prompts.json', json, 'application/json'))}>{t('prompts_export_all')}</button>
          <button onClick={() => void lib('importStarter').then((n) => run(Promise.resolve(), t('prompts_starter_added', String(n))), (e: Error) => run(Promise.reject(e)))}>
            {t('prompts_starter', String(starter.items.length))}
          </button>
        </div>
        <p class="hint muted">
          {t('prompts_starter_source')}{' '}
          <a href={starter.source} target="_blank" rel="noreferrer">
            {starter.source.replace('https://', '')}
          </a>{' '}
          ({starter.license})
        </p>
      </Section>
    </>
  );
}

function PromptEditor({ initial, done }: { initial: Partial<PromptRow>; done(): void }) {
  const [name, setName] = useState(initial.name ?? '');
  const [body, setBody] = useState(initial.body ?? '');
  const [category, setCategory] = useState(initial.category ?? 'general');
  const [autoSend, setAutoSend] = useState(initial.autoSend ?? false);
  const [fileIds, setFileIds] = useState<string[]>(initial.fileIds ?? []);
  const [files] = useLib('promptFiles', []);
  const { run, status } = useRun();
  const fields = parseTemplate(body).fields;
  return (
    <Section title={initial.id ? t('prompts_edit') : t('prompts_new')}>
      <div class="field">
        <label for="p-name">{t('prompts_name')}</label>
        <input id="p-name" type="text" maxLength={100} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </div>
      <div class="field">
        <label for="p-cat">{t('prompts_category')}</label>
        <input id="p-cat" type="text" list="p-cats" maxLength={24} value={category} onInput={(e) => setCategory((e.target as HTMLInputElement).value)} />
        <datalist id="p-cats">
          {CATEGORIES.map((c) => (
            <option value={c} />
          ))}
        </datalist>
      </div>
      <label for="p-body">{t('prompts_text')}</label>
      <textarea id="p-body" class="note mono" rows={10} value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
      <details>
        <summary>{t('prompts_syntax')}</summary>
        <table class="dense">
          <tbody>
            <tr><td class="mono">{'{{topic}}'}</td><td>{t('syntax_text')}</td></tr>
            <tr><td class="mono">{'{{topic:default # help}}'}</td><td>{t('syntax_default')}</td></tr>
            <tr><td class="mono">{'{{tone|formal|*casual|...}}'}</td><td>{t('syntax_choice')}</td></tr>
            <tr><td class="mono">{'{{+parts|a|*b|c}}'}</td><td>{t('syntax_multi')}</td></tr>
            <tr><td class="mono">{'{{!audience:experts}}'}</td><td>{t('syntax_hidden')}</td></tr>
            <tr><td class="mono">{'{{=lang:British English}}'}</td><td>{t('syntax_const')}</td></tr>
            <tr><td class="mono">{'{{file:Reference}}'}</td><td>{t('syntax_file')}</td></tr>
            <tr><td class="mono">{'{{date}} {{time}} {{selection}}'}</td><td>{t('syntax_builtin')}</td></tr>
            <tr><td class="mono">{'\\{{'}</td><td>{t('syntax_escape')}</td></tr>
          </tbody>
        </table>
      </details>
      {fields.length ? <p class="muted">{t('prompts_fields', fields.map((f) => f.name).join(', '))}</p> : null}
      <Toggle label={t('prompts_autosend')} hint={t('prompts_autosend_hint')} checked={autoSend} onChange={setAutoSend} />
      {files?.length ? (
        <fieldset>
          <legend class="muted">{t('prompts_attach')}</legend>
          {files.map((f) => (
            <label class="inline">
              <input type="checkbox" checked={fileIds.includes(f.id)} onChange={(e) => setFileIds((e.target as HTMLInputElement).checked ? [...fileIds, f.id] : fileIds.filter((x) => x !== f.id))} /> {f.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div class="row">
        <button class="primary" onClick={() => void run(lib('savePrompt', { ...initial, name, body, category, autoSend, fileIds })).then(done)}>
          {t('common_save')}
        </button>
        <button onClick={done}>{t('common_cancel')}</button>
      </div>
      {status}
    </Section>
  );
}

function Chains({ tab }: { tab: ActiveTab | null }) {
  const [rows] = useLib('chains', []);
  const [editing, setEditing] = useState<Partial<ChainRow> | null>(null);
  const { run, status } = useRun();
  if (editing) return <ChainEditor initial={editing} done={() => setEditing(null)} />;
  return (
    <Section
      title={t('chains_count', String(rows?.length ?? 0))}
      aside={
        <button class="primary" onClick={() => setEditing({ name: '', steps: [{ name: '', text: '', after: 'reply' }] })}>
          <Icon name="plus" size={12} /> {t('chains_new')}
        </button>
      }
    >
      <p class="hint muted">{t('chains_hint')}</p>
      {rows?.length === 0 ? <p class="muted">{t('chains_empty')}</p> : null}
      <ul class="plain">
        {(rows ?? []).map((c) => (
          <li class="row">
            <strong class="grow">{c.name}</strong>
            <span class="muted">{t('picker_steps', String(c.steps.length))}</span>
            <button
              onClick={() => {
                const why = needSite(tab);
                void run(why ? Promise.reject(new Error(why)) : sendToTab(tab!.tabId, { type: 'content:run-chain', chainId: c.id }), t('chains_started'));
              }}
            >
              {t('chains_run')}
            </button>
            <button onClick={() => setEditing(c)}>{t('prompts_edit')}</button>
            <ConfirmButton label={t('common_delete')} confirmLabel={t('prompts_delete_one', c.name)} onConfirm={() => void run(lib('deleteChains', [c.id]))} />
          </li>
        ))}
      </ul>
      {status}
    </Section>
  );
}

function ChainEditor({ initial, done }: { initial: Partial<ChainRow>; done(): void }) {
  const [name, setName] = useState(initial.name ?? '');
  const [steps, setSteps] = useState<ChainStep[]>(initial.steps ?? []);
  const [paste, setPaste] = useState('');
  const { run, status } = useRun();
  const set = (i: number, patch: Partial<ChainStep>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const next = [...steps];
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s!);
    setSteps(next);
  };
  return (
    <Section title={initial.id ? t('chains_edit') : t('chains_new')}>
      <div class="field">
        <label for="c-name">{t('prompts_name')}</label>
        <input id="c-name" type="text" maxLength={100} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </div>
      <ol class="steps">
        {steps.map((s, i) => (
          <li>
            <div class="row">
              <input type="text" aria-label={t('chains_step_name', String(i + 1))} placeholder={t('chains_step_name', String(i + 1))} value={s.name} onInput={(e) => set(i, { name: (e.target as HTMLInputElement).value })} />
              <select aria-label={t('chains_after')} value={s.after} onChange={(e) => set(i, { after: (e.target as HTMLSelectElement).value as ChainStep['after'] })}>
                <option value="reply">{t('chains_after_reply')}</option>
                <option value="confirm">{t('chains_after_confirm')}</option>
              </select>
              <button class="icon" aria-label={t('chains_up')} disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="up" size={12} />
              </button>
              <button class="icon" aria-label={t('chains_down')} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                <Icon name="down" size={12} />
              </button>
              <button class="icon" aria-label={t('chains_remove_step')} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                <Icon name="close" size={12} />
              </button>
            </div>
            <textarea class="note" rows={3} aria-label={t('chains_step_text', String(i + 1))} value={s.text} onInput={(e) => set(i, { text: (e.target as HTMLTextAreaElement).value })} />
          </li>
        ))}
      </ol>
      <div class="row">
        <button onClick={() => setSteps([...steps, { name: '', text: '', after: 'reply' }])}>
          <Icon name="plus" size={12} /> {t('chains_add_step')}
        </button>
      </div>
      <details>
        <summary>{t('chains_paste')}</summary>
        <textarea class="note" rows={5} value={paste} placeholder={t('chains_paste_hint')} onInput={(e) => setPaste((e.target as HTMLTextAreaElement).value)} />
        <button disabled={!paste.trim()} onClick={() => {
          setSteps([...steps.filter((s) => s.text.trim()), ...splitSteps(paste).map((text) => ({ name: '', text, after: 'reply' as const }))]);
          setPaste('');
        }}>
          {t('chains_split')}
        </button>
      </details>
      <div class="row">
        <button class="primary" onClick={() => void run(lib('saveChain', { id: initial.id, name, steps })).then(done)}>
          {t('common_save')}
        </button>
        <button onClick={done}>{t('common_cancel')}</button>
      </div>
      {status}
    </Section>
  );
}

function Queue({ tab }: { tab: ActiveTab | null }) {
  const [text, setText] = useState('');
  const { run, status } = useRun();
  const items = splitSteps(text);
  return (
    <Section title={t('queue_title')}>
      <p class="hint muted">{t('queue_hint')}</p>
      <textarea class="note" rows={8} aria-label={t('queue_title')} placeholder={t('chains_paste_hint')} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <div class="row">
        <button
          class="primary"
          disabled={!items.length}
          onClick={() => {
            const why = needSite(tab);
            void run(why ? Promise.reject(new Error(why)) : sendToTab(tab!.tabId, { type: 'content:queue', texts: items }), t('queue_started', String(items.length))).then(() => setText(''));
          }}
        >
          {t('queue_send', String(items.length))}
        </button>
      </div>
      {status}
    </Section>
  );
}

function History() {
  const [rows] = useLib('history', [null, 200]);
  const [q, setQ] = useState('');
  const { run, status } = useRun();
  const list = (rows ?? []).filter((h) => !q || h.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section title={t('history_title', String(rows?.length ?? 0))} aside={<ConfirmButton label={t('history_clear')} confirmLabel={t('history_clear_confirm')} onConfirm={() => void run(lib('clearHistory'))} />}>
      <p class="hint muted">{t('history_hint')}</p>
      <input type="search" aria-label={t('library_filter')} placeholder={t('library_filter')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <ul class="cards">
        {list.map((h) => (
          <li>
            <div class="row">
              <span class="site-tag">{SITES[h.site]?.name ?? h.site}</span>
              <span class="muted when">{fmtDate(h.at)}</span>
            </div>
            <p class="snip">{h.text}</p>
            <div class="row">
              <button onClick={() => void navigator.clipboard.writeText(h.text)}>{t('compare_copy')}</button>
              <button onClick={() => void run(lib('savePrompt', { name: h.text.split('\n')[0]!.slice(0, 60), body: h.text }), t('history_saved'))}>{t('history_save')}</button>
            </div>
          </li>
        ))}
      </ul>
      {status}
    </Section>
  );
}

function Files() {
  const [files] = useLib('promptFiles', []);
  const { run, status } = useRun();
  const add = async (list: FileList) => {
    for (const f of list) await lib('addPromptFile', { name: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, data: bytesToBase64(new Uint8Array(await f.arrayBuffer())) });
  };
  return (
    <Section title={t('files_title', String(files?.length ?? 0))}>
      <p class="hint muted">{t('files_hint')}</p>
      <label class="button-like">
        {t('files_add')}
        <input type="file" multiple class="sr-only" onChange={(e) => {
          const l = (e.target as HTMLInputElement).files;
          if (l?.length) void run(add(l));
        }} />
      </label>
      <ul class="plain">
        {(files ?? []).map((f) => (
          <li class="row">
            <span class="grow">{f.name}</span>
            <span class="muted mono">{Math.ceil(f.size / 1024)} KB</span>
            <ConfirmButton label={t('common_delete')} confirmLabel={t('prompts_delete_one', f.name)} onConfirm={() => void run(lib('deletePromptFile', f.id))} />
          </li>
        ))}
      </ul>
      {status}
    </Section>
  );
}
