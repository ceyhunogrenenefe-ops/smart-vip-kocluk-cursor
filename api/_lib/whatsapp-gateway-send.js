/**
 * Sunucu tarafı WhatsApp gateway (Baileys VPS) — koç oturumu üzerinden düz metin gönderimi.
 * Ortam: WHATSAPP_GATEWAY_UPSTREAM, APP_JWT_SECRET, BOOK_ORDER_GATEWAY_SESSION_ID, GATEWAY_API_KEY
 */
import { signAuthToken } from './auth.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { resolveGatewayUpstream, probeGatewayHealth } from './gateway-upstream.js';

function gatewayApiKey() {
  return String(
    process.env.GATEWAY_API_KEY ||
      process.env.WHATSAPP_GATEWAY_KEY ||
      process.env.VITE_WHATSAPP_GATEWAY_KEY ||
      ''
  ).trim();
}

export function bookOrderGatewaySessionId() {
  return String(
    process.env.BOOK_ORDER_GATEWAY_SESSION_ID ||
      process.env.WHATSAPP_GATEWAY_SESSION_ID ||
      ''
  ).trim();
}

/** Günlük rapor hatırlatması — aynı QR oturumu (kitap siparişi ile paylaşılabilir). */
export function reportReminderGatewaySessionId() {
  return String(
    process.env.REPORT_REMINDER_GATEWAY_SESSION_ID ||
      process.env.BOOK_ORDER_GATEWAY_SESSION_ID ||
      process.env.WHATSAPP_GATEWAY_SESSION_ID ||
      ''
  ).trim();
}

export function gatewayConfiguredForSession(sessionId) {
  return Boolean(
    resolveGatewayUpstream() &&
      String(sessionId || '').trim() &&
      String(process.env.APP_JWT_SECRET || '').trim()
  );
}

export function gatewaySendConfigured() {
  return Boolean(
    resolveGatewayUpstream() &&
      bookOrderGatewaySessionId() &&
      String(process.env.APP_JWT_SECRET || '').trim()
  );
}

export function getGatewaySendEnvStatus() {
  const upstream = resolveGatewayUpstream();
  const sessionId = bookOrderGatewaySessionId();
  const hasJwt = Boolean(String(process.env.APP_JWT_SECRET || '').trim());
  const configured = Boolean(upstream && sessionId && hasJwt);
  return {
    configured,
    upstream_suffix: upstream ? upstream.replace(/^https?:\/\//, '').slice(-24) : null,
    session_id_suffix: sessionId && sessionId.length > 8 ? sessionId.slice(-8) : sessionId || null,
    has_api_key: Boolean(gatewayApiKey()),
    hint: configured
      ? 'Kitap siparişleri bağlı WhatsApp gateway oturumu üzerinden gider (Meta şablonu değil).'
      : 'Vercel: WHATSAPP_GATEWAY_UPSTREAM, BOOK_ORDER_GATEWAY_SESSION_ID (QR bağlı kullanıcı id), APP_JWT_SECRET.'
  };
}

function serviceGatewayJwt(sessionId) {
  return signAuthToken({
    sub: sessionId,
    role: 'super_admin',
    institution_id: null
  });
}

async function gatewayFetch(path, { method = 'GET', body } = {}) {
  const upstream = resolveGatewayUpstream();
  if (!upstream) {
    return {
      ok: false,
      status: 503,
      data: { error: 'whatsapp_gateway_upstream_missing' }
    };
  }
  const headers = {
    Authorization: `Bearer ${serviceGatewayJwt(bookOrderGatewaySessionId())}`
  };
  const key = gatewayApiKey();
  if (key) headers['x-gateway-key'] = key;
  if (body != null) headers['Content-Type'] = 'application/json';

  const timeoutMs = Math.min(
    55000,
    Math.max(15000, Number(process.env.WA_GATEWAY_SEND_TIMEOUT_MS) || 48000)
  );
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${upstream}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    clearTimeout(tid);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    clearTimeout(tid);
    const aborted = e instanceof Error && e.name === 'AbortError';
    return {
      ok: false,
      status: aborted ? 504 : 502,
      data: { error: aborted ? 'gateway_upstream_timeout' : 'gateway_fetch_failed' }
    };
  }
}

