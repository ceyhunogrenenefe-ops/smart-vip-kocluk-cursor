import { Capacitor } from '@capacitor/core';

/** Capacitor iOS/Android kabuğu içinde mi? */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}

/** Mobil build — API aynı origin değil; production backend gerekir */
export function isMobileApiBuild(): boolean {
  return Boolean(String(import.meta.env.VITE_API_BASE_URL || '').trim());
}

export async function initNativeApp(): Promise<void> {
  if (!isNativeApp()) return;

  document.documentElement.classList.add('native-app', `native-${nativePlatform()}`);

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#1e293b' });
    }
  } catch {
    /* plugin yok */
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* plugin yok */
  }

  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
  } catch {
    /* plugin yok */
  }

  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    Keyboard.addListener('keyboardWillShow', () => {
      document.documentElement.classList.add('keyboard-open');
    });
    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.classList.remove('keyboard-open');
    });
  } catch {
    /* plugin yok */
  }
}
