import { apiFetch, getAuthToken } from './session';

export function formatWhatsAppPhone(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

/** TR cep: 0546… → 90546… (gateway ve wa.me için) */
export function normalizeWhatsAppPhoneForSend(value: string): string {
  let d = formatWhatsAppPhone(value);
  if (!d) return '';
  if (d.startsWith('90') && d.length >= 12) return d;
  if (d.startsWith('0') && d.length === 11) return `90${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('5')) return `90${d}`;
  return d;
}

function humanizeGatewayError(status: number, data: { error?: string; detail?: string; hint?: string }): string {
  const code = String(data.error || '').trim();
  if (code === 'session_not_connected') {
    return 'WhatsApp oturumu bağlı değil. WhatsApp merkezinden QR ile yeniden bağlanın.';
  }
  if (code === 'send_message_timeout') {
    return 'WhatsApp sunucusu zaman aşımına uğradı. VPS’te gateway (pm2) çalışıyor mu kontrol edin; tekrar deneyin.';
  }
  if (code === 'number_not_on_whatsapp') {
    return 'Bu numara WhatsApp’ta kayıtlı görünmüyor. Veli numarasını 05… veya 905… formatında güncelleyin.';
  }
  if (code === 'gateway_upstream_timeout') {
    return `VPS gateway yanıt vermedi (${data.detail || 'zaman aşımı'}). WHATSAPP_GATEWAY_UPSTREAM ve pm2 kontrol edin.`;
  }
  if (code === 'phone_and_message_required') {
    return 'Telefon veya mesaj eksik (proxy gövdesi ulaşmamış olabilir). Sayfayı yenileyip tekrar deneyin.';
  }
  const parts = [data.error, data.detail, data.hint].filter(
    (x): x is string => typeof x === 'string' && x.length > 0
  );
  if (parts.length) return parts.join(' — ');
  return `gateway_request_failed (HTTP ${status})`;
}

function isValidGatewayEnvUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\/[^\s]+/i.test(t);
}

/** HTTPS panel + HTTP VPS → aynı origin Vercel proxy (`/api/whatsapp-gateway`). */
export function resolveWhatsAppGatewayBase(): string {
  const raw = String(import.meta.env.VITE_WHATSAPP_GATEWAY_URL || '').trim();
  const gv = raw.replace(/\/$/, '');
  if (!gv || !isValidGatewayEnvUrl(gv)) return '';
  if (typeof window === 'undefined') return gv;
  try {
    if (window.location.protocol === 'https:' && gv.startsWith('http://')) {
      return `${window.location.origin.replace(/\/$/, '')}/api/whatsapp-gateway`;
    }
  } catch {
    /* noop */
  }
  return gv;
}

type GatewayStatusPayload = {
  status?: string;
  qr?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
};

async function callGateway<T>(coachUserId: string, endpoint: string, init?: RequestInit): Promise<T> {
  const gatewayUrl = resolveWhatsAppGatewayBase();
  if (!gatewayUrl || !coachUserId) throw new Error('whatsapp_gateway_url_missing');
  const authToken = getAuthToken();
  if (!authToken) throw new Error('jwt_required_log_in_again');

  const headers = new Headers(init?.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${authToken}`);
  const gatewayKey = (import.meta.env.VITE_WHATSAPP_GATEWAY_KEY || '').trim();
  if (gatewayKey) headers.set('x-gateway-key', gatewayKey);

  const isSend = /\/send\/?$/i.test(endpoint);
  const timeoutMs = isSend ? 52000 : 22000;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${gatewayUrl}${endpoint}`, { headers, ...init, signal: controller.signal });
  } catch (e) {
    clearTimeout(tid);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        isSend
          ? 'İstek zaman aşımı (52 sn). VPS gateway yavaş veya takılı; pm2 restart whatsapp-gateway deneyin.'
          : 'Gateway durumu alınamadı (zaman aşımı).'
      );
    }
    throw e;
  }
  clearTimeout(tid);

  const rawText = await res.text();
  let data: { error?: string; detail?: string; hint?: string; ok?: boolean } = {};
  try {
    data = rawText ? (JSON.parse(rawText) as typeof data) : {};
  } catch {
    data = { detail: rawText.slice(0, 400) };
  }
  if (!res.ok) {
    throw new Error(humanizeGatewayError(res.status, data));
  }
  return data as T;
}

export async function isGatewayWhatsAppConnected(coachUserId: string): Promise<boolean> {
  try {
    const data = await callGateway<GatewayStatusPayload>(coachUserId, `/sessions/${coachUserId}/status`);
    return data.status === 'connected';
  } catch {
    return false;
  }
}

export function openWaMeLink(targetPhone: string, message: string): { opened: boolean; url: string } {
  const target = normalizeWhatsAppPhoneForSend(targetPhone) || formatWhatsAppPhone(targetPhone);
  const url = `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  const opened = w != null && !w.closed;
  return { opened, url };
}

