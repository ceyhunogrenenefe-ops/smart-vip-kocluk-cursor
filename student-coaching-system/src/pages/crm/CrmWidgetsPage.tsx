import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Facebook, Instagram, Loader2, MessageCircle, Puzzle } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmEnsureInbound,
  crmFacebookLoginStart,
  crmInboundStatus,
  crmSaveMetaAppSecret,
  crmSavePageToken,
  type CrmFacebookLoginStart,
  type CrmInboundStatus
} from '../../lib/crmInboxApi';

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void;
      login: (
        cb: (res: { authResponse?: { accessToken?: string }; status?: string }) => void,
        opts?: { config_id?: string }
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(appId: string, version: string): Promise<void> {
  const ver = version.startsWith('v') ? version : `v${version}`;
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }
    const prev = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      try {
        window.FB?.init({ appId, version: ver, cookie: false, xfbml: false });
        prev?.();
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error('fb_init_failed'));
      }
    };
    const existing = document.getElementById('facebook-jssdk');
    if (existing) {
      setTimeout(() => (window.FB ? resolve() : reject(new Error('fb_sdk_timeout'))), 8000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.src = 'https://connect.facebook.net/tr_TR/sdk.js';
    script.onerror = () => reject(new Error('fb_sdk_load_failed'));
    document.body.appendChild(script);
    setTimeout(() => {
      if (!window.FB) reject(new Error('fb_sdk_timeout'));
    }, 8000);
  });
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

