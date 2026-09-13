import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Puzzle, Search } from 'lucide-react';
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
import {
  CRM_WIDGET_CATALOG,
  CRM_WIDGET_CATEGORIES,
  type CrmWidgetAction,
  type CrmWidgetCategory,
  type CrmWidgetDef
} from './crmWidgetCatalog';

function widgetInstalled(id: string, inbound: CrmInboundStatus | null): boolean {
  const social = Boolean(inbound?.social?.ok);
  const wa = Boolean(inbound?.bound_to_production);
  if (id === 'whatsapp_business') return wa;
  if (id === 'instagram' || id === 'facebook') return social;
  if (id === 'facebook_lead_ads' || id === 'instagram_lead') return social;
  return false;
}

export default function CrmWidgetsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inbound, setInbound] = useState<CrmInboundStatus | null>(null);
  const [login, setLogin] = useState<CrmFacebookLoginStart | null>(null);
  const [loading, setLoading] = useState(true);
  const [binding, setBinding] = useState(false);
  const [appSecret, setAppSecret] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<(typeof CRM_WIDGET_CATEGORIES)[number]['id']>('all');

  const socialOk = Boolean(inbound?.social?.ok);
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
      const assetFail = /1349246|not granted|varlık/i.test(err);
      toast.error(
        assetFail
          ? 'Facebook 3 ekstra varlığa izin veremedi. «Instagram’ı bağla» sayfa izinleriyle tekrar deneyin; popup’ta yalnızca Online VIP’i seçin.'
          : err
      );
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

  const startOAuth = (url?: string | null) => {
    if (!login?.has_app_secret) {
      toast.error(
        'Önce SmartKocluk Facebook App Secret’ı kaydedin (Instagram Login secret değil). Ayarlar → Temel → Göster.'
      );
      document.getElementById('meta-app-secret')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!url) {
      toast.error('Facebook giriş adresi yok — sayfayı yenileyin');
      return;
    }
    setBinding(true);
    window.location.assign(url);
  };

  const connectSocial = () => startOAuth(login?.authorize_url || login?.code_authorize_url);

  const connectLoginForBusiness = () => startOAuth(login?.config_authorize_url);

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
      toast.success('App secret kaydedildi — şimdi Instagram’ı bağla’ya basın');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSavingSecret(false);
    }
  };

  const runAction = async (action: CrmWidgetAction) => {
    if (action === 'whatsapp_cloud') return refreshWhatsApp();
    if (action === 'facebook_login' || action === 'facebook_lead_ads') return connectSocial();
    if (action === 'whatsapp_gateway') {
      navigate('/coach-whatsapp-settings');
      return;
    }
    if (action === 'google_calendar') {
      navigate('/settings');
      return;
    }
    if (action === 'crm_pipeline') {
      navigate('/crm');
      return;
    }
    if (action === 'meetings') {
      navigate('/meetings');
      return;
    }
    if (action === 'webhooks') {
      navigate('/webhooks');
      return;
    }
    toast.message('Bu widget sıradaki turda native bağlanacak — önce Instagram / Facebook / WhatsApp’ı kurun.');
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    return CRM_WIDGET_CATALOG.filter((w) => {
      const installed = widgetInstalled(w.id, inbound);
      if (cat === 'installed' && !installed) return false;
      if (cat !== 'all' && cat !== 'installed' && w.category !== (cat as CrmWidgetCategory)) return false;
      if (!needle) return true;
      return `${w.name} ${w.blurb} ${w.id}`.toLocaleLowerCase('tr').includes(needle);
    });
  }, [cat, inbound, q]);

  const buttonLabel = (w: CrmWidgetDef, installed: boolean) => {
    if (binding) return 'İşleniyor…';
    if (w.action === 'soon') return 'Sırada';
    if (installed) return 'Yenile';
    if (w.action === 'facebook_login' || w.action === 'facebook_lead_ads') return 'Kur / Bağla';
    if (w.action === 'whatsapp_cloud') return 'Hattı bağla';
    return 'Aç';
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-1 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            CRM · Ayarlar
          </p>
          <h2 className="mt-1 flex items-center gap-2 font-serif text-2xl font-semibold text-slate-900">
            <Puzzle className="h-6 w-6 text-emerald-700" />
            Widgetler
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Kommo’daki entegrasyon listesinin tamamı. Instagram, Facebook ve WhatsApp tek tıkla bağlanır;
            mesajlar bizim Gelen Kutusu’na düşer.
          </p>
        </div>
        <Link
          to="/crm/inbox"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Gelen kutusuna dön
        </Link>
      </div>

      <section
        id="instagram-facebook-bagla"
        className="rounded-2xl border-2 border-pink-200 bg-gradient-to-r from-purple-50 via-white to-blue-50 p-4 shadow-sm sm:p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-pink-700">Şimdi bağla</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">Instagram + Facebook</h3>
        <p className="mt-1 text-sm text-slate-600">
          «URL Engellendi» = Facebook bu adresi henüz kaydetmemiş. Aşağıdaki satırları SmartKocluk →
          Facebook Login → <strong>Valid OAuth Redirect URIs</strong> alanına <em>aynen</em> yapıştırın
          (www / slash değişmesin). Client OAuth Login ve Web OAuth Login açık olsun.
        </p>
        <div className="mt-3 space-y-1.5 rounded-xl bg-white/90 p-3 ring-1 ring-amber-200">
          {(
            login?.whitelist_uris || [
              'https://www.dersonlinevipkocluk.com/api/meta/facebook-oauth',
              'https://www.dersonlinevipkocluk.com/crm/widgetler'
            ]
          ).map((uri) => (
            <div key={uri} className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-amber-50 px-2 py-1 text-[12px] text-slate-800">
                {uri}
              </code>
              <button
                type="button"
                className="shrink-0 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                onClick={() => {
                  void navigator.clipboard.writeText(uri);
                  toast.success('URI kopyalandı — Meta’ya yapıştırın');
                }}
              >
                Kopyala
              </button>
            </div>
          ))}
        </div>
        {socialOk ? (
          <p className="mt-2 text-sm font-medium text-emerald-700">Bağlı sayfa: {pageName || 'ok'}</p>
        ) : null}
        <div id="meta-app-secret" className="mt-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-900">
            1. adım — SmartKocluk Facebook App Secret
            {login?.has_app_secret ? (
              <span className="ml-2 text-xs font-medium text-emerald-700">kayıtlı</span>
            ) : (
              <span className="ml-2 text-xs font-medium text-amber-700">zorunlu</span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            developers.facebook.com → SmartKocluk → Ayarlar → Temel → App secret → Göster. Instagram
            Login secret (<code>b35d…</code>) değil.
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
              {savingSecret ? 'Kaydediliyor…' : 'Secret’ı kaydet'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={binding}
            onClick={() => void connectSocial()}
            className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 text-sm font-semibold text-white shadow hover:opacity-95 disabled:opacity-60"
          >
            {binding ? 'Bağlanıyor…' : socialOk ? 'Instagram’ı yenile' : 'Instagram’ı bağla'}
          </button>
          <button
            type="button"
            disabled={binding}
            onClick={() => void connectSocial()}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
          >
            {binding ? 'Bağlanıyor…' : socialOk ? 'Facebook’u yenile' : 'Facebook’u bağla'}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Hata <strong>1349246</strong> (varlıklar 52570416778031, 23850842047630381, 776451501294387):
          Login for Business, yönetici olmadığınız sayfa/reklam/IG varlıklarına izin istiyor. Yukarıdaki
          butonlar artık yalnızca <strong>Online VIP sayfası + Instagram</strong> izni ister. Popup’ta başka
          sayfa işaretlemeyin.
        </p>
        <button
          type="button"
          disabled={binding}
          onClick={() => connectLoginForBusiness()}
          className="mt-2 text-xs font-medium text-slate-500 underline hover:text-slate-800 disabled:opacity-50"
        >
          Eski Login for Business (tüm BM varlıkları) — 1349246 verebilir
        </button>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Widget ara — Instagram, Telegram, Gmail…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CRM_WIDGET_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                cat === c.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((w) => {
            const installed = widgetInstalled(w.id, inbound);
            return (
              <article
                key={w.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-bold text-white ${w.accent}`}
                  >
                    {w.mark}
                  </span>
                  {installed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" /> Kurulu
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {w.action === 'soon' ? 'Sırada' : 'Kurulmadı'}
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{w.name}</h3>
                <p className="mt-1 min-h-[40px] flex-1 text-xs leading-relaxed text-slate-600">{w.blurb}</p>
                {installed && (w.id === 'instagram' || w.id === 'facebook') && pageName ? (
                  <p className="mt-1 truncate text-[11px] text-slate-500">{pageName}</p>
                ) : null}
                {installed && w.id === 'whatsapp_business' ? (
                  <p className="mt-1 truncate text-[11px] text-slate-500">
                    {inbound?.display_phone || inbound?.company_line || '0850 303 40 14'}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={binding}
                  onClick={() => void runAction(w.action)}
                  className={`mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                    w.action === 'soon'
                      ? 'bg-slate-100 text-slate-500'
                      : installed
                        ? 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {buttonLabel(w, installed)}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {!loading && visible.length === 0 ? (
        <p className="text-center text-sm text-slate-500">Bu filtrede widget yok.</p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
        <h3 className="font-semibold text-slate-900">Meta Dashboard (yalnızca ilk sefer)</h3>
        <p className="mt-1 text-xs text-slate-500">
          Online VIP seçimi bizim formda değil — Facebook’un açtığı pencerede çıkar. Önce sayfanın
          başındaki pembe / mavi butona basın.
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            Meta for Developers → <strong>SmartKocluk</strong> → Ayarlar → Temel → App Domains:{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">dersonlinevipkocluk.com</code>
            · Site URL:{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">https://www.dersonlinevipkocluk.com/</code>
          </li>
          <li>
            Facebook Login → Settings: <strong>Client OAuth Login</strong> ve{' '}
            <strong>Web OAuth Login</strong> açık. Valid OAuth Redirect URIs’ye yukarıdaki sarı
            kutudaki adresleri birebir ekleyin. Login for Business yapılandırmasına da aynı URI.
          </li>
          <li>
            Aynı ekranda «Allowed domains for the JavaScript SDK» / ana domain:{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">https://www.dersonlinevipkocluk.com/</code>
          </li>
          <li>
            Kaydet. Sonra bu sayfanın en üstündeki «Instagram’ı bağla» — Facebook sizi kendi
            ekranına götürür, orada Online VIP sayfasını seçin.
          </li>
        </ol>
        {socialOk ? (
          <p className="mt-3 text-xs text-emerald-700">Sayfa bağlı: {pageName || 'ok'}</p>
        ) : null}
      </section>
    </div>
  );
}
