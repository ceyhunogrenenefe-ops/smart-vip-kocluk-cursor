/**
 * "İletişime geçildi" = temsilci adaya mesaj gönderdi, not/arama ekledi veya aday bilgisini güncelledi.
 * Gelen (veliden gelen) mesaj iletişim sayılmaz; o bilgi last_inbound_at'te tutulur.
 */
import { supabaseAdmin } from './supabase-admin.js';

/** Bu alanların tek başına değişmesi iletişim sayılmaz (atama / planlama) */
const NON_CONTACT_FIELDS = new Set([
  'assigned_user_id',
  'next_action_at',
  'next_action_type',
  'updated_at',
  'updated_by',
  'academic_period_id',
  'academic_period_key',
  'first_contact_at',
  'last_contact_at'
]);

export function isContactUpdate(patch) {
  return Object.keys(patch || {}).some((k) => !NON_CONTACT_FIELDS.has(k));
}

export async function markLeadContacted(leadId, at = new Date().toISOString()) {
  const id = String(leadId || '').trim();
  if (!id) return;
  try {
    await supabaseAdmin.from('registration_leads').update({ last_contact_at: at }).eq('id', id);
    await supabaseAdmin
      .from('registration_leads')
      .update({ first_contact_at: at })
      .eq('id', id)
      .is('first_contact_at', null);
  } catch (e) {
    console.warn('[lead-contact]', e instanceof Error ? e.message : e);
  }
}
