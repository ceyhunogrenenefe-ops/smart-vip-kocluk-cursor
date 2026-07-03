import { hasInstitutionAccess } from './auth.js';
import { errorMessage } from './error-msg.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { enforceStudentInsertQuotas, QuotaError } from './quota-enforce.js';
import { getSupabaseAdmin, hasSupabaseServiceRoleKey, supabaseAdmin } from './supabase-admin.js';
import { normalizeUuidOrGenerate } from './uuid.js';

const USER_ROLES = ['super_admin', 'admin', 'coach', 'teacher', 'student'];

function cleanStr(raw) {
  return String(raw || '').trim();
}

function toLowerEmail(raw) {
  return cleanStr(raw).toLowerCase();
}

function normalizeClassLevel(raw) {
  const v = cleanStr(raw);
  if (!v) return '9';
  return v;
}

function normalizeRoles(rawRoles, fallback = 'student') {
  const arr = Array.isArray(rawRoles) ? rawRoles : [];
  const cleaned = arr.map((x) => String(x || '').trim()).filter((x) => USER_ROLES.includes(x));
  if (!cleaned.length) return [fallback];
  return [...new Set(cleaned)];
}

function validateRoleCombo(roles) {
  const hasStudent = roles.includes('student');
  const hasStaff = roles.some((r) => r !== 'student');
  if (hasStudent && hasStaff) {
    return 'Öğrenci rolü öğretmen/koç/admin ile aynı satırda kullanılamaz.';
  }
  return null;
}

function actorMayAssignRole(actor, newRole) {
  if (!USER_ROLES.includes(newRole) || newRole === 'super_admin') return false;
  if (actor.role === 'super_admin') return ['admin', 'coach', 'teacher', 'student'].includes(newRole);
  if (actor.role === 'admin') return ['coach', 'teacher', 'student'].includes(newRole);
  return false;
}

