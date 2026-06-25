import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendGatewayTextMessage } from './whatsapp-gateway-send.js';
import { insertWhatsAppAutomationLog } from './message-log.js';
import { isEmailConfigured, logEmailError, publicAppOrigin, sendTransactionalEmail } from './send-email.js';

export const VELI_KAYIT_ADMIN_WA_KIND = 'veli_kayit_admin_notify';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

function parseEnvList(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function userAdminRoles(row) {
  const roles = new Set();
  const primary = String(row?.role || '')
    .trim()
    .toLowerCase();
  if (primary) roles.add(primary);
  if (Array.isArray(row?.roles)) {
    for (const r of row.roles) {
      const v = String(r || '')
        .trim()
        .toLowerCase();
      if (v) roles.add(v);
    }
  }
  return roles;
}

function rowIsActiveAdmin(row, institutionId) {
  if (!row || row.is_active === false) return false;
  const roles = userAdminRoles(row);
  const isAdmin = [...roles].some((r) => ADMIN_ROLES.has(r));
  if (!isAdmin) return false;
  if (roles.has('super_admin')) return true;
  return String(row.institution_id || '').trim() === String(institutionId || '').trim();
}

function odemeTercihiLabel(tercih) {
  if (tercih === 'kredi_karti_odendi') return 'Kredi kartı ile ödedim';
  if (tercih === 'aylik_taksit_istiyorum') return 'Aylık taksit istiyorum';
  return 'Henüz ödemedi — kurum iletişime geçsin';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildVeliKayitAdminWhatsAppText(payload) {
  const lines = [
    '📋 YENİ DERSHANE KAYIT FORMU',
    '',
    `Kurum: ${payload.kurumAdi || '—'}`,
    `Öğrenci: ${payload.ogrenciLabel || '—'}`,
    `Veli: ${payload.veliLabel || '—'}`,
    `Program: ${payload.programAdi || '—'}`,
    `Sınıf: ${payload.sinif || '—'}`,
    `Veli tel: ${payload.veliTel || '—'}`,
    `Öğr. tel: ${payload.ogrenciTel || '—'}`,
    `E-posta: ${payload.eposta || '—'}`,
    `Ödeme: ${payload.odemeLabel || '—'}`,
    `Sözleşme no: ${payload.contractNumber || '—'}`
  ];
  if (payload.adminUrl) lines.push('', `Panel: ${payload.adminUrl}`);
  return lines.join('\n').trim();
}

export function buildVeliKayitAdminEmailHtml(payload) {
  const rows = [
    ['Kurum', payload.kurumAdi],
    ['Öğrenci', payload.ogrenciLabel],
    ['Veli', payload.veliLabel],
    ['Program', payload.programAdi],
    ['Sınıf', payload.sinif],
    ['Veli telefon', payload.veliTel],
    ['Öğrenci telefon', payload.ogrenciTel],
    ['E-posta', payload.eposta],
    ['Ödeme tercihi', payload.odemeLabel],
    ['Sözleşme no', payload.contractNumber]
  ];
  const trs = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">${escapeHtml(k)}</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${escapeHtml(v || '—')}</td></tr>`
    )
    .join('');
  const btn = payload.adminUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(payload.adminUrl)}" style="display:inline-block;background:#0b1f3a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Veli onay paneline git</a></p>`
    : '';
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111827;max-width:560px">
  <h2 style="margin:0 0 8px;color:#0b1f3a">Yeni dershane kayıt formu</h2>
  <p style="margin:0 0 16px;color:#4b5563">Veli kayıt formu dolduruldu. Ücret girişi ve onay için panele gidin.</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${trs}</table>
  ${btn}
  <p style="margin-top:24px;font-size:12px;color:#6b7280">Bu bildirim otomatik gönderilmiştir.</p>
</div>`;
}

async function loadAdminRecipients(institutionId) {
  const instId = String(institutionId || '').trim();
  const byKey = new Map();

  const pushRecipient = (entry) => {
    const id = String(entry.id || entry.email || entry.phone || '').trim();
    const email = String(entry.email || '')
      .trim()
      .toLowerCase();
    const phone = normalizePhoneToE164(entry.phone);
    const key = id || email || phone;
    if (!key) return;
    const prev = byKey.get(key);
    if (prev) {
      if (email && !prev.email) prev.email = email;
      if (phone && !prev.phone) prev.phone = phone;
      return;
    }
    byKey.set(key, {
      id: id || key,
      name: String(entry.name || 'Admin').trim() || 'Admin',
      email: email || null,
      phone: phone || null
    });
  };

  if (instId) {
    const { data: instUsers, error: instErr } = await supabaseAdmin
      .from('users')
      .select('id,name,email,phone,role,roles,institution_id,is_active')
      .eq('institution_id', instId)
      .limit(300);
    if (instErr) throw instErr;
    for (const row of instUsers || []) {
      if (rowIsActiveAdmin(row, instId)) pushRecipient(row);
    }
  }

  const { data: superUsers, error: superErr } = await supabaseAdmin
    .from('users')
    .select('id,name,email,phone,role,roles,institution_id,is_active')
    .eq('role', 'super_admin')
    .limit(100);
  if (superErr) throw superErr;
  for (const row of superUsers || []) {
    if (rowIsActiveAdmin(row, instId)) pushRecipient(row);
  }

  for (const email of parseEnvList(process.env.VELI_KAYIT_ADMIN_NOTIFY_EMAILS)) {
    if (email.includes('@')) pushRecipient({ id: `env:${email}`, name: 'Admin', email, phone: null });
  }
  for (const phoneRaw of parseEnvList(process.env.VELI_KAYIT_ADMIN_NOTIFY_PHONES)) {
    const phone = normalizePhoneToE164(phoneRaw);
    if (phone) pushRecipient({ id: `env:${phone}`, name: 'Admin', email: null, phone });
  }

  return [...byKey.values()];
}

function buildNotifyPayload({ contract, reg, institution, signUrl }) {
  const origin = publicAppOrigin();
  const adminUrl = `${origin}/veli-onay`;
  const ogrenciLabel = `${String(reg?.ogrenci_ad || contract?.ogrenci_ad || '').trim()} ${String(reg?.ogrenci_soyad || contract?.ogrenci_soyad || '').trim()}`.trim();
  const veliLabel = `${String(reg?.veli_ad || contract?.veli_ad || '').trim()} ${String(reg?.veli_soyad || contract?.veli_soyad || '').trim()}`.trim();
  return {
    kurumAdi: String(institution?.name || '').trim(),
    ogrenciLabel,
    veliLabel,
    programAdi: String(reg?.program_adi || contract?.program_adi || '').trim(),
    sinif: String(reg?.sinif || contract?.sinif || '').trim(),
    veliTel: String(reg?.veli_tel || contract?.telefon || '').trim(),
    ogrenciTel: String(reg?.ogrenci_tel || '').trim(),
    eposta: String(reg?.eposta || '').trim(),
    odemeLabel: odemeTercihiLabel(reg?.odeme_tercihi_veli),
    contractNumber: String(contract?.contract_number || '').trim(),
    adminUrl,
    signUrl: String(signUrl || '').trim()
  };
}

/**
 * Veli kayıt formu gönderildiğinde kurum adminlerine e-posta + WhatsApp bildirimi.
 * @returns {Promise<{ ok: boolean, emails: object[], whatsapp: object[], skipped?: string }>}
 */
export async function notifyAdminsOnVeliKayitForm({ contract, reg, institution, signUrl }) {
  const contractId = String(contract?.id || '').trim();
  const institutionId = String(contract?.institution_id || institution?.id || '').trim();
  if (!contractId || !institutionId) {
    return { ok: false, error: 'missing_contract_or_institution', emails: [], whatsapp: [] };
  }

  let recipients;
  try {
    recipients = await loadAdminRecipients(institutionId);
  } catch (e) {
    console.warn('[veli-kayit-admin-notify] load recipients', errorMessage(e));
    return { ok: false, error: errorMessage(e), emails: [], whatsapp: [] };
  }

  if (!recipients.length) {
    return { ok: true, skipped: 'no_admin_recipients', emails: [], whatsapp: [] };
  }

  const payload = buildNotifyPayload({ contract, reg, institution, signUrl });
  const waText = buildVeliKayitAdminWhatsAppText(payload);
  const emailSubject = `Yeni dershane kayıt formu — ${payload.ogrenciLabel || 'Öğrenci'}`;
  const emailHtml = buildVeliKayitAdminEmailHtml(payload);
  const emailText = buildVeliKayitAdminWhatsAppText(payload);

  const emailResults = [];
  const waResults = [];

  if (isEmailConfigured()) {
    for (const r of recipients) {
      const to = String(r.email || '').trim();
      if (!to || !to.includes('@')) continue;
      try {
        const sent = await sendTransactionalEmail({
          to,
          subject: emailSubject,
          html: emailHtml,
          text: emailText
        });
        emailResults.push({ to, ok: true, provider: sent.provider });
      } catch (e) {
        logEmailError('veli-kayit-admin-notify', e);
        emailResults.push({ to, ok: false, error: errorMessage(e) });
      }
    }
  } else {
    emailResults.push({ ok: false, skipped: 'email_not_configured' });
  }

  for (const r of recipients) {
    const phone = normalizePhoneToE164(r.phone);
    if (!phone) continue;
    const sid =
      String(process.env.VELI_KAYIT_GATEWAY_SESSION_ID || '').trim() ||
      String(process.env.REPORT_REMINDER_GATEWAY_SESSION_ID || '').trim() ||
      String(process.env.BOOK_ORDER_GATEWAY_SESSION_ID || '').trim();
    const sent = await sendGatewayTextMessage({
      phone,
      message: waText,
      sessionId: sid,
      sessionCandidates: sid ? [sid] : [],
      allowSharedFallback: Boolean(sid)
    });
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId: contractId,
      kind: `${VELI_KAYIT_ADMIN_WA_KIND}:${String(r.id || phone).slice(0, 40)}`,
      message: waText.slice(0, 8000),
      status: sent.ok ? 'sent' : 'failed',
      logCode: sent.ok ? null : sent.errorCode || 'GATEWAY_SEND_FAILED',
      error: sent.ok ? null : String(sent.error || 'send_failed').slice(0, 400),
      phone
    });
    waResults.push({ phone, ok: sent.ok, error: sent.error || null });
  }

  if (!waResults.length && !emailResults.some((x) => x.ok)) {
    return {
      ok: false,
      skipped: 'no_contact_channels',
      emails: emailResults,
      whatsapp: waResults
    };
  }

  return {
    ok: emailResults.some((x) => x.ok) || waResults.some((x) => x.ok),
    emails: emailResults,
    whatsapp: waResults
  };
}
