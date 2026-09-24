import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.contexter.local',
  appName: 'Contexter',
  webDir: 'dist',
  plugins: { CapacitorHttp: { enabled: true } },
};

export default config;
