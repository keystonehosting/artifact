// Auto-archive rules (SPEC §6G): rules are saved here, a daily check counts
// the chats each rule matches and notifies, and nothing is archived until the
// user reviews the list and starts the job.
import { useEffect, useState } from 'preact/hooks';
import { lib } from '../../core/library/client';
import { ruleMatches, type AutoArchiveRule, type RuleCandidate, type ActionJobSpec } from '../../core/bulk/action-job';
import { SITES, type SiteId } from '../../core/sites/sites';
import { NumberField, Section, Toggle } from '../components';
import { t } from '../../core/i18n/t';
import { ActionTask } from './ActionTask';

export const RULES_KEY = 'autoarchive:rules';
const ARCHIVABLE: SiteId[] = ['chatgpt'];

export async function candidates(): Promise<RuleCandidate[]> {
  const [{ rows }, tree] = await Promise.all([lib('chats', { limit: 1_000_000, archived: false }), lib('folderTree', 'manual')]);
  const filed = new Set<string>();
  const walk = async (ns: typeof tree) => {
    for (const n of ns) {
      for (const c of await lib('chatsInFolder', n.id)) filed.add(c.id);
      await walk(n.children);
    }
  };
  await walk(tree);
  return rows.map((r) => ({ id: r.id, site: r.site, title: r.title, pinned: r.pinned, archived: r.archived, updatedAt: r.updatedAt, lastOpenedAt: r.lastOpenedAt, inFolder: filed.has(r.id) }));
}

export function AutoArchive() {
  const [rules, setRules] = useState<AutoArchiveRule[]>([]);
  const [matches, setMatches] = useState<Record<string, RuleCandidate[]>>({});
  const [job, setJob] = useState<ActionJobSpec | null>(null);

  const load = async () => {
    const saved = ((await lib('kvGet', RULES_KEY)) as AutoArchiveRule[] | null) ?? [];
    setRules(saved);
    const cs = await candidates();
    setMatches(Object.fromEntries(saved.map((r) => [r.id, ruleMatches(r, cs, (s) => ARCHIVABLE.includes(s))])));
  };
  useEffect(() => void load(), []);
  const save = async (next: AutoArchiveRule[]) => {
    await lib('kvSet', RULES_KEY, next);
    await load();
  };
  const set = (i: number, patch: Partial<AutoArchiveRule>) => void save(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (job) return <ActionTask spec={job} />;
  return (
    <Section title={t('autoarchive_title')}>
      <p class="hint muted">{t('autoarchive_hint', ARCHIVABLE.map((s) => SITES[s].name).join(', '))}</p>
      {rules.map((r, i) => (
        <div class="preset">
          <div class="row">
            <input type="text" aria-label={t('prompts_name')} value={r.name} onChange={(e) => set(i, { name: (e.target as HTMLInputElement).value })} />
            <button onClick={() => void save(rules.filter((_, j) => j !== i))}>{t('common_remove')}</button>
          </div>
          <Toggle label={t('autoarchive_enabled')} checked={r.enabled} onChange={(v) => set(i, { enabled: v })} />
          <NumberField label={t('autoarchive_days')} value={r.days} min={1} max={3650} suffix={t('autoarchive_days_suffix')} onChange={(v) => set(i, { days: v })} />
          <Toggle label={t('autoarchive_except_pinned')} checked={r.exceptPinned} onChange={(v) => set(i, { exceptPinned: v })} />
          <Toggle label={t('autoarchive_except_folders')} checked={r.exceptInFolders} onChange={(v) => set(i, { exceptInFolders: v })} />
          <p>{t('autoarchive_matches', String(matches[r.id]?.length ?? 0))}</p>
          {matches[r.id]?.length ? (
            <button class="primary" onClick={() => setJob({ kind: 'action', title: r.name, action: 'archive', chatIds: matches[r.id]!.map((c) => c.id), removeFromLibrary: false })}>
              {t('autoarchive_review', String(matches[r.id]!.length))}
            </button>
          ) : null}
        </div>
      ))}
      <button onClick={() => void save([...rules, { id: crypto.randomUUID(), name: t('autoarchive_default_name'), days: 90, exceptPinned: true, exceptInFolders: true, sites: [], enabled: true }])}>{t('autoarchive_add')}</button>
    </Section>
  );
}
