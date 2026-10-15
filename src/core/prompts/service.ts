// Prompt library, chains, prompt files, prompt history, handoff history and
// drafts (SPEC §6D, §6E, §6I). Runs in the background behind `lib:call`.
import { z } from 'zod';
import { db, newId, type ChainRow, type ChainStep, type DraftRow, type HandoffRow, type PromptFileRow, type PromptRow } from '../db/db';
import type { SiteId } from '../sites/sites';
import starter from './starter-pack.json';

const HISTORY_PER_SITE = 300;
const HANDOFFS_KEPT = 20;

export const CATEGORIES = ['general', 'work', 'writing', 'coding', 'learning', 'creative', 'personal'] as const;

export type PromptInput = Partial<Omit<PromptRow, 'id' | 'createdAt' | 'updatedAt' | 'uses' | 'lastUsedAt'>> & { id?: string; name: string; body: string };

function checkPrompt(p: { name: string; body: string }): void {
  if (!p.name.trim()) throw new Error('A prompt needs a name');
  if (p.name.length > 100) throw new Error('Prompt names are limited to 100 characters');
  if (!p.body.trim()) throw new Error('A prompt needs text');
  if (p.body.length > 50_000) throw new Error('Prompt text is limited to 50,000 characters');
}

export async function savePrompt(input: PromptInput): Promise<PromptRow> {
  checkPrompt(input);
  const now = Date.now();
  const prev = input.id ? await db().prompts.get(input.id) : undefined;
  const row: PromptRow = {
    id: prev?.id ?? newId(),
    name: input.name.trim(),
    body: input.body,
    category: (input.category ?? prev?.category ?? 'general').trim() || 'general',
    favorite: input.favorite ?? prev?.favorite ?? 0,
    pinned: input.pinned ?? prev?.pinned ?? 0,
    uses: prev?.uses ?? 0,
    lastUsedAt: prev?.lastUsedAt ?? null,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    autoSend: input.autoSend ?? prev?.autoSend ?? false,
    fileIds: input.fileIds ?? prev?.fileIds ?? [],
    source: input.source ?? prev?.source ?? null,
  };
  await db().prompts.put(row);
  return row;
}

export type PromptSort = 'recent' | 'used' | 'az' | 'za' | 'newest';

export async function listPrompts(sort: PromptSort = 'recent'): Promise<PromptRow[]> {
  const rows = await db().prompts.toArray();
  const by: Record<PromptSort, (a: PromptRow, b: PromptRow) => number> = {
    recent: (a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt),
    used: (a, b) => b.uses - a.uses,
    az: (a, b) => a.name.localeCompare(b.name),
    za: (a, b) => b.name.localeCompare(a.name),
    newest: (a, b) => b.createdAt - a.createdAt,
  };
  return rows.sort((a, b) => b.pinned - a.pinned || by[sort](a, b));
}

export async function usePrompt(id: string): Promise<void> {
  const p = await db().prompts.get(id);
  if (p) await db().prompts.update(id, { uses: p.uses + 1, lastUsedAt: Date.now() });
}

export async function deletePrompts(ids: string[]): Promise<void> {
  await db().prompts.bulkDelete(ids);
}

/** Adds the starter prompts that aren't in the library yet. Returns how many were added. */
export async function importStarter(): Promise<number> {
  const have = new Set((await db().prompts.toArray()).map((p) => p.source).filter(Boolean));
  let added = 0;
  for (const item of starter.items) {
    const source = `starter:${item.name}`;
    if (have.has(source)) continue;
    await savePrompt({ name: item.name, body: item.body, category: item.category, source });
    added++;
  }
  return added;
}

/** A prompt from the user's own library for today: favorites first, the same one all day. */
export async function promptOfTheDay(today = new Date()): Promise<PromptRow | null> {
  const all = await db().prompts.toArray();
  const pool = all.some((p) => p.favorite) ? all.filter((p) => p.favorite) : all;
  if (!pool.length) return null;
  pool.sort((a, b) => a.id.localeCompare(b.id));
  const day = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000);
  return pool[day % pool.length]!;
}

// ---------- import / export ----------

const PromptFileSchema = z.object({
  format: z.literal('artifact-prompts'),
  version: z.literal(1),
  prompts: z.array(z.object({ name: z.string(), body: z.string(), category: z.string().optional(), favorite: z.boolean().optional(), autoSend: z.boolean().optional() })),
  chains: z.array(z.object({ name: z.string(), steps: z.array(z.object({ name: z.string().optional(), text: z.string(), after: z.enum(['reply', 'confirm']).optional() })) })).optional(),
});

export async function exportPrompts(ids?: string[]): Promise<string> {
  const prompts = ids ? (await db().prompts.bulkGet(ids)).filter((p): p is PromptRow => !!p) : await db().prompts.toArray();
  const chains = ids ? [] : await db().chains.toArray();
  return JSON.stringify(
    {
      format: 'artifact-prompts',
      version: 1,
      prompts: prompts.map((p) => ({ name: p.name, body: p.body, category: p.category, favorite: !!p.favorite, autoSend: p.autoSend })),
      chains: chains.map((c) => ({ name: c.name, steps: c.steps })),
    },
    null,
    2,
  );
}

