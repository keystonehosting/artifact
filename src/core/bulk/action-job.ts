// Bulk actions that change the user's account (SPEC §0.5, §6G): delete,
// archive, unarchive. The caller shows a preview list and asks for typed
// confirmation above 10 items; this runs them one at a time, paced, with
// pause and cancel, and logs every item.
import type { SiteId } from '../sites/sites';
import { StopError, type LogEntry } from './export-job';

export type BulkAction = 'delete' | 'archive' | 'unarchive';

export interface ActionJobSpec {
  kind: 'action';
  title: string;
  action: BulkAction;
  chatIds: string[];
  /** After a site delete, also remove Artifact's stored copy. */
  removeFromLibrary: boolean;
}

/** Typed confirmation is required above this many items. */
export const TYPED_CONFIRM_ABOVE = 10;

export function needsTypedConfirm(count: number): boolean {
  return count > TYPED_CONFIRM_ABOVE;
}

/** What the user must type, e.g. "delete 23". */
export function confirmPhrase(action: BulkAction, count: number): string {
  return `${action} ${count}`;
}

export function confirmMatches(typed: string, action: BulkAction, count: number): boolean {
  return typed.trim().toLowerCase().replace(/\s+/g, ' ') === confirmPhrase(action, count);
}

export interface ActionDeps {
  can(site: SiteId, action: BulkAction): boolean;
  run(site: SiteId, siteChatId: string, action: BulkAction): Promise<void>;
  title(chatId: string): string;
  /** Local follow-up after a successful site change (archived flag, removal). */
  after(chatId: string, action: BulkAction): Promise<void>;
  log(entry: LogEntry): void;
  progress(done: number, total: number, label: string): void;
  gate(): Promise<void>;
  sleep(ms: number): Promise<void>;
  /** Gap between items, on top of the site's own rate limiter. */
  gapMs: number;
}

export async function runActionJob(spec: ActionJobSpec, d: ActionDeps): Promise<{ ok: number; failed: number; skipped: number; stopped: boolean }> {
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  let done = 0;
  const total = spec.chatIds.length;
  try {
    for (const chatId of spec.chatIds) {
      await d.gate();
      const site = chatId.slice(0, chatId.indexOf(':')) as SiteId;
      const siteChatId = chatId.slice(chatId.indexOf(':') + 1);
      const title = d.title(chatId);
      d.progress(done, total, title);
      const at = () => new Date().toISOString();
      if (!d.can(site, spec.action)) {
        skipped++;
        d.log({ at: at(), chatId, title, result: 'skipped', detail: `${spec.action} is not available on this site` });
      } else {
        try {
          await d.run(site, siteChatId, spec.action);
          await d.after(chatId, spec.action);
          ok++;
          d.log({ at: at(), chatId, title, result: 'ok', detail: spec.action });
        } catch (e) {
          if (e instanceof StopError) throw e;
          failed++;
          d.log({ at: at(), chatId, title, result: 'failed', detail: (e as Error).message });
        }
        await d.sleep(d.gapMs);
      }
      done++;
      d.progress(done, total, '');
    }
  } catch (e) {
    if (!(e instanceof StopError)) throw e;
    return { ok, failed, skipped, stopped: true };
  }
  return { ok, failed, skipped, stopped: false };
}

/** The log as CSV, for the downloadable record. */
export function logCsv(entries: LogEntry[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ['time,chat,title,result,detail', ...entries.map((e) => [e.at, e.chatId, e.title, e.result, e.detail].map(q).join(','))].join('\n') + '\n';
}

// ---------- auto-archive rules ----------

export interface AutoArchiveRule {
  id: string;
  name: string;
  /** Untouched (no update and not opened) for at least this many days. */
  days: number;
  exceptPinned: boolean;
  exceptInFolders: boolean;
  /** Empty: every site that can archive. */
  sites: SiteId[];
  enabled: boolean;
}

export interface RuleCandidate {
  id: string;
  site: SiteId;
  title: string;
  pinned: 0 | 1;
  archived: 0 | 1;
  updatedAt: string | null;
  lastOpenedAt: number | null;
  inFolder: boolean;
}

/** Chats a rule would archive now. Nothing is archived without the user starting it. */
export function ruleMatches(rule: AutoArchiveRule, chats: RuleCandidate[], canArchive: (site: SiteId) => boolean, now = Date.now()): RuleCandidate[] {
  const cutoff = now - rule.days * 86_400_000;
  return chats.filter((c) => {
    if (c.archived || !canArchive(c.site)) return false;
    if (rule.sites.length && !rule.sites.includes(c.site)) return false;
    if (rule.exceptPinned && c.pinned) return false;
    if (rule.exceptInFolders && c.inFolder) return false;
    const last = Math.max(Date.parse(c.updatedAt ?? '') || 0, c.lastOpenedAt ?? 0);
    return last > 0 && last < cutoff;
  });
}
