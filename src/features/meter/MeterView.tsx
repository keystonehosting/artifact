import { useState } from 'preact/hooks';
import type { MeterState } from './model';
import { heaviest } from './model';
import { formatTokens, meterLabel } from '../../core/meter/meter';
import type { SiteHealth } from '../../core/health/health';
import type { UsageReport } from '../../adapters/types';
import { t } from '../../core/i18n/t';

export interface MeterViewProps {
  state: MeterState | null;
  health: SiteHealth;
  usage: UsageReport | null;
  showDraft: boolean;
  onJump(messageId: string, index: number): void;
}

function Sparkline({ values, limit }: { values: number[]; limit: number | null }) {
  if (values.length < 2) return null;
  const max = Math.max(values[values.length - 1]!, limit ?? 0, 1);
  const w = 340;
  const h = 36;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`);
  const limitY = limit ? h - (limit / max) * (h - 2) - 1 : null;
  return (
    <svg class="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={t('meter_growth_label')}>
      {limitY !== null && <line x1="0" x2={w} y1={limitY} y2={limitY} />}
      <path d={`M${pts.join('L')}`} />
    </svg>
  );
}

function relTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return t('usage_resets_now');
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return t('usage_resets_in', h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`);
}

export function UsageBars({ usage }: { usage: UsageReport | null }) {
  if (!usage?.windows.length) return null;
  return (
    <span class="usage" aria-label={t('usage_label')}>
      {usage.windows.map((w) => (
        <span class="usage-item" title={relTime(w.resetsAt)}>
          <span>{w.label}</span>
          <span class="usage-bar" aria-hidden="true">
            <i style={{ width: `${Math.round((w.fraction ?? 0) * 100)}%` }} />
          </span>
          <span class="mono">{w.fraction === null ? '—' : `${Math.round(w.fraction * 100)}%`}</span>
        </span>
      ))}
    </span>
  );
}

export function MeterView({ state, health, usage, showDraft, onJump }: MeterViewProps) {
  const [open, setOpen] = useState(false);
  if (!state) {
    return (
      <div class="meter">
        <span class={`health-dot ${health.state}`} title={health.reason} />
        <UsageBars usage={usage} />
      </div>
    );
  }
  const pct = state.percent === null ? 0 : Math.min(100, state.percent);
  const label = meterLabel(state.used, state.limit.tokens, state.approximate);
  const b = state.breakdown;
  return (
    <div class={`meter lvl-${state.level}`} onMouseLeave={() => setOpen(false)}>
      <span class={`health-dot ${health.state}`} title={health.reason} />
      <span
        class="meter-pill"
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-label={t('meter_aria', label)}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        <span class="meter-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span class="meter-text mono">{label}</span>
        {state.exchangesLeft !== null && <span class="meter-extra">{t('meter_exchanges_left', String(state.exchangesLeft))}</span>}
        {showDraft && b.draft > 0 && <span class="meter-extra mono">+{formatTokens(b.draft)} {t('meter_draft')}</span>}
      </span>
      <UsageBars usage={usage} />
      {open && (
        <div class="card" role="dialog" aria-label={t('meter_breakdown')}>
          <h3>{t('meter_breakdown')}</h3>
          <dl class="kv">
            <dt>{t('meter_user')}</dt>
            <dd>{formatTokens(b.user)}</dd>
            <dt>{t('meter_assistant')}</dt>
            <dd>{formatTokens(b.assistant)}</dd>
            <dt>{t('meter_tools_code')}</dt>
            <dd>{formatTokens(b.toolsAndCode)}</dd>
            <dt>{t('meter_attachments')}</dt>
            <dd>{formatTokens(b.attachments)}{b.unmeasuredFiles ? ` + ${t('meter_files_unmeasured', String(b.unmeasuredFiles))}` : ''}</dd>
            <dt>{t('meter_hidden_context')}</dt>
            <dd>{t('meter_unknown')}</dd>
            <dt>{t('meter_draft')}</dt>
            <dd>{formatTokens(b.draft)}</dd>
          </dl>
          <h3>{t('meter_limit')}</h3>
          <dl class="kv">
            <dt>{t('meter_model')}</dt>
            <dd>{state.model ?? t('meter_unknown')}</dd>
            <dt>{t('meter_limit')}</dt>
            <dd>{state.limit.tokens === null ? t('meter_unknown') : formatTokens(state.limit.tokens)}</dd>
          </dl>
          <div class="muted">
            {state.limit.url ? <a href={state.limit.url} target="_blank" rel="noreferrer">{state.limit.label}</a> : state.limit.label}
            {state.limit.note ? ` — ${state.limit.note}` : ''}
          </div>
          <dl class="kv">
            <dt>{t('meter_count_method')}</dt>
            <dd>{state.approximate ? t('meter_count_estimated') : t('meter_count_exact')}</dd>
            <dt>{t('meter_data_source')}</dt>
            <dd>{t(`source_${state.source}`)}</dd>
            <dt>{t('meter_health')}</dt>
            <dd>{t(`health_${health.state}`)}</dd>
          </dl>
          {health.state !== 'healthy' && <div class="muted">{health.reason}</div>}
          <h3>{t('meter_growth')}</h3>
          <Sparkline values={state.cumulative} limit={state.limit.tokens} />
          <h3>{t('meter_heaviest')}</h3>
          <ol class="heavy">
            {heaviest(state.messages).map((m) => (
              <li>
                <span class="mono">{formatTokens(m.tokens)}</span>
                <button onClick={() => onJump(m.id, m.index)} title={m.snippet}>
                  {m.role === 'user' ? t('meter_user') : t('meter_assistant')}: {m.snippet}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