/**
 * Imports an Artifact prompts file, or a plain text / Markdown file as one
 * prompt named after the file. Prompts with the same name and text are skipped.
 */
export async function importPrompts(text: string, fileName = 'Imported prompt'): Promise<{ prompts: number; chains: number }> {
  let parsed: z.infer<typeof PromptFileSchema> | null;
  try {
    parsed = PromptFileSchema.parse(JSON.parse(text));
  } catch {
    parsed = null;
  }
  const existing = await db().prompts.toArray();
  const seen = new Set(existing.map((p) => `${p.name}\u0000${p.body}`));
  if (!parsed) {
    if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) throw new Error('This JSON file is not an Artifact prompts file');
    const name = fileName.replace(/\.(txt|md|markdown)$/i, '').slice(0, 100) || 'Imported prompt';
    if (seen.has(`${name}\u0000${text}`)) return { prompts: 0, chains: 0 };
    await savePrompt({ name, body: text });
    return { prompts: 1, chains: 0 };
  }
  let prompts = 0;
  for (const p of parsed.prompts) {
    if (seen.has(`${p.name}\u0000${p.body}`)) continue;
    await savePrompt({ name: p.name.slice(0, 100), body: p.body, category: p.category, favorite: p.favorite ? 1 : 0, autoSend: p.autoSend ?? false });
    prompts++;
  }
  let chains = 0;
  const haveChains = new Set((await db().chains.toArray()).map((c) => c.name));
  for (const c of parsed.chains ?? []) {
    if (haveChains.has(c.name)) continue;
    await saveChain({ name: c.name, steps: c.steps.map((s) => ({ name: s.name ?? '', text: s.text, after: s.after ?? 'reply' })) });
    chains++;
  }
  return { prompts, chains };
}

// ---------- chains ----------

/** Splits pasted text into steps at lines that hold only `---`. */
export function splitSteps(text: string): string[] {
  return text
    .split(/^\s*---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveChain(input: { id?: string; name: string; steps: ChainStep[] }): Promise<ChainRow> {
  if (!input.name.trim()) throw new Error('A chain needs a name');
  const steps = input.steps.filter((s) => s.text.trim());
  if (!steps.length) throw new Error('A chain needs at least one step');
  if (steps.length > 50) throw new Error('Chains are limited to 50 steps');
  const prev = input.id ? await db().chains.get(input.id) : undefined;
  const now = Date.now();
  const row: ChainRow = { id: prev?.id ?? newId(), name: input.name.trim(), steps, uses: prev?.uses ?? 0, lastUsedAt: prev?.lastUsedAt ?? null, createdAt: prev?.createdAt ?? now, updatedAt: now };
  await db().chains.put(row);
  return row;
}

export async function listChains(): Promise<ChainRow[]> {
  return (await db().chains.toArray()).sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt));
}

export async function useChain(id: string): Promise<void> {
  const c = await db().chains.get(id);
  if (c) await db().chains.update(id, { uses: c.uses + 1, lastUsedAt: Date.now() });
}

// ---------- files attached to prompts ----------

export async function addPromptFile(f: Omit<PromptFileRow, 'id' | 'addedAt'>): Promise<PromptFileRow> {
  const same = (await db().promptFiles.toArray()).find((x) => x.name === f.name && x.size === f.size);
  if (same) return same;
  if (f.size > 20 * 1024 * 1024) throw new Error('Prompt files are limited to 20 MB each');
  const row = { ...f, id: newId(), addedAt: Date.now() };
  await db().promptFiles.add(row);
  return row;
}

// ---------- prompt history ----------

export async function addHistory(site: SiteId, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  const d = db();
  const last = await d.history.where('site').equals(site).last();
  if (last?.text === t) return;
  await d.history.add({ site, text: t, at: Date.now() });
  const count = await d.history.where('site').equals(site).count();
  if (count > HISTORY_PER_SITE) {
    const old = await d.history.where('site').equals(site).limit(count - HISTORY_PER_SITE).primaryKeys();
    await d.history.bulkDelete(old);
  }
}

/** Newest first. */
export async function history(site: SiteId | null, limit = 100): Promise<Array<{ text: string; at: number; site: SiteId }>> {
  const rows = site ? await db().history.where('site').equals(site).toArray() : await db().history.toArray();
  return rows
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ text, at, site: s }) => ({ text, at, site: s }));
}

// ---------- handoffs and drafts ----------

export async function addHandoff(h: Omit<HandoffRow, 'id' | 'at'>): Promise<HandoffRow> {
  const row = { ...h, id: newId(), at: Date.now() };
  const d = db();
  await d.handoffs.add(row);
  const all = await d.handoffs.orderBy('at').reverse().primaryKeys();
  if (all.length > HANDOFFS_KEPT) await d.handoffs.bulkDelete(all.slice(HANDOFFS_KEPT));
  return row;
}

export async function setDraft(key: string, text: string): Promise<void> {
  if (text.trim()) await db().drafts.put({ key, text, updatedAt: Date.now() } satisfies DraftRow);
  else await db().drafts.delete(key);
}
