/**
 * Kurum içi kişiler (mevcut öğrenci / veli): gelen kutusunda ayrı sekme, raporlara girmez.
 * internal_reason: student_phone | manual | manual_unmarked (elle kaldırıldı → otomatik tekrar işaretlenmez)
 */
import { supabaseAdmin } from './supabase-admin.js';

const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, keys: new Set() };

/** Telefonun son 10 hanesi (90 / 0 önekinden bağımsız karşılaştırma) */
export function phoneKey(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

export async function loadInternalPhoneKeys({ force = false } = {}) {
  if (!force && Date.now() - cache.at < CACHE_MS) return cache.keys;
  const keys = new Set();
  try {
    const { data } = await supabaseAdmin
      .from('students')
      .select('phone, parent_phone')
      .is('deleted_at', null)
      .limit(20000);
    for (const s of data || []) {
      for (const p of [s.phone, s.parent_phone]) {
        const k = phoneKey(p);
        if (k) keys.add(k);
      }
    }
    cache = { at: Date.now(), keys };
  } catch (e) {
    console.warn('[crm-internal] phones:', e instanceof Error ? e.message : e);
    return cache.keys;
  }
  return keys;
}

export async function isInternalPhone(raw) {
  const k = phoneKey(raw);
  if (!k) return false;
  return (await loadInternalPhoneKeys()).has(k);
}

export function internalMarkFields(internal, { reason, actorId = null } = {}) {
  return {
    is_internal: Boolean(internal),
    internal_reason: reason || (internal ? 'manual' : 'manual_unmarked'),
    internal_marked_by: actorId,
    internal_marked_at: new Date().toISOString()
  };
}

/** Takipteki adayı öğrenci/veli telefonuysa işaretle (elle kaldırılmışsa dokunma) */
export async function autoMarkLeadInternal(leadId, phone) {
  if (!leadId || !(await isInternalPhone(phone))) return false;
  try {
    const { data } = await supabaseAdmin
      .from('registration_leads')
      .update(internalMarkFields(true, { reason: 'student_phone' }))
      .eq('id', leadId)
      .eq('primary_status', 'tracking')
      .eq('is_internal', false)
      .or('internal_reason.is.null,internal_reason.neq.manual_unmarked')
      .select('id');
    return Boolean(data?.length);
  } catch (e) {
    console.warn('[crm-internal] lead mark:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Konuşmayı telefon veya bağlı aday kurum içiyse işaretle */
export async function autoMarkConversationInternal(conversation) {
  if (!conversation?.id || conversation.is_internal || conversation.internal_reason === 'manual_unmarked') {
    return false;
  }
  let internal = conversation.channel === 'whatsapp' && (await isInternalPhone(conversation.contact_identifier));
  if (!internal && conversation.lead_id) {
    const { data: lead } = await supabaseAdmin
      .from('registration_leads')
      .select('is_internal')
      .eq('id', conversation.lead_id)
      .maybeSingle();
    internal = Boolean(lead?.is_internal);
  }
  if (!internal) return false;
  try {
    await supabaseAdmin
      .from('crm_conversations')
      .update(internalMarkFields(true, { reason: 'student_phone' }))
      .eq('id', conversation.id)
      .eq('is_internal', false);
    return true;
  } catch (e) {
    console.warn('[crm-internal] conversation mark:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Gelen kutusundan elle işaretle / kaldır; bağlı takipteki aday da aynı işareti alır */
export async function setConversationInternal(conversation, internal, actorId) {
  const fields = internalMarkFields(internal, { reason: internal ? 'manual' : 'manual_unmarked', actorId });
  const { data, error } = await supabaseAdmin
    .from('crm_conversations')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', conversation.id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (conversation.lead_id) {
    await supabaseAdmin
      .from('registration_leads')
      .update(fields)
      .eq('id', conversation.lead_id)
      .neq('primary_status', 'confirmed');
  }
  return data;
}
