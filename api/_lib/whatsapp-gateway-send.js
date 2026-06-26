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

/** Giriş yapan kullanıcının kendi gateway oturumu (QR = users.id). */
export function resolveActorGatewaySessionId(userId) {
  return String(userId || '').trim();
}

/** Cron / kitap siparişi env oturumu — yalnızca otomasyon için. */
export function resolveBookOrderGatewaySessionId(fallbackUserId) {
  return bookOrderGatewaySessionId() || resolveActorGatewaySessionId(fallbackUserId);
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

/** Öğretmen ders hatırlatması cron — varsayılan süper admin / kitap siparişi gateway oturumu. */
export function teacherReminderGatewaySessionId() {
  return String(
    process.env.TEACHER_REMINDER_GATEWAY_SESSION_ID ||
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
    if (Array.isArray(ids) && ids.length) {
      return ids.map((x) => String(x || '').trim()).filter(Boolean);
    }
    if (Number(data?.connected) > 0) {
      return probeConnectedGatewaySessionIds([]);
    }
    return [];
  } catch {
    return [];
  }
}

async function adminUserIdsForGatewayProbe() {
  try {
    const { supabaseAdmin } = await import('./supabase-admin.js');
    const { data } = await supabaseAdmin
      .from('users')
      .select('id')
      .in('role', ['super_admin', 'admin'])
      .eq('is_active', true)
      .limit(30);
    return (data || []).map((r) => String(r.id || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** VPS health connected>0 ama id listesi yoksa admin hesaplarını tarar. */
export async function probeConnectedGatewaySessionIds(extraCandidates = []) {
  const health = await probeGatewayHealth();
  if (!health.ok || Number(health.connected) <= 0) return [];

  const fromHealth = health.connected_session_ids || [];
  if (fromHealth.length) return fromHealth;

  const candidates = [
    ...extraCandidates,
    bookOrderGatewaySessionId(),
    reportReminderGatewaySessionId(),
    ...(await adminUserIdsForGatewayProbe())
  ];
  const uniq = [...new Set(candidates.map((x) => String(x || '').trim()).filter(Boolean))];
  const connected = [];
  for (const id of uniq) {
    if (!gatewayConfiguredForSession(id)) continue;
    const st = await getGatewaySessionStatus(id);
    if (st.ok && st.status === 'connected') connected.push(id);
  }
  return connected;
}

/** Gönderim için oturum: önce canlı bağlı, yoksa ısıtılacak aday. */
export async function resolveGatewaySessionForSend(candidates = [], { allowSharedFallback = false } = {}) {
  const uniq = [
    ...new Set(
      (Array.isArray(candidates) ? candidates : [candidates])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  ];
  let live = await listConnectedGatewaySessionIds();
  if (!live.length && allowSharedFallback) {
    live = await probeConnectedGatewaySessionIds(uniq);
  }
  for (const id of uniq) {
    if (live.includes(id) && gatewayConfiguredForSession(id)) {
      return { sessionId: id, connected: true };
    }
  }
  if (allowSharedFallback) {
    for (const id of live) {
      if (gatewayConfiguredForSession(id)) return { sessionId: id, connected: true };
    }
  }
  for (const id of uniq) {
    if (gatewayConfiguredForSession(id)) return { sessionId: id, connected: false };
  }
  return { sessionId: '', connected: false };
}

/** @deprecated resolveGatewaySessionForSend kullanın */
export async function pickConnectedGatewaySessionId(candidates = [], { allowSharedFallback = false } = {}) {
  const { sessionId } = await resolveGatewaySessionForSend(candidates, { allowSharedFallback });
  return sessionId;
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
    115000,
    Math.max(20000, Number(process.env.WA_GATEWAY_SEND_TIMEOUT_MS) || 110000)
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

/**
 * Kopmuş oturumu diskteki auth ile sessizce yeniden bağlar (QR gerekmez).
 * @returns {Promise<{ ok: boolean, status?: string, warmed?: boolean }>}
 */
export async function warmGatewaySession(sessionId, { waitMs = 25000 } = {}) {
  const id = String(sessionId || '').trim();
  if (!id || !gatewayConfiguredForSession(id)) {
    return { ok: false, status: 'not_configured' };
  }

  const health = await probeGatewayHealth();
  if (!health.ok) {
    return { ok: false, status: 'vps_unreachable' };
  }

  let st = await getGatewaySessionStatus(id);
  if (st.ok && st.status === 'connected') {
    return { ok: true, status: 'connected', warmed: false };
  }

  const raw = st.raw && typeof st.raw === 'object' ? st.raw : {};
  const authOnDisk = raw.authOnDisk === true;
  const restoreBlocked = raw.restoreBlocked === true;
  const status = String(st.status || raw.status || '').toLowerCase();
  const canWarm =
    authOnDisk &&
    !restoreBlocked &&
    (status === 'idle' ||
      status === 'reconnecting' ||
      status === 'logged_out' ||
      status === 'connecting' ||
      status === 'unknown' ||
      !status);

  if (!canWarm) {
    return { ok: false, status: status || 'not_warmable' };
  }

  await gatewayFetch(`/sessions/${encodeURIComponent(id)}/start`, {
    method: 'POST',
    body: { purge: false },
    sessionId: id
  });

  const deadline = Date.now() + Math.max(2000, waitMs);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    st = await getGatewaySessionStatus(id);
    if (st.ok && st.status === 'connected') {
      return { ok: true, status: 'connected', warmed: true };
    }
    const cur = String(st.status || '').toLowerCase();
    if (cur === 'qr_ready') break;
  }

  return {
    ok: st.ok && st.status === 'connected',
    status: st.status || 'warming',
    warmed: true
  };
}

/** Aktif gateway zamanlayıcılarındaki oturumları cron öncesi canlı tutar. */
export async function warmActiveCoachGatewaySessions(sessionIds = []) {
  const uniq = [
    ...new Set(
      (Array.isArray(sessionIds) ? sessionIds : [sessionIds])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  ];
  const bookId = bookOrderGatewaySessionId();
  if (bookId) uniq.push(bookId);
  const results = [];
  for (const id of uniq) {
    if (!gatewayConfiguredForSession(id)) continue;
    try {
      const out = await warmGatewaySession(id, { waitMs: 12000 });
      results.push({ session_id: id, ...out });
    } catch (e) {
      results.push({
        session_id: id,
        ok: false,
        status: 'warm_error',
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
  return results;
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
export async function sendGatewayTextMessage({
  phone,
  message,
  sessionId,
  sessionCandidates,
  allowSharedFallback = false
}) {
  const actorSid = String(sessionId || '').trim();
  const candidates = [
    ...(Array.isArray(sessionCandidates) ? sessionCandidates : []),
    actorSid
  ];
  if (allowSharedFallback) {
    candidates.push(bookOrderGatewaySessionId(), reportReminderGatewaySessionId());
  }

  const e164 = normalizePhoneToE164(phone);
  const text = String(message || '').trim();

  if (!resolveGatewayUpstream() || !String(process.env.APP_JWT_SECRET || '').trim()) {
    return {
      ok: false,
      channel: 'gateway',
      error: 'Gateway yapılandırılmamış: WHATSAPP_GATEWAY_UPSTREAM ve APP_JWT_SECRET gerekli.',
      errorCode: 'GATEWAY_ENV'
    };
  }

  let { sessionId: sid, connected } = await resolveGatewaySessionForSend(candidates, {
    allowSharedFallback
  });

  if (!sid) {
    return {
      ok: false,
      channel: 'gateway',
      error: allowSharedFallback
        ? 'Bağlı WhatsApp oturumu yok. İlgili kullanıcı kendi hesabından QR ile bağlanmalı.'
        : 'Sizin WhatsApp oturumunuz bağlı değil — Koç WhatsApp ayarlarından kendi numaranızı QR ile bağlayın.',
      errorCode: 'GATEWAY_NOT_CONNECTED'
    };
  }
  if (!e164) {
    return { ok: false, channel: 'gateway', error: 'Geçersiz telefon numarası.', errorCode: 'PHONE' };
  }
  if (!text) {
    return { ok: false, channel: 'gateway', error: 'Mesaj metni boş.', errorCode: 'MESSAGE' };
  }

  const retryableErrors = new Set([
    'send_message_timeout',
    'gateway_upstream_timeout',
    'session_not_connected',
    'send_precheck_timeout',
    'gateway_fetch_failed'
  ]);

  const hints = {
    session_not_connected: 'Gateway oturumu düştü — QR ile yeniden bağlayın veya birkaç saniye sonra tekrar deneyin.',
    number_not_on_whatsapp: 'Numara WhatsApp kayıtlı değil.',
    invalid_gateway_key: 'GATEWAY_API_KEY uyuşmuyor.',
    gateway_upstream_timeout: 'VPS gateway zaman aşımı — pm2 restart whatsapp-gateway.',
    send_message_timeout: 'WhatsApp gönderimi zaman aşımına uğradı; tekrar denendi.'
  };

  const maxAttempts = 3;
  let lastErr = 'gateway_send_failed';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!connected || attempt > 1) {
      const warmed = await warmGatewaySession(sid, { waitMs: attempt === 1 ? 22000 : 14000 });
      connected = warmed.ok;
      if (!warmed.ok && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
    }

    const recheck = await getGatewaySessionStatus(sid);
    if (!recheck.ok && attempt < maxAttempts) {
      lastErr = String(recheck.error || recheck.status || 'GATEWAY_NOT_CONNECTED');
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }

    const r = await gatewayFetch(`/sessions/${encodeURIComponent(sid)}/send`, {
      method: 'POST',
      body: { phone: e164.replace(/^\+/, ''), message: text },
      sessionId: sid
    });

    if (r.ok) {
      return {
        ok: true,
        channel: 'gateway',
        sid: r.data?.id || null,
        meta_message_id: null,
        bodyPreview: text.slice(0, 200),
        gateway_message_id: r.data?.id || null,
        gateway_session_id: sid,
        attempts: attempt
      };
    }

    lastErr = String(r.data?.error || 'gateway_send_failed');
    if (!retryableErrors.has(lastErr) || attempt >= maxAttempts) {
      return {
        ok: false,
        channel: 'gateway',
        error: hints[lastErr] || lastErr,
        errorCode: lastErr.toUpperCase().slice(0, 32),
        gateway_session_id: sid,
        attempts: attempt
      };
    }

    await warmGatewaySession(sid, { waitMs: 4000 });
    await new Promise((r) => setTimeout(r, 2000));
    connected = false;
  }

  return {
    ok: false,
    channel: 'gateway',
    error: hints[lastErr] || lastErr,
    errorCode: String(lastErr).toUpperCase().slice(0, 32),
    gateway_session_id: sid
  };
}
