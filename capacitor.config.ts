import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.goedacsess.app',
  appName: 'Goed Acsess',
  webDir: 'src',
  // Menutup Web Inspector (iOS) dan remote debugging chrome://inspect (Android).
  // Setel true sementara kalau perlu membedah WebView di perangkat saat ngoding.
  ios: { webContentsDebuggingEnabled: false },
  android: { webContentsDebuggingEnabled: false }
};

export default config;
