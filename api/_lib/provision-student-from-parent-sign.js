import { supabaseAdmin, getSupabaseAdmin, hasSupabaseServiceRoleKey } from './supabase-admin.js';
import { normalizeUuidOrGenerate } from './uuid.js';
import { enforceStudentInsertQuotas } from './quota-enforce.js';
import { errorMessage } from './error-msg.js';

function kayitJson(row) {
  const kj = row?.kayit_formu_json;
  return kj && typeof kj === 'object' && !Array.isArray(kj) ? kj : {};
}

function normalizeBirthDate(raw) {
  const v = String(raw || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function digitsPhone(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

function randomStudentPassword(length = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${s}A1`;
}

async function provisionSupabaseAuthUser(userRow, passwordPlain) {
  if (!hasSupabaseServiceRoleKey()) return;
  const sb = getSupabaseAdmin();
  const { data: existing } = await sb.auth.admin.getUserById(String(userRow.id));
  if (existing?.user?.id) return;
  await sb.auth.admin.createUser({
    id: String(userRow.id),
    email: String(userRow.email || '').toLowerCase().trim(),
    password: String(passwordPlain || ''),
    email_confirm: true,
    user_metadata: {
      name: String(userRow.name || ''),
      app_role: String(userRow.role || '')
    }
  });
}

export function profileFromParentSignContract(row) {
  const j = kayitJson(row);
  const email = String(j.eposta || '')
    .trim()
    .toLowerCase();
  const ogrenciAd = String(row?.ogrenci_ad || '').trim();
  const ogrenciSoyad = String(row?.ogrenci_soyad || '').trim();
  const fullName = `${ogrenciAd} ${ogrenciSoyad}`.trim();
  const veliName = `${String(row?.veli_ad || '').trim()} ${String(row?.veli_soyad || '').trim()}`.trim();
  const ogrenciTel = digitsPhone(j.ogrenci_tel) || digitsPhone(row?.telefon);
  const veliTel = digitsPhone(j.veli_tel) || digitsPhone(row?.telefon);
  const tc = String(j.tc_kimlik || '').replace(/\D/g, '');
  const tcIdentityNo = tc.length === 11 ? tc : null;
  const sinif = String(row?.sinif || '').trim() || '9';
  const okul = String(j.okul_adi || '').trim() || null;
  const programAdi = String(row?.program_adi || '').trim() || null;
  const adres = String(row?.adres || '').trim() || null;

  return {
    email,
    fullName: fullName || email || 'Öğrenci',
    ogrenciTel,
    veliName: veliName || null,
    veliTel,
    tcIdentityNo,
    birthDate: normalizeBirthDate(j.dogum_tarihi),
    classLevel: sinif,
    school: okul,
    programAdi,
    adres,
    institutionId: String(row?.institution_id || '').trim() || null
  };
}

function alreadyLinked(row) {
  const j = kayitJson(row);
  const uid = String(row?.ogrenci_user_id || j.platform_user_id || '').trim();
  const sid = String(row?.student_id || j.student_id || '').trim();
  return { linked: Boolean(uid), userId: uid, studentId: sid };
}

/**
 * İmzalı veli sözleşmesinden users + students kaydı oluşturur ve sözleşmeye bağlar.
 * Idempotent: zaten bağlıysa veya e-posta yoksa atlar.
 */
export async function provisionStudentFromParentSignContract(rowOrId, opts = {}) {
  let row = rowOrId;
  if (typeof rowOrId === 'string') {
    const { data, error } = await supabaseAdmin
      .from('parent_sign_contracts')
      .select('*')
      .eq('id', rowOrId)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row?.id) return { ok: false, skipped: true, reason: 'not_found' };

  const link = alreadyLinked(row);
  if (link.linked && !opts.force) {
    return { ok: true, skipped: true, reason: 'already_linked', userId: link.userId, studentId: link.studentId };
  }

  const signed =
    String(row.status || '').toLowerCase() === 'signed' || Boolean(row.signed_at);
  if (!signed && !opts.force) {
    return { ok: false, skipped: true, reason: 'not_signed' };
  }

  const profile = profileFromParentSignContract(row);
  if (!profile.email || !profile.email.includes('@')) {
    return { ok: false, skipped: true, reason: 'email_missing' };
  }
  if (!profile.institutionId) {
    return { ok: false, skipped: true, reason: 'institution_missing' };
  }

  const now = new Date().toISOString();
  const passwordPlain = String(opts.passwordPlain || randomStudentPassword(10));

  let userId = link.userId;
  let studentId = link.studentId;
  let createdUser = false;
  let createdStudent = false;

  if (!userId) {
    const { data: existingByEmail } = await supabaseAdmin
      .from('users')
      .select('id,email,role,institution_id')
      .eq('email', profile.email)
      .maybeSingle();
    if (existingByEmail?.id) {
      userId = String(existingByEmail.id);
    }
  }

  if (!userId) {
    userId = normalizeUuidOrGenerate(null);
    const insertUserPayload = {
      id: userId,
      email: profile.email,
      name: profile.fullName,
      phone: profile.ogrenciTel,
      tc_identity_no: profile.tcIdentityNo,
      role: 'student',
      roles: ['student'],
      password_hash: passwordPlain,
      institution_id: profile.institutionId,
      is_active: true,
      package: 'trial',
      start_date: now,
      end_date: null,
      created_by: opts.createdBy || null,
      created_at: now,
      updated_at: now
    };
    const { data: createdUserRow, error: uErr } = await supabaseAdmin
      .from('users')
      .insert(insertUserPayload)
      .select('*')
      .single();
    if (uErr) throw uErr;
    createdUser = true;
    try {
      await provisionSupabaseAuthUser(createdUserRow, passwordPlain);
    } catch (authErr) {
      console.warn('[provision-student-from-parent-sign] auth', errorMessage(authErr));
    }
  }

  const studentPayload = {
    name: profile.fullName,
    email: profile.email,
    phone: profile.ogrenciTel,
    birth_date: profile.birthDate,
    class_level: profile.classLevel || '9',
    school: profile.school,
    branch: profile.school,
    tc_identity_no: profile.tcIdentityNo,
    parent_name: profile.veliName,
    parent_phone: profile.veliTel,
    institution_id: profile.institutionId,
    user_id: userId,
    platform_user_id: userId,
    updated_at: now
  };

  if (!studentId) {
    const { data: existingStudentByEmail } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('email', profile.email)
      .maybeSingle();
    if (existingStudentByEmail?.id) {
      studentId = String(existingStudentByEmail.id);
    }
  }

  if (!studentId) {
    try {
      await enforceStudentInsertQuotas({
        institutionId: profile.institutionId,
        coachId: null,
        actorRole: 'admin'
      });
    } catch (quotaErr) {
      console.warn('[provision-student-from-parent-sign] quota', errorMessage(quotaErr));
    }
    studentId = normalizeUuidOrGenerate(null);
    const { error: stInsErr } = await supabaseAdmin.from('students').insert({
      id: studentId,
      ...studentPayload,
      coach_id: null,
      program_id: null,
      created_at: now
    });
    if (stInsErr) throw stInsErr;
    createdStudent = true;
  } else {
    const { error: stUpdErr } = await supabaseAdmin
      .from('students')
      .update(studentPayload)
      .eq('id', studentId);
    if (stUpdErr) throw stUpdErr;
  }

  const jPrev = kayitJson(row);
  const nextJson = {
    ...jPrev,
    platform_user_id: userId,
    student_id: studentId,
    provisioned_at: now,
    provisioned_password_plain: createdUser ? passwordPlain : jPrev.provisioned_password_plain || null,
    provision_source: String(jPrev.source || opts.source || 'parent_sign_signed')
  };

  const { error: cErr } = await supabaseAdmin
    .from('parent_sign_contracts')
    .update({
      ogrenci_user_id: userId,
      student_id: studentId,
      kayit_formu_json: nextJson,
      updated_at: now
    })
    .eq('id', row.id);
  if (cErr) throw cErr;

  return {
    ok: true,
    skipped: false,
    userId,
    studentId,
    email: profile.email,
    passwordPlain: createdUser ? passwordPlain : null,
    createdUser,
    createdStudent,
    profile
  };
}
