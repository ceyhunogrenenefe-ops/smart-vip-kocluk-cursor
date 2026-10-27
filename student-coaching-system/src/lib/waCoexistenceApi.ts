import { apiFetch } from './session';

export type WaCoexistenceStep = { step: string; ok: boolean; error?: string | null };

export type WaCoexistenceSetup = {
  app_id: string;
  graph_version: string;
  config_id: string;
  config_source: 'env' | 'panel' | null;
  has_app_secret: boolean;
  feature_type: string;
  ready: boolean;
  current_phone_number_id_suffix: string | null;
  current_waba_id_suffix: string | null;
  last_onboarding: {
    at: string;
    ok: boolean;
    display_phone: string | null;
    steps: WaCoexistenceStep[];
  } | null;
};

export type WaCoexistenceResult = {
  ok: boolean;
  error?: string;
  display_phone: string | null;
  steps: WaCoexistenceStep[];
};

const BASE = '/api/meta/wa-coexistence';

export async function getWaCoexistenceSetup(): Promise<WaCoexistenceSetup> {
  const res = await apiFetch(BASE);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.hint || json?.error || 'wa_coexistence_status_failed');
  return json.data as WaCoexistenceSetup;
}

export async function saveWaCoexistenceConfigId(configId: string): Promise<WaCoexistenceSetup> {
  const res = await apiFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'save_config', config_id: configId })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.hint || json?.error || 'config_save_failed');
  return json.data as WaCoexistenceSetup;
}

export async function completeWaCoexistence(input: {
  code: string;
  waba_id?: string;
  phone_number_id?: string;
  event?: string;
}): Promise<WaCoexistenceResult> {
  const res = await apiFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'complete', ...input })
  });
  const json = (await res.json().catch(() => ({}))) as WaCoexistenceResult;
  if (!res.ok && !Array.isArray(json?.steps)) {
    throw new Error((json as { error?: string })?.error || 'coexistence_failed');
  }
  return json;
}

/** Facebook JS SDK’yı bir kez yükler ve başlatır. */
type FbSdk = {
  init: (opts: Record<string, unknown>) => void;
  login: (cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void, opts: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

let sdkPromise: Promise<FbSdk> | null = null;

export function loadFacebookSdk(appId: string, version: string): Promise<FbSdk> {
  if (window.FB) {
    window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
    return Promise.resolve(window.FB);
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<FbSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      if (!window.FB) return reject(new Error('facebook_sdk_missing'));
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/tr_TR/sdk.js';
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error('facebook_sdk_load_failed'));
    };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

export type EmbeddedSignupSession = { waba_id?: string; phone_number_id?: string; event?: string; cancelled?: boolean };

/** Embedded Signup penceresinin postMessage ile gönderdiği oturum bilgisini dinler. */
export function listenEmbeddedSignup(onSession: (s: EmbeddedSignupSession) => void): () => void {
  const handler = (event: MessageEvent) => {
    if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
    let data: unknown = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    const d = data as { type?: string; event?: string; data?: Record<string, string> };
    if (d?.type !== 'WA_EMBEDDED_SIGNUP') return;
    const ev = String(d.event || '');
    if (ev === 'CANCEL' || ev === 'ERROR') {
      onSession({ cancelled: true, event: ev });
      return;
    }
    onSession({
      event: ev,
      waba_id: d.data?.waba_id,
      phone_number_id: d.data?.phone_number_id
    });
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
