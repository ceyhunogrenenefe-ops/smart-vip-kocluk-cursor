import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  Building2,
  CheckCircle,
  Clock,
  Loader2,
  MessageCircle,
  Phone,
  QrCode,
  RefreshCw,
  Smartphone,
  Unlink,
  User,
  Users,
  Zap
} from 'lucide-react';
import { apiFetch, getAuthToken } from '../lib/session';

const formatPhone = (value: string) => value.replace(/\D/g, '');

function isValidGatewayEnvUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\/[^\s]+/i.test(t);
}

/**
 * HTTPS panel + HTTP VPS: tarayıcı mixed content engeller; aynı origin Vercel proxy kullan.
 * Yalnızca gerçek URL kabul edilir (örn. http://27.x.x.x:4010). Placeholder veya boşluklu değer reddedilir.
 */
function resolveWhatsAppGatewayBase(): string {
  const raw = String(import.meta.env.VITE_WHATSAPP_GATEWAY_URL || '').trim();
  const gv = raw.replace(/\/$/, '');
  if (!gv || !isValidGatewayEnvUrl(gv)) return '';
  if (typeof window === 'undefined') return gv;
  try {
    const pageHttps = window.location.protocol === 'https:';
    if (pageHttps && gv.startsWith('http://')) {
      return `${window.location.origin.replace(/\/$/, '')}/api/whatsapp-gateway`;
    }
  } catch {
    /* noop */
  }
  return gv;
}

type GatewayStatus = 'idle' | 'connecting' | 'qr_ready' | 'connected' | 'logged_out' | 'reconnecting';

interface MetaWhatsAppServerStatus {
  configured: boolean;
  graph_api_version?: string;
  phone_number_id_suffix?: string | null;
  waba_id_suffix?: string | null;
  has_token?: boolean;
  hint?: string | null;
}

interface WaScheduleDTO {
  coach_id: string;
  is_active: boolean;
  message_template: string;
  send_hour_tr: number;
  send_minute_tr: number;
  weekdays_only: boolean;
  interval_days: number;
  campaign_days: number | null;
  campaign_started_at: string | null;
  prefer_parent_phone: boolean;
}

