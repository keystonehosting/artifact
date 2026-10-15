// Side panel: Artifact's home base. Tabs appear as their features ship.
import { useState } from 'preact/hooks';
import { useActiveTab, useSettings } from './hooks';
import { useTheme } from './theme';
import { Tabs } from '../components';
import { Dashboard } from './Dashboard';
import { ExportPanel } from './ExportPanel';
import { SettingsPanel } from './SettingsPanel';
import { FoldersPanel } from './FoldersPanel';
import { SearchPanel } from './SearchPanel';
import { LibraryPanel } from './LibraryPanel';
import { PromptsPanel } from './PromptsPanel';
import { CrossAiPanel } from './CrossAiPanel';
import { DataPanel } from './DataPanel';
import { t } from '../../core/i18n/t';

type Tab = 'dashboard' | 'prompts' | 'crossai' | 'folders' | 'search' | 'library' | 'export' | 'data' | 'settings';

export function SidePanel() {
  const [settings, update] = useSettings();
  const tab = useActiveTab();
  const [view, setView] = useState<Tab>('dashboard');
  useTheme(settings?.theme ?? 'system');
  if (!settings) return null;
  return (
    <div class="app">
      <Tabs<Tab>
        tabs={[
          ['dashboard', t('tab_dashboard')],
          ['prompts', t('tab_prompts')],
          ['crossai', t('tab_crossai')],
          ['folders', t('tab_folders')],
          ['search', t('tab_search')],
          ['library', t('tab_library')],
          ['export', t('tab_export')],
          ['data', t('tab_data')],
          ['settings', t('tab_settings')],
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'dashboard' && <Dashboard tab={tab} settings={settings} update={update} />}
      {view === 'prompts' && <PromptsPanel tab={tab} />}
      {view === 'crossai' && <CrossAiPanel tab={tab} settings={settings} update={update} />}
      {view === 'folders' && <FoldersPanel tab={tab} />}
      {view === 'search' && <SearchPanel tab={tab} />}
      {view === 'library' && <LibraryPanel />}
      {view === 'export' && <ExportPanel tab={tab} settings={settings} update={update} />}
      {view === 'data' && <DataPanel />}
      {view === 'settings' && <SettingsPanel settings={settings} update={update} />}
    </div>
  );
}
