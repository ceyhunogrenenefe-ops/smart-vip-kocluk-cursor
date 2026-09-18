/** FAZ 4 — CRM Web Push (tarayıcı / PWA) istemci tarafı */
import { apiFetch } from './session';

const SW_URL = '/crm-sw.js';
const SW_SCOPE = '/crm/';
export const PUSH_FLAG_KEY = 'crm_push_enabled';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on' | 'ios_needs_install';

async function inbox<T>(op: string, body?: Record<string, unknown>): Promise<T> {
  const res = await apiFetch(`/api/crm-inbox?op=${encodeURIComponent(op)}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, ...body }) }
    : {});
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `crm_${op}_failed`);
  return json as T;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function setPushFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(PUSH_FLAG_KEY, '1');
    else localStorage.removeItem(PUSH_FLAG_KEY);
  } catch {
    /* depolama kapalı */
  }
}

export function pushFlagOn() {
  try {
    return localStorage.getItem(PUSH_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export async function getPushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return isIos() && !isStandalone() ? 'ios_needs_install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  const on = Boolean(sub) && Notification.permission === 'granted';
  setPushFlag(on);
  return on ? 'on' : 'off';
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

/** Service worker aktif olana kadar bekle (navigator.serviceWorker.ready sayfa kapsam dışındaysa hiç çözülmez) */
function waitActive(reg: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (reg.active) return Promise.resolve(reg);
  const sw = reg.installing || reg.waiting;
  return new Promise((resolve) => {
    if (!sw) return resolve(reg);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') resolve(reg);
    });
  });
}

function pushServiceError(e: unknown) {
  const name = e instanceof DOMException ? e.name : '';
  const msg = e instanceof Error ? e.message : String(e);
  if (name === 'NotAllowedError') return new Error('Bildirim izni verilmedi.');
  if (name === 'AbortError' || /push service/i.test(msg)) {
    return new Error(
      'Tarayıcının bildirim servisine bağlanılamadı. Brave kullanıyorsanız Ayarlar → Gizlilik → “Anlık mesajlaşma için Google hizmetlerini kullan” açık olmalı; aksi halde Chrome / Edge ile deneyin.'
    );
  }
  return new Error(`Bildirim aboneliği oluşturulamadı: ${msg}`);
}

export async function enablePush(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return isIos() && !isStandalone() ? 'ios_needs_install' : 'unsupported';
  }
  // İzin isteği tıklamadan hemen sonra (başka await olmadan) — Safari / Edge aksi halde sessizce reddeder
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  } catch (e) {
    throw new Error(`Bildirim servisi yüklenemedi: ${e instanceof Error ? e.message : String(e)}`);
  }
  await withTimeout(waitActive(reg), 15000, 'Bildirim servisi başlatılamadı (zaman aşımı). Sayfayı yenileyip tekrar deneyin.');

  const { data } = await inbox<{ data: { public_key: string } }>('push_key');
  const appKey = urlBase64ToUint8Array(data.public_key);
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Eski / farklı anahtarla oluşmuş abonelik varsa yenile
    const current = sub.options?.applicationServerKey;
    const same =
      current && new Uint8Array(current).length === appKey.length && new Uint8Array(current).every((b, i) => b === appKey[i]);
    if (!same) {
      await sub.unsubscribe().catch(() => undefined);
      sub = null;
    }
  }
  if (!sub) {
    try {
      sub = await withTimeout(
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }),
        20000,
        'push service timeout'
      );
    } catch (e) {
      throw pushServiceError(e);
    }
  }
  await inbox('push_subscribe', { subscription: sub.toJSON() });
  setPushFlag(true);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker?.getRegistration(SW_SCOPE);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await inbox('push_unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  setPushFlag(false);
  return 'off';
}

export function sendPushTest() {
  return inbox<{ data: { sent: number } }>('push_test', {});
}

/** CRM ekranlarında PWA manifest + tema rengi (Ana ekrana ekle için) */
export function ensureCrmManifest() {
  if (document.querySelector('link[data-crm-manifest]')) return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/crm-manifest.webmanifest';
  link.setAttribute('data-crm-manifest', '1');
  document.head.appendChild(link);
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#047857';
    document.head.appendChild(meta);
  }
}
