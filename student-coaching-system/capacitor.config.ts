import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Öğrenci mobil uygulama (App Store / Play Store).
 * Build: npm run build:mobile && npx cap sync
 */
const config: CapacitorConfig = {
  appId: 'com.dersonlinevipkocluk.student',
  appName: 'VIP Koçluk',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'VIP Koçluk'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#1e293b',
      androidSplashResourceName: 'splash',
      showSpinner: false
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    }
  }
};

export default config;
