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

/** Env yoksa giriş yapan admin/koç oturumu (QR bağlı users.id). */
export function resolveBookOrderGatewaySessionId(fallbackUserId) {
  return bookOrderGatewaySessionId() || String(fallbackUserId || '').trim();
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

export function gatewaySendConfigured(fallbackUserId) {
  return gatewayConfiguredForSession(resolveBookOrderGatewaySessionId(fallbackUserId));
}

export function getGatewaySendEnvStatus() {
  const upstream = resolveGatewayUpstream();
  const sessionId = bookOrderGatewaySessionId();
  const hasJwt = Boolean(String(process.env.APP_JWT_SECRET || '').trim());
  const configured = Boolean(upstream && hasJwt);
  return {
    configured: Boolean(configured && sessionId),
    upstream_ready: Boolean(upstream && hasJwt),
    upstream_suffix: upstream ? upstream.replace(/^https?:\/\//, '').slice(-24) : null,
    session_id_suffix: sessionId && sessionId.length > 8 ? sessionId.slice(-8) : sessionId || null,
    has_api_key: Boolean(gatewayApiKey()),
    hint: !upstream || !hasJwt
      ? 'Vercel: WHATSAPP_GATEWAY_UPSTREAM, APP_JWT_SECRET (ve isteğe bağlı BOOK_ORDER_GATEWAY_SESSION_ID).'
      : !sessionId
        ? 'BOOK_ORDER_GATEWAY_SESSION_ID boş — QR bağlı kullanıcı id otomatik aranır; cron için env önerilir.'
        : 'Kitap siparişleri gateway (Baileys) veya Meta yedek kanalı ile gider.'
  };
}

/** VPS /health + gateway key → bağlı oturum id listesi */
export async function listConnectedGatewaySessionIds() {
  const upstream = resolveGatewayUpstream();
  if (!upstream) return [];
  const key = gatewayApiKey();
  const headers = key ? { 'x-gateway-key': key } : {};
  const timeoutMs = Math.min(12000, Math.max(4000, Number(process.env.WA_GATEWAY_HEALTH_TIMEOUT_MS) || 8000));
  try {
    const res = await fetch(`${upstream}/health`, { headers, signal: AbortSignal.timeout(timeoutMs) });
    const data = await res.json().catch(() => ({}));
    const ids = data?.connected_session_ids;
    return Array.isArray(ids) ? ids.map((x) => String(x || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Önce aday id'ler, sonra VPS'teki bağlı oturumlar — QR hangi hesaptaysa onu bulur. */
export async function pickConnectedGatewaySessionId(candidates = []) {
  const uniq = [
    ...new Set(
      (Array.isArray(candidates) ? candidates : [candidates])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  ];
  for (const id of uniq) {
    if (!gatewayConfiguredForSession(id)) continue;
    const st = await getGatewaySessionStatus(id);
    if (st.ok && st.status === 'connected') return id;
  }
  const live = await listConnectedGatewaySessionIds();
  for (const id of live) {
    if (gatewayConfiguredForSession(id)) return id;
  }
  return uniq[0] || live[0] || '';
}

function serviceGatewayJwt(sessionId) {
  return signAuthToken({
    sub: sessionId,
    role: 'super_admin',
    institution_id: null
  });
}

async function gatewayFetch(path, { method = 'GET', body, sessionId } = {}) {
  const upstream = resolveGatewayUpstream();
  if (!upstream) {
    return {
      ok: false,
      status: 503,
      data: { error: 'whatsapp_gateway_upstream_missing' }
    };
  }
  const sid =
    String(sessionId || '').trim() ||
    (() => {
      const m = String(path || '').match(/\/sessions\/([^/]+)/);
      return m ? decodeURIComponent(m[1]) : bookOrderGatewaySessionId();
    })();
  const headers = {
    Authorization: `Bearer ${serviceGatewayJwt(sid)}`
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

  const r = await gatewayFetch(`/sessions/${encodeURIComponent(id)}/status`, { sessionId: id });
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
      coach_scope_mismatch: 'Gateway oturum id uyuşmazlığı — BOOK_ORDER_GATEWAY_SESSION_ID QR bağlı kullanıcı id ile aynı olmalı.',
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
export async function sendGatewayTextMessage({ phone, message, sessionId, sessionCandidates }) {
  const e164 = normalizePhoneToE164(phone);
  const text = String(message || '').trim();
  const candidates = [
    ...(Array.isArray(sessionCandidates) ? sessionCandidates : []),
    sessionId,
    bookOrderGatewaySessionId(),
    reportReminderGatewaySessionId()
  ];
  const sid = await pickConnectedGatewaySessionId(candidates);

  if (!resolveGatewayUpstream() || !String(process.env.APP_JWT_SECRET || '').trim()) {
    return {
      ok: false,
      channel: 'gateway',
      error: 'Gateway yapılandırılmamış: WHATSAPP_GATEWAY_UPSTREAM ve APP_JWT_SECRET gerekli.',
      errorCode: 'GATEWAY_ENV'
    };
  }
  if (!sid) {
    return {
      ok: false,
      channel: 'gateway',
      error:
        'Bağlı WhatsApp oturumu yok. Kitap siparişleri veya Koç WhatsApp sayfasından QR okutun; ardından BOOK_ORDER_GATEWAY_SESSION_ID olarak kullanıcı id yazın.',
      errorCode: 'GATEWAY_NOT_CONNECTED'
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
      error: status.error || `WhatsApp gateway bağlı değil (${st}). QR ile bağlayın.`,
      errorCode: st === 'missing_session_id' ? 'GATEWAY_SESSION' : 'GATEWAY_NOT_CONNECTED',
      gateway_session_id: sid
    };
  }

  const r = await gatewayFetch(`/sessions/${encodeURIComponent(sid)}/send`, {
    method: 'POST',
    body: { phone: e164.replace(/^\+/, ''), message: text },
    sessionId: sid
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
    gateway_message_id: r.data?.id || null,
    gateway_session_id: sid
  };
}
