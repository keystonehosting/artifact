// The form a prompt's {{variables}} open before it is inserted. Enter
// submits, Shift+Enter adds a line, Escape cancels.
import { useState } from 'preact/hooks';
import { mountShadow, pageIsDark } from '../../ui/shadow';
import { defaultValues, type Field, type Parsed, type Values } from '../../core/prompts/template';
import { t } from '../../core/i18n/t';

const OTHER = '\u0000other';

export interface FormResult {
  values: Values;
  files: File[];
}

function FieldInput({ f, value, onChange, onFiles, first }: { f: Field; value: string | string[]; onChange(v: string | string[]): void; onFiles(fs: File[]): void; first: boolean }) {
  const id = `f-${f.name.replace(/\W+/g, '-')}`;
  const focus = (el: HTMLElement | null) => {
    if (first && el) setTimeout(() => el.focus(), 0);
  };
  const [other, setOther] = useState('');
  const [otherOn, setOtherOn] = useState(false);
  if (f.kind === 'file') {
    return <input id={id} type="file" multiple onChange={(e) => onFiles([...((e.target as HTMLInputElement).files ?? [])])} ref={focus} />;
  }
  if (f.kind === 'choice') {
    const v = value as string;
    return (
      <>
        <select
          id={id}
          value={otherOn ? OTHER : v}
          ref={focus}
          onChange={(e) => {
            const next = (e.target as HTMLSelectElement).value;
            setOtherOn(next === OTHER);
            onChange(next === OTHER ? other : next);
          }}
        >
          {!f.options.includes(v) && !otherOn ? <option value="">—</option> : null}
          {f.options.map((o) => (
            <option value={o}>{o}</option>
          ))}
          {f.other ? <option value={OTHER}>{t('var_other')}</option> : null}
        </select>
        {otherOn ? (
          <input
            type="text"
            aria-label={t('var_other')}
            value={other}
            onInput={(e) => {
              setOther((e.target as HTMLInputElement).value);
              onChange((e.target as HTMLInputElement).value);
            }}
          />
        ) : null}
      </>
    );
  }
  if (f.kind === 'multi') {
    const list = value as string[];
    const toggle = (o: string, on: boolean) => onChange(on ? [...list, o] : list.filter((x) => x !== o));
    return (
      <div class="checks" role="group" aria-labelledby={`${id}-l`}>
        {f.options.map((o, i) => (
          <label>
            <input type="checkbox" checked={list.includes(o)} ref={i === 0 ? focus : undefined} onChange={(e) => toggle(o, (e.target as HTMLInputElement).checked)} /> {o}
          </label>
        ))}
        {f.other ? (
          <input type="text" aria-label={t('var_other')} placeholder={t('var_other')} value={other} onInput={(e) => {
            const next = (e.target as HTMLInputElement).value;
            onChange([...list.filter((x) => x !== other), ...(next ? [next] : [])]);
            setOther(next);
          }} />
        ) : null}
      </div>
    );
  }
  return <textarea id={id} rows={Math.min(6, Math.max(2, String(value).split('\n').length))} value={value as string} ref={focus} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />;
}

function Form({ title, parsed, done }: { title: string; parsed: Parsed; done(r: FormResult | null): void }) {
  const [values, setValues] = useState<Values>(defaultValues(parsed));
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const submit = () => done({ values, files: Object.values(files).flat() });
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && done(null)}>
      <form
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('var_title', title)}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') done(null);
          if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'BUTTON') {
            e.preventDefault();
            submit();
          }
        }}
      >
        <h2>{title}</h2>
        {parsed.fields.map((f, i) => (
          <div class="field">
            <label id={`f-${f.name.replace(/\W+/g, '-')}-l`} for={`f-${f.name.replace(/\W+/g, '-')}`}>
              {f.name}
            </label>
            <FieldInput
              f={f}
              first={i === 0}
              value={values[f.name] ?? (f.kind === 'multi' ? [] : '')}
              onChange={(v) => setValues({ ...values, [f.name]: v })}
              onFiles={(fs) => setFiles({ ...files, [f.name]: fs })}
            />
            {f.help ? <p class="help">{f.help}</p> : null}
            {f.hidden ? <p class="help">{t('var_hidden')}</p> : null}
          </div>
        ))}
        <div class="actions">
          <button type="button" onClick={() => done(null)}>
            {t('common_cancel')}
          </button>
          <button type="submit" class="primary">
            {t('var_insert')}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Opens the form; resolves with the answers, or null when cancelled. */
export function askVariables(title: string, parsed: Parsed): Promise<FormResult | null> {
  return new Promise((resolve) => {
    const m = mountShadow('artifact-variables');
    document.body.append(m.host);
    m.setTheme(pageIsDark());
    const done = (r: FormResult | null) => {
      m.remove();
      resolve(r);
    };
    m.update(<Form title={title} parsed={parsed} done={done} />);
  });
}