export async function getGatewaySessionStatus(sessionId = bookOrderGatewaySessionId()) {
  const id = String(sessionId || '').trim();
  if (!id) return { ok: false, status: 'missing_session_id' };

  const health = await probeGatewayHealth();
  if (!health.ok) {
    return {
      ok: false,
      status: 'vps_unreachable',
      health,
      error:
        health.error === 'fetch_failed' || health.error === 'gateway_upstream_timeout'
          ? 'VPS gateway yanıt vermiyor — sunucuda pm2 restart whatsapp-gateway ve 4010 portu açık mı kontrol edin.'
          : health.error || 'gateway_health_failed'
    };
  }

  const r = await gatewayFetch(`/sessions/${encodeURIComponent(id)}/status`);
  const errCode = String(r.data?.error || '').trim();
  const st = String(r.data?.status || '').trim().toLowerCase();

  if (!r.ok) {
    const hints = {
      invalid_gateway_key:
        'GATEWAY_API_KEY uyuşmuyor — VPS .env dosyasındaki anahtar Vercel GATEWAY_API_KEY ile aynı olmalı, sonra pm2 restart.',
      missing_token: 'JWT eksik.',
      invalid_signature:
        'APP_JWT_SECRET uyuşmuyor — VPS gateway .env içindeki APP_JWT_SECRET, Vercel ile aynı olmalı.',
      jwt_secret_missing: 'VPS’te APP_JWT_SECRET tanımlı değil.',
      unauthorized: 'Gateway yetkilendirme hatası.'
    };
    return {
      ok: false,
      status: errCode || `http_${r.status}`,
      http_status: r.status,
      health,
      error: hints[errCode] || errCode || `gateway_status_http_${r.status}`
    };
  }

  return {
    ok: st === 'connected',
    status: st || 'unknown',
    health,
    raw: r.data,
    error:
      st === 'connected'
        ? null
        : st === 'idle' || st === 'qr_ready' || st === 'connecting'
          ? 'WhatsApp gateway oturumu bağlı değil — Koç WhatsApp ayarlarından QR ile bağlayın.'
          : `Oturum durumu: ${st}`
  };
}

export { probeGatewayHealth };

/**
 * Gateway üzerinden düz metin WhatsApp gönderir.
 * @returns {Promise<{ ok: boolean, sid?: string|null, channel: string, error?: string, errorCode?: string, bodyPreview?: string }>}
 */
export async function sendGatewayTextMessage({ phone, message, sessionId = bookOrderGatewaySessionId() }) {
  const e164 = normalizePhoneToE164(phone);
  const text = String(message || '').trim();
  const sid = String(sessionId || '').trim();

  if (!gatewaySendConfigured()) {
    return {
      ok: false,
      channel: 'gateway',
      error: 'Gateway yapılandırılmamış: WHATSAPP_GATEWAY_UPSTREAM, BOOK_ORDER_GATEWAY_SESSION_ID, APP_JWT_SECRET.',
      errorCode: 'GATEWAY_ENV'
    };
  }
  if (!e164) {
    return { ok: false, channel: 'gateway', error: 'Geçersiz telefon numarası.', errorCode: 'PHONE' };
  }
  if (!text) {
    return { ok: false, channel: 'gateway', error: 'Mesaj metni boş.', errorCode: 'MESSAGE' };
  }

  const status = await getGatewaySessionStatus(sid);
  if (!status.ok) {
    const st = status.status || 'unknown';
    return {
      ok: false,
      channel: 'gateway',
      error:
        st === 'missing_session_id'
          ? 'BOOK_ORDER_GATEWAY_SESSION_ID tanımlı değil.'
          : `WhatsApp gateway oturumu bağlı değil (${st}). Koç WhatsApp ayarlarından QR ile bağlayın.`,
      errorCode: st === 'missing_session_id' ? 'GATEWAY_SESSION' : 'GATEWAY_NOT_CONNECTED'
    };
  }

  const r = await gatewayFetch(`/sessions/${encodeURIComponent(sid)}/send`, {
    method: 'POST',
    body: { phone: e164.replace(/^\+/, ''), message: text }
  });

  if (!r.ok) {
    const err = String(r.data?.error || 'gateway_send_failed');
    const hints = {
      session_not_connected: 'Gateway oturumu düştü — QR ile yeniden bağlayın.',
      number_not_on_whatsapp: 'Numara WhatsApp kayıtlı değil.',
      invalid_gateway_key: 'GATEWAY_API_KEY uyuşmuyor.',
      gateway_upstream_timeout: 'VPS gateway zaman aşımı — pm2 restart whatsapp-gateway.'
    };
    return {
      ok: false,
      channel: 'gateway',
      error: hints[err] || err,
      errorCode: err.toUpperCase().slice(0, 32)
    };
  }

  return {
    ok: true,
    channel: 'gateway',
    sid: r.data?.id || null,
    meta_message_id: null,
    bodyPreview: text.slice(0, 200),
    gateway_message_id: r.data?.id || null
  };
}