async function resolveCreatedByFk(actor) {
  const sub = actor?.sub;
  if (!sub || sub === 'anonymous') return null;
  const { data, error } = await supabaseAdmin.from('users').select('id').eq('id', sub).maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

async function provisionSupabaseAuthUser({ id, email, passwordPlain, name, role }) {
  if (!hasSupabaseServiceRoleKey()) return;
  const pwd = cleanStr(passwordPlain);
  if (pwd.length < 6) return;
  const em = toLowerEmail(email);
  if (!em || !id) return;
  try {
    const sb = getSupabaseAdmin();
    const { data: existing, error: getErr } = await sb.auth.admin.getUserById(String(id));
    if (!getErr && existing?.user?.id) return;
    const { error: cErr } = await sb.auth.admin.createUser({
      id: String(id),
      email: em,
      password: pwd,
      email_confirm: true,
      user_metadata: { name: name || '', app_role: role || '' }
    });
    if (cErr) console.warn('[user-bulk-import] auth create:', cErr.message || String(cErr));
  } catch (e) {
    console.warn('[user-bulk-import] auth provision:', errorMessage(e));
  }
}

function normalizeInstitutionId(actor, requested) {
  if (actor.role === 'admin') return actor.institution_id || null;
  const s = requested != null ? cleanStr(requested) : '';
  return s || actor.institution_id || null;
}

function normalizePhoneField(raw) {
  const local = cleanStr(raw);
  if (!local) return { local: '', e164: null };
  const e164 = normalizePhoneToE164(local);
  return { local, e164: e164 || local };
}

export async function upsertCoachProfile({ userId, fullName, email, phone, institutionId, now }) {
  const em = toLowerEmail(email);
  const { data: byEmail } = await supabaseAdmin.from('coaches').select('id').eq('email', em).maybeSingle();
  const { data: byId } = await supabaseAdmin.from('coaches').select('id').eq('id', userId).maybeSingle();
  const existingId = byEmail?.id || byId?.id;
  const patch = {
    name: fullName,
    email: em,
    phone: phone || null,
    institution_id: institutionId,
    updated_at: now
  };
  if (existingId) {
    const { error } = await supabaseAdmin.from('coaches').update(patch).eq('id', existingId);
    if (error) throw error;
    return;
  }
  const { error } = await supabaseAdmin.from('coaches').insert({
    id: userId,
    ...patch,
    subjects: [],
    student_ids: [],
    created_at: now
  });
  if (error) throw error;
}

async function upsertStudentProfile({
  userId,
  fullName,
  email,
  phone,
  birthDate,
  classLevel,
  branch,
  parentName,
  parentPhone,
  institutionId,
  now
}) {
  const em = toLowerEmail(email);
  const studentPayload = {
    name: fullName,
    email: em,
    phone: phone || null,
    birth_date: birthDate || null,
    class_level: classLevel,
    school: branch || null,
    branch: branch || null,
    parent_name: parentName || null,
    parent_phone: parentPhone || null,
    institution_id: institutionId,
    user_id: userId,
    platform_user_id: userId,
    updated_at: now
  };

  const { data: existingByEmail } = await supabaseAdmin
    .from('students')
    .select('id')
    .eq('email', em)
    .maybeSingle();

  if (existingByEmail?.id) {
    const { error } = await supabaseAdmin
      .from('students')
      .update(studentPayload)
      .eq('id', existingByEmail.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from('students').insert({
    id: normalizeUuidOrGenerate(null),
    ...studentPayload,
    coach_id: null,
    created_at: now
  });
  if (error) throw error;
}

/**
 * @param {import('./auth.js').AuthActor} actor
 * @param {Record<string, unknown>} row
 * @param {string|null} institutionId
 */
export async function importBulkUserRow(actor, row, institutionId) {
  const rowNumber = Number(row.rowNumber) || 0;
  const firstName = cleanStr(row.firstName);
  const lastName = cleanStr(row.lastName);
  const fullName = cleanStr(row.fullName) || `${firstName} ${lastName}`.trim();
  const email = toLowerEmail(row.email);
  const roles = normalizeRoles(row.roles, 'student');
  const password = cleanStr(row.password);
  const classLevel = normalizeClassLevel(row.classLevel);
  const branch = cleanStr(row.branch);
  const birthDate = cleanStr(row.birthDate) || null;
  const parentName = cleanStr(row.parentName) || null;

  const studentPhone = normalizePhoneField(row.phone);
  const parentPhoneNorm = normalizePhoneField(row.parentPhone);

  if (!firstName || !lastName) {
    return { status: 'error', rowNumber, message: 'Ad ve soyad zorunludur.' };
  }
  if (!email || !email.includes('@')) {
    return { status: 'error', rowNumber, message: 'Geçerli e-posta zorunludur.' };
  }
  if (password.length < 6) {
    return { status: 'error', rowNumber, message: 'Şifre en az 6 karakter olmalıdır.' };
  }

  const comboErr = validateRoleCombo(roles);
  if (comboErr) return { status: 'error', rowNumber, message: comboErr };

  for (const r of roles) {
    if (!actorMayAssignRole(actor, r)) {
      return { status: 'error', rowNumber, message: `Bu rol için yetkiniz yok: ${r}.` };
    }
  }

  if (cleanStr(row.parentPhone) && !parentPhoneNorm.e164) {
    return { status: 'error', rowNumber, message: 'Veli telefonu geçersiz.' };
  }
  if (cleanStr(row.phone) && !studentPhone.e164) {
    return { status: 'error', rowNumber, message: 'Öğrenci telefonu geçersiz.' };
  }

  if (institutionId) {
    const { data: instRow, error: instErr } = await supabaseAdmin
      .from('institutions')
      .select('id')
      .eq('id', institutionId)
      .maybeSingle();
    if (instErr) throw instErr;
    if (!instRow?.id) {
      return { status: 'error', rowNumber, message: 'Kurum geçersiz veya bulunamadı.' };
    }
  }

  if (actor.role === 'admin' && !hasInstitutionAccess(actor, institutionId)) {
    return { status: 'error', rowNumber, message: 'Kurum yetkisi yok.' };
  }

  const now = new Date().toISOString();
  const primaryRole = roles[0];
  const phoneForUser = studentPhone.e164 || studentPhone.local || null;
  const parentPhoneStored = parentPhoneNorm.e164 || parentPhoneNorm.local || null;

  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (existingUser?.id) {
    if (existingUser.role === 'super_admin') {
      return { status: 'error', rowNumber, message: 'Süper admin hesabı güncellenemez.' };
    }
    if (actor.role === 'admin' && !hasInstitutionAccess(actor, existingUser.institution_id)) {
      return { status: 'error', rowNumber, message: 'Mevcut kullanıcı kurum kapsamı dışında.' };
    }

    const existingRoles = normalizeRoles(existingUser.roles, existingUser.role || 'student');
    const hasStudent = (rs) => rs.includes('student');
    const hasStaff = (rs) => rs.some((r) => r !== 'student');
    if (
      (hasStudent(existingRoles) && hasStaff(roles)) ||
      (hasStaff(existingRoles) && hasStudent(roles))
    ) {
      return {
        status: 'error',
        rowNumber,
        message: `Mevcut roller (${existingRoles.join(', ')}) ile dosyadaki roller uyumsuz.`
      };
    }

    const { error: updErr } = await supabaseAdmin
      .from('users')
      .update({
        name: fullName,
        email,
        phone: phoneForUser,
        password_hash: password,
        role: primaryRole,
        roles,
        institution_id: institutionId ?? existingUser.institution_id,
        updated_at: now
      })
      .eq('id', existingUser.id);
    if (updErr) throw updErr;

    if (roles.includes('student')) {
      await upsertStudentProfile({
        userId: existingUser.id,
        fullName,
        email,
        phone: phoneForUser,
        birthDate,
        classLevel,
        branch,
        parentName,
        parentPhone: parentPhoneStored,
        institutionId: institutionId ?? existingUser.institution_id,
        now
      });
    }
    if (roles.includes('coach')) {
      await upsertCoachProfile({
        userId: existingUser.id,
        fullName,
        email,
        phone: phoneForUser,
        institutionId: institutionId ?? existingUser.institution_id,
        now
      });
    }

    return { status: 'updated', rowNumber };
  }

  if (roles.includes('student')) {
    await enforceStudentInsertQuotas({
      institutionId,
      coachId: null,
      actorRole: actor.role
    });
  }

  const userId = normalizeUuidOrGenerate(null);
  const createdByFk = await resolveCreatedByFk(actor);
  const insertUserPayload = {
    id: userId,
    email,
    name: fullName,
    phone: phoneForUser,
    role: primaryRole,
    roles,
    password_hash: password,
    institution_id: institutionId,
    is_active: true,
    package: 'trial',
    start_date: now,
    end_date: null,
    created_by: createdByFk,
    created_at: now,
    updated_at: now
  };

  const { data: createdUser, error: uErr } = await supabaseAdmin
    .from('users')
    .insert(insertUserPayload)
    .select('*')
    .single();
  if (uErr) {
    if (uErr.code === '23505') {
      return { status: 'skipped', rowNumber, message: 'E-posta zaten kayıtlı.' };
    }
    throw uErr;
  }

  await provisionSupabaseAuthUser({
    id: createdUser.id,
    email: createdUser.email,
    passwordPlain: password,
    name: createdUser.name,
    role: createdUser.role
  });

  if (roles.includes('student')) {
    await upsertStudentProfile({
      userId: createdUser.id,
      fullName,
      email,
      phone: phoneForUser,
      birthDate,
      classLevel,
      branch,
      parentName,
      parentPhone: parentPhoneStored,
      institutionId,
      now
    });
  }
  if (roles.includes('coach')) {
    await upsertCoachProfile({
      userId: createdUser.id,
      fullName,
      email,
      phone: phoneForUser,
      institutionId,
      now
    });
  }

  return { status: 'created', rowNumber };
}

/**
 * @param {import('./auth.js').AuthActor} actor
 * @param {Record<string, unknown>[]} rows
 * @param {string|null|undefined} requestedInstitutionId
 */
export async function runBulkUserImport(actor, rows, requestedInstitutionId) {
  const institutionId = normalizeInstitutionId(actor, requestedInstitutionId);
  const summary = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

  for (const row of rows || []) {
    try {
      const result = await importBulkUserRow(actor, row, institutionId);
      if (result.status === 'created') summary.created += 1;
      else if (result.status === 'updated') summary.updated += 1;
      else if (result.status === 'skipped') {
        summary.skipped += 1;
        if (result.message) summary.errors.push({ rowNumber: result.rowNumber, message: result.message });
      } else if (result.status === 'error') {
        summary.failed += 1;
        summary.errors.push({ rowNumber: result.rowNumber, message: result.message || 'Kayıt başarısız.' });
      }
    } catch (e) {
      summary.failed += 1;
      if (e instanceof QuotaError) {
        summary.errors.push({
          rowNumber: Number(row.rowNumber) || 0,
          message: e.userMessage || 'Kota aşıldı.'
        });
        break;
      }
      const pgCode = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
      let msg = errorMessage(e);
      if (pgCode === '23505') msg = 'Bu e-posta adresi zaten kayıtlı.';
      summary.errors.push({ rowNumber: Number(row.rowNumber) || 0, message: msg });
    }
  }

  return summary;
}