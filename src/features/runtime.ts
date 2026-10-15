// Starts the in-page features enabled in Settings for this site, and
// restarts them when Settings change.
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { SiteInfo } from '../core/sites/sites';
import type { SiteAdapter } from '../adapters/types';
import { loadSettings, onSettingsChanged, type Settings } from '../core/settings/settings';
import { MeterFeature } from './meter';

export async function startFeatures(site: SiteInfo, adapter: SiteAdapter, ctx: ContentScriptContext): Promise<void> {
  let settings: Settings = await loadSettings();
  let meter: MeterFeature | null = null;

  const apply = async () => {
    const on = settings.sites[site.id] !== false;
    const wantMeter = on && (settings.features.meter || settings.features.usage);
    if (wantMeter && !meter) {
      meter = new MeterFeature(adapter, settings);
      await meter.start();
    } else if (!wantMeter && meter) {
      meter.stop();
      meter = null;
    } else meter?.updateSettings(settings);
  };

  await apply();
  const off = onSettingsChanged((s) => {
    settings = s;
    void apply();
  });
  ctx.onInvalidated(() => {
    off();
    meter?.stop();
  });
}
