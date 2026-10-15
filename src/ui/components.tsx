// Small shared controls for extension pages. Native elements, labelled.
import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';

export function Section({ title, children, aside }: { title: string; children: ComponentChildren; aside?: ComponentChildren }) {
  return (
    <section class="section">
      <header class="section-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange(v: boolean): void; hint?: string }) {
  const id = useId();
  return (
    <div class="field toggle">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <label for={id}>{label}</label>
      {hint && <div class="hint">{hint}</div>}
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange(v: T): void }) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value as T)}>
        {options.map(([v, l]) => (
          <option value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

export function NumberField({ label, value, min, max, step, onChange, suffix }: { label: string; value: number; min?: number; max?: number; step?: number; onChange(v: number): void; suffix?: string }) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <span class="inline">
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
        {suffix && <span class="muted">{suffix}</span>}
      </span>
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange(v: string): void; placeholder?: string; hint?: string }) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange((e.target as HTMLInputElement).value)} />
      {hint && <div class="hint">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<[T, string]>; value: T; onChange(v: T): void }) {
  return (
    <nav class="tabs" role="tablist">
      {tabs.map(([v, l]) => (
        <button role="tab" aria-selected={v === value} class={v === value ? 'active' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </nav>
  );
}

export function Progress({ done, total, label, onCancel }: { done: number; total: number; label?: string; onCancel?: () => void }) {
  return (
    <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div class="progress-bar">
        <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <span class="mono muted">
        {done}/{total} {label}
      </span>
      {onCancel && <button onClick={onCancel}>Cancel</button>}
    </div>
  );
}
