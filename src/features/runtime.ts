// Starts the in-page features enabled in Settings for this site, and
// restarts them when Settings change.
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { SiteInfo } from '../core/sites/sites';
import type { SiteAdapter } from '../adapters/types';
import { loadSettings, onSettingsChanged, type Settings } from '../core/settings/settings';
import { MeterFeature } from './meter';
import { PageState, startReader } from './page-state';
import { startIndexer } from './library/indexer';
import { SidebarTree } from './library/sidebar-tree';
import { MessageTools } from './library/message-tools';
import { Highlights } from './library/highlights';
import { FindBar } from './library/find';
import { setBlur, startBlurHotkey } from './library/blur';
import { resumeJump } from './library/jump';
import { DeepScan } from './library/deepscan';

/** Live feature objects the content-script message handlers act on. */
export interface Features {
  state: PageState;
  find: FindBar;
  scan: DeepScan;
}

type Toggle = { key: string; want(s: Settings): boolean; start(): () => void };

export function createFeatures(adapter: SiteAdapter): Features {
  return { state: new PageState(adapter), find: new FindBar(adapter), scan: new DeepScan(adapter) };
}

export async function startFeatures(site: SiteInfo, adapter: SiteAdapter, ctx: ContentScriptContext, f: Features): Promise<void> {
  let settings: Settings = await loadSettings();
  let meter: MeterFeature | null = null;
  const on = () => settings.sites[site.id] !== false;

  const toggles: Toggle[] = [
    {
      key: 'reader',
      // The meter reads the chat itself; otherwise library features need their own reads.
      want: (s) => !(s.features.meter || s.features.usage) && (s.features.library || s.features.messageTools || s.features.highlights),
      start: () => startReader(adapter),
    },
    { key: 'indexer', want: (s) => s.features.library, start: () => startIndexer(adapter) },
    { key: 'sidebar', want: (s) => s.features.sidebarFolders && adapter.capabilities.sidebarFolders, start: () => new SidebarTree(adapter).start() },
    { key: 'tools', want: (s) => s.features.messageTools, start: () => new MessageTools(adapter, f.state).start() },
    { key: 'highlights', want: (s) => s.features.highlights, start: () => new Highlights(adapter, f.state).start() },
    { key: 'find', want: (s) => s.features.find, start: () => f.find.start() },
    {
      key: 'blur',
      want: (s) => s.features.blur,
      start: () => {
        const off = startBlurHotkey(adapter);
        return () => {
          off();
          setBlur(adapter, false);
        };
      },
    },
  ];
  const running = new Map<string, () => void>();

  const apply = async () => {
    for (const tg of toggles) {
      const want = on() && tg.want(settings);
      const stop = running.get(tg.key);
      if (want && !stop) running.set(tg.key, tg.start());
      else if (!want && stop) {
        stop();
        running.delete(tg.key);
      }
    }
    const wantMeter = on() && (settings.features.meter || settings.features.usage);
    if (wantMeter && !meter) {
      meter = new MeterFeature(adapter, settings);
      await meter.start();
    } else if (!wantMeter && meter) {
      meter.stop();
      meter = null;
    } else meter?.updateSettings(settings);
  };

  const offJump = resumeJump(adapter, f.state);
  await apply();
  const off = onSettingsChanged((s) => {
    settings = s;
    void apply();
  });
  ctx.onInvalidated(() => {
    off();
    offJump();
    f.scan.stop();
    for (const stop of running.values()) stop();
    meter?.stop();
  });
}
