// User settings, validated with Zod and stored in storage.local. Missing or
// invalid fields fall back to defaults field by field, so an older or newer
// stored shape never breaks the extension.
import { z } from 'zod';
import { browser } from 'wxt/browser';
import { ALL_SITES, TIER1_SITES, type SiteId } from '../sites/sites';
import { DEFAULT_EXPORT_OPTIONS } from '../export/document';

const KEY = 'settings';

const siteFlags = (on: readonly string[]) => Object.fromEntries(ALL_SITES.map((s) => [s, on.includes(s)])) as Record<SiteId, boolean>;

export const SettingsSchema = z.object({
  version: z.literal(1).catch(1),
  theme: z.enum(['system', 'light', 'dark']).catch('system'),
  sites: z.record(z.string(), z.boolean()).catch(siteFlags(TIER1_SITES)),
  features: z
    .object({
      meter: z.boolean().catch(true),
      usage: z.boolean().catch(true),
      warnings: z.boolean().catch(true),
      messageTokens: z.boolean().catch(true),
    })
    .catch({ meter: true, usage: true, warnings: true, messageTokens: true }),
  meter: z
    .object({
      amber: z.number().min(1).max(100).catch(50),
      orange: z.number().min(1).max(100).catch(75),
      red: z.number().min(1).max(100).catch(90),
      showDraft: z.boolean().catch(true),
    })
    .catch({ amber: 50, orange: 75, red: 90, showDraft: true }),
  warnings: z
    .object({
      levels: z.array(z.number().min(1).max(100)).catch([75, 90]),
      muted: z.boolean().catch(false),
      /** chat key -> epoch ms until which warnings are snoozed */
      snoozed: z.record(z.string(), z.number()).catch({}),
    })
    .catch({ levels: [75, 90], muted: false, snoozed: {} }),
  /** Plan per site for limit lookup; 'auto' uses detection when the site exposes it. */
  plans: z.record(z.string(), z.string()).catch({}),
  /** Context limit overrides: model slug or "site:<id>" -> tokens. */
  limitOverrides: z.record(z.string(), z.number().int().positive()).catch({}),
  /** ChatGPT local rate-limit widget: the user's own caps per model. */
  chatgptCaps: z.array(z.object({ model: z.string(), count: z.number().int().positive(), hours: z.number().positive() })).catch([]),
  export: z
    .object({
      defaultFormat: z.enum(['md', 'txt', 'json', 'html', 'pdf', 'docx', 'png']).catch('md'),
      filenameTemplate: z.string().catch(DEFAULT_EXPORT_OPTIONS.filenameTemplate),
      numbering: z.enum(['off', 'per-message', 'per-turn']).catch('off'),
      includeTimestamps: z.boolean().catch(false),
      includeToc: z.boolean().catch(false),
      includeThinking: z.boolean().catch(false),
      includeImages: z.boolean().catch(true),
      includeFiles: z.boolean().catch(true),
      includeArtifacts: z.boolean().catch(true),
      includeToolCalls: z.boolean().catch(true),
      includeCredit: z.boolean().catch(false),
      branches: z.enum(['active', 'all']).catch('active'),
      obsidianVault: z.string().catch(''),
      obsidianFolder: z.string().catch('AI Chats'),
    })
    .catch({
      defaultFormat: 'md',
      filenameTemplate: DEFAULT_EXPORT_OPTIONS.filenameTemplate,
      numbering: 'off',
      includeTimestamps: false,
      includeToc: false,
      includeThinking: false,
      includeImages: true,
      includeFiles: true,
      includeArtifacts: true,
      includeToolCalls: true,
      includeCredit: false,
      branches: 'active',
      obsidianVault: '',
      obsidianFolder: 'AI Chats',
    }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function parseSettings(raw: unknown): Settings {
  return SettingsSchema.parse(raw && typeof raw === 'object' ? raw : {});
}

export const DEFAULT_SETTINGS: Settings = parseSettings({});

export async function loadSettings(): Promise<Settings> {
  const got = await browser.storage.local.get(KEY);
  return parseSettings(got[KEY]);
}

export async function saveSettings(s: Settings): Promise<void> {
  await browser.storage.local.set({ [KEY]: SettingsSchema.parse(s) });
}

export async function updateSettings(fn: (s: Settings) => Settings | void): Promise<Settings> {
  const cur = await loadSettings();
  const draft = structuredClone(cur);
  const next = fn(draft) ?? draft;
  await saveSettings(next);
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && KEY in changes) cb(parseSettings(changes[KEY]!.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
