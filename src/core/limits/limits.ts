// Context limit lookup (SPEC §6A). Every number comes from limits.json with a
// cited source, or from the site itself, or from the user's own override.
// Anything else is "unknown"; the meter never shows a guessed limit.
import LIMITS from './limits.json';
import type { SiteId } from '../sites/sites';

export type Plan = 'free' | 'go' | 'plus' | 'pro' | 'business' | 'enterprise' | 'ultra' | 'max' | 'team' | 'unknown';
export type Mode = 'instant' | 'reasoning';

export interface LimitQuery {
  site: SiteId;
  model: string | null;
  plan: Plan;
  mode?: Mode;
  /** Limit reported by the page itself (AI Studio). */
  siteReported?: number | null;
  /** User overrides keyed by model slug, or by "site:<id>" for a whole site. */
  overrides?: Record<string, number>;
}

export interface LimitResult {
  tokens: number | null;
  source: 'override' | 'site' | 'docs' | 'unknown';
  label: string;
  /** URL of the document the number comes from, when it comes from docs. */
  url?: string;
  note?: string;
}

interface Src {
  url: string;
  date: string;
}

const RETRIEVED = LIMITS.retrieved;

function docs(tokens: number, label: string, src: Src | undefined, note?: string): LimitResult {
  return { tokens, source: 'docs', label: `${label} (retrieved ${src?.date ?? RETRIEVED})`, ...(src ? { url: src.url } : {}), ...(note ? { note } : {}) };
}

/** Reasoning models: the slug or label says so. */
export function modeForModel(model: string | null): Mode {
  return model && /think|reason|\bo\d\b|^o\d|-pro\b|deep/i.test(model) ? 'reasoning' : 'instant';
}

export function lookupLimit(q: LimitQuery): LimitResult {
  const o = q.overrides ?? {};
  if (q.model && o[q.model]) return { tokens: o[q.model]!, source: 'override', label: 'Your setting for this model' };
  if (o[`site:${q.site}`]) return { tokens: o[`site:${q.site}`]!, source: 'override', label: 'Your setting for this site' };
  if (q.siteReported) return { tokens: q.siteReported, source: 'site', label: 'Reported by the site' };

  const s = LIMITS.sites;
  switch (q.site) {
    case 'chatgpt': {
      const plans = s.chatgpt.plans as Record<string, { instant: number | null; reasoning: number | null }>;
      const p = plans[q.plan];
      if (!p) return { tokens: null, source: 'unknown', label: 'Plan not detected; pick it in Settings' };
      const mode = q.mode ?? modeForModel(q.model);
      const n = p[mode];
      if (n === null) return { tokens: null, source: 'unknown', label: `Not published for ${q.plan} (${mode})` };
      return docs(n, `ChatGPT ${q.plan}, ${mode === 'reasoning' ? 'reasoning' : 'instant'} model`, s.chatgpt.sources[0], s.chatgpt.notes);
    }
    case 'claude': {
      if (q.plan === 'free') return { tokens: null, source: 'unknown', label: 'Not published for the Free plan' };
      const slug = (q.model ?? '').toLowerCase();
      const hit = s.claude.models.find((m) => m.match.some((k) => slug.includes(k)));
      if (hit) return docs(hit.tokens, hit.label, s.claude.sources[0]);
      if (!slug) return docs(s.claude.default, 'Claude paid plans', s.claude.sources[0], s.claude.scope);
      return docs(s.claude.default, 'Claude paid plans, default', s.claude.sources[0], s.claude.scope);
    }
    case 'gemini': {
      const plans = s.gemini.plans as Record<string, number>;
      const n = plans[q.plan];
      if (!n) return { tokens: null, source: 'unknown', label: 'Plan not detected; pick it in Settings' };
      return docs(n, `Gemini app, ${q.plan} plan`, s.gemini.sources[0], s.gemini.notes);
    }
    case 'aistudio':
      return { tokens: null, source: 'unknown', label: 'Waiting for the token counter on the page' };
    default:
      return { tokens: null, source: 'unknown', label: 'No published limit for this site; set one in Settings' };
  }
}
