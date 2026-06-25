import { getAuthToken, getGatewaySessionUserId } from './session';

export type GatewayStatus = 'idle' | 'connecting' | 'qr_ready' | 'connected' | 'logged_out' | 'reconnecting';

export type GatewayStatusPayload = {
  status: GatewayStatus;
  qr: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
  restoreBlocked?: boolean;
  authOnDisk?: boolean;
  hint?: string | null;
  linkedPhone?: string | null;
  sessionCoachId?: string | null;
};

function isValidGatewayEnvUrl(s: string): boolean {
  const t = s.trim();
  if (!t || t.includes('your-') || t.includes('example.com')) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveWhatsAppGatewayBase(): string {
  const raw = String(import.meta.env.VITE_WHATSAPP_GATEWAY_URL || '').trim();
  const gv = raw.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '');
    const proxy = `${origin}/api/whatsapp-gateway`;
    if (!gv || !isValidGatewayEnvUrl(gv)) return proxy;
    if (window.location.protocol === 'https:' && gv.startsWith('http://')) return proxy;
    return gv;
  }
  return gv && isValidGatewayEnvUrl(gv) ? gv : '';
}

export function gatewayApiKeyHeader(): string {
  return String(import.meta.env.VITE_WHATSAPP_GATEWAY_KEY || '').trim();
}

export function formatGatewaySessionError(raw: string) {
  const e = raw.trim().toLowerCase();
  if (e.includes('stream errored')) {
    return 'Geçici bağlantı kesintisi — otomatik yeniden bağlanılıyor. QR gerekmez.';
  }
  if (e.includes('connection failure')) {
    return 'WhatsApp sunucusuna geçici bağlantı hatası. «Oturumu sıfırla ve QR al» deneyin; telefonda Bağlı cihazlardan eski oturumu kaldırın.';
  }
  if (e.includes('conflict') || e.includes('connection replaced')) {
    return 'Aynı numara başka yerde bağlı. Telefondan diğer WhatsApp Web oturumlarını kapatın.';
  }
  return raw.trim();
}

function buildGatewayUnreachableHint(raw: string) {
  const t = raw.toLowerCase();
  if (!t.includes('gateway_upstream_unreachable') && !t.includes('gateway_upstream_timeout')) return '';
  return ' Vercel WHATSAPP_GATEWAY_UPSTREAM=http://VPS_IP:4010 olmalı; VPS’te pm2 restart whatsapp-gateway.';
}

export async function callWhatsAppGateway<T>(
  sessionId: string,
  endpoint: string,
  init?: RequestInit
): Promise<T> {
  const gatewayUrl = resolveWhatsAppGatewayBase();
  const requested = String(sessionId || '').trim();
  const sid = getGatewaySessionUserId(requested) || requested;
  if (!gatewayUrl || !sid) throw new Error('whatsapp_gateway_url_missing');
  const authToken = getAuthToken();
  if (!authToken) throw new Error('jwt_required_log_in_again');

  const headers = new Headers(init?.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${authToken}`);
  const gk = gatewayApiKeyHeader();
  if (gk) headers.set('x-gateway-key', gk);

  const isSend = /\/send\/?$/i.test(endpoint);
  const timeoutMs = isSend ? 115000 : 28000;
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
          ? 'Mesaj gönderimi zaman aşımına uğradı (110 sn). VPS gateway yavaş veya kopuk — pm2 restart whatsapp-gateway deneyin.'
          : 'Gateway durumu alınamadı (zaman aşımı).'
      );
    }
    throw e;
  }
  clearTimeout(tid);

  const rawText = await res.text();
  let data: { error?: string; detail?: string; hint?: string } = {};
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
        ? data.error === 'invalid_gateway_key'
          ? ' GATEWAY_API_KEY uyuşmuyor — VPS .env ile Vercel aynı olmalı.'
          : ' JWT süresi dolmuş veya APP_JWT_SECRET uyuşmuyor — çıkış yapıp tekrar giriş yapın.'
        : res.status === 502
          ? ' VPS gateway kapalı — pm2 restart whatsapp-gateway.'
          : res.status === 504
            ? ' Mesaj gönderimi zaman aşımına uğradı — VPS gateway yavaş veya kopuk.'
            : res.status === 403
            ? data.error === 'coach_scope_mismatch'
              ? ' Oturum id ile giriş JWT’si uyuşmuyor — çıkış yapıp tekrar giriş yapın. Başka kullanıcı adına görünümdeyken WhatsApp bağlanamaz.'
              : ' Erişim reddedildi (403).'
            : '';
    throw new Error(`${base}${authHint}${buildGatewayUnreachableHint(base)}`);
  }
  return data as T;
}

export async function gatewayResetSession(sessionId: string): Promise<GatewayStatusPayload & { purged?: boolean }> {
  try {
    return await callWhatsAppGateway<GatewayStatusPayload & { reset?: boolean }>(
      sessionId,
      `/sessions/${sessionId}/reset`,
      { method: 'POST' }
    );
  } catch (e) {
    const status = (e as Error & { httpStatus?: number }).httpStatus;
    if (status === 404) {
      return callWhatsAppGateway<GatewayStatusPayload & { purged?: boolean }>(
        sessionId,
        `/sessions/${sessionId}/start`,
        { method: 'POST', body: JSON.stringify({ purge: true }) }
      );
    }
    throw e;
  }
}