export default function CrmWidgetsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inbound, setInbound] = useState<CrmInboundStatus | null>(null);
  const [login, setLogin] = useState<CrmFacebookLoginStart | null>(null);
  const [loading, setLoading] = useState(true);
  const [binding, setBinding] = useState(false);
  const [appSecret, setAppSecret] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);

  const socialOk = Boolean(inbound?.social?.ok);
  const waOk = Boolean(inbound?.bound_to_production);
  const pageName = inbound?.social?.page_name || '';

  const refresh = useCallback(async () => {
    const [statusRes, loginRes] = await Promise.all([
      crmInboundStatus().catch(() => null),
      crmFacebookLoginStart().catch(() => null)
    ]);
    if (statusRes?.data) setInbound(statusRes.data);
    if (loginRes?.data) setLogin(loginRes.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refresh()
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Durum alınamadı'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const err = searchParams.get('error');
    const page = searchParams.get('page');
    if (connected === '1') {
      toast.success(page ? `${page} bağlandı — Instagram DM inbox’a düşer` : 'Facebook / Instagram bağlandı');
      setSearchParams({}, { replace: true });
      void refresh();
    } else if (err) {
      toast.error(err);
      setSearchParams({}, { replace: true });
    }
  }, [refresh, searchParams, setSearchParams]);

  useEffect(() => {
    const parsed = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const token = String(parsed.get('access_token') || '').trim();
    const hashError = parsed.get('error') || parsed.get('error_description');
    if (!token && !hashError) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (hashError && !token) {
      toast.error(String(hashError));
      return;
    }
    if (!token) return;
    setBinding(true);
    void crmSavePageToken({ user_access_token: token })
      .then((res) => {
        if (res.ok) {
          toast.success('Sayfa bağlandı — Instagram ve Facebook DM inbox’a düşer');
          void refresh();
        } else {
          toast.error(res.hint || res.error || 'Bağlanamadı');
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Bağlanamadı'))
      .finally(() => setBinding(false));
  }, [refresh]);

  const connectSocial = async () => {
    if (!login) {
      toast.error('Login bilgisi yok — sayfayı yenileyin');
      return;
    }
    setBinding(true);
    try {
      try {
        await loadFacebookSdk(login.app_id, login.graph_version);
        const token = await new Promise<string>((resolve, reject) => {
          if (!window.FB) {
            reject(new Error('fb_sdk_missing'));
            return;
          }
          window.FB.login(
            (response) => {
              const access = String(response?.authResponse?.accessToken || '').trim();
              if (access) resolve(access);
              else reject(new Error(response?.status === 'unknown' ? 'popup_blocked' : 'login_cancelled'));
            },
            { config_id: login.config_id }
          );
        });
        const res = await crmSavePageToken({ user_access_token: token });
        if (!res.ok) throw new Error(res.hint || res.error || 'Bağlanamadı');
        toast.success(res.data?.social?.page_name || 'Instagram / Facebook bağlandı');
        await refresh();
        return;
      } catch (sdkErr) {
        const msg = sdkErr instanceof Error ? sdkErr.message : '';
        if (msg === 'login_cancelled') {
          toast.error('Facebook penceresi iptal edildi');
          return;
        }
        if (login.authorize_url) {
          window.location.assign(login.authorize_url);
          return;
        }
        throw sdkErr;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bağlanamadı');
    } finally {
      setBinding(false);
    }
  };

  const refreshWhatsApp = async () => {
    setBinding(true);
    try {
      const res = await crmEnsureInbound();
      setInbound(res.data || inbound);
      toast.success(res.data?.bound_to_production ? 'WhatsApp 0850 bağlı' : res.data?.hint || 'Yenilendi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yenilenemedi');
    } finally {
      setBinding(false);
    }
  };

  const saveSecret = async () => {
    if (!appSecret.trim()) return;
    setSavingSecret(true);
    try {
      await crmSaveMetaAppSecret(appSecret.trim());
      setAppSecret('');
      toast.success('App secret kaydedildi — webhook aboneliği için kullanılır');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSavingSecret(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-1 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            CRM · Kanallar
          </p>
          <h2 className="mt-1 flex items-center gap-2 font-serif text-2xl font-semibold text-slate-900">
            <Puzzle className="h-6 w-6 text-emerald-700" />
            Widgetler
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Kommo’daki gibi Instagram ve Facebook’u tek tıkla bağlayın. Mesajlar doğrudan bizim Gelen
            Kutusu’na düşer — Kommo köprüsü yok.
          </p>
        </div>
        <Link
          to="/crm/inbox"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Gelen kutusuna dön
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <MessageCircle className="h-5 w-5" />
              </span>
              <StatusPill ok={waOk} label={waOk ? 'Kurulu' : 'Bekliyor'} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">WhatsApp</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">
              Kurumsal hat 0850 303 40 14 · Cloud API. Inbox’a gelen yazışmalar burada.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {inbound?.display_phone || inbound?.company_line || '0850 303 40 14'}
              {inbound?.verified_name ? ` · ${inbound.verified_name}` : ''}
            </p>
            <button
              type="button"
              disabled={binding}
              onClick={() => void refreshWhatsApp()}
              className="mt-4 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {binding ? 'İşleniyor…' : waOk ? 'Yenile' : 'Hattı bağla'}
            </button>
          </article>

          <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                <Instagram className="h-5 w-5" />
              </span>
              <StatusPill ok={socialOk} label={socialOk ? 'Kurulu' : 'Kurulmadı'} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Instagram</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">
              Direkt mesajlar (DM). Facebook Login for Business ile sayfayı seçin — Kommo Instagram
              widget’ı ile aynı akış.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {socialOk ? pageName || 'Sayfa bağlı' : 'Sayfa seçilmedi'}
            </p>
            <button
              type="button"
              disabled={binding}
              onClick={() => void connectSocial()}
              className="mt-4 w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {binding ? 'Bağlanıyor…' : socialOk ? 'Yeniden bağla' : 'Instagram’ı bağla'}
            </button>
          </article>

          <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Facebook className="h-5 w-5" />
              </span>
              <StatusPill ok={socialOk} label={socialOk ? 'Kurulu' : 'Kurulmadı'} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Facebook</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">
              Messenger. Instagram ile aynı sayfa token’ı kullanılır; bir kez bağlamanız yeter.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {socialOk ? pageName || 'Sayfa bağlı' : 'Sayfa seçilmedi'}
            </p>
            <button
              type="button"
              disabled={binding}
              onClick={() => void connectSocial()}
              className="mt-4 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {binding ? 'Bağlanıyor…' : socialOk ? 'Yeniden bağla' : 'Facebook’u bağla'}
            </button>
          </article>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
        <h3 className="font-semibold text-slate-900">İlk kurulum (bir kez)</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            Meta for Developers → uygulama <strong>SmartKocluk</strong> → Facebook Login → Settings
          </li>
          <li>
            Valid OAuth Redirect URIs:
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">
              {login?.widget_redirect_uri || 'https://www.dersonlinevipkocluk.com/crm/widgetler'}
            </code>
            ve
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">
              {login?.oauth_redirect_uri || 'https://www.dersonlinevipkocluk.com/api/meta/facebook-oauth'}
            </code>
          </li>
          <li>App Domains: <code className="rounded bg-slate-100 px-1.5 py-0.5">dersonlinevipkocluk.com</code></li>
          <li>
            Yukarıdan Instagram veya Facebook’a tıklayın → popup’ta <strong>Online VIP</strong> sayfasını
            seçin.
          </li>
        </ol>
        {login?.hint ? <p className="mt-3 text-xs text-slate-500">{login.hint}</p> : null}

        <details className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-800">
            İsteğe bağlı: SmartKocluk Facebook App Secret
          </summary>
          <p className="mt-2 text-xs text-slate-600">
            Instagram Login secret değil. App Dashboard → SmartKocluk → Ayarlar → App secret. Webhook
            alanlarını (page + instagram) otomatik işaretlemek için kullanılır.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder="Facebook App Secret"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              autoComplete="off"
            />
            <button
              type="button"
              disabled={savingSecret || !appSecret.trim()}
              onClick={() => void saveSecret()}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingSecret ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </details>
      </section>
    </div>
  );
}
