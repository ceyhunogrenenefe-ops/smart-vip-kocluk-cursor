import { supabaseAdmin } from './supabase-admin.js';
import { insertWhatsAppAutomationLog } from './message-log.js';
import { resolveVeliPhoneFromContract } from './taksit-whatsapp-notify.js';
import { paraBirimiLabel, resolveRowParaBirimi } from './parent-sign-defaults.js';
import { sendAutomatedWhatsApp } from './whatsapp-outbound.js';
import { metaWhatsAppConfigured } from './meta-whatsapp.js';

export const VELI_SIGN_READY_WA_KIND = 'veli_sign_ready_notify';
export const VELI_SIGN_READY_TEMPLATE_TYPE = 'veli_sign_ready_notify';

function publicSignUrl(contract) {
  const base = String(
    process.env.PUBLIC_APP_URL ||
      process.env.VITE_APP_URL ||
      process.env.APP_PUBLIC_URL ||
      'https://www.dersonlinevipkocluk.com'
  )
    .trim()
    .replace(/\/+$/, '');
  const origin =
    base ||
    (process.env.VERCEL_URL
      ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}`
      : '');
  const token = String(contract?.signing_token || '').trim();
  if (!origin || !token) return '';
  return `${origin}/veli-imza/${encodeURIComponent(token)}`;
}

function kayitJson(row) {
  const j = row?.kayit_formu_json;
  return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
}

function formatUcretLabel(row, feeNum) {
  const pb = paraBirimiLabel(resolveRowParaBirimi(row));
  const n = Math.round(Number(feeNum) || Number(row?.ucret) || 0);
  if (!n) return '';
  return pb === 'TL' ? `${n} TL` : `${n} ${pb}`;
}

function formatTaksitLabel(row, taksitCount) {
  const n = Math.max(1, Math.round(Number(taksitCount) || Number(row?.taksit_sayisi) || 1));
  if (n <= 1) return 'Tek ödeme';
  const kj = kayitJson(row);
  const cards = Array.isArray(kj.taksit_kartlari) ? kj.taksit_kartlari : [];
  const count = cards.length || n;
  return `${count} taksit`;
}

export function buildVeliSignReadyTemplateVars({ contract, institution, signUrl }) {
  const veliLabel =
    `${String(contract?.veli_ad || '').trim()} ${String(contract?.veli_soyad || '').trim()}`.trim() || 'Veli';
  const ogrenciLabel =
    `${String(contract?.ogrenci_ad || '').trim()} ${String(contract?.ogrenci_soyad || '').trim()}`.trim() ||
    'Öğrenciniz';
  const ucret = formatUcretLabel(contract, contract?.ucret);
  const taksit = formatTaksitLabel(contract, contract?.taksit_sayisi);
  const ucretOzet =
    ucret && taksit ? `Toplam: ${ucret} · ${taksit}` : ucret ? `Toplam: ${ucret}` : taksit ? taksit : '—';
  const url = String(signUrl || publicSignUrl(contract) || '').trim() || '—';

  return {
    veli_ad_soyad: veliLabel,
    ogrenci_ad_soyad: ogrenciLabel,
    ucret_ozet: ucretOzet,
    imza_link: url,
    kurum_adi: String(institution?.name || 'Online VIP Dershane').trim() || 'Online VIP Dershane'
  };
}

export function buildVeliSignReadyWhatsAppText(payload) {
  const v =
    payload.veli_ad_soyad != null
      ? payload
      : buildVeliSignReadyTemplateVars({
          contract: payload.contract || payload,
          institution: payload.institution,
          signUrl: payload.signUrl
        });
  const lines = [
    `Merhaba ${v.veli_ad_soyad},`,
    '',
    `${v.ogrenci_ad_soyad} için kayıt işleminizin tamamlanabilmesi için sözleşmenizi onaylayıp imzalamanız gerekmektedir.`,
    '',
    v.ucret_ozet,
    '',
    'İmza linki:',
    v.imza_link,
    '',
    v.kurum_adi
  ];
  return lines.join('\n').trim();
}

async function alreadySentSignReadyNotify(contractId) {
  const id = String(contractId || '').trim();
  if (!id) return true;
  const { data, error } = await supabaseAdmin
    .from('message_logs')
    .select('id')
    .eq('kind', VELI_SIGN_READY_WA_KIND)
    .eq('related_id', id)
    .eq('status', 'sent')
    .maybeSingle();
  if (error) {
    console.warn('[veli-sign-ready-notify] alreadySent', error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Ücret + taksit planı kaydedildikten sonra veliye Meta şablon ile imza linki.
 */
export async function notifyVeliSignReady({ contract, institution }) {
  const contractId = String(contract?.id || '').trim();
  if (!contractId) return { ok: false, error: 'missing_contract' };

  if (await alreadySentSignReadyNotify(contractId)) {
    return { ok: true, skipped: 'already_sent' };
  }

  const phone = resolveVeliPhoneFromContract(contract);
  if (!phone) {
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId: contractId,
      kind: VELI_SIGN_READY_WA_KIND,
      message: 'veli_sign_ready: telefon yok',
      status: 'skipped',
      logCode: 'invalid_phone',
      error: 'invalid_phone'
    });
    return { ok: false, skipped: 'invalid_phone' };
  }

  if (!metaWhatsAppConfigured()) {
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId: contractId,
      kind: VELI_SIGN_READY_WA_KIND,
      message: 'veli_sign_ready: meta env yok',
      status: 'failed',
      logCode: 'META_ENV',
      error: 'meta_whatsapp_not_configured',
      phone
    });
    return { ok: false, skipped: 'meta_whatsapp_not_configured' };
  }

  const signUrl = publicSignUrl(contract);
  const templateVars = buildVeliSignReadyTemplateVars({ contract, institution, signUrl });
  const waText = buildVeliSignReadyWhatsAppText({ ...templateVars, signUrl });

  const sent = await sendAutomatedWhatsApp({
    phone,
    templateType: VELI_SIGN_READY_TEMPLATE_TYPE,
    vars: templateVars
  });

  await insertWhatsAppAutomationLog({
    studentId: null,
    relatedId: contractId,
    kind: VELI_SIGN_READY_WA_KIND,
    message: waText.slice(0, 8000),
    status: sent.ok ? 'sent' : 'failed',
    logCode: sent.ok ? null : sent.errorCode || 'META_SEND_FAILED',
    error: sent.ok ? null : String(sent.error || 'send_failed').slice(0, 400),
    phone,
    meta_message_id: sent.sid || sent.meta_message_id || null,
    meta_template_name: sent.meta_template_name || VELI_SIGN_READY_TEMPLATE_TYPE
  });

  if (!sent.ok) {
    console.warn('[veli-sign-ready-notify] send failed', contractId, sent.error || sent.errorCode);
  }

  return { ok: sent.ok, error: sent.error, phone, signUrl, channel: 'meta' };
}
