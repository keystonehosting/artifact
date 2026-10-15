import { render } from 'preact';
import '../../ui/tokens.css';
import '../../ui/app.css';
import { useSettings } from '../../ui/app/hooks';
import { SettingsPanel } from '../../ui/app/SettingsPanel';
import { useTheme } from '../../ui/app/theme';
import { t } from '../../core/i18n/t';

function Options() {
  const [settings, update] = useSettings();
  useTheme(settings?.theme ?? 'system');
  return (
    <div class="app" style={{ maxWidth: '760px', margin: '0 auto' }}>
      <header class="app-head">
        <h1>{t('settings_title')}</h1>
      </header>
      {settings && <SettingsPanel settings={settings} update={update} />}
    </div>
  );
}

render(<Options />, document.getElementById('app')!);
