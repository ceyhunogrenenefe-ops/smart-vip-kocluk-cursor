import { supabaseAdmin } from './supabase-admin.js';

/** Özel hata — handler 403 + mesaj için */
export class QuotaError extends Error {
  constructor(code = 'quota_exceeded') {
    super('user_limit_exceeded');
    this.code = code;
    this.userMessage =
      code === 'user_limit_exceeded'
        ? 'Kullanıcı limitiniz doldu'
        : 'Kullanıcı limitiniz doldu';
  }
}

const LIMIT_MESSAGE = 'Kullanıcı limitiniz doldu';

export async function getInstitutionAdminUserId(institutionId) {
  if (!institutionId) return null;
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('institution_id', institutionId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function getAdminLimits(adminUserId) {
  const { data, error } = await supabaseAdmin.from('admin_limits').select('*').eq('admin_id', adminUserId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getCoachLimitRow(coachId) {
  const { data, error } = await supabaseAdmin.from('coach_limits').select('*').eq('coach_id', coachId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function countStudentsInInstitution(institutionId) {
  const { count, error } = await supabaseAdmin
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('institution_id', institutionId);
  if (error) throw error;
  return count ?? 0;
}

async function countCoachesInInstitution(institutionId) {
  const { count, error } = await supabaseAdmin
    .from('coaches')
    .select('id', { count: 'exact', head: true })
    .eq('institution_id', institutionId);
  if (error) throw error;
  return count ?? 0;
}

async function countStudentsForCoach(coachId) {
  const { count, error } = await supabaseAdmin
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Kurum genelinde öğrenci sayısı (admin_limits üzerinden admin_id ile)
 */
export async function enforceOrganizationStudentQuota(institutionId) {
  if (!institutionId) return;
  const adminUserId = await getInstitutionAdminUserId(institutionId);
  if (!adminUserId) return;
  const limits = await getAdminLimits(adminUserId);
  if (!limits || limits.max_students == null) return;
  const n = await countStudentsInInstitution(institutionId);
  if (n >= limits.max_students) {
    const err = new QuotaError('user_limit_exceeded');
    err.userMessage = LIMIT_MESSAGE;
    throw err;
  }
}

/** Kuruma yeni koç eklenmeden önce */
export async function enforceOrganizationCoachQuota(institutionId) {
  if (!institutionId) return;
  const adminUserId = await getInstitutionAdminUserId(institutionId);
  if (!adminUserId) return;
  const limits = await getAdminLimits(adminUserId);
  if (!limits || limits.max_coaches == null) return;
  const n = await countCoachesInInstitution(institutionId);
  if (n >= limits.max_coaches) {
    const err = new QuotaError('user_limit_exceeded');
    err.userMessage = LIMIT_MESSAGE;
    throw err;
  }
}

/** Belirtilen koça atanmış öğrenci kotası (+1 gelecek INSERT için) */
export async function enforceCoachStudentQuota(coachId) {
  if (!coachId) return;
  const row = await getCoachLimitRow(coachId);
  if (!row) return;
  const n = await countStudentsForCoach(coachId);
  if (n >= row.max_students) {
    const err = new QuotaError('user_limit_exceeded');
    err.userMessage = LIMIT_MESSAGE;
    throw err;
  }
}

/** Öğrenci oluşturma: hem kurum hem (varsa) koç kotası */
export async function enforceStudentInsertQuotas({ institutionId, coachId }) {
  await enforceOrganizationStudentQuota(institutionId);
  if (coachId) await enforceCoachStudentQuota(coachId);
}
