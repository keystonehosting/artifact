// Settings: sites, features, meter thresholds, warnings, plans and limits,
// export defaults, Obsidian, theme. Shared by the side panel and options page.
import { useState } from 'preact/hooks';
import type { Settings } from '../../core/settings/settings';
import { NumberField, Section, Select, TextField, Toggle } from '../components';
import { t } from '../../core/i18n/t';
import { ALL_SITES, SITES, TIER1_SITES, type SiteId } from '../../core/sites/sites';
import { requestSitePermission } from '../../core/sites/permissions';

const PLAN_OPTIONS: Partial<Record<SiteId, Array<[string, string]>>> = {
  chatgpt: [['auto', 'Detect'], ['free', 'Free'], ['go', 'Go'], ['plus', 'Plus'], ['pro', 'Pro'], ['business', 'Business'], ['enterprise', 'Enterprise']],
  claude: [['auto', 'Detect'], ['free', 'Free'], ['pro', 'Pro'], ['max', 'Max'], ['team', 'Team'], ['enterprise', 'Enterprise']],
  gemini: [['auto', 'Not set'], ['free', 'No plan'], ['plus', 'Google AI Plus'], ['pro', 'Google AI Pro'], ['ultra', 'Google AI Ultra']],
};

export function SettingsPanel({ settings, update }: { settings: Settings; update: (fn: (s: Settings) => void) => void }) {
  const [model, setModel] = useState('');
  const [tokens, setTokens] = useState(0);
  const [siteError, setSiteError] = useState<string | null>(null);
  const s = settings;

  const toggleSite = async (id: SiteId, on: boolean) => {
    setSiteError(null);
    if (on && SITES[id].tier === 2) {
      const granted = await requestSitePermission(id);
      if (!granted) return setSiteError(t('settings_site_denied', SITES[id].name));
    }
    update((x) => void (x.sites[id] = on));
  };

  return (
    <div class="content">
      <Section title={t('settings_sites')}>
        <div class="grid-2">
          {TIER1_SITES.map((id) => (
            <Toggle label={SITES[id].name} checked={s.sites[id] === true} onChange={(v) => void toggleSite(id, v)} />
          ))}
        </div>
        <p class="hint muted">{t('settings_sites_hint')}</p>
        {siteError && <p class="status error">{siteError}</p>}
      </Section>

      <Section title={t('settings_features')}>
        <Toggle label={t('settings_feature_meter')} checked={s.features.meter} onChange={(v) => update((x) => void (x.features.meter = v))} />
        <Toggle label={t('settings_feature_usage')} checked={s.features.usage} onChange={(v) => update((x) => void (x.features.usage = v))} />
        <Toggle label={t('settings_feature_warnings')} checked={s.features.warnings} onChange={(v) => update((x) => void (x.features.warnings = v))} />
        <Toggle label={t('settings_feature_badges')} checked={s.features.messageTokens} onChange={(v) => update((x) => void (x.features.messageTokens = v))} />
        <Toggle label={t('settings_feature_library')} hint={t('settings_feature_library_hint')} checked={s.features.library} onChange={(v) => update((x) => void (x.features.library = v))} />
        <Toggle label={t('settings_feature_sidebar')} checked={s.features.sidebarFolders} onChange={(v) => update((x) => void (x.features.sidebarFolders = v))} />
        <Toggle label={t('settings_feature_tools')} checked={s.features.messageTools} onChange={(v) => update((x) => void (x.features.messageTools = v))} />
        <Toggle label={t('settings_feature_highlights')} checked={s.features.highlights} onChange={(v) => update((x) => void (x.features.highlights = v))} />
        <Toggle label={t('settings_feature_find')} checked={s.features.find} onChange={(v) => update((x) => void (x.features.find = v))} />
        <Toggle label={t('settings_feature_blur')} checked={s.features.blur} onChange={(v) => update((x) => void (x.features.blur = v))} />
      </Section>

      <Section title={t('settings_meter')}>
        <NumberField label={t('settings_amber')} value={s.meter.amber} min={1} max={100} suffix="%" onChange={(v) => update((x) => void (x.meter.amber = v))} />
        <NumberField label={t('settings_orange')} value={s.meter.orange} min={1} max={100} suffix="%" onChange={(v) => update((x) => void (x.meter.orange = v))} />
        <NumberField label={t('settings_red')} value={s.meter.red} min={1} max={100} suffix="%" onChange={(v) => update((x) => void (x.meter.red = v))} />
        <Toggle label={t('settings_show_draft')} checked={s.meter.showDraft} onChange={(v) => update((x) => void (x.meter.showDraft = v))} />
        <TextField
          label={t('settings_warning_levels')}
          value={s.warnings.levels.join(', ')}
          onChange={(v) => {
            const levels = v.split(/[,\s]+/).map(Number).filter((n) => n > 0 && n <= 100);
            if (levels.length) update((x) => void (x.warnings.levels = levels));
          }}
        />
        <Toggle label={t('settings_warnings_muted')} checked={s.warnings.muted} onChange={(v) => update((x) => void (x.warnings.muted = v))} />
        {Object.keys(s.warnings.snoozed).length > 0 && <button onClick={() => update((x) => void (x.warnings.snoozed = {}))}>{t('settings_clear_snoozes')}</button>}
      </Section>

      <Section title={t('settings_plans')}>
        <p class="hint muted">{t('settings_plans_hint')}</p>
        {(Object.keys(PLAN_OPTIONS) as SiteId[]).map((id) => (
          <Select label={SITES[id].name} value={s.plans[id] ?? 'auto'} options={PLAN_OPTIONS[id]!} onChange={(v) => update((x) => void (x.plans[id] = v))} />
        ))}
        <h3 class="muted">{t('settings_limit_overrides')}</h3>
        <table class="dense">
          <tbody>
            {Object.entries(s.limitOverrides).map(([k, v]) => (
              <tr>
                <td>{k.startsWith('site:') ? SITES[k.slice(5) as SiteId]?.name ?? k : k}</td>
                <td class="num">{v.toLocaleString()}</td>
                <td><button onClick={() => update((x) => void delete x.limitOverrides[k])}>{t('common_remove')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="row">
          <input type="text" list="artifact-limit-keys" placeholder={t('settings_limit_model')} aria-label={t('settings_limit_model')} value={model} onChange={(e) => setModel((e.target as HTMLInputElement).value.trim())} style={{ width: '12em' }} />
          <datalist id="artifact-limit-keys">
            {ALL_SITES.map((id) => <option value={`site:${id}`}>{SITES[id].name}</option>)}
          </datalist>
          <input type="number" min={1} placeholder={t('settings_limit_tokens')} aria-label={t('settings_limit_tokens')} value={tokens || ''} onChange={(e) => setTokens(Number((e.target as HTMLInputElement).value))} style={{ width: '9em' }} />
          <button onClick={() => model && tokens > 0 && update((x) => void (x.limitOverrides[model] = Math.round(tokens)))}>{t('common_add')}</button>
        </div>
        <p class="hint muted">{t('settings_limit_hint')}</p>
      </Section>

      <Section title={t('settings_export')}>
        <Select
          label={t('settings_default_format')}
          value={s.export.defaultFormat}
          options={[['md', 'Markdown'], ['txt', 'Text'], ['json', 'JSON'], ['html', 'HTML'], ['docx', 'DOCX'], ['pdf', 'PDF'], ['png', 'PNG']]}
          onChange={(v) => update((x) => void (x.export.defaultFormat = v))}
        />
        <TextField label={t('export_filename')} value={s.export.filenameTemplate} onChange={(v) => update((x) => void (x.export.filenameTemplate = v))} hint={t('export_filename_tokens')} />
        <TextField label={t('settings_obsidian_vault')} value={s.export.obsidianVault} onChange={(v) => update((x) => void (x.export.obsidianVault = v.trim()))} hint={t('settings_obsidian_hint')} />
        <TextField label={t('settings_obsidian_folder')} value={s.export.obsidianFolder} onChange={(v) => update((x) => void (x.export.obsidianFolder = v.trim()))} />
      </Section>

      <Section title={t('settings_appearance')}>
        <Select label={t('settings_theme')} value={s.theme} options={[['system', t('settings_theme_system')], ['light', t('settings_theme_light')], ['dark', t('settings_theme_dark')]]} onChange={(v) => update((x) => void (x.theme = v))} />
      </Section>
    </div>
  );
}
