import { supabaseAdmin } from './supabase-admin.js';
import { sendGatewayTextMessage } from './whatsapp-gateway-send.js';
import { insertWhatsAppAutomationLog } from './message-log.js';
import { resolveVeliPhoneFromContract } from './taksit-whatsapp-notify.js';
import { paraBirimiLabel, resolveRowParaBirimi } from './parent-sign-defaults.js';

export const VELI_SIGN_READY_WA_KIND = 'veli_sign_ready_notify';

function publicSignUrl(contract) {
  const base = String(
    process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || process.env.APP_PUBLIC_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');
  const origin = base || (process.env.VERCEL_URL ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}` : '');
  const token = String(contract?.signing_token || '').trim();
  if (!origin || !token) return '';
  return `${origin}/veli-imza/${encodeURIComponent(token)}`;
}

function kayitJson(row) {
  const j = row?.kayit_formu_json;
  return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
}

function veliGatewaySessionId() {
  return (
    String(process.env.VELI_KAYIT_GATEWAY_SESSION_ID || '').trim() ||
    String(process.env.REPORT_REMINDER_GATEWAY_SESSION_ID || '').trim() ||
    String(process.env.BOOK_ORDER_GATEWAY_SESSION_ID || '').trim()
  );
}

export function buildVeliSignReadyWhatsAppText(payload) {
  const veli = String(payload.veliLabel || 'Veli').trim();
  const ogrenci = String(payload.ogrenciLabel || 'öğrenciniz').trim();
  const kurum = String(payload.kurumAdi || 'Kurumumuz').trim();
  const url = String(payload.signUrl || '').trim();
  const ucret = payload.ucretLabel ? `Toplam ücret: ${payload.ucretLabel}` : '';
  const taksit = payload.taksitLabel ? `Taksit planı: ${payload.taksitLabel}` : '';

  const lines = [
    `Merhaba ${veli},`,
    '',
    `${ogrenci} için kayıt formunuz işleme alındı.`,
    'E-sözleşme imzaya açılmıştır; lütfen sözleşmeyi okuyup imzalayın.',
    '',
    ...(ucret ? [ucret] : []),
    ...(taksit ? [taksit] : []),
    ...(ucret || taksit ? [''] : []),
    ...(url ? ['İmza linki:', url, ''] : []),
    kurum
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

/**
 * Ücret + taksit planı kaydedildikten sonra veliye imza linki (gateway WhatsApp).
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

  const signUrl = publicSignUrl(contract);
  const veliLabel =
    `${String(contract?.veli_ad || '').trim()} ${String(contract?.veli_soyad || '').trim()}`.trim() || 'Veli';
  const ogrenciLabel =
    `${String(contract?.ogrenci_ad || '').trim()} ${String(contract?.ogrenci_soyad || '').trim()}`.trim() ||
    'Öğrenciniz';
  const payload = {
    veliLabel,
    ogrenciLabel,
    kurumAdi: String(institution?.name || '').trim(),
    signUrl,
    ucretLabel: formatUcretLabel(contract, contract?.ucret),
    taksitLabel: formatTaksitLabel(contract, contract?.taksit_sayisi)
  };
  const waText = buildVeliSignReadyWhatsAppText(payload);

  const sid = veliGatewaySessionId();
  const sent = await sendGatewayTextMessage({
    phone,
    message: waText,
    sessionId: sid,
    sessionCandidates: sid ? [sid] : [],
    allowSharedFallback: true
  });

  await insertWhatsAppAutomationLog({
    studentId: null,
    relatedId: contractId,
    kind: VELI_SIGN_READY_WA_KIND,
    message: waText.slice(0, 8000),
    status: sent.ok ? 'sent' : 'failed',
    logCode: sent.ok ? null : sent.errorCode || 'GATEWAY_SEND_FAILED',
    error: sent.ok ? null : String(sent.error || 'send_failed').slice(0, 400),
    phone
  });

  if (!sent.ok) {
    console.warn('[veli-sign-ready-notify] send failed', contractId, sent.error || sent.errorCode);
  }

  return { ok: sent.ok, error: sent.error, phone, signUrl };
}
