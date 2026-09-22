/**
 * CRM personel bildirimleri — süper admin QR (gateway) hattından düz metin.
 * Meta şablonu ücretli olduğu için kullanılmaz; Meta'ya yedek gönderim YOK.
 * Oturum: CRM_ALERT_GATEWAY_SESSION_ID (varsa) → aktif süper admin kullanıcı id'leri (QR = users.id).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { sendGatewayTextMessage, getGatewaySessionStatus } from './whatsapp-gateway-send.js';

const CACHE_MS = 10 * 60 * 1000;
let cache = { at: 0, ids: [] };

export async function crmGatewaySessionIds() {
  const envId = String(process.env.CRM_ALERT_GATEWAY_SESSION_ID || '').trim();
  if (envId) return [envId];
  if (Date.now() - cache.at < CACHE_MS && cache.ids.length) return cache.ids;
  const { data } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('role', 'super_admin')
    .eq('is_active', true)
    .limit(5);
  const ids = (data || []).map((r) => String(r.id || '').trim()).filter(Boolean);
  cache = { at: Date.now(), ids };
  return ids;
}

/** @returns {Promise<{ ok: boolean, sid?: string|null, error?: string }>} */
export async function sendCrmGatewayText({ phone, message }) {
  const ids = await crmGatewaySessionIds();
  if (!ids.length) return { ok: false, error: 'super_admin_gateway_session_missing' };
  return sendGatewayTextMessage({
    phone,
    message,
    sessionId: ids[0],
    sessionCandidates: ids,
    allowSharedFallback: false
  });
}

/** Ayar ekranı için: süper admin hattı bağlı mı */
export async function crmGatewayStatus() {
  const ids = await crmGatewaySessionIds();
  if (!ids.length) return { connected: false, status: 'missing_session' };
  const st = await getGatewaySessionStatus(ids[0]).catch(() => ({ ok: false, status: 'error' }));
  return { connected: Boolean(st.ok), status: st.status || 'unknown', error: st.ok ? null : st.error || null };
}
