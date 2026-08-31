/**
 * VPS WhatsApp gateway taban adresi.
 * Üretim her zaman Phoenix (89.252.179.128:4010). Eski Windows/Korea IP
 * (27.102.132.134) ölü — env yanlış kalsa bile oraya gidilmez.
 */
export const PHOENIX_GATEWAY = 'http://89.252.179.128:4010';
export const PHOENIX_HOST = '89.252.179.128';
export const GATEWAY_UPSTREAM_PIN = 'phoenix-89.252.179.128:4010';

const LEGACY_HOST_RE = /27\.102\.(132\.134|134\.199)/;

function stripQuotes(s) {
  return String(s || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\/$/, '');
}

function allowNonPhoenix() {
  return String(process.env.WHATSAPP_GATEWAY_ALLOW_NON_PHOENIX || '').trim() === '1';
}

function isLocalDevHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function isPhoenixHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === PHOENIX_HOST || h === 'app.phoenixdms.com' || h.endsWith('.phoenixdms.com');
}

/**
 * Env ne olursa olsun (eski Korea/Windows IP, tırnak, şema yok) Phoenix’e pinler.
 * Yerel geliştirme: localhost. Kaçış: WHATSAPP_GATEWAY_ALLOW_NON_PHOENIX=1
 */
export function resolveGatewayUpstream() {
  let raw = stripQuotes(process.env.WHATSAPP_GATEWAY_UPSTREAM || '');
  if (!raw) {
    const alt = stripQuotes(process.env.WHATSAPP_GATEWAY_URL || '');
    if (alt && /^https?:\/\//i.test(alt) && !/vercel\.app/i.test(alt)) raw = alt;
  }
  if (!raw) return PHOENIX_GATEWAY;

  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  if (LEGACY_HOST_RE.test(raw)) return PHOENIX_GATEWAY;

  try {
    const u = new URL(raw);
    if (isPhoenixHost(u.hostname)) {
      const port = u.port || (u.protocol === 'https:' ? '443' : '4010');
      return `${u.protocol}//${u.hostname}:${port}`;
    }
    if (isLocalDevHost(u.hostname)) {
      const port = u.port || '4010';
      return `${u.protocol}//${u.hostname}:${port}`;
    }
  } catch {
    /* pin below */
  }

  if (allowNonPhoenix()) {
    try {
      const u = new URL(raw);
      const port = u.port || (u.protocol === 'https:' ? '443' : '4010');
      return `${u.protocol}//${u.hostname}:${port}`;
    } catch {
      return PHOENIX_GATEWAY;
    }
  }

  return PHOENIX_GATEWAY;
}

/** VPS /health — JWT gerekmez; kısa süre önbellek (status spam önlenir). */
let healthCache = { at: 0, data: null };
const HEALTH_CACHE_MS = Math.min(8000, Math.max(1500, Number(process.env.WA_GATEWAY_HEALTH_CACHE_MS) || 3000));

export async function probeGatewayHealth() {
  const now = Date.now();
  if (healthCache.data && now - healthCache.at < HEALTH_CACHE_MS) {
    return healthCache.data;
  }
  const upstream = resolveGatewayUpstream();
  if (!upstream) {
    return { ok: false, error: 'upstream_missing', upstream: null, pin: GATEWAY_UPSTREAM_PIN };
  }
  const timeoutMs = Math.min(8000, Math.max(2000, Number(process.env.WA_GATEWAY_HEALTH_TIMEOUT_MS) || 5000));
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${upstream}/health`, { signal: controller.signal });
    clearTimeout(tid);
    const data = await res.json().catch(() => ({}));
    const out = {
      ok: res.ok && data?.ok !== false,
      status: res.status,
      upstream: upstream.replace(/^https?:\/\//, ''),
      pin: GATEWAY_UPSTREAM_PIN,
      service: data?.service || null,
      sessions: Number(data?.sessions) || 0,
      connected: Number(data?.connected) || 0,
      connected_session_ids: Array.isArray(data?.connected_session_ids)
        ? data.connected_session_ids.map((x) => String(x || '').trim()).filter(Boolean)
        : [],
      get_message_implemented: data?.get_message_implemented === true,
      message_store: data?.message_store || null,
      sessions_detail: Array.isArray(data?.sessions_detail) ? data.sessions_detail : null,
      raw: data && typeof data === 'object' ? data : null,
      error: res.ok ? null : String(data?.error || `http_${res.status}`)
    };
    healthCache = { at: Date.now(), data: out };
    return out;
  } catch (e) {
    clearTimeout(tid);
    const aborted = e instanceof Error && e.name === 'AbortError';
    const out = {
      ok: false,
      upstream: upstream.replace(/^https?:\/\//, ''),
      pin: GATEWAY_UPSTREAM_PIN,
      error: aborted ? 'gateway_upstream_timeout' : e instanceof Error ? e.message : 'fetch_failed'
    };
    healthCache = { at: Date.now(), data: out };
    return out;
  }
}