export type WhatsAppSendResult = {
  channel: 'gateway' | 'twilio' | 'wame';
  notice: string;
  waUrl?: string;
};

/**
 * Gateway (bağlı oturum) → Twilio → wa.me sırası — Koç WhatsApp merkezi ile aynı mantık.
 */
export async function sendWhatsAppOutbound(opts: {
  coachUserId: string;
  targetPhone: string;
  message: string;
}): Promise<WhatsAppSendResult> {
  const target = normalizeWhatsAppPhoneForSend(opts.targetPhone);
  const message = String(opts.message || '').trim();
  const coachUserId = String(opts.coachUserId || '').trim();
  if (!target) throw new Error('Geçerli telefon numarası yok');
  if (!message) throw new Error('Mesaj metni boş');

  const gatewayUrl = resolveWhatsAppGatewayBase();
  const hasJwt = Boolean(getAuthToken());

  if (gatewayUrl && coachUserId && hasJwt) {
    try {
      const connected = await isGatewayWhatsAppConnected(coachUserId);
      if (connected) {
        await callGateway(coachUserId, `/sessions/${coachUserId}/send`, {
          method: 'POST',
          body: JSON.stringify({ phone: target, message })
        });
        return { channel: 'gateway', notice: 'Analiz özeti veliye WhatsApp gateway üzerinden gönderildi.' };
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'gateway_send_failed';
      const { opened, url } = openWaMeLink(target, message);
      return {
        channel: 'wame',
        waUrl: url,
        notice: opened
          ? `Gateway gönderemedi (${err}). wa.me yeni sekmede açıldı.`
          : `Gateway gönderemedi (${err}). Bağlantı: ${url}`
      };
    }
  }

  if (hasJwt) {
    try {
      const statusRes = await apiFetch('/api/twilio');
      const statusPayload = (await statusRes.json().catch(() => ({}))) as {
        data?: { configured?: boolean };
      };
      if (statusRes.ok && statusPayload.data?.configured) {
        const res = await apiFetch('/api/twilio', {
          method: 'POST',
          body: JSON.stringify({ to: target, message })
        });
        const payload = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        if (res.ok) {
          return { channel: 'twilio', notice: 'Analiz özeti veliye kurumsal WhatsApp (Twilio) ile gönderildi.' };
        }
        const { opened, url } = openWaMeLink(target, message);
        return {
          channel: 'wame',
          waUrl: url,
          notice: opened
            ? `Twilio (${res.status}): ${payload.error || 'hata'}. wa.me açıldı.`
            : `Twilio hatası. wa.me: ${url}`
        };
      }
    } catch {
      /* Twilio yok → wa.me */
    }
  }

  const { opened, url } = openWaMeLink(target, message);
  if (opened) {
    return {
      channel: 'wame',
      waUrl: url,
      notice:
        gatewayUrl && !hasJwt
          ? 'Sunucu oturumu (JWT) gerekli. wa.me yeni sekmede açıldı — gateway için çıkış yapıp tekrar giriş yapın.'
          : 'WhatsApp gateway bağlı değil; analiz metni wa.me ile yeni sekmede açıldı.'
    };
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
  } catch {
    /* ignore */
  }
  return {
    channel: 'wame',
    waUrl: url,
    notice: 'Tarayıcı yeni sekme açmayı engelledi. Bağlantı panoya kopyalandı veya aşağıdan açılabilir.'
  };
}
