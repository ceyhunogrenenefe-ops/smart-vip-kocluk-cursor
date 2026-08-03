import { supabaseAdmin } from './supabase-admin.js';
import { resolveCoachIdByUserSub } from './enrich-student-actor.js';
import { normalizedUserRolesFromDb } from './user-roles-fetch.js';
import { normRole, roleSetHasAdmin, roleSetHasSuperAdmin } from './actor-roles.js';

/**
 * Süper admin / kurum admini başka kullanıcı adına öğrenci kapsamı isterken
 * (istemci taklidi — JWT hâlâ admin/süper admin kalır).
 * Koç kendi öğrencisini taklit ederken de view_as kullanılabilir.
 * @returns {Promise<object>} Hedef kullanıcıyı actor şeklinde (sub, roles, coach_id, …)
 */
export async function resolveViewAsActorIfAllowed(realActor, realRoleSet, viewAsUserId) {
  const targetId = String(viewAsUserId || '').trim();
  if (!targetId) {
    const err = new Error('view_as_user_id_required');
    err.status = 400;
    err.code = 'view_as_user_id_required';
    throw err;
  }

  if (String(realActor?.sub || '') === targetId) {
    return realActor;
  }

  const isSuper = roleSetHasSuperAdmin(realRoleSet);
  const isAdmin = roleSetHasAdmin(realRoleSet);
  const isCoach = Boolean(realRoleSet && realRoleSet.has('coach'));

  if (!isSuper && !isAdmin && !isCoach) {
    const err = new Error('view_as_forbidden');
    err.status = 403;
    err.code = 'view_as_forbidden';
    throw err;
  }

  const { data: userRow, error } = await supabaseAdmin
    .from('users')
    .select('id,role,roles,institution_id,email')
    .eq('id', targetId)
    .maybeSingle();
  if (error) throw error;
  if (!userRow?.id) {
    const err = new Error('view_as_user_not_found');
    err.status = 404;
    err.code = 'view_as_user_not_found';
    throw err;
  }

  if (isAdmin && !isSuper) {
    const aInst = String(realActor?.institution_id || '').trim();
    const tInst = String(userRow.institution_id || '').trim();
    if (!aInst || !tInst || aInst !== tInst) {
      const err = new Error('view_as_institution_mismatch');
      err.status = 403;
      err.code = 'view_as_institution_mismatch';
      throw err;
    }
  }

  const roles = await normalizedUserRolesFromDb(targetId);
  const targetIsStudent =
    roles.includes('student') || normRole(userRow.role) === 'student';

  // Koç (admin değil): yalnızca kendi öğrencisini view_as edebilir
  if (isCoach && !isAdmin && !isSuper) {
    if (!targetIsStudent) {
      const err = new Error('view_as_forbidden');
      err.status = 403;
      err.code = 'view_as_forbidden';
      throw err;
    }
    const coachId =
      realActor?.coach_id || (await resolveCoachIdByUserSub(realActor?.sub));
    if (!coachId) {
      const err = new Error('view_as_forbidden');
      err.status = 403;
      err.code = 'view_as_forbidden';
      throw err;
    }
    const email = String(userRow.email || '').toLowerCase().trim();
    let studentRow = null;
    const { data: byPlatform } = await supabaseAdmin
      .from('students')
      .select('id,coach_id')
      .or(`platform_user_id.eq.${targetId},user_id.eq.${targetId}`)
      .maybeSingle();
    studentRow = byPlatform;
    if (!studentRow?.id && email) {
      const { data: byEmail } = await supabaseAdmin
        .from('students')
        .select('id,coach_id')
        .eq('email', email)
        .maybeSingle();
      studentRow = byEmail;
    }
    if (!studentRow?.id || String(studentRow.coach_id) !== String(coachId)) {
      const err = new Error('view_as_forbidden');
      err.status = 403;
      err.code = 'view_as_forbidden';
      throw err;
    }
  }

  const coachId = await resolveCoachIdByUserSub(targetId);
  const primary =
    roles.find((r) => r === 'coach' || r === 'teacher') ||
    roles[0] ||
    normRole(userRow.role) ||
    'coach';

  return {
    sub: targetId,
    role: primary,
    roles,
    institution_id: userRow.institution_id || null,
    coach_id: coachId,
    student_id: null,
    email: userRow.email || null
  };
}
