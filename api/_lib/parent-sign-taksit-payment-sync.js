/**
 * Parent-sign taksit ↔ student_payment_records senkronu.
 * Not alanı: parent_sign_taksit:{contractId}:{index}
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_PREFIX = 'parent_sign_taksit:';

export function istanbulYmd() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    const n = new Date();
    const off = 3 * 60;
    const t = new Date(n.getTime() + (off - n.getTimezoneOffset()) * 60000);
    return t.toISOString().slice(0, 10);
  }
}

export function parentSignTaksitNoteKey(contractId, index) {
  return `${NOTE_PREFIX}${String(contractId)}:${Number(index)}`;
}

function money(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

/**
 * Taksit ödendi/ödenmedi değişince öğrenci ödemeleri kaydını güncelle.
 * paidAt: YYYY-MM-DD (ödeme tarihi) — ödendiğinde zorunlu anlamlı.
 */
export async function syncParentSignTaksitToStudentPayment({
  contract,
  index,
  card,
  paid,
  paidAt,
  actorSub
}) {
  const contractId = String(contract?.id || '').trim();
  if (!contractId) return { ok: false, reason: 'no_contract' };
  const noteKey = parentSignTaksitNoteKey(contractId, index);
  const amount = money(card?.tutar_tl ?? card?.tutar ?? 0);
  const due =
    String(card?.vade_tarihi || '')
      .trim()
      .slice(0, 10) || null;
  const paidYmd = YMD.test(String(paidAt || '').slice(0, 10))
    ? String(paidAt).slice(0, 10)
    : istanbulYmd();

  const ogrenci = `${String(contract.ogrenci_ad || '').trim()} ${String(contract.ogrenci_soyad || '').trim()}`.trim();
  const program = String(contract.program_adi || '').trim();
  const title = [
    program || 'Kayıt',
    `Taksit ${Number(card?.no) || index + 1}`,
    contract.contract_number ? `#${contract.contract_number}` : null
  ]
    .filter(Boolean)
    .join(' — ');

  let currency = String(contract.para_birimi || 'TRY').trim().toUpperCase() || 'TRY';
  if (!['TRY', 'EUR', 'USD', 'GBP'].includes(currency)) currency = 'TRY';

  const studentId = String(contract.student_id || '').trim() || null;
  const institutionId = contract.institution_id || null;

  let findQ = supabaseAdmin
    .from('student_payment_records')
    .select('id, notes')
    .eq('notes', noteKey)
    .limit(1);
  let { data: foundRows, error: fe } = await findQ;
  if (fe) {
    if (/student_payment_records|does not exist|schema cache|PGRST205/i.test(errorMessage(fe))) {
      return { ok: false, reason: 'student_payment_tracker_sql_missing' };
    }
    throw fe;
  }
  let existingId = foundRows?.[0]?.id || null;

  if (!existingId) {
    // Eski kayıtlar: notes içinde anahtar geçenler
    const { data: loose } = await supabaseAdmin
      .from('student_payment_records')
      .select('id, notes')
      .ilike('notes', `%${noteKey}%`)
      .limit(5);
    existingId = loose?.[0]?.id || null;
  }

  if (!paid) {
    if (!existingId) return { ok: true, cleared: false };
    const { error } = await supabaseAdmin
      .from('student_payment_records')
      .update({
        amount_paid: 0,
        status: 'unpaid',
        paid_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingId);
    if (error) throw error;
    return { ok: true, cleared: true, id: existingId };
  }

  const row = {
    institution_id: institutionId,
    student_id: studentId,
    external_student_name: studentId ? null : ogrenci || 'Öğrenci',
    class_level: String(contract.sinif || '').trim() || null,
    payment_type: 'donem_kayit',
    title,
    amount_total: amount,
    amount_paid: amount,
    currency,
    status: 'paid',
    due_date: due && YMD.test(due) ? due : paidYmd,
    paid_at: paidYmd,
    contact_phone: String(contract.telefon || '').trim() || null,
    contact_name: ogrenci || null,
    notes: noteKey,
    updated_at: new Date().toISOString()
  };

  if (existingId) {
    const { data, error } = await supabaseAdmin
      .from('student_payment_records')
      .update(row)
      .eq('id', existingId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return { ok: true, id: data?.id || existingId, updated: true };
  }

  const { data, error } = await supabaseAdmin
    .from('student_payment_records')
    .insert({
      ...row,
      created_by: actorSub || null
    })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return { ok: true, id: data?.id || null, created: true };
}
