import { supabaseAdmin } from './supabase-admin.js';
import { getIstanbulDateString } from './istanbul-time.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendAutomatedWhatsApp, OUTBOUND_LOG_CODE } from './whatsapp-outbound.js';
import { insertWhatsAppAutomationLog } from './message-log.js';
import { metaWhatsAppConfigured } from './meta-whatsapp.js';
import { resolveRowParaBirimi, paraBirimiLabel } from './parent-sign-defaults.js';

export const TAKSIT_PAID_TEMPLATE = 'taksit_payment_received';
export const TAKSIT_OVERDUE_TEMPLATE = 'taksit_payment_overdue';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function kayitJson(row) {
  const j = row?.kayit_formu_json;
  return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
}

function shiftYmdByMonths(ymd, deltaMonths) {
  const m = String(ymd || '')
    .trim()
    .slice(0, 10);
  if (!YMD.test(m)) return null;
  const [y, mo, d] = m.split('-').map((x) => parseInt(x, 10));
  const t = new Date(y, mo - 1 + deltaMonths, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const day = Math.min(d, last);
  const r = new Date(t.getFullYear(), t.getMonth(), day);
  const yy = r.getFullYear();
  const mm = String(r.getMonth() + 1).padStart(2, '0');
  const dd = String(r.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function effectiveVadeYmd(card, baslangic, indexZero) {
  const v = String(card?.vade_tarihi || '')
    .trim()
    .slice(0, 10);
  if (YMD.test(v)) return v;
  const b = String(baslangic || '')
    .trim()
    .slice(0, 10);
  if (YMD.test(b)) {
    const shifted = shiftYmdByMonths(b, indexZero);
    if (shifted) return shifted;
  }
  return getIstanbulDateString();
}

function formatTrDate(ymd) {
  if (!YMD.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

function formatTutar(amount, paraBirimi) {
  const n = Math.round(Number(amount) || 0);
  const pb = paraBirimiLabel(paraBirimi);
  if (pb === 'TL') return `${n} TL`;
  const sym = pb === 'EUR' ? '€' : pb === 'USD' ? '$' : pb === 'GBP' ? '£' : '';
  return sym ? `${n} ${pb} ${sym}` : `${n} ${pb}`;
}

export function resolveVeliPhoneFromContract(row) {
  const kj = kayitJson(row);
  const candidates = [
    kj.veli_tel,
    row?.telefon,
    kj.ogrenci_tel
  ];
  for (const raw of candidates) {
    const e164 = normalizePhoneToE164(raw);
    if (e164) return e164;
  }
  return null;
}

export function buildTaksitWhatsAppVars(row, card, indexZero) {
  const veliLine = `${String(row?.veli_ad || '').trim()} ${String(row?.veli_soyad || '').trim()}`.trim() || 'Veli';
  const ogrenciLine =
    `${String(row?.ogrenci_ad || '').trim()} ${String(row?.ogrenci_soyad || '').trim()}`.trim() || 'Öğrenci';
  const pb = resolveRowParaBirimi(row);
  const bas = String(row?.baslangic_tarihi || '').slice(0, 10);
  const vade = effectiveVadeYmd(card, bas, indexZero);
  const tutar = Number(card?.tutar_tl);
  const taksitNo = card?.no != null ? String(card.no) : String(indexZero + 1);
  return {
    veli_ad_soyad: veliLine.slice(0, 120),
    ogrenci_ad_soyad: ogrenciLine.slice(0, 120),
    taksit_no: taksitNo,
    tutar: formatTutar(Number.isFinite(tutar) ? tutar : 0, pb),
    vade_tarihi: formatTrDate(vade),
    program_adi: String(row?.program_adi || '').trim().slice(0, 120) || '—',
    contract_number: String(row?.contract_number || '').trim().slice(0, 40),
    kurum_adi: ''
  };
}

function logKindWithIndex(baseKind, index) {
  return `${baseKind}_${index}`;
}

export async function alreadySentTaksitWhatsApp(contractId, index, baseKind) {
  const id = String(contractId || '').trim();
  if (!id) return true;
  const { data, error } = await supabaseAdmin
    .from('message_logs')
    .select('id')
    .eq('kind', logKindWithIndex(baseKind, index))
    .eq('related_id', id)
    .eq('status', 'sent')
    .maybeSingle();
  if (error) {
    console.warn('[taksit-whatsapp] alreadySent', error.message);
    return false;
  }
  return Boolean(data);
}

async function loadInstitutionName(institutionId) {
  const id = String(institutionId || '').trim();
  if (!id) return '';
  const { data } = await supabaseAdmin.from('institutions').select('name').eq('id', id).maybeSingle();
  return String(data?.name || '').trim();
}

/**
 * @param {Record<string, unknown>} row parent_sign_contracts satırı
 * @param {number} index taksit indeksi (0-based)
 * @param {{ templateType: string, baseKind: string }} opts
 */
export async function sendTaksitWhatsAppNotice(row, index, opts) {
  const templateType = opts.templateType;
  const baseKind = opts.baseKind;
  const logDate = getIstanbulDateString();

  if (!metaWhatsAppConfigured()) {
    return { ok: false, skipped: 'meta_whatsapp_not_ready' };
  }

  const contractId = String(row?.id || '').trim();
  if (!contractId) return { ok: false, error: 'contract_id_missing' };

  if (await alreadySentTaksitWhatsApp(contractId, index, baseKind)) {
    return { ok: true, skipped: 'already_sent' };
  }

  const phone = resolveVeliPhoneFromContract(row);
  if (!phone) {
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId: contractId,
      kind: logKindWithIndex(baseKind, index),
      message: `${templateType}: telefon yok`,
      status: 'skipped',
      logCode: OUTBOUND_LOG_CODE.INVALID_PHONE,
      error: 'invalid_phone',
      logDate
    });
    return { ok: false, skipped: 'invalid_phone' };
  }

  const kj = kayitJson(row);
  const cards = Array.isArray(kj.taksit_kartlari) ? kj.taksit_kartlari : [];
  const card = cards[index];
  if (!card || typeof card !== 'object') {
    return { ok: false, error: 'taksit_card_missing' };
  }

  const vars = buildTaksitWhatsAppVars(row, card, index);
  vars.kurum_adi = (await loadInstitutionName(row.institution_id)).slice(0, 120) || 'Kurum';

  const sent = await sendAutomatedWhatsApp({ phone, templateType, vars });
  const preview = sent.bodyPreview || `[${templateType}] ${vars.veli_ad_soyad}`;

  await insertWhatsAppAutomationLog({
    studentId: null,
    relatedId: contractId,
    kind: logKindWithIndex(baseKind, index),
    message: preview,
    status: sent.ok ? 'sent' : 'failed',
    logCode: sent.ok ? null : sent.errorCode || OUTBOUND_LOG_CODE.META_SEND_FAILED,
    error: sent.ok ? null : String(sent.error || 'send_failed').slice(0, 400),
    phone,
    logDate,
    meta_message_id: sent.meta_message_id || null,
    meta_template_name: sent.meta_template_name || null
  });

  return { ok: sent.ok, error: sent.error, phone, vars };
}

export async function notifyTaksitMarkedPaid(row, index, wasPaidBefore) {
  if (wasPaidBefore) return { ok: true, skipped: 'was_already_paid' };
  const kj = kayitJson(row);
  const cards = Array.isArray(kj.taksit_kartlari) ? kj.taksit_kartlari : [];
  const card = cards[index];
  if (!card?.odendi) return { ok: true, skipped: 'not_paid' };
  return sendTaksitWhatsAppNotice(row, index, {
    templateType: TAKSIT_PAID_TEMPLATE,
    baseKind: 'taksit_paid_notice'
  });
}

/**
 * Vadesi geçmiş ödenmemiş taksitler için günlük cron.
 */
export async function runTaksitOverdueRemindersJob(opts = {}) {
  const triggeredBy = String(opts.triggeredBy || 'cron').trim() || 'cron';
  const log = [];
  const today = getIstanbulDateString();

  if (!metaWhatsAppConfigured()) {
    return { ok: true, skipped: 'meta_whatsapp_not_ready', log, triggeredBy };
  }

  const { data: contracts, error } = await supabaseAdmin
    .from('parent_sign_contracts')
    .select(
      'id,institution_id,ogrenci_ad,ogrenci_soyad,veli_ad,veli_soyad,telefon,program_adi,baslangic_tarihi,contract_number,para_birimi,merged_html,kayit_formu_json'
    )
    .not('kayit_formu_json', 'is', null)
    .limit(500);
  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of contracts || []) {
    const kj = kayitJson(row);
    const cards = Array.isArray(kj.taksit_kartlari) ? kj.taksit_kartlari : [];
    if (!cards.length) continue;

    const bas = String(row.baslangic_tarihi || '').slice(0, 10);
    for (let idx = 0; idx < cards.length; idx++) {
      const card = cards[idx];
      if (!card || typeof card !== 'object') continue;
      if (Boolean(card.odendi)) continue;
      const vade = effectiveVadeYmd(card, bas, idx);
      if (!YMD.test(vade) || vade >= today) continue;

      const out = await sendTaksitWhatsAppNotice(row, idx, {
        templateType: TAKSIT_OVERDUE_TEMPLATE,
        baseKind: 'taksit_overdue_reminder'
      });
      log.push({
        contract_id: row.id,
        taksit_index: idx,
        vade,
        ...out
      });
      if (out.skipped) skipped++;
      else if (out.ok) sent++;
      else failed++;
    }
  }

  return { ok: true, today, sent, skipped, failed, log, triggeredBy };
}
