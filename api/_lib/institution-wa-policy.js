/**
 * Kurum bazlı WhatsApp gönderim politikası.
 *
 * `institutions.whatsapp_send_mode = 'gateway_only'` olan kurumların öğrenci / veli
 * numaralarına Meta (0850) üzerinden mesaj gönderilmez: mesaj kurumun
 * `whatsapp_gateway_user_id` gateway oturumundan gider, oturum bağlı değilse hiç gitmez.
 *
 * Numara başka bir kurumda da kayıtlıysa (ör. iki kurumda çocuğu olan veli) politika
 * uygulanmaz; o kurumun mesajı yanlış hattan gitmesin.
 */
import { supabaseAdmin } from './supabase-admin.js';

const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, phoneToInst: new Map() };
const sharedCache = new Map(); // last10 -> { at, shared }

export function phoneKey(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

/** Test için önbelleği sıfırlar. */
export function resetInstitutionWaPolicyCache() {
  cache = { at: 0, phoneToInst: new Map() };
  sharedCache.clear();
}

async function loadGatewayOnlyPhones() {
  if (Date.now() - cache.at < TTL_MS) return cache.phoneToInst;
  const phoneToInst = new Map();
  const { data: insts, error } = await supabaseAdmin
    .from('institutions')
    .select('id, name, whatsapp_send_mode, whatsapp_gateway_user_id')
    .eq('whatsapp_send_mode', 'gateway_only');
  if (error) {
    // Kolon henüz yoksa (migration öncesi) politika yok sayılır
    cache = { at: Date.now(), phoneToInst };
    return phoneToInst;
  }
  for (const inst of insts || []) {
    const [{ data: studs }, { data: users }] = await Promise.all([
      supabaseAdmin.from('students').select('phone, parent_phone').eq('institution_id', inst.id).limit(5000),
      supabaseAdmin.from('users').select('phone').eq('institution_id', inst.id).limit(5000)
    ]);
    const add = (p) => {
      const k = phoneKey(p);
      if (k) phoneToInst.set(k, inst);
    };
    for (const s of studs || []) {
      add(s.phone);
      add(s.parent_phone);
    }
    for (const u of users || []) add(u.phone);
  }
  cache = { at: Date.now(), phoneToInst };
  return phoneToInst;
}

async function phoneUsedByOtherInstitution(key, institutionId) {
  const hit = sharedCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.shared;
  const like = `%${key}`;
  const [{ data: s }, { data: u }] = await Promise.all([
    supabaseAdmin
      .from('students')
      .select('id')
      .neq('institution_id', institutionId)
      .or(`phone.ilike.${like},parent_phone.ilike.${like}`)
      .limit(1),
    supabaseAdmin.from('users').select('id').neq('institution_id', institutionId).ilike('phone', like).limit(1)
  ]);
  const shared = Boolean((s && s.length) || (u && u.length));
  sharedCache.set(key, { at: Date.now(), shared });
  return shared;
}

/**
 * @returns {Promise<null | { institutionId: string, institutionName: string, gatewayUserId: string|null }>}
 */
export async function gatewayOnlyPolicyForPhone(phone) {
  const key = phoneKey(phone);
  if (!key) return null;
  let inst;
  try {
    inst = (await loadGatewayOnlyPhones()).get(key);
    if (!inst) return null;
    if (await phoneUsedByOtherInstitution(key, inst.id)) return null;
  } catch (e) {
    console.warn('[institution-wa-policy]', e instanceof Error ? e.message : e);
    return null;
  }
  return {
    institutionId: inst.id,
    institutionName: inst.name || '',
    gatewayUserId: inst.whatsapp_gateway_user_id ? String(inst.whatsapp_gateway_user_id) : null
  };
}

/**
 * Kurumun gateway oturumundan düz metin gönderir. Oturum yoksa/kopuksa göndermez.
 * @returns {Promise<{ ok: boolean, channel: 'institution_gateway', sid?: string|null, error?: string|null, errorCode?: string|null }>}
 */
export async function sendViaInstitutionGateway({ policy, phone, text }) {
  const body = String(text || '').trim();
  if (!policy?.gatewayUserId) {
    return {
      ok: false,
      channel: 'institution_gateway',
      error: `${policy?.institutionName || 'Kurum'}: gateway oturumu tanımlı değil — Meta'dan gönderilmedi`,
      errorCode: 'INSTITUTION_GATEWAY_NOT_LINKED'
    };
  }
  if (!body) {
    return { ok: false, channel: 'institution_gateway', error: 'Mesaj metni boş', errorCode: 'MESSAGE' };
  }
  const { getGatewaySessionStatus, sendGatewayTextMessage } = await import('./whatsapp-gateway-send.js');
  const st = await getGatewaySessionStatus(policy.gatewayUserId, { skipHealth: true });
  if (!st.ok || st.status !== 'connected') {
    return {
      ok: false,
      channel: 'institution_gateway',
      error: `${policy.institutionName || 'Kurum'} WhatsApp gateway bağlı değil — Meta'dan gönderilmedi`,
      errorCode: 'INSTITUTION_GATEWAY_DISCONNECTED'
    };
  }
  const sent = await sendGatewayTextMessage({
    phone,
    message: body,
    sessionId: policy.gatewayUserId,
    sessionCandidates: [policy.gatewayUserId],
    allowSharedFallback: false
  });
  return {
    ok: Boolean(sent.ok),
    channel: 'institution_gateway',
    sid: sent.gateway_message_id || sent.sid || null,
    error: sent.ok ? null : sent.error || 'gateway_send_failed',
    errorCode: sent.ok ? null : sent.errorCode || 'GATEWAY_SEND_FAILED'
  };
}

/** Meta gönderimi engellendiğinde fırlatılan hata. */
export function gatewayOnlyBlockedError(policy, detail = '') {
  const err = new Error(
    `${policy?.institutionName || 'Kurum'} yalnız gateway ile mesaj alır — Meta gönderimi engellendi${detail ? ` (${detail})` : ''}`
  );
  err.code = 'GATEWAY_ONLY_INSTITUTION';
  return err;
}
