import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Contexter',
    description: 'Collect sources and export portable context.',
    version: '0.9.12',
    version_name: '0.9.0-test.12',
    permissions: ['activeTab', 'clipboardRead', 'scripting', 'storage'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'Contexter öffnen' },
  },
});
