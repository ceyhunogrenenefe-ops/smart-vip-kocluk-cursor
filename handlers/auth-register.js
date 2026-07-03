import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const ipBuckets = new Map();

const ROLE_SET = new Set(['admin', 'coach', 'teacher', 'student']);

function cleanStr(raw) {
  return String(raw || '').trim();
}

function toLowerEmail(raw) {
  return cleanStr(raw).toLowerCase();
}

function normalizeTc(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function normalizeClassLevel(raw) {
  const v = cleanStr(raw);
  return v || null;
}

function normalizeBranch(raw) {
  const v = cleanStr(raw);
  return v || null;
}

function normalizeBirthDate(raw) {
  const v = cleanStr(raw);
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function currentIp(req) {
  const fromHeader = req.headers['x-forwarded-for'];
  if (Array.isArray(fromHeader) && fromHeader[0]) return String(fromHeader[0]).split(',')[0].trim();
  if (typeof fromHeader === 'string' && fromHeader) return fromHeader.split(',')[0].trim();
  return cleanStr(req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown');
}

function isRateLimited(ip) {
  const now = Date.now();
  const prev = ipBuckets.get(ip) || [];
  const recent = prev.filter((ts) => now - ts < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    ipBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipBuckets.set(ip, recent);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = currentIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'too_many_requests', hint: 'Lutfen 10 dakika sonra tekrar deneyin.' });
  }

  try {
    const body = req.body || {};
    const firstName = cleanStr(body.first_name || body.firstName || body.ad);
    const lastName = cleanStr(body.last_name || body.lastName || body.soyad);
    const tcIdentityNo = normalizeTc(body.tc_identity_no || body.tcIdentityNo || body.tc || body.tcNo);
    const email = toLowerEmail(body.email || body.mail);
    const phoneE164 = normalizePhoneToE164(body.phone || body.telefon);
    const classLevel = normalizeClassLevel(body.class_level || body.classLevel || body.sinif);
    const branch = normalizeBranch(body.branch || body.sube || body['şube']);
    const parentName = cleanStr(body.parent_name || body.parentName || body.veli_adi || body.veliAdi) || null;
    const parentPhoneE164 = normalizePhoneToE164(body.parent_phone || body.parentPhone || body.veli_telefon || body.veliTelefon);
    const birthDate = normalizeBirthDate(body.birth_date || body.birthDate || body.dogum_tarihi || body.dogumTarihi);
    const passwordPlain = cleanStr(body.password || body.sifre || body.şifre);
    const requestedRole = cleanStr(body.role || body.rol).toLowerCase();
    const institutionId = cleanStr(body.institution_id || body.institutionId) || null;

    if (!firstName || !lastName) return res.status(400).json({ error: 'ad_ve_soyad_zorunlu' });
    if (tcIdentityNo.length !== 11) return res.status(400).json({ error: 'tc_11_hane_olmali' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'gecersiz_email' });
    if (!phoneE164) return res.status(400).json({ error: 'gecersiz_telefon_e164' });
    if (!passwordPlain || passwordPlain.length < 6) return res.status(400).json({ error: 'sifre_min_6' });
    if (!ROLE_SET.has(requestedRole)) return res.status(400).json({ error: 'gecersiz_rol' });
    if (institutionId) {
      const { data: instRow, error: instErr } = await supabaseAdmin
        .from('institutions')
        .select('id')
        .eq('id', institutionId)
        .maybeSingle();
      if (instErr) throw instErr;
      if (!instRow?.id) {
        return res.status(400).json({ error: 'gecersiz_kurum' });
      }
    }
    if (body.birth_date || body.birthDate || body.dogum_tarihi || body.dogumTarihi) {
      if (!birthDate) return res.status(400).json({ error: 'gecersiz_dogum_tarihi' });
    }
    if ((body.parent_phone || body.parentPhone || body.veli_telefon || body.veliTelefon) && !parentPhoneE164) {
      return res.status(400).json({ error: 'gecersiz_veli_telefonu_e164' });
    }

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingUser?.id) {
      return res.status(409).json({ error: 'email_zaten_kullanimda' });
    }

    const { data: existingPendingByEmail } = await supabaseAdmin
      .from('pending_registrations')
      .select('id')
      .eq('status', 'pending')
      .eq('email', email)
      .maybeSingle();
    if (existingPendingByEmail?.id) {
      return res.status(409).json({ error: 'bu_email_icin_bekleyen_kayit_var' });
    }

    const { data: existingPendingByTc } = await supabaseAdmin
      .from('pending_registrations')
      .select('id')
      .eq('status', 'pending')
      .eq('tc_identity_no', tcIdentityNo)
      .maybeSingle();
    if (existingPendingByTc?.id) {
      return res.status(409).json({ error: 'bu_tc_icin_bekleyen_kayit_var' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('pending_registrations')
      .insert({
        first_name: firstName,
        last_name: lastName,
        tc_identity_no: tcIdentityNo,
        email,
        phone_e164: phoneE164,
        class_level: classLevel,
        branch,
        parent_name: parentName,
        parent_phone_e164: parentPhoneE164 || null,
        birth_date: birthDate,
        requested_role: requestedRole,
        password_plain: passwordPlain,
        institution_id: institutionId,
        status: 'pending',
        created_at: now,
        updated_at: now
      })
      .select('id,status,created_at')
      .single();

    if (error) throw error;
    return res.status(200).json({ data });
  } catch (e) {
    const msg = errorMessage(e);
    console.error('[auth-register]', msg, e);
    return res.status(500).json({ error: msg || 'register_failed' });
  }
}
