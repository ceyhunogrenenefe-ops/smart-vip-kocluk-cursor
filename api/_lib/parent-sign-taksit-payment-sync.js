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

  let defaultAccountId = null;
  try {
    let aq = supabaseAdmin
      .from('payment_accounts')
      .select('id')
      .eq('active', true)
      .eq('account_type', 'bank')
      .order('sort_order', { ascending: true })
      .limit(1);
    if (institutionId) aq = aq.or(`institution_id.eq.${institutionId},institution_id.is.null`);
    const { data: accs } = await aq;
    defaultAccountId = accs?.[0]?.id || null;
  } catch {
    defaultAccountId = null;
  }

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
    payment_account_id: defaultAccountId,
    title,
    amount_total: amount > 0 ? amount : money(card?.amount),
    amount_paid: amount > 0 ? amount : money(card?.amount),
    currency,
    status: 'paid',
    due_date: due && YMD.test(due) ? due : paidYmd,
    paid_at: paidYmd,
    contact_phone: String(contract.telefon || '').trim() || null,
    contact_name: ogrenci || null,
    notes: noteKey,
    updated_at: new Date().toISOString()
  };

  // Tutar 0 ise yine de oluştur (yönetici sonra düzeltsin) — ama tutarı sözleşmeden dene
  if (!row.amount_total || row.amount_total <= 0) {
    const fromContract = money(contract.ucret);
    const taksitN = Math.max(1, Number(contract.taksit_sayisi) || 1);
    if (fromContract > 0) {
      const share = Math.round((fromContract / taksitN) * 100) / 100;
      row.amount_total = share;
      row.amount_paid = share;
    }
  }

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

/**
 * Kurumdaki ödenmiş tüm taksit kartlarını öğrenci ödemelerine aktarır (geri doldurma).
 */
export async function backfillPaidTaksitToStudentPayments({ institutionId, actorSub, limit = 300 }) {
  let q = supabaseAdmin
    .from('parent_sign_contracts')
    .select(
      'id, institution_id, student_id, ogrenci_ad, ogrenci_soyad, program_adi, contract_number, para_birimi, sinif, telefon, ucret, taksit_sayisi, kayit_formu_json, baslangic_tarihi'
    )
    .order('created_at', { ascending: false })
    .limit(Math.min(500, Math.max(50, Number(limit) || 300)));
  if (institutionId) q = q.eq('institution_id', institutionId);
  const { data, error } = await q;
  if (error) throw error;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const contract of data || []) {
    const tk = Array.isArray(contract?.kayit_formu_json?.taksit_kartlari)
      ? contract.kayit_formu_json.taksit_kartlari
      : [];
    for (let i = 0; i < tk.length; i++) {
      const card = tk[i] && typeof tk[i] === 'object' ? tk[i] : null;
      if (!card || !card.odendi) {
        skipped += 1;
        continue;
      }
      try {
        const res = await syncParentSignTaksitToStudentPayment({
          contract,
          index: i,
          card,
          paid: true,
          paidAt: card.odendi_tarihi || istanbulYmd(),
          actorSub
        });
        if (res?.created) created += 1;
        else if (res?.updated) updated += 1;
        else if (res?.ok) updated += 1;
        else failed += 1;
      } catch (e) {
        failed += 1;
        if (errors.length < 8) {
          errors.push(errorMessage(e));
        }
      }
    }
  }

  return { ok: true, created, updated, skipped, failed, errors };
}
