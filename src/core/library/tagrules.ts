// Smart Tags (SPEC §6B): local keyword rules, built-in and custom. A rule
// tags a chat when its terms appear in the title and/or the text.
import type { TagRuleRow } from '../db/db';

export const BUILTIN_RULES: TagRuleRow[] = [
  { id: 'builtin:code', tag: 'Code', terms: ['```', 'function', 'stack trace', 'compile', 'error:', 'typescript', 'python', 'javascript', 'sql', 'regex', 'api'], match: 'any', fields: ['content'], sites: [], enabled: 1, builtin: 1 },
  { id: 'builtin:writing', tag: 'Writing', terms: ['essay', 'rewrite', 'proofread', 'blog post', 'email', 'draft', 'tone', 'paragraph', 'cover letter'], match: 'any', fields: ['title', 'content'], sites: [], enabled: 1, builtin: 1 },
  { id: 'builtin:math', tag: 'Math', terms: ['$$', 'equation', 'integral', 'derivative', 'proof', 'theorem', 'matrix', 'probability'], match: 'any', fields: ['content'], sites: [], enabled: 1, builtin: 1 },
  { id: 'builtin:data', tag: 'Data', terms: ['csv', 'spreadsheet', 'dataframe', 'pandas', 'chart', 'dataset', 'excel', 'pivot'], match: 'any', fields: ['title', 'content'], sites: [], enabled: 1, builtin: 1 },
  { id: 'builtin:research', tag: 'Research', terms: ['sources', 'citation', 'study', 'paper', 'literature', 'compare', 'pros and cons', 'summary of'], match: 'any', fields: ['title', 'content'], sites: [], enabled: 1, builtin: 1 },
  { id: 'builtin:learning', tag: 'Learning', terms: ['explain', 'how does', 'what is', 'teach me', 'eli5', 'tutorial', 'step by step'], match: 'any', fields: ['title', 'content'], sites: [], enabled: 1, builtin: 1 },
  { id: 'builtin:image', tag: 'Images', terms: ['generate an image', 'draw', 'picture of', 'illustration', 'logo'], match: 'any', fields: ['title', 'content'], sites: [], enabled: 1, builtin: 1 },
];

/** Minimum number of distinct terms a built-in "any" rule needs in the content, so one stray word doesn't tag a chat. */
const BUILTIN_MIN_HITS = 2;

export function ruleMatches(rule: TagRuleRow, site: string, title: string, content: string): boolean {
  if (!rule.enabled || !rule.terms.length) return false;
  if (rule.sites.length && !rule.sites.includes(site as never)) return false;
  const hay = [rule.fields.includes('title') ? title : '', rule.fields.includes('content') ? content : ''].join('\n').toLowerCase();
  const hits = rule.terms.filter((t) => hay.includes(t.toLowerCase())).length;
  if (rule.match === 'all') return hits === rule.terms.length;
  const titleHit = rule.fields.includes('title') && rule.terms.some((t) => title.toLowerCase().includes(t.toLowerCase()));
  return rule.builtin ? titleHit || hits >= BUILTIN_MIN_HITS : hits > 0;
}

export function applyRules(rules: TagRuleRow[], site: string, title: string, content: string): string[] {
  return [...new Set(rules.filter((r) => ruleMatches(r, site, title, content)).map((r) => r.tag))].sort();
}
