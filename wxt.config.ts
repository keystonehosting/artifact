import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { TIER1_HOST_PERMISSIONS, TIER1_ASSET_HOST_PERMISSIONS, TIER2_HOST_PERMISSIONS } from './src/core/sites/hosts';

// Every permission is justified in docs/permissions.md.
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  manifestVersion: 3,
  zip: {
    artifactTemplate: 'artifact-{{version}}-{{browser}}.zip',
  },
  vite: () => ({
    plugins: [preact()],
    build: { modulePreload: false, chunkSizeWarningLimit: 4096 },
  }),
  manifest: ({ browser }) => {
    const firefox = browser === 'firefox';
    const permissions = ['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'downloads', 'scripting', 'clipboardWrite', 'notifications'];
    if (!firefox) permissions.push('sidePanel', 'offscreen');
    return {
      name: '__MSG_extensionName__',
      short_name: '__MSG_extensionShortName__',
      description: '__MSG_extensionDescription__',
      default_locale: 'en',
      homepage_url: 'https://github.com/keystonehosting/artifact',
      permissions,
      host_permissions: [...TIER1_HOST_PERMISSIONS, ...TIER1_ASSET_HOST_PERMISSIONS],
      optional_host_permissions: [...TIER2_HOST_PERMISSIONS],
      icons: { '16': 'icons/icon16.png', '32': 'icons/icon32.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' },
      commands: {
        'copy-markdown': { suggested_key: { default: 'Alt+Shift+C' }, description: '__MSG_command_copy_markdown__' },
        'export-chat': { suggested_key: { default: 'Alt+Shift+D' }, description: '__MSG_command_export__' },
        'open-preview': { suggested_key: { default: 'Alt+Shift+P' }, description: '__MSG_command_preview__' },
        'open-panel': { suggested_key: { default: 'Alt+Shift+A' }, description: '__MSG_command_open_panel__' },
        'find-in-chat': { description: '__MSG_command_find__' },
        'privacy-blur': { description: '__MSG_command_blur__' },
      },
      action: {
        default_title: '__MSG_extensionShortName__',
        default_icon: { '16': 'icons/icon16.png', '32': 'icons/icon32.png' },
      },
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self'",
        ...(firefox ? {} : { sandbox: "sandbox allow-scripts; script-src 'self' 'unsafe-inline'; object-src 'none'" }),
      },
      ...(firefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'artifact@keystonehosting.dev',
                strict_min_version: '128.0',
                data_collection_permissions: { required: ['none'] },
              },
            },
          }
        : {}),
    };
  },
});
