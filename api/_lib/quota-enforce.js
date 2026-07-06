import { supabaseAdmin } from './supabase-admin.js';

/** Ana platform kurumu (Online VIP Dershane) */
export const PLATFORM_PRIMARY_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

/** Özel hata — handler 403 + mesaj için */
export class QuotaError extends Error {
  constructor(code = 'quota_exceeded', detail = {}) {
    super('user_limit_exceeded');
    this.code = code;
    this.detail = detail;
    const { current, max, kind } = detail;
    if (kind === 'coach_students') {
      this.userMessage = 'Kullanabileceğiniz öğrenci hakkınız dolmuştur.';
    } else if (Number.isFinite(current) && Number.isFinite(max)) {
      const label =
        kind === 'coaches'
          ? 'Koç'
          : kind === 'coach_students'
            ? 'Koç öğrenci'
            : 'Öğrenci';
      this.userMessage = `${label} kotası doldu (${current}/${max}). Süper admin kotayı artırabilir.`;
    } else {
      this.userMessage = 'Kullanıcı limitiniz doldu';
    }
  }
}

/** Tüm kurumlarda kota uygulanır; süper admin ekleme sırasında muaf */
export function shouldSkipInstitutionQuota({ institutionId, actorRole } = {}) {
  void institutionId;
  return String(actorRole || '').toLowerCase() === 'super_admin';
}

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

export async function countStudentsForCoachingQuota(institutionId) {
  return countStudentsInInstitution(institutionId);
}

export async function countCoachesForCoachingQuota(institutionId) {
  return countCoachesInInstitution(institutionId);
}

async function countStudentsInInstitution(institutionId) {
  let q = supabaseAdmin.from('students').select('id', { count: 'exact', head: true });
  if (institutionId === PLATFORM_PRIMARY_INSTITUTION_ID) {
    q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
  } else {
    q = q.eq('institution_id', institutionId);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function countCoachesInInstitution(institutionId) {
  let q = supabaseAdmin.from('coaches').select('id', { count: 'exact', head: true });
  if (institutionId === PLATFORM_PRIMARY_INSTITUTION_ID) {
    q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
  } else {
    q = q.eq('institution_id', institutionId);
  }
  const { count, error } = await q;
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
export async function enforceOrganizationStudentQuota(institutionId, options = {}) {
  if (!institutionId || shouldSkipInstitutionQuota({ institutionId, actorRole: options.actorRole })) {
    return;
  }
  const adminUserId = await getInstitutionAdminUserId(institutionId);
  if (!adminUserId) return;
  const limits = await getAdminLimits(adminUserId);
  if (!limits || limits.max_students == null) return;
  const n = await countStudentsInInstitution(institutionId);
  if (n >= limits.max_students) {
    throw new QuotaError('user_limit_exceeded', {
      kind: 'students',
      current: n,
      max: limits.max_students
    });
  }
}

/** Kuruma yeni koç eklenmeden önce */
export async function enforceOrganizationCoachQuota(institutionId, options = {}) {
  if (!institutionId || shouldSkipInstitutionQuota({ institutionId, actorRole: options.actorRole })) {
    return;
  }
  const adminUserId = await getInstitutionAdminUserId(institutionId);
  if (!adminUserId) return;
  const limits = await getAdminLimits(adminUserId);
  if (!limits || limits.max_coaches == null) return;
  const n = await countCoachesInInstitution(institutionId);
  if (n >= limits.max_coaches) {
    throw new QuotaError('user_limit_exceeded', {
      kind: 'coaches',
      current: n,
      max: limits.max_coaches
    });
  }
}

/** Belirtilen koça atanmış öğrenci kotası (+1 gelecek INSERT için) */
export async function enforceCoachStudentQuota(coachId, options = {}) {
  if (!coachId) return;
  if (shouldSkipInstitutionQuota({ actorRole: options.actorRole })) return;
  const row = await getCoachLimitRow(coachId);
  if (!row) return;
  const n = await countStudentsForCoach(coachId);
  if (n >= row.max_students) {
    throw new QuotaError('user_limit_exceeded', {
      kind: 'coach_students',
      current: n,
      max: row.max_students
    });
  }
}

/** Öğrenci oluşturma: hem kurum hem (varsa) koç kotası */
export async function enforceStudentInsertQuotas({ institutionId, coachId, actorRole }) {
  const quotaOpts = { institutionId, actorRole };
  await enforceOrganizationStudentQuota(institutionId, quotaOpts);
  if (coachId) await enforceCoachStudentQuota(coachId, quotaOpts);
}
