// Full-text search across every stored chat (SPEC §6C). One MiniSearch
// document per message, persisted in IndexedDB. Filters run on stored
// fields; folders and tags are resolved to chat ids by the caller.
import MiniSearch, { type SearchResult } from 'minisearch';
import type { Conversation } from '../schema/archive';
import { activeBranch, messageText } from '../model/tree';

export interface SearchDoc {
  id: string;
  chatId: string;
  messageId: string;
  site: string;
  role: string;
  model: string;
  title: string;
  text: string;
  at: number;
}

export const INDEX_OPTIONS = {
  fields: ['title', 'text'],
  storeFields: ['chatId', 'messageId', 'site', 'role', 'model', 'at'],
  searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.15, combineWith: 'AND' as const },
};

export function createIndex(): MiniSearch<SearchDoc> {
  return new MiniSearch<SearchDoc>(INDEX_OPTIONS);
}

export function loadIndex(json: string | null): MiniSearch<SearchDoc> {
  if (!json) return createIndex();
  try {
    return MiniSearch.loadJSON<SearchDoc>(json, INDEX_OPTIONS);
  } catch {
    return createIndex();
  }
}

/** Every message on every branch is searchable; the active branch is preferred in ranking by order only. */
export function docsFor(conv: Conversation): SearchDoc[] {
  const active = new Set(activeBranch(conv).map((m) => m.id));
  const all = Object.values(conv.messages).filter((m) => !m.hidden);
  const fallbackAt = Date.parse(conv.updatedAt ?? conv.createdAt ?? '') || 0;
  return all
    .sort((a, b) => Number(active.has(b.id)) - Number(active.has(a.id)))
    .map((m) => ({
      id: `${conv.id}#${m.id}`,
      chatId: conv.id,
      messageId: m.id,
      site: conv.site,
      role: m.role,
      model: m.model ?? conv.model ?? '',
      title: conv.title,
      text: messageText(m),
      at: Date.parse(m.createdAt ?? '') || fallbackAt,
    }))
    .filter((d) => d.text.trim() || d.title);
}

export interface SearchQuery {
  text: string;
  /** Match the exact phrase instead of words. */
  exact?: boolean;
  titlesOnly?: boolean;
  roles?: string[];
  sites?: string[];
  models?: string[];
  from?: number | null;
  to?: number | null;
  /** Limit to these chats (folder or tag filters, resolved by the caller). */
  chatIds?: Set<string> | null;
  /** Must-include / exclude panel. */
  include?: string[];
  includeMode?: 'all' | 'any';
  exclude?: string[];
  limit?: number;
}

export interface Hit {
  chatId: string;
  messageId: string;
  site: string;
  role: string;
  score: number;
  terms: string[];
}

export interface ChatHit {
  chatId: string;
  site: string;
  score: number;
  hits: Hit[];
}

/**
 * Runs a query. Exact phrases and include/exclude terms are checked against
 * the message text through `textOf`, because the index stores no text.
 */
export function search(index: MiniSearch<SearchDoc>, q: SearchQuery, textOf: (chatId: string, messageId: string) => string | null): ChatHit[] {
  const terms = q.text.trim();
  const include = (q.include ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const exclude = (q.exclude ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const query = terms || include.join(' ');
  if (!query) return [];
  const filter = (r: SearchResult) => {
    if (q.roles?.length && !q.roles.includes(r.role as string)) return false;
    if (q.sites?.length && !q.sites.includes(r.site as string)) return false;
    if (q.models?.length && !q.models.includes(r.model as string)) return false;
    if (q.from && (r.at as number) < q.from) return false;
    if (q.to && (r.at as number) > q.to) return false;
    if (q.chatIds && !q.chatIds.has(r.chatId as string)) return false;
    return true;
  };
  const results = index.search(query, {
    filter,
    fields: q.titlesOnly ? ['title'] : ['title', 'text'],
    prefix: !q.exact,
    fuzzy: q.exact ? false : 0.15,
    combineWith: terms ? 'AND' : q.includeMode === 'any' ? 'OR' : 'AND',
  });
  const phrase = q.exact && terms ? terms.toLowerCase() : null;
  const byChat = new Map<string, ChatHit>();
  for (const r of results) {
    const chatId = r.chatId as string;
    const messageId = r.messageId as string;
    if (phrase || include.length || exclude.length) {
      const text = (textOf(chatId, messageId) ?? '').toLowerCase();
      if (phrase && !text.includes(phrase)) continue;
      if (include.length && terms) {
        const ok = q.includeMode === 'any' ? include.some((t) => text.includes(t)) : include.every((t) => text.includes(t));
        if (!ok) continue;
      }
      if (exclude.some((t) => text.includes(t))) continue;
    }
    const hit: Hit = { chatId, messageId, site: r.site as string, role: r.role as string, score: r.score, terms: r.terms };
    const c = byChat.get(chatId);
    if (c) {
      c.hits.push(hit);
      c.score = Math.max(c.score, r.score);
    } else byChat.set(chatId, { chatId, site: hit.site, score: r.score, hits: [hit] });
  }
  return [...byChat.values()].sort((a, b) => b.score - a.score).slice(0, q.limit ?? 200);
}

/** A short excerpt around the first matching term, with matches wrapped for highlighting. */
export function snippet(text: string, terms: string[], width = 160): Array<{ text: string; match: boolean }> {
  const lower = text.toLowerCase();
  const ts = [...new Set(terms.map((t) => t.toLowerCase()).filter(Boolean))].sort((a, b) => b.length - a.length);
  let first = -1;
  for (const t of ts) {
    const i = lower.indexOf(t);
    if (i >= 0 && (first < 0 || i < first)) first = i;
  }
  const start = Math.max(0, first < 0 ? 0 : first - Math.floor(width / 3));
  const slice = text.slice(start, start + width).replace(/\s+/g, ' ');
  const out: Array<{ text: string; match: boolean }> = [];
  if (start > 0) out.push({ text: '…', match: false });
  if (!ts.length) {
    out.push({ text: slice, match: false });
    return out;
  }
  const re = new RegExp(`(${ts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  let last = 0;
  for (const m of slice.matchAll(re)) {
    if (m.index! > last) out.push({ text: slice.slice(last, m.index), match: false });
    out.push({ text: m[0], match: true });
    last = m.index! + m[0].length;
  }
  if (last < slice.length) out.push({ text: slice.slice(last), match: false });
  if (start + width < text.length) out.push({ text: '…', match: false });
  return out;
}
