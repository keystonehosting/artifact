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
import { t } from '../../core/i18n/t';

type Tab = 'dashboard' | 'folders' | 'search' | 'library' | 'export' | 'settings';

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
          ['folders', t('tab_folders')],
          ['search', t('tab_search')],
          ['library', t('tab_library')],
          ['export', t('tab_export')],
          ['settings', t('tab_settings')],
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'dashboard' && <Dashboard tab={tab} settings={settings} update={update} />}
      {view === 'folders' && <FoldersPanel tab={tab} />}
      {view === 'search' && <SearchPanel tab={tab} />}
      {view === 'library' && <LibraryPanel />}
      {view === 'export' && <ExportPanel tab={tab} settings={settings} update={update} />}
      {view === 'settings' && <SettingsPanel settings={settings} update={update} />}
    </div>
  );
}
