import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.panther.admin',
  appName: 'PANTHER ADMIN',
  webDir: 'out',
  appendUserAgent: 'PANTHER_MOBILE',
  server: {
    url: 'https://legend-kart.vercel.app/admin',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
