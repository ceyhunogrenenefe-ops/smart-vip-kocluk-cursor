/**
 * VPS WhatsApp gateway taban adresi — http:// ve :4010 eksikse tamamlar.
 * Eski Windows/Korea IP otomatik Phoenix VPS’e alınır (2026-08-27).
 */
const PHOENIX_GATEWAY = 'http://89.252.179.128:4010';
const LEGACY_GATEWAY_HOSTS = new Set(['27.102.132.134', '27.102.134.199']);

function remapLegacyGatewayHost(raw) {
  try {
    const u = new URL(raw);
    if (LEGACY_GATEWAY_HOSTS.has(u.hostname)) return PHOENIX_GATEWAY;
  } catch {
    /* ignore */
  }
  return raw;
}

export function resolveGatewayUpstream() {
  let raw = String(process.env.WHATSAPP_GATEWAY_UPSTREAM || '').trim().replace(/\/$/, '');
  if (!raw) {
    const alt = String(process.env.WHATSAPP_GATEWAY_URL || '').trim().replace(/\/$/, '');
    if (alt && /^https?:\/\//i.test(alt) && !/vercel\.app/i.test(alt)) raw = alt;
  }
  if (!raw) raw = PHOENIX_GATEWAY;

  if (!/^https?:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }
  raw = remapLegacyGatewayHost(raw);

  try {
    const u = new URL(raw);
    if (!u.port) {
      const def = u.protocol === 'https:' ? '443' : '4010';
      return `${u.protocol}//${u.hostname}:${def}`;
    }
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return '';
  }
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
    return { ok: false, error: 'upstream_missing', upstream: null };
  }
  const timeoutMs = Math.min(5000, Math.max(2000, Number(process.env.WA_GATEWAY_HEALTH_TIMEOUT_MS) || 3500));
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
      error: aborted ? 'gateway_upstream_timeout' : e instanceof Error ? e.message : 'fetch_failed'
    };
    healthCache = { at: Date.now(), data: out };
    return out;
  }
}
