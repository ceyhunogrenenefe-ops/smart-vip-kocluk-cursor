import { supabaseAdmin } from './supabase-admin.js';
import { resolveCoachIdByUserSub } from './enrich-student-actor.js';
import { normalizedUserRolesFromDb } from './user-roles-fetch.js';
import { normRole, roleSetHasAdmin, roleSetHasSuperAdmin } from './actor-roles.js';

/**
 * Süper admin / kurum admini başka kullanıcı adına öğrenci kapsamı isterken
 * (istemci taklidi — JWT hâlâ admin/süper admin kalır).
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

  if (!roleSetHasSuperAdmin(realRoleSet) && !roleSetHasAdmin(realRoleSet)) {
    const err = new Error('view_as_forbidden');
    err.status = 403;
    err.code = 'view_as_forbidden';
    throw err;
  }

  if (String(realActor?.sub || '') === targetId) {
    return realActor;
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

  if (roleSetHasAdmin(realRoleSet) && !roleSetHasSuperAdmin(realRoleSet)) {
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
