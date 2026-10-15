// Side panel: Artifact's home base. Tabs appear as their features ship.
import { useState } from 'preact/hooks';
import { useActiveTab, useSettings } from './hooks';
import { useTheme } from './theme';
import { Tabs } from '../components';
import { Dashboard } from './Dashboard';
import { ExportPanel } from './ExportPanel';
import { SettingsPanel } from './SettingsPanel';
import { t } from '../../core/i18n/t';

type Tab = 'dashboard' | 'export' | 'settings';

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
          ['export', t('tab_export')],
          ['settings', t('tab_settings')],
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'dashboard' && <Dashboard tab={tab} settings={settings} update={update} />}
      {view === 'export' && <ExportPanel tab={tab} settings={settings} update={update} />}
      {view === 'settings' && <SettingsPanel settings={settings} update={update} />}
    </div>
  );
}
