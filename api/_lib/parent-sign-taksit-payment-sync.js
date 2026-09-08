/**
 * Parent-sign taksit ↔ student_payment_records senkronu.
 * Not alanı: parent_sign_taksit:{contractId}:{index}
 * Hesap: payment_account_id (banka / kredi kartı ayrımı)
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_PREFIX = 'parent_sign_taksit:';
/** Tahsilat → öğrenci ödemesi senkronu bu tarihten itibaren geçerlidir */
export const TAKSIT_PAYMENT_SYNC_FROM = '2026-08-01';

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

export function preferredAccountTypeFromOdemeSekli(sekli) {
  const s = String(sekli || '').trim();
  if (s === 'kredi_karti_tek' || s === 'kredi_karti_otomatik' || s.startsWith('kredi_karti')) {
    return 'credit_card';
  }
  return 'bank';
}

function money(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

function resolveOdemeSekli(contract, card) {
  const fromCard = String(card?.odeme_sekli || '').trim();
  if (fromCard) return fromCard;
  const kj = contract?.kayit_formu_json;
  if (kj && typeof kj === 'object') {
    const fromJson = String(kj.odeme_sekli || '').trim();
    if (fromJson) return fromJson;
  }
  return String(contract?.odeme_sekli || '').trim() || 'aylik_taksit';
}

async function pickDefaultAccountId(institutionId, accountType) {
  const types = accountType === 'credit_card' ? ['credit_card', 'bank'] : ['bank', 'credit_card'];
  for (const t of types) {
    try {
      let aq = supabaseAdmin
        .from('payment_accounts')
        .select('id, account_type')
        .eq('active', true)
        .eq('account_type', t)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true })
        .limit(1);
      if (institutionId) aq = aq.or(`institution_id.eq.${institutionId},institution_id.is.null`);
      const { data: accs } = await aq;
      if (accs?.[0]?.id) return accs[0].id;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function validateAccountId(institutionId, paymentAccountId) {
  const id = String(paymentAccountId || '').trim();
  if (!id) return null;
  try {
    let q = supabaseAdmin
      .from('payment_accounts')
      .select('id, account_type, active')
      .eq('id', id)
      .maybeSingle();
    const { data } = await q;
    if (!data?.id || data.active === false) return null;
    return data.id;
  } catch {
    return null;
  }
}

async function accountTypeOf(accountId) {
  if (!accountId) return null;
  try {
    const { data } = await supabaseAdmin
      .from('payment_accounts')
      .select('account_type')
      .eq('id', accountId)
      .maybeSingle();
    return data?.account_type || null;
  } catch {
    return null;
  }
}

/**
 * Taksit ödendi/ödenmedi değişince öğrenci ödemeleri kaydını güncelle.
 * paidAt: YYYY-MM-DD — ödendiğinde zorunlu anlamlı.
 * paymentAccountId: banka / kredi kartı hesabı (yoksa ödeme şekline göre seçilir)
 */
export async function syncParentSignTaksitToStudentPayment({
  contract,
  index,
  card,
  paid,
  paidAt,
  actorSub,
  paymentAccountId,
  remapAccount = false
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
  const odemeSekli = resolveOdemeSekli(contract, card);
  const preferredType = preferredAccountTypeFromOdemeSekli(odemeSekli);

  let findQ = supabaseAdmin
    .from('student_payment_records')
    .select('id, notes, payment_account_id')
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
  let existingAccountId = foundRows?.[0]?.payment_account_id || null;

  if (!existingId) {
    const { data: loose } = await supabaseAdmin
      .from('student_payment_records')
      .select('id, notes, payment_account_id')
      .ilike('notes', `%${noteKey}%`)
      .limit(5);
    existingId = loose?.[0]?.id || null;
    existingAccountId = loose?.[0]?.payment_account_id || null;
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

  // Ağustos 2026 öncesi ödemeler senkronlanmaz (manuel girilmiş kayıtlar korunur)
  if (paidYmd < TAKSIT_PAYMENT_SYNC_FROM) {
    if (existingId) {
      const { data: ex } = await supabaseAdmin
        .from('student_payment_records')
        .select('id, notes, created_at')
        .eq('id', existingId)
        .maybeSingle();
      if (ex && String(ex.notes || '').startsWith(NOTE_PREFIX)) {
        await supabaseAdmin.from('student_payment_records').delete().eq('id', existingId);
        return { ok: true, skipped: true, deleted_pre_cutoff: true, reason: 'before_august_2026' };
      }
    }
    return { ok: true, skipped: true, reason: 'before_august_2026' };
  }

  const fromCardAccount =
    String(paymentAccountId || card?.odeme_hesap_id || card?.payment_account_id || '').trim() || null;
  let resolvedAccountId = await validateAccountId(institutionId, fromCardAccount);

  if (!resolvedAccountId && existingAccountId && !remapAccount) {
    const existingType = await accountTypeOf(existingAccountId);
    if (existingType === preferredType) {
      resolvedAccountId = existingAccountId;
    }
  }

  if (!resolvedAccountId) {
    resolvedAccountId = await pickDefaultAccountId(institutionId, preferredType);
  }

  const row = {
    institution_id: institutionId,
    student_id: studentId,
    external_student_name: studentId ? null : ogrenci || 'Öğrenci',
    class_level: String(contract.sinif || '').trim() || null,
    payment_type: 'donem_kayit',
    payment_account_id: resolvedAccountId,
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
    return {
      ok: true,
      id: data?.id || existingId,
      updated: true,
      payment_account_id: resolvedAccountId,
      account_type: preferredType
    };
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
  return {
    ok: true,
    id: data?.id || null,
    created: true,
    payment_account_id: resolvedAccountId,
    account_type: preferredType
  };
}

/**
 * parent_sign_taksit otomatik kayıtlarından Ağustos öncekileri siler.
 * Manuel (notes farklı) kayıtlar dokunulmaz.
 */
export async function cleanupPreAugustAutoTaksitPayments({ institutionId } = {}) {
  let q = supabaseAdmin
    .from('student_payment_records')
    .select('id, paid_at, due_date, notes, title')
    .like('notes', `${NOTE_PREFIX}%`)
    .limit(2000);
  if (institutionId) q = q.eq('institution_id', institutionId);
  const { data, error } = await q;
  if (error) throw error;

  const toDelete = (data || []).filter((r) => {
    const paid = String(r.paid_at || '').slice(0, 10);
    const due = String(r.due_date || '').slice(0, 10);
    const anchor = YMD.test(paid) ? paid : due;
    return !anchor || anchor < TAKSIT_PAYMENT_SYNC_FROM;
  });

  let deleted = 0;
  for (const row of toDelete) {
    const { error: de } = await supabaseAdmin.from('student_payment_records').delete().eq('id', row.id);
    if (!de) deleted += 1;
  }
  return {
    ok: true,
    scanned: (data || []).length,
    deleted,
    cutoff: TAKSIT_PAYMENT_SYNC_FROM,
    deleted_ids: toDelete.map((r) => r.id)
  };
}

/**
 * Kurumdaki ödenmiş taksit kartlarını öğrenci ödemelerine aktarır (yalnızca Ağustos+).
 * remapAccount=true: ödeme şekline göre banka/kart hesabını yeniden atar.
 */
export async function backfillPaidTaksitToStudentPayments({
  institutionId,
  actorSub,
  limit = 300,
  remapAccount = true
} = {}) {
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
  const byType = { bank: 0, credit_card: 0 };
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
      const paidAt = String(card.odendi_tarihi || '').slice(0, 10);
      if (!YMD.test(paidAt) || paidAt < TAKSIT_PAYMENT_SYNC_FROM) {
        skipped += 1;
        continue;
      }
      try {
        const res = await syncParentSignTaksitToStudentPayment({
          contract,
          index: i,
          card,
          paid: true,
          paidAt,
          actorSub,
          paymentAccountId: card.odeme_hesap_id || card.payment_account_id || null,
          remapAccount
        });
        if (res?.skipped) skipped += 1;
        else if (res?.created) {
          created += 1;
          if (res.account_type === 'credit_card') byType.credit_card += 1;
          else byType.bank += 1;
        } else if (res?.updated || res?.ok) {
          updated += 1;
          if (res.account_type === 'credit_card') byType.credit_card += 1;
          else byType.bank += 1;
        } else failed += 1;
      } catch (e) {
        failed += 1;
        if (errors.length < 8) errors.push(errorMessage(e));
      }
    }
  }

  return {
    ok: true,
    created,
    updated,
    skipped,
    failed,
    by_type: byType,
    errors,
    cutoff: TAKSIT_PAYMENT_SYNC_FROM
  };
}