export default function CoachWhatsAppSettings() {
  const hook = useAuth();
  /** Bazı bileşenler effectiveUser bekler; AuthContext bazen yalnızca user döndürür. Gateway JWT'deki sub = users.id olduğundan kullanıcı id kullanılmalıdır. */
  const actor =
    (hook as unknown as { effectiveUser?: typeof hook.user | null }).effectiveUser ??
    hook.user ??
    null;
  const coachId = actor?.id || '';
  const { students } = useApp();
  const gatewayEnvRaw = String(import.meta.env.VITE_WHATSAPP_GATEWAY_URL || '').trim();
  const gatewayEnvInvalid = Boolean(gatewayEnvRaw && !isValidGatewayEnvUrl(gatewayEnvRaw));
  const gatewayUrl = resolveWhatsAppGatewayBase();
  const gatewayKey = (import.meta.env.VITE_WHATSAPP_GATEWAY_KEY || '').trim();

  const [metaWaStatus, setMetaWaStatus] = useState<MetaWhatsAppServerStatus | null>(null);
  const [metaWaLoading, setMetaWaLoading] = useState(true);

  const [waScheduleLoading, setWaScheduleLoading] = useState(false);
  const [waScheduleSaving, setWaScheduleSaving] = useState(false);
  const [waScheduleMsg, setWaScheduleMsg] = useState('');
  const [restartCampaignOnSave, setRestartCampaignOnSave] = useState(false);
  const [waDraft, setWaDraft] = useState<WaScheduleDTO | null>(null);

  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<GatewayStatus>('idle');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  /** VPS gateway (Baileys) bağlantı hatası — WhatsApp oturumu düşünce dolabilir */
  const [gatewaySessionError, setGatewaySessionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [templateTab, setTemplateTab] = useState<'student' | 'parent'>('student');
  const [templateTask, setTemplateTask] = useState('');
  const [templateSendBusy, setTemplateSendBusy] = useState(false);
  const [templateNotice, setTemplateNotice] = useState('');
  const [templateWaUrl, setTemplateWaUrl] = useState<string | null>(null);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const isConnected = status === 'connected';
  const hasServerJwt = Boolean(getAuthToken());
  /** Gateway VPS JWT imzasını doğrular; yalnızca localStorage kullanıcısı (JWT yok) yetmez. */
  const canUseGateway = Boolean(gatewayUrl && coachId && hasServerJwt);
  const needsJwtForGateway = Boolean(gatewayUrl && coachId && !hasServerJwt);

  const refreshMetaWa = useCallback(async () => {
    if (!getAuthToken()) {
      setMetaWaLoading(false);
      return;
    }
    setMetaWaLoading(true);
    try {
      const res = await apiFetch('/api/meta/whatsapp');
      const payload = (await res.json().catch(() => ({}))) as { data?: MetaWhatsAppServerStatus };
      if (res.ok && payload?.data) setMetaWaStatus(payload.data);
      else setMetaWaStatus(null);
    } catch {
      setMetaWaStatus(null);
    } finally {
      setMetaWaLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMetaWa();
  }, [refreshMetaWa]);

  const loadWaSchedule = useCallback(async () => {
    if (!getAuthToken()) {
      setWaDraft(null);
      return;
    }
    setWaScheduleLoading(true);
    setWaScheduleMsg('');
    try {
      const res = await apiFetch('/api/coach-whatsapp-schedule');
      const payload = (await res.json().catch(() => ({}))) as {
        data?: WaScheduleDTO;
        error?: string;
        hint?: string;
        code?: string;
      };
      if (!res.ok) {
        setWaDraft(null);
        const codePrefix =
          payload?.code === 'no_coach_id'
            ? 'Koç kaydı bulunamadı (users ile coaches e-postası aynı olmalı). '
            : payload?.code === 'wrong_role'
              ? 'Bu uç yalnızca koç veya öğretmen içindir. '
              : '';
        const parts = [
          codePrefix,
          payload?.hint || payload?.error
        ].filter((x): x is string => Boolean(x && String(x).trim()));
        setWaScheduleMsg(parts.length ? parts.join('') : 'Zamanlayıcı ayarları yüklenemedi.');
        return;
      }
      if (payload.data) setWaDraft(payload.data);
    } catch {
      setWaDraft(null);
      setWaScheduleMsg('Zamanlayıcı ayarları yüklenemedi.');
    } finally {
      setWaScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWaSchedule();
  }, [loadWaSchedule]);

  const saveWaSchedule = async () => {
    if (!waDraft || !getAuthToken()) return;
    setWaScheduleSaving(true);
    setWaScheduleMsg('');
    try {
      const res = await apiFetch('/api/coach-whatsapp-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          is_active: waDraft.is_active,
          message_template: waDraft.message_template,
          send_hour_tr: waDraft.send_hour_tr,
          send_minute_tr: waDraft.send_minute_tr,
          weekdays_only: waDraft.weekdays_only,
          interval_days: waDraft.interval_days,
          campaign_days:
            waDraft.campaign_days === null || waDraft.campaign_days === undefined
              ? ''
              : waDraft.campaign_days,
          prefer_parent_phone: waDraft.prefer_parent_phone,
          restart_campaign: restartCampaignOnSave
        })
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: WaScheduleDTO;
        error?: string;
      };
      if (!res.ok) {
        setWaScheduleMsg(payload?.error || 'Kayıt başarısız.');
        return;
      }
      if (payload.data) setWaDraft(payload.data);
      setRestartCampaignOnSave(false);
      setWaScheduleMsg('Plan kaydedildi. Gönderimler Meta WhatsApp (kurumsal hat) ile sunucudan yapılır (öğrenci telefonları kayıtlı olmalı).');
    } catch {
      setWaScheduleMsg('Kayıt başarısız.');
    } finally {
      setWaScheduleSaving(false);
    }
  };

  const connectionLabel = useMemo(() => {
    if (status === 'connected') return 'Bağlı';
    if (status === 'qr_ready') return 'QR hazır';
    if (status === 'connecting' || status === 'reconnecting') return 'Bağlanıyor…';
    return 'Bağlı değil';
  }, [status]);

  const prettyDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('tr-TR');
  };

  type GatewayStatusPayload = {
    status: GatewayStatus;
    qr: string | null;
    connectedAt?: string | null;
    lastError?: string | null;
  };

  const applyGatewayStatusPayload = (data: GatewayStatusPayload) => {
    setStatus(data.status || 'idle');
    setQrDataUrl(data.qr || null);
    setLastConnectedAt(data.connectedAt || null);
    setGatewaySessionError(
      data.status === 'connected'
        ? null
        : typeof data.lastError === 'string' && data.lastError.trim()
          ? data.lastError.trim()
          : null
    );
  };

  const callGateway = async <T,>(endpoint: string, init?: RequestInit): Promise<T> => {
    if (!gatewayUrl || !coachId) throw new Error('whatsapp_gateway_url_missing');
    const authToken = getAuthToken();
    if (!authToken) throw new Error('jwt_required_log_in_again');
    const headers = new Headers(init?.headers || {});
    headers.set('Content-Type', 'application/json');
    if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
    if (gatewayKey) headers.set('x-gateway-key', gatewayKey);
    const res = await fetch(`${gatewayUrl}${endpoint}`, { headers, ...init });
    const rawText = await res.text();
    let data: {
      error?: string;
      detail?: string;
      hint?: string;
      ok?: boolean;
    } = {};
    try {
      data = rawText ? (JSON.parse(rawText) as typeof data) : {};
    } catch {
      data = { detail: rawText.slice(0, 400) };
    }
    if (!res.ok) {
      const parts = [data.error, data.detail, data.hint].filter(
        (x): x is string => typeof x === 'string' && x.length > 0
      );
      const base = parts.length
        ? parts.join(' — ')
        : rawText.trim()
          ? `HTTP ${res.status}: ${rawText.slice(0, 200)}`
          : `gateway_request_failed (HTTP ${res.status})`;
      const authHint =
        res.status === 401
          ? ' Oturum (JWT) süresi dolmuş veya imza uyuşmuyor: çıkış yapıp tekrar giriş yapın. Panel ile gateway’de aynı APP_JWT_SECRET olmalı.'
          : res.status === 403
            ? ' URL’deki oturum id (JWT sub) ile eşleşme yok (coach_scope_mismatch) veya erişim reddedildi. Tarayıcıda açık olan kullanıcı = gateway’e giden id; Vercel’de WHATSAPP_GATEWAY_UPSTREAM / proxy çalışıyor olmalı.'
            : '';
      throw new Error(`${base}${authHint}`);
    }
    return data as T;
  };

  const fetchStatus = async () => {
    if (!canUseGateway || !hasServerJwt) return;
    try {
      const data = await callGateway<GatewayStatusPayload>(`/sessions/${coachId}/status`);
      applyGatewayStatusPayload(data);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'gateway_request_failed';
      const upstreamHint = msg.includes('whatsapp_gateway_upstream_missing')
        ? ' Vercel ortam değişkeni: WHATSAPP_GATEWAY_UPSTREAM=http://SUNUCU_IP:4010 (WhatsApp gateway VPS).'
        : '';
      setGatewaySessionError(null);
      setStatusMessage(`Gateway durumu: ${msg}.${upstreamHint}`);
    }
  };

  useEffect(() => {
    void fetchStatus();
    if (!canUseGateway) return;
    const timer = setInterval(() => void fetchStatus(), 5000);
    return () => clearInterval(timer);
  }, [canUseGateway, coachId, hasServerJwt]);

  const startConnection = async () => {
    if (!canUseGateway) {
      setStatusMessage(
        needsJwtForGateway
          ? 'Sunucu oturumu (JWT) yok. Çıkış yapıp e-posta ve şifrenizle tekrar giriş yapın; yalnızca tarayıcıda kayıtlı “yerel” oturum WhatsApp gateway için yeterli değil.'
          : 'WhatsApp gateway adresi tanımlı değil (ortam değişkeni).'
      );
      return;
    }
    setIsBusy(true);
    setStatusMessage('');
    try {
      const started = await callGateway<{
        status?: GatewayStatus;
        qr?: string | null;
        lastError?: string | null;
      }>(`/sessions/${coachId}/start`, { method: 'POST' });
      if (started?.qr) {
        applyGatewayStatusPayload({
          status: (started.status as GatewayStatus) || 'qr_ready',
          qr: started.qr,
          lastError: started.lastError ?? null
        });
      }
      if (started?.lastError && started.status !== 'connected') {
        setGatewaySessionError(started.lastError);
      }
      /** Baileys QR’sı genelde bir sonraki connection.update ile gelir; 5 sn aralık tek tur yetmez. */
      let sawQrOrConnected = Boolean(started?.qr) || started?.status === 'connected';
      for (let i = 0; i < 60; i++) {
        try {
          const snap = await callGateway<GatewayStatusPayload>(`/sessions/${coachId}/status`);
          applyGatewayStatusPayload(snap);
          if (snap.qr || snap.status === 'connected') {
            sawQrOrConnected = true;
            break;
          }
        } catch {
          /* geçici proxy/VPS — kısa aralıkla yeniden dene */
        }
        await new Promise((r) => setTimeout(r, 450));
      }
      await fetchStatus();
      setStatusMessage(
        sawQrOrConnected
          ? 'QR oluşturuldu. WhatsApp ile tarayın.'
          : 'İstek gönderildi ancak QR henüz gelmedi. Vercel’de WHATSAPP_GATEWAY_UPSTREAM, VPS’te gateway süreci (pm2), APP_JWT_SECRET eşleşmesi ve CORS_ALLOWED_ORIGINS (panel kökeni) kontrol edin.'
      );
    } catch (error) {
      setStatusMessage(`Bağlantı başlatılamadı: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const disconnect = async () => {
    if (!canUseGateway) return;
    setIsBusy(true);
    try {
      await callGateway(`/sessions/${coachId}/logout`, { method: 'POST' });
      setStatus('logged_out');
      setQrDataUrl(null);
      setStatusMessage('WhatsApp bağlantısı kapatıldı.');
    } catch (error) {
      setStatusMessage(`Çıkış yapılamadı: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  /** Yeni sekme açılıp açılmadığını döndürür (popup engeli = sessiz görünmezlik olmasın diye). */
  const openWaFallback = (target: string, message: string): { opened: boolean; url: string } => {
    const url = `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    const opened = w != null && !w.closed;
    return { opened, url };
  };

  const sendGatewayMessage = async (targetPhone: string, message: string) => {
    await callGateway(`/sessions/${coachId}/send`, {
      method: 'POST',
      body: JSON.stringify({ phone: targetPhone, message })
    });
  };

  const buildTemplateMessage = () => {
    if (!selectedStudent) return '';
    if (templateTab === 'student') {
      return `Merhaba ${selectedStudent.name}, bugün hedefin: ${templateTask || 'görev giriniz'}.\n\n• Kaç soru çözdün?\n• Hangi derslere çalıştın?\n• Kaç sayfa kitap okudun?`;
    }
    return `Sayın veli,\n${selectedStudent.name} için bugün kısa durum özeti:\n• Disiplin: [1–10]\n• Odak: [1–10]\n• Ekran süresi: […]\n\nNot: ${templateTask || 'ek not yok'}`;
  };

  const sendQuickTemplate = async () => {
    setTemplateNotice('');
    setTemplateWaUrl(null);
    if (!selectedStudentId) {
      setTemplateNotice('Önce öğrenci seçin.');
      return;
    }
    const st = selectedStudent;
    const parentRaw =
      st?.parentPhone ||
      (st as unknown as { parent_phone?: string } | undefined)?.parent_phone ||
      '';
    const targetRaw =
      templateTab === 'student' ? String(st?.phone || '').trim() : String(parentRaw || st?.phone || '').trim();
    const target = formatPhone(targetRaw);
    if (!st || !target) {
      setTemplateNotice(
        templateTab === 'parent'
          ? 'Veli veya öğrenci telefonu kayıtta yok — Öğrenciler sayfasında veli numarasını kontrol edin.'
          : 'Öğrenci telefonu kayıtta yok.'
      );
      return;
    }
    const message = buildTemplateMessage();
    if (!message) {
      setTemplateNotice('Şablon metni oluşturulamadı; öğrenci seçimini doğrulayın.');
      return;
    }

    setTemplateSendBusy(true);
    try {
      if (isConnected && canUseGateway) {
        await sendGatewayMessage(target, message);
        setTemplateNotice('Mesaj bağlı WhatsApp oturumundan gönderildi.');
      } else if (metaWaStatus?.configured && hasServerJwt) {
        try {
          const res = await apiFetch('/api/meta/whatsapp', {
            method: 'POST',
            body: JSON.stringify({ to: target, message })
          });
          const payload = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
          if (res.ok) {
            setTemplateNotice('Mesaj kurumsal hat (Meta WhatsApp) üzerinden gönderildi.');
          } else {
            const { opened, url } = openWaFallback(target, message);
            setTemplateWaUrl(url);
            const hintTail = payload?.hint ? ` ${payload.hint}` : '';
            if (payload?.error === 'forbidden' || res.status === 403) {
              setTemplateNotice(
                opened
                  ? `Sunucu reddetti (403).${hintTail} wa.me yeni sekmede açıldı.`
                  : `Sunucu reddetti (403).${hintTail}\nBağlantı: ${url}`
              );
            } else {
              setTemplateNotice(
                `Sunucu (${res.status}): ${payload?.error || res.statusText || 'bilinmeyen'}${hintTail} — wa.me ${opened ? 'açıldı' : `açılmadı\n${url}`}`
              );
            }
          }
        } catch {
          const { opened, url } = openWaFallback(target, message);
          setTemplateWaUrl(url);
          setTemplateNotice(
            opened
              ? 'Kurumsal hatta ulaşılamadı; wa.me için yeni sekme açıldı.'
              : `Kurumsal hat isteği atılamadı. Engel varsa bağlantıyı kopyalayın:\n${url}`
          );
        }
      } else {
        const { opened, url } = openWaFallback(target, message);
        setTemplateWaUrl(url);
        if (opened) {
          setTemplateNotice(
            'Oturum yok; whatsapp bağlantısı yeni sekmede açıldı. Görmüyorsanız görev çubuğundaki sekme veya tarayıcı “popup izni” uyarısı.'
          );
        } else {
          setTemplateNotice(
            'Tarayıcı yeni sekme açmayı engelledi. Adresteki kilit/popup ikonundan izin verin veya bağlantıyı aşağıdan kopyalayın.'
          );
        }
        try {
          if (!opened && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            setTemplateNotice((prev) => `${prev}\n(Metin bağlantısı panoya kopyalandı.)`);
          }
        } catch {
          /* yoksay */
        }
      }
    } catch (error) {
      setTemplateNotice(`Mesaj gönderilemedi: ${(error as Error).message}`);
    } finally {
      setTemplateSendBusy(false);
    }
  };

  const sendTestMessage = async () => {
    const target = formatPhone(phone);
    if (!target) {
      setStatusMessage('Test için ülke kodlu telefon girin.');
      return;
    }
    const message = 'Merhaba, koç paneli WhatsApp bağlantı test mesajı.';
    try {
      if (isConnected && canUseGateway) {
        await sendGatewayMessage(target, message);
        setStatusMessage('Test mesajı bağlı oturumdan gönderildi.');
      } else if (metaWaStatus?.configured && hasServerJwt) {
        const res = await apiFetch('/api/meta/whatsapp', {
          method: 'POST',
          body: JSON.stringify({ to: target, message })
        });
        const payload = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        if (res.ok) {
          setStatusMessage('Test mesajı Meta WhatsApp (kurumsal hat) üzerinden gönderildi.');
        } else {
          const { opened, url } = openWaFallback(target, message);
          setStatusMessage(
            `Sunucu (${res.status}): ${payload?.error || res.statusText || 'hata'}${payload?.hint ? ` — ${payload.hint}` : ''}. wa.me: ${opened ? 'sekme açıldı' : url}`
          );
        }
      } else {
        const { opened, url } = openWaFallback(target, message);
        setStatusMessage(
          opened
            ? 'Oturum yok; whatsapp bağlantısı yeni sekmede açıldı.'
            : `Tarayıcı yeni sekme açmayı engelledi. Bağlantı:\n${url}`
        );
      }
    } catch (error) {
      setStatusMessage(`Test mesajı gönderilemedi: ${(error as Error).message}`);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-8">
      {/* Üst başlık */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-teal-800 to-slate-900 p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-emerald-200/90">Koç · Mesajlaşma</p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">WhatsApp merkezi</h1>
            <p className="mt-2 max-w-xl text-sm text-emerald-100/95">
              <strong className="text-white">Meta WhatsApp</strong> ile kurumsal otomatik mesajlar sunucudan gider; isteğe bağlı{' '}
              <strong className="text-white">QR gateway</strong> ile kendi WhatsApp hattınızdan anlık mesaj atabilirsiniz.
              İkisi birbirini tamamlar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshMetaWa()}
            className="shrink-0 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-white/20"
          >
            Meta durumunu yenile
          </button>
        </div>
      </div>

      {/* 1 — Kurumsal Meta WhatsApp */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-emerald-50/40 px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Kurumsal WhatsApp (Meta)</h2>
            <p className="text-sm text-slate-600">
              Kurumsal hat açıksa aşağıdaki hızlı şablonlar ve test mesajı <strong>Meta Cloud API</strong> üzerinden sunucudan gider
              (JWT ile oturum gerekli). Anahtarlar Vercel&apos;de tanımlıdır; koç olarak gönderim yapabilirsiniz.
            </p>
          </div>
        </div>
        <div className="p-6">
          {metaWaLoading ? (
            <p className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              Meta yapılandırması kontrol ediliyor…
            </p>
          ) : metaWaStatus?.configured ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                  Aktif
                </span>
                <ul className="space-y-1 text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                    Planlı görüşme ve sistem mesajları WhatsApp ile iletilebilir.
                  </li>
                  {metaWaStatus.graph_api_version && (
                    <li className="text-slate-500">Graph API: {metaWaStatus.graph_api_version}</li>
                  )}
                  {metaWaStatus.phone_number_id_suffix && (
                    <li className="text-slate-500">Telefon kimliği (sonu): …{metaWaStatus.phone_number_id_suffix}</li>
                  )}
                  {metaWaStatus.waba_id_suffix && (
                    <li className="text-slate-500">WABA (sonu): …{metaWaStatus.waba_id_suffix}</li>
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-medium">Meta WhatsApp henüz tam yapılandırılmamış veya okunamadı.</p>
              <p className="mt-1 text-amber-900/90">
                Yöneticinizin Vercel&apos;de <code className="rounded bg-amber-100 px-1 text-xs">META_WHATSAPP_TOKEN</code>,{' '}
                <code className="rounded bg-amber-100 px-1 text-xs">META_PHONE_NUMBER_ID</code> değişkenlerini kaydetmesi gerekir.
                Bu koşul sağlanana kadar otomatik kurumsal WhatsApp gönderilemez; aşağıdaki kişisel gateway veya wa.me yedeğini kullanabilirsiniz.
            </p>
            </div>
          )}
        </div>
      </section>

      {/* Otomatik Meta zamanlayıcı */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50/60 px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md">
            <Clock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Otomatik mesaj (Meta şablon)</h2>
            <p className="text-sm text-slate-600">
              Tüm öğrencilerinize aynı şablonla, seçtiğiniz İstanbul saatinde ve <strong>her N günde bir</strong> gönderilir.
              Kampanya süresi (gün) dolduğunda durur; boş bırakırsanız süresiz çalışır. Sunucuda{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">/api/cron/coach-whatsapp-auto</code> zamanlanmalıdır
              (projede varsayılan: 15 dk).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadWaSchedule()}
            disabled={waScheduleLoading || !hasServerJwt}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Yenile
          </button>
        </div>
        <div className="space-y-4 p-6">
          {!hasServerJwt && (
            <p className="text-sm text-slate-600">
              Zamanlayıcı için sunucu oturumu (JWT) gerekir. Çıkış yapıp e-postanızla tekrar giriş yapın.
            </p>
          )}
          {actor?.role === 'coach' && actor.coachId == null && hasServerJwt && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              Hesabınız koç olarak görünüyor ancak <strong>koç kaydı</strong> (users ile eşleşen coaches satırı) bulunamadı.
              Otomatik WhatsApp zamanlayıcısı bu yüzden sunucuda reddedilir. Yöneticiniz e-postayı coaches tablosuyla eşleştirmeli.
            </div>
          )}
          {!metaWaLoading && !metaWaStatus?.configured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Meta şablonu ve ortam yapılandırılmadan otomatik mesaj gönderilemez; ayarları yine de kaydedebilirsiniz.
            </div>
          )}
          {waScheduleLoading ? (
            <p className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              Zamanlayıcı ayarları yükleniyor…
            </p>
          ) : waDraft ? (
            <>
              <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={waDraft.is_active}
                  onChange={(e) => setWaDraft({ ...waDraft, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Planlayıcıyı aktif et
              </label>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Mesaj şablonu</label>
                <textarea
                  value={waDraft.message_template}
                  onChange={(e) => setWaDraft({ ...waDraft, message_template: e.target.value })}
                  rows={5}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Yer tutucular:{' '}
                  <code className="rounded bg-slate-100 px-1">
                    {'{{name}}, {{coach}}, {{date}}'}
                  </code>{' '}
                  (İstanbul tarihi <code className="rounded bg-slate-100 px-1">YYYY-MM-DD</code>).
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Gönderim saati (İstanbul)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={waDraft.send_hour_tr}
                      onChange={(e) =>
                        setWaDraft({ ...waDraft, send_hour_tr: Math.min(23, Math.max(0, Number(e.target.value))) })
                      }
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <select
                      value={Math.min(59, Math.max(0, waDraft.send_minute_tr || 0))}
                      onChange={(e) =>
                        setWaDraft({
                          ...waDraft,
                          send_minute_tr: Math.min(59, Math.max(0, Number(e.target.value)))
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm"
                    >
                      {Array.from({ length: 60 }, (_, m) => (
                        <option key={m} value={m}>
                          {String(m).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Cron ~15 dk’da bir tetiklenir; dakika yaklaşık ±15 dk penceresindedir.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tekrar aralığı (gün)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={waDraft.interval_days}
                    onChange={(e) =>
                      setWaDraft({
                        ...waDraft,
                        interval_days: Math.min(365, Math.max(1, Number(e.target.value) || 1))
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Son başarılı gönderimden bu kadar İstanbul günü sonra yeniden gönderilir.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Kampanya süresi (gün)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={waDraft.campaign_days ?? ''}
                    placeholder="Boş = süresiz"
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === '') {
                        setWaDraft({ ...waDraft, campaign_days: null });
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      setWaDraft({ ...waDraft, campaign_days: Math.min(3650, Math.max(1, Math.floor(n))) });
                    }}
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm"
                  />
                  {waDraft.campaign_started_at && waDraft.campaign_days != null && (
                    <p className="mt-1 text-xs text-slate-500">
                      Başlangıç (UTC kayıt): {prettyDate(waDraft.campaign_started_at)}
                    </p>
                  )}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={waDraft.weekdays_only}
                  onChange={(e) => setWaDraft({ ...waDraft, weekdays_only: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                Yalnızca hafta içi (Cumartesi–Pazar atla)
              </label>

              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={waDraft.prefer_parent_phone}
                  onChange={(e) => setWaDraft({ ...waDraft, prefer_parent_phone: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                Varsa önce veli telefonunu kullan
              </label>

              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={restartCampaignOnSave}
                  onChange={(e) => setRestartCampaignOnSave(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                Kaydederken kampanya başlangıcını sıfırla (süreli kampanyalar için)
              </label>

              <button
                type="button"
                onClick={() => void saveWaSchedule()}
                disabled={waScheduleSaving || !hasServerJwt}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-teal-700 disabled:opacity-50"
              >
                {waScheduleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Kaydet
              </button>

              {waScheduleMsg ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {waScheduleMsg}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-600">Zamanlayıcı verisi alınamadı.</p>
          )}
        </div>
      </section>

      {/* 2 — QR Gateway */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-white px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Kişisel WhatsApp oturumu (QR)</h2>
            <p className="text-sm text-slate-600">
              Ayrı bir sunucuda çalışan gateway ile telefonunuzu tarayıp doğrudan mesaj gönderirsiniz.{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">VITE_WHATSAPP_GATEWAY_URL</code> tanımlı değilse bu bölüm
              devre dışı kalır. HTTPS siteden HTTP gateway için istek otomatik olarak{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">/api/whatsapp-gateway</code> üzerinden iletilir.
            </p>
          </div>
        </div>
        <div className="space-y-6 p-6">
          {needsJwtForGateway && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
              <p className="font-medium">WhatsApp için sunucu JWT’si gerekli (401 önler)</p>
              <p className="mt-2">
                Hesabınız açık görünse bile <code className="rounded bg-rose-100 px-1 text-xs">coaching_auth_token</code>{' '}
                yoksa gateway isteği reddedilir.{' '}
                <strong>Çıkış yapın</strong> ve veritabanındaki kullanıcı ile{' '}
                <strong>yeniden giriş</strong> yapın (ilk adımda <code className="rounded bg-rose-100 px-1 text-xs">/api/auth-login</code>{' '}
                token üretmeli). Demo / yalnızca bu cihazda tanımlı deneme hesapları sunucuda yoksa JWT alınamaz.
              </p>
            </div>
          )}

          {!canUseGateway && !needsJwtForGateway && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {gatewayEnvInvalid ? (
                <>
                  <p className="font-medium">Vercel’deki gateway adresi geçersiz.</p>
                  <p className="mt-2">
                    Değişken <strong>adını</strong> değil, gerçek sunucu adresini yazın (örn.{' '}
                    <code className="rounded bg-amber-100 px-1 text-xs">http://27.102.134.199:4010</code>). Sonda boşluk
                    veya yanlış yapıştırma olmamalı. Kaydettikten sonra projeyi yeniden deploy edin.
                  </p>
                </>
              ) : (
                <>
                  Gateway adresi yok: QR ve oturumdan gönderim kapalı. Hızlı şablonlar yine{' '}
                  <strong>wa.me</strong> ile tarayıcıda açılabilir.
                </>
              )}
            </div>
          )}

          {(status === 'reconnecting' || status === 'logged_out') && canUseGateway ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              <p className="font-medium">WhatsApp oturumu düşebilir</p>
              <p className="mt-1 text-sky-900/90">
                VPS yeniden başlayınca, telefondan çıkış yapılınca veya WhatsApp tarafı bağlantıyı kestiğinde QR yeniden
                gerekebilir. Önce <strong>QR / Oturum başlat</strong>; birkaç dakika <strong>Bağlanıyor…</strong> kalırsa
                VPS’te gateway sürecini (pm2 / docker) kontrol edin.
              </p>
            </div>
          ) : null}

          {gatewaySessionError && canUseGateway ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              <p className="font-medium">Gateway (sunucu) mesajı</p>
              <p className="mt-1 font-mono text-xs break-all">{gatewaySessionError}</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className={`h-5 w-5 ${isConnected ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span className="font-medium text-slate-800">Durum: {connectionLabel}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startConnection()}
                disabled={isBusy || !canUseGateway}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-100 px-3 py-2 text-sm font-medium text-indigo-900 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} />
                QR / Oturum başlat
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={isBusy || !canUseGateway}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800 disabled:opacity-50"
              >
                <Unlink className="h-4 w-4" />
                Çıkış
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Son bağlantı</p>
                  <p className="font-medium text-slate-800">{prettyDate(lastConnectedAt)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Oturum (kullanıcı id)</p>
                  <p className="truncate font-mono text-xs text-slate-700">{coachId || '—'}</p>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">Test numarası (ülke kodlu)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="905551112233"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void sendTestMessage()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto sm:px-6"
              >
                <MessageCircle className="h-4 w-4" />
                Test mesajı gönder
              </button>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">QR kod</p>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="WhatsApp QR" className="h-52 w-52 rounded-xl border border-white shadow-md" />
              ) : (
                <div className="flex h-52 w-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400">
                  <QrCode className="mb-2 h-12 w-12" />
                  <span className="text-xs">Bağlantı başlatın</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3 — Hızlı şablonlar */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-green-50 to-emerald-50/50 px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white shadow-md">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Hızlı şablonlar</h2>
            <p className="text-sm text-slate-600">
              Öğrenci veya veliye metin hazırlayın. Oturum bağlıysa gateway üzerinden; değilse WhatsApp Web / uygulama
              (wa.me) açılır.
            </p>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTemplateTab('student')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                templateTab === 'student' ? 'bg-blue-100 text-blue-900 ring-2 ring-blue-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <User className="h-4 w-4" />
              Öğrenci
            </button>
            <button
              type="button"
              onClick={() => setTemplateTab('parent')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                templateTab === 'parent' ? 'bg-purple-100 text-purple-900 ring-2 ring-purple-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="h-4 w-4" />
              Veli
            </button>
          </div>

          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
          >
            <option value="">Öğrenci seçin</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>

          <input
            value={templateTask}
            onChange={(e) => setTemplateTask(e.target.value)}
            placeholder="Bugünkü görev / ek not"
            className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
          />

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-800">
            {buildTemplateMessage() || 'Önizleme için öğrenci seçin.'}
          </div>

          {templateNotice ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-slate-200 bg-amber-50/80 px-4 py-3 text-sm whitespace-pre-wrap text-slate-800"
            >
              {templateNotice}
              {templateWaUrl ? (
                <p className="mt-2 break-all">
                  <a
                    href={templateWaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-green-800 underline decoration-green-700/40 hover:decoration-green-900"
                  >
                    WhatsApp bağlantısını buradan açın
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void sendQuickTemplate()}
            disabled={templateSendBusy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
          >
            {templateSendBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
            {templateSendBusy ? 'Gönderiliyor…' : 'Şablonu gönder'}
          </button>
        </div>
      </section>

      {statusMessage && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{statusMessage}</div>
      )}
    </div>
  );
}
