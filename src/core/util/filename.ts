/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Derived from ACE content/utils/filename.js (Covai-Labs/ace@671dfc8, MPL-2.0).
 * Changes: TypeScript, Artifact's site names, {site}/{model}/{id} tokens. */

export const DEFAULT_FILENAME_TEMPLATE = '{platform} - {title} - {datetime}';

const BRAND_PATTERNS: RegExp[] = [
  /^(?:Google\s+)?Gemini(?:\s+Advanced)?\s*[-–—|:]\s*/i,
  /\s*[-–—|:]\s*(?:Google\s+)?Gemini(?:\s+Advanced)?$/i,
  /^ChatGPT\s*[-–—|:]\s*/i,
  /\s*[-–—|:]\s*ChatGPT$/i,
  /^Claude\s*[-–—|:]\s*/i,
  /\s*[-–—|:]\s*Claude$/i,
  /^Grok\s*[-–—|:]\s*/i,
  /\s*[-–—|:]\s*Grok$/i,
  /^DeepSeek\s*[-–—|:]\s*/i,
  /\s*[-–—|:]\s*DeepSeek$/i,
  /^Perplexity\s*[-–—|:]\s*/i,
  /\s*[-–—|:]\s*Perplexity$/i,
  /^Mistral(?:\s+AI)?\s*[-–—|:]\s*/i,
  /\s*[-–—|:]\s*(?:Le Chat|Mistral(?:\s+AI)?)$/i,
  /^(?:Microsoft\s+)?Copilot\s*[-–—|:]\s*/i,
  /\s*[-–—|:]\s*(?:Microsoft\s+)?Copilot$/i,
  /^Google AI Studio\s*[-–—|:]\s*/i,
  /\s*[-–—|:]\s*Google AI Studio$/i,
];

const GENERIC_TITLES = new Set([
  'conversation',
  'chat',
  'ai conversation',
  'ai chat',
  'untitled',
  'untitled chat',
  'untitled conversation',
  'new chat',
  'new conversation',
  'chat export',
]);

const COMMON_BRANDS = new Set([
  'gemini',
  'google gemini',
  'gemini advanced',
  'chatgpt',
  'claude',
  'grok',
  'deepseek',
  'perplexity',
  'mistral',
  'mistral ai',
  'le chat',
  'copilot',
  'microsoft copilot',
  'google ai studio',
  'kimi',
  'poe',
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strips site branding and separators from a raw document title. */
export function cleanPageTitle(rawTitle: string, platform = ''): string {
  if (!rawTitle) return '';
  let cleaned = rawTitle.replace(/\s+/g, ' ').trim();
  const patterns = [...BRAND_PATTERNS];
  if (platform.trim()) {
    const escaped = escapeRegExp(platform.trim());
    patterns.unshift(
      new RegExp(`^(?:Google\\s+)?${escaped}\\s*[-–—|:]\\s*`, 'i'),
      new RegExp(`\\s*[-–—|:]\\s*(?:Google\\s+)?${escaped}$`, 'i'),
    );
  }
  for (const p of patterns) cleaned = cleaned.replace(p, '').trim();
  cleaned = cleaned.replace(/^[-–—|:·/\\\s]+|[-–—|:·/\\\s]+$/g, '').trim();
  return isGenericTitle(cleaned, platform) ? '' : cleaned;
}

export function isGenericTitle(title: string, platform = ''): boolean {
  const t = title.trim().toLowerCase();
  if (t.length <= 1) return true;
  if (GENERIC_TITLES.has(t) || COMMON_BRANDS.has(t)) return true;
  const p = platform.trim().toLowerCase();
  if (p && (t === p || t === `${p} conversation` || t === `${p} chat` || t === `google ${p}`)) return true;
  return false;
}

export function resolveConversationTitle(title: string | null | undefined, platform = 'AI', doc?: { title: string } | null): string {
  const trimmed = (title ?? '').trim();
  if (trimmed && !isGenericTitle(trimmed, platform)) return trimmed;
  if (doc?.title) {
    const cleaned = cleanPageTitle(doc.title, platform);
    if (cleaned) return cleaned;
  }
  return platform ? `${platform} Conversation` : 'Conversation';
}

// eslint-disable-next-line no-control-regex -- control characters are illegal in filenames
const ILLEGAL = /[/\\?%*:|"<>\u0000-\u001f]/g;

export function sanitizeFilenamePart(s: string, fallback: string): string {
  return s.replace(ILLEGAL, '').replace(/\s+/g, ' ').trim() || fallback;
}

export interface FilenameContext {
  platform?: string;
  title?: string;
  date?: Date | number | string;
  model?: string | null;
  id?: string | null;
}

/**
 * Formats a filename from a template. Tokens: {platform}, {title}, {date},
 * {time}, {datetime}, {timestamp}, {model}, {id}. Returns the name without extension.
 */
export function formatFilename(template: string | null | undefined, ctx: FilenameContext = {}): string {
  const platform = ctx.platform ?? 'AI';
  const now = ctx.date instanceof Date ? ctx.date : new Date(ctx.date ?? Date.now());
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const cleanTitle = sanitizeFilenamePart(resolveConversationTitle(ctx.title, platform), 'Conversation');
  const cleanPlatform = sanitizeFilenamePart(platform, 'AI');
  const replacements: Record<string, string> = {
    '{platform}': cleanPlatform,
    '{title}': cleanTitle,
    '{date}': `${yyyy}-${mm}-${dd}`,
    '{time}': `${hh}-${min}`,
    '{datetime}': `${yyyy}-${mm}-${dd}_${hh}-${min}`,
    '{timestamp}': `${yyyy}-${mm}-${dd}_${hh}-${min}`,
    '{model}': sanitizeFilenamePart(ctx.model ?? '', ''),
    '{id}': sanitizeFilenamePart(ctx.id ?? '', ''),
  };
  let out = template?.trim() || DEFAULT_FILENAME_TEMPLATE;
  for (const [token, val] of Object.entries(replacements)) out = out.replaceAll(token, val);
  const final = out.replace(ILLEGAL, '').replace(/\s+/g, ' ').replace(/\s+-\s+(?=-|$)/g, '').trim().slice(0, 200);
  return final || `${cleanPlatform} - ${cleanTitle}`;
}

/** Makes `name` unique within `taken` by appending " (2)", " (3)"... before the extension. */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}
