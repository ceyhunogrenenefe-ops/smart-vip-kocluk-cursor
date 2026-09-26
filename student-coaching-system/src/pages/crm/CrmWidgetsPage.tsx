import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Puzzle, Search } from 'lucide-react';
import { toast } from 'sonner';
import CrmInstitutionMetaCard from '../../components/crm/CrmInstitutionMetaCard';
import CrmAutoGreetingPanel from '../../components/crm/CrmAutoGreetingPanel';
import { useApp } from '../../context/AppContext';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from '../../lib/activeInstitutionScope';
import {
  readCachedInboundStatus,
  crmEnsureInbound,
  crmFacebookLoginStart,
  crmInboundStatus,
  crmMetaDiagnostics,
  crmSaveMetaAppSecret,
  crmSaveMetaConfigurationId,
  crmSavePageToken,
  type CrmFacebookLoginStart,
  type CrmInboundStatus,
  type CrmMetaDiagnostics
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
  if (id === 'website_form') return true;
  return false;
}

export default function CrmWidgetsPage() {
  const navigate = useNavigate();
  const { institution } = useApp();
  /** Platform kurumu genel Meta hesabını yönetir; diğer kurumlar yalnız kendi bağlantısını görür */
  const isPlatform = !institution?.id || institution.id === PLATFORM_PRIMARY_INSTITUTION_ID;
  const [searchParams, setSearchParams] = useSearchParams();
  const [inbound, setInbound] = useState<CrmInboundStatus | null>(() => readCachedInboundStatus());
  const [login, setLogin] = useState<CrmFacebookLoginStart | null>(null);
  const [loading, setLoading] = useState(true);
  const [binding, setBinding] = useState(false);
  const [appSecret, setAppSecret] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);
  const [configId, setConfigId] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<(typeof CRM_WIDGET_CATEGORIES)[number]['id']>('all');
  const [diag, setDiag] = useState<CrmMetaDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const socialOk = Boolean(inbound?.social?.ok);
  /** Sayfa bağlı, secret ve yeni Login for Business yapılandırması kayıtlı: kurulum yönergeleri gizlenir */
  const setupDone = socialOk && Boolean(login?.has_app_secret) && Boolean(login?.uses_slim_config);
  const pageName = inbound?.social?.page_name || '';

  const refresh = useCallback(async () => {
    const [statusRes, loginRes] = await Promise.all([
      crmInboundStatus().catch(() => null),
      crmFacebookLoginStart().catch(() => null)
    ]);
    if (statusRes?.data) setInbound(statusRes.data);
    if (loginRes?.data) setLogin(loginRes.data);
  }, []);

  const refreshDiag = useCallback(async () => {
    setDiagLoading(true);
    try {
      const res = await crmMetaDiagnostics();
      if (res?.data) setDiag(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Meta tanılama alınamadı');
    } finally {
      setDiagLoading(false);
    }
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
      const invalidScopes = /invalid scopes|pages_messaging|pages_manage_metadata/i.test(err);
      toast.error(
        assetFail
          ? '1349246: Facebook 52570416778031 ve 23850842047630381 varlıklarına izin veremedi. Meta’da Login for Business yapılandırmasından bu iki varlığı silin; yalnızca Online VIP kalsın.'
          : invalidScopes
            ? 'Invalid Scopes: pages_messaging ve pages_manage_metadata URL’de istenemez. Yeni Login for Business yapılandırmasına ekleyin (yalnızca Online VIP), ID’yi kaydedin, tekrar bağlayın.'
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

  const startOAuth = async (pick: (l: CrmFacebookLoginStart | null) => string | null | undefined) => {
    // Ayarlar henüz yüklenmediyse önce sunucudan al; “secret yok” yanlış uyarısı çıkmasın
    let current = login;
    if (!current) {
      setBinding(true);
      current = (await crmFacebookLoginStart().catch(() => null))?.data || null;
      setBinding(false);
      if (current) setLogin(current);
    }
    const url = pick(current);
    if (!current?.has_app_secret) {
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

  const connectSocial = () => void startOAuth((l) => l?.authorize_url || l?.code_authorize_url);

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

  const saveConfig = async () => {
    if (!configId.trim()) return;
    setSavingConfig(true);
    try {
      await crmSaveMetaConfigurationId(configId.trim());
      setConfigId('');
      toast.success('Yeni yapılandırma kaydedildi — Instagram’ı bağla yalnızca bu listedeki varlıkları ister');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSavingConfig(false);
    }
  };

  const runAction = async (action: CrmWidgetAction) => {
    const metaAction =
      action === 'whatsapp_cloud' || action === 'facebook_login' || action === 'facebook_lead_ads';
    if (metaAction && !isPlatform) {
      document.getElementById('kurum-meta-baglantisi')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.message('Kurumunuzun kendi WhatsApp / Instagram hesabını yukarıdaki karttan bağlayın.');
      return;
    }
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
    if (installed && w.id === 'website_form') return 'Pipeline';
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

      {/* Platform dışı kurumlar kendi Meta hesabını bağlar */}
      <CrmInstitutionMetaCard />

      {/* Ayarlar > Otomatik Karşılama — varsayılan kapalı */}
      <CrmAutoGreetingPanel />

      {isPlatform ? (
      <section
        id="instagram-facebook-bagla"
        className="rounded-2xl border-2 border-pink-200 bg-gradient-to-r from-purple-50 via-white to-blue-50 p-4 shadow-sm sm:p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-pink-700">{setupDone ? 'Bağlı' : 'Şimdi bağla'}</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">Instagram + Facebook</h3>
        {setupDone ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
            ✓ Bağlı — sayfa: {pageName || 'Online VIP'} · kurulum tamamlandı
          </p>
        ) : socialOk ? (
          <p className="mt-2 text-sm font-medium text-emerald-700">Bağlı sayfa: {pageName || 'ok'}</p>
        ) : null}
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
        {setupDone ? (
          <details className="mt-3 rounded-xl bg-white/80 p-3 text-sm ring-1 ring-slate-200">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">
              Kurulum ayrıntıları (yalnız yeniden kurulum veya hata durumunda gerekir)
            </summary>
            <div className="mt-2">
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
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 ring-1 ring-amber-200">
          <p className="font-semibold">Invalid Scopes / 1349246 — izinler yapılandırmada, URL’de değil</p>
          <p className="mt-1">
            SmartKocluk bir <strong>Login for Business</strong> uygulaması.{' '}
            <code className="rounded bg-white px-1">pages_messaging</code> ve{' '}
            <code className="rounded bg-white px-1">pages_manage_metadata</code> klasik Facebook
            Login <code className="rounded bg-white px-1">scope</code> satırında geçersiz. DM için
            bunları yeni yapılandırmanın izin listesine ekleyin.
          </p>
          <p className="mt-1">
            Eski config’teki{' '}
            <code className="rounded bg-white px-1">
              {login?.blocked_asset_ids?.[0] || '52570416778031'}
            </code>{' '}
            ve{' '}
            <code className="rounded bg-white px-1">
              {login?.blocked_asset_ids?.[1] || '23850842047630381'}
            </code>{' '}
            varlıklarını eklemeyin — 1349246 verir.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>developers.facebook.com → SmartKocluk → <strong>Facebook Login for Business</strong></li>
            <li>
              <strong>Create configuration</strong> (User access token). Assets: yalnızca Online VIP
              sayfası + bağlı Instagram.
            </li>
            <li>
              Permissions:{' '}
              <code className="rounded bg-white px-1">
                {(login?.config_permissions || [
                  'pages_show_list',
                  'pages_messaging',
                  'pages_manage_metadata',
                  'instagram_basic',
                  'instagram_manage_messages',
                  'instagram_manage_comments'
                ]).join(', ')}
              </code>
            </li>
            <li>Kaydet → config ID’yi aşağıya yapıştırın → Instagram’ı bağla.</li>
          </ol>
          {login?.uses_slim_config ? (
            <p className="mt-2 font-medium text-emerald-800">
              Yeni yapılandırma kayıtlı: {login.config_id}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={configId}
                onChange={(e) => setConfigId(e.target.value.replace(/\D/g, ''))}
                placeholder="Yeni config ID (yalnızca Online VIP)"
                className="min-w-[220px] flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                inputMode="numeric"
                autoComplete="off"
              />
              <button
                type="button"
                disabled={savingConfig || configId.length < 10}
                onClick={() => void saveConfig()}
                className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingConfig ? 'Kaydediliyor…' : 'Yeni config’i kaydet'}
              </button>
            </div>
          )}
        </div>
            </div>
          </details>
        ) : (
          <>
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
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 ring-1 ring-amber-200">
          <p className="font-semibold">Invalid Scopes / 1349246 — izinler yapılandırmada, URL’de değil</p>
          <p className="mt-1">
            SmartKocluk bir <strong>Login for Business</strong> uygulaması.{' '}
            <code className="rounded bg-white px-1">pages_messaging</code> ve{' '}
            <code className="rounded bg-white px-1">pages_manage_metadata</code> klasik Facebook
            Login <code className="rounded bg-white px-1">scope</code> satırında geçersiz. DM için
            bunları yeni yapılandırmanın izin listesine ekleyin.
          </p>
          <p className="mt-1">
            Eski config’teki{' '}
            <code className="rounded bg-white px-1">
              {login?.blocked_asset_ids?.[0] || '52570416778031'}
            </code>{' '}
            ve{' '}
            <code className="rounded bg-white px-1">
              {login?.blocked_asset_ids?.[1] || '23850842047630381'}
            </code>{' '}
            varlıklarını eklemeyin — 1349246 verir.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>developers.facebook.com → SmartKocluk → <strong>Facebook Login for Business</strong></li>
            <li>
              <strong>Create configuration</strong> (User access token). Assets: yalnızca Online VIP
              sayfası + bağlı Instagram.
            </li>
            <li>
              Permissions:{' '}
              <code className="rounded bg-white px-1">
                {(login?.config_permissions || [
                  'pages_show_list',
                  'pages_messaging',
                  'pages_manage_metadata',
                  'instagram_basic',
                  'instagram_manage_messages',
                  'instagram_manage_comments'
                ]).join(', ')}
              </code>
            </li>
            <li>Kaydet → config ID’yi aşağıya yapıştırın → Instagram’ı bağla.</li>
          </ol>
          {login?.uses_slim_config ? (
            <p className="mt-2 font-medium text-emerald-800">
              Yeni yapılandırma kayıtlı: {login.config_id}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={configId}
                onChange={(e) => setConfigId(e.target.value.replace(/\D/g, ''))}
                placeholder="Yeni config ID (yalnızca Online VIP)"
                className="min-w-[220px] flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                inputMode="numeric"
                autoComplete="off"
              />
              <button
                type="button"
                disabled={savingConfig || configId.length < 10}
                onClick={() => void saveConfig()}
                className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingConfig ? 'Kaydediliyor…' : 'Yeni config’i kaydet'}
              </button>
            </div>
          )}
        </div>
          </>
        )}
      </section>
      ) : null}

      {isPlatform ? (
      <section
        id="meta-tanilama"
        className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meta Tanılama</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Facebook / Instagram webhook durumu</h3>
            <p className="mt-1 text-sm text-slate-600">
              Bağlantı, abonelik alanları, son webhook ve son 20 event. Silent failure kontrolü.
            </p>
          </div>
          <button
            type="button"
            disabled={diagLoading}
            onClick={() => void refreshDiag()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {diagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Tanılamayı yenile
          </button>
        </div>
        {diag ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Facebook bağlı', diag.facebook_connected ? 'Evet' : 'Hayır'],
                ['Instagram bağlı', diag.instagram_connected ? 'Evet' : 'Hayır'],
                ['Token geçerli', diag.token_valid ? 'Evet' : 'Hayır'],
                ['Page ID', String(diag.page_id_suffix || diag.page_id || '—')],
                ['IG Business ID', String(diag.instagram_business_id_suffix || diag.instagram_business_id || '—')],
                ['Page webhook', diag.page_webhook_subscribed ? 'Abone' : 'Eksik'],
                ['IG webhook', diag.instagram_webhook_subscribed ? 'Abone' : 'Eksik'],
                ['FB kanal DB', diag.facebook_channel_db_ok === false ? 'CHECK eksik' : diag.facebook_channel_db_ok ? 'OK' : '—'],
                ['Son webhook', String(diag.last_webhook_at || '—')],
                ['Son FB mesaj', String(diag.last_facebook_message_at || '—')],
                ['Son IG mesaj', String(diag.last_instagram_message_at || '—')],
                ['Son yorum webhook', String(diag.last_comment_webhook_at || '—')],
                ['IG DM teslimat', String((diag.instagram_dm_delivery as { verdict?: string } | undefined)?.verdict || '—')],
                ['Son IG event', String((diag.last_instagram_webhook_event as { event_type?: string } | undefined)?.event_type || '—')],
                ['Son hata', String(diag.last_error || '—')]
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</p>
                  <p className="mt-0.5 break-all text-sm font-semibold text-slate-900">{v}</p>
                </div>
              ))}
            </div>
            {diag.facebook_channel_db_ok === false && diag.facebook_channel_repair_sql ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p className="font-semibold">Facebook kanalı DB CHECK’te yok — Supabase SQL Editor’da çalıştırın:</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2 font-mono text-[11px] text-slate-800">
                  {String(diag.facebook_channel_repair_sql)}
                </pre>
              </div>
            ) : null}
            
            
            {diag.ig_dm_capability ? (
              <div className={`rounded-xl border px-3 py-3 text-sm ${
                (diag.ig_dm_capability as { ok?: boolean }).ok
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-rose-300 bg-rose-50 text-rose-950'
              }`}>
                <p className="font-semibold">
                  IG DM Graph yetkisi:{' '}
                  {(diag.ig_dm_capability as { ok?: boolean }).ok ? 'Conversations API OK' : 'Conversations API RED'}
                </p>
                <p className="mt-1 text-xs opacity-90">
                  Neden: {String((diag.ig_dm_capability as { likely_cause?: string }).likely_cause || '—')}
                </p>
                <p className="mt-1 text-xs opacity-90">
                  {String((diag.ig_dm_capability as { hint?: string }).hint || diag.dm_routing_hint || '')}
                </p>
                <p className="mt-2 text-[11px] opacity-80">
                  scopes messages={String((diag.ig_dm_capability as { has_instagram_manage_messages_scope?: boolean }).has_instagram_manage_messages_scope)} · pages_messaging={String((diag.ig_dm_capability as { has_pages_messaging_scope?: boolean }).has_pages_messaging_scope)} · pageConv={String((diag.ig_dm_capability as { page_conversations_ok?: boolean }).page_conversations_ok)} · igConv={String((diag.ig_dm_capability as { ig_conversations_ok?: boolean }).ig_conversations_ok)}
                </p>
              </div>
            ) : null}
{diag.instagram_dm_not_delivered ||
            (diag.instagram_dm_delivery as { verdict?: string } | undefined)?.verdict === 'META_DID_NOT_DELIVER' ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                <p className="font-semibold">Instagram DM endpoint’e POST edilmiyor (META_DID_NOT_DELIVER)</p>
                <p className="mt-1 text-xs text-amber-900/90">
                  Reels/yorum webhook’ları SmartKocluk’a geliyor; gerçek DM POST’u gelmiyor. Bu bir kod filtresi değil —
                  Meta Conversation Routing / Kommo hâlâ DM birincil alıcısı. Kommo Instagram bağlantısını tamamen kesin,
                  sonra gerçek bir Instagram hesabından (Dashboard Test butonu değil) DM gönderin.
                </p>
                <p className="mt-2 text-[11px] text-amber-800">
                  Son yorum: {String((diag.instagram_dm_delivery as { last_instagram_comment_at?: string } | undefined)?.last_instagram_comment_at || '—')}
                  {' · '}
                  Son gerçek DM: {String((diag.instagram_dm_delivery as { last_instagram_real_dm_at?: string } | undefined)?.last_instagram_real_dm_at || 'yok')}
                  {' · '}
                  Sentetik test: {String((diag.instagram_dm_delivery as { ig_synthetic_hits?: number } | undefined)?.ig_synthetic_hits ?? '—')}
                </p>
              </div>
            ) : null}
            {(diag.instagram_dm_delivery as { verdict?: string } | undefined)?.verdict === 'ONLY_SYNTHETIC_META_TESTS' ? (
              <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-800">
                <p className="font-semibold">Meta Dashboard “Test” boş payload — CRM’e düşmez</p>
                <p className="mt-1 text-xs text-slate-600">
                  entry.id=0 sentetik istekler CRM konuşması oluşturmaz. Instagram uygulamasından gerçek DM gönderin.
                </p>
              </div>
            ) : null}

            {diag.last_instagram_webhook_event ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
                <p className="font-semibold text-slate-900">Son IG webhook event (kanıt)</p>
                <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  {[
                    ['received_at', (diag.last_instagram_webhook_event as { received_at?: string }).received_at],
                    ['object', (diag.last_instagram_webhook_event as { object?: string }).object],
                    ['entry_id', (diag.last_instagram_webhook_event as { entry_id?: string }).entry_id],
                    ['event_type', (diag.last_instagram_webhook_event as { event_type?: string }).event_type],
                    ['channel', (diag.last_instagram_webhook_event as { channel?: string }).channel],
                    ['accepted', String((diag.last_instagram_webhook_event as { accepted?: boolean }).accepted)],
                    ['dropped', String((diag.last_instagram_webhook_event as { dropped?: boolean }).dropped)],
                    ['drop_reason', (diag.last_instagram_webhook_event as { drop_reason?: string }).drop_reason]
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex gap-2">
                      <dt className="w-28 shrink-0 font-medium text-slate-500">{k}</dt>
                      <dd className="break-all font-mono text-slate-900">{String(v || '—')}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
{diag.instagram_ads_partner_block ||
            (Number(diag.recent_whatsapp_webhook_hits_24h || 0) > 0 &&
              Number(diag.recent_instagram_webhook_hits_24h || 0) === 0 &&
              diag.instagram_webhook_subscribed) ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-950">
                <p className="font-semibold">Instagram reklam DM’leri CRM’e gelmiyor — Kommo köprüsü yok, doğrudan Meta</p>
                <p className="mt-1 text-xs text-rose-900/90">
                  WhatsApp webhook’ları geliyor, Instagram aboneliği aktif görünüyor ama son 24s IG hit yok. Meta IG
                  mesajlarını hâlâ Kommo’ya veriyor. Köprü kurmayacağız — Kommo Instagram bağlantısını sökün, CRM
                  tek alıcı olsun.
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-rose-950">
                  {(Array.isArray(diag.instagram_ads_direct_steps)
                    ? (diag.instagram_ads_direct_steps as string[])
                    : [
                        'Kommo → Entegrasyonlar → Instagram → Bağlantıyı kaldır',
                        'Meta Business Suite → Instagram bağlı iş ortaklarından Kommo’yu çıkarın',
                        'CRM Widgetler → Hattı bağla',
                        'Instagram reklamından test DM gönderin'
                      ]
                  ).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="mt-2 text-[11px] text-rose-800">
                  24s WA hit: {String(diag.recent_whatsapp_webhook_hits_24h ?? '—')} · IG hit:{' '}
                  {String(diag.recent_instagram_webhook_hits_24h ?? '—')}
                </p>
              </div>
            ) : null}
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <p className="text-xs font-semibold text-slate-700">Beklenen abonelik alanları</p>
              <p className="mt-1 text-[12px] text-slate-600">
                Page: {Array.isArray((diag.expected_page_fields || diag.page_subscribed_fields)) ? ((diag.expected_page_fields || diag.page_subscribed_fields) as string[]).join(', ') : '—'}
              </p>
              <p className="mt-1 text-[12px] text-slate-600">
                Instagram: {Array.isArray((diag.expected_instagram_fields || diag.instagram_subscribed_fields)) ? ((diag.expected_instagram_fields || diag.instagram_subscribed_fields) as string[]).join(', ') : '—'}
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Zaman</th>
                    <th className="px-2 py-1.5 font-semibold">Platform</th>
                    <th className="px-2 py-1.5 font-semibold">Event</th>
                    <th className="px-2 py-1.5 font-semibold">Sender</th>
                    <th className="px-2 py-1.5 font-semibold">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray((diag.recent_webhook_events || diag.recent_webhook_events)) ? ((diag.recent_webhook_events || diag.recent_webhook_events) as Array<Record<string, unknown>>) : []).slice(0, 20).map((ev, i) => (
                    <tr key={String(ev.id || i)} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 whitespace-nowrap">{String(ev.received_at || '—')}</td>
                      <td className="px-2 py-1.5">{String(ev.platform || ev.object_type || '—')}</td>
                      <td className="px-2 py-1.5">{String(ev.event_type || ev.field || '—')}</td>
                      <td className="px-2 py-1.5 font-mono">{String(ev.sender_id || '—').slice(-10)}</td>
                      <td className="px-2 py-1.5">{String(ev.processing_status || '—')}</td>
                    </tr>
                  ))}
                  {!Array.isArray((diag.recent_webhook_events || diag.recent_webhook_events)) || ((diag.recent_webhook_events || diag.recent_webhook_events) as unknown[]).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-slate-500">
                        Henüz webhook kaydı yok — SQL migration veya ilk mesaj sonrası dolar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Tanılamayı yenile ile Meta durumunu yükleyin.</p>
        )}
      </section>
      ) : null}


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

      {isPlatform ? (
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
      ) : null}
    </div>
  );
}
