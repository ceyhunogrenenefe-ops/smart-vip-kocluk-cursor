import { hasInstitutionAccess } from './auth.js';
import { enrichStudentActor, resolveCoachIdByUserSub } from './enrich-student-actor.js';
import { actorRoleSet, roleSetHasAdmin, roleSetHasSuperAdmin } from './actor-roles.js';
import { getTeacherPanelStudentScope } from './teacher-class-scope.js';
import { supabaseAdmin } from './supabase-admin.js';

async function fetchStudentMinimal(studentId) {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id,coach_id,institution_id')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** JWT coach_id / institution_id tamamlanır; roles[] birleştirilir */
export async function buildAccessContext(actor) {
  let enriched = await enrichStudentActor(actor);
  let roleSet = await actorRoleSet(enriched);
  if ((roleSet.has('coach') || roleSet.has('teacher')) && !enriched.coach_id && enriched.sub) {
    const cid = await resolveCoachIdByUserSub(enriched.sub);
    if (cid) {
      enriched = { ...enriched, coach_id: cid };
      roleSet = await actorRoleSet(enriched);
    }
  }
  return { actor: enriched, roleSet };
}

function forbidden(student = null) {
  return { ok: false, status: 403, student };
}

function notFound() {
  return { ok: false, status: 404, student: null };
}

function allowed(student) {
  return { ok: true, student };
}

/**
 * Haftalık plan / koç hedefi okuma: süper admin, kurum admin, atanmış koç, öğrenci.
 * Koç+öğretmen çift rol: roles[] içinde coach varsa koç kapsamı uygulanır.
 */
export async function assertStudentPlannerRead(ctx, studentId) {
  const { actor, roleSet } = ctx;
  const sid = String(studentId || '').trim();
  if (!sid) return notFound();

  const st = await fetchStudentMinimal(sid);
  if (!st) return notFound();

  if (roleSetHasSuperAdmin(roleSet)) return allowed(st);

  if (roleSetHasAdmin(roleSet)) {
    if (!hasInstitutionAccess(actor, st.institution_id)) return forbidden(st);
    return allowed(st);
  }

  if (roleSet.has('coach')) {
    if (actor.coach_id && String(st.coach_id || '') === String(actor.coach_id)) {
      return allowed(st);
    }
  }

  if (roleSet.has('student') && String(actor.student_id || '') === sid) {
    return allowed(st);
  }

  return forbidden(st);
}

/** Haftalık plan yazma: okuma + öğrenci kendi planını düzenler */
export async function assertStudentPlannerWrite(ctx, studentId) {
  const read = await assertStudentPlannerRead(ctx, studentId);
  if (!read.ok) return read;

  const { actor, roleSet } = ctx;
  const sid = String(studentId || '').trim();

  if (roleSetHasSuperAdmin(roleSet)) return read;
  if (roleSetHasAdmin(roleSet)) return read;
  if (roleSet.has('coach') && actor.coach_id && String(read.student?.coach_id || '') === String(actor.coach_id)) {
    return read;
  }
  if (roleSet.has('student') && String(actor.student_id || '') === sid) {
    return read;
  }

  return forbidden(read.student);
}

/** Koç hedefi yazma: koç/admin/süper admin; öğrenci yalnızca koçsuz veya kendi hedefi */
export async function assertCoachGoalWrite(ctx, studentId, existingGoal = null) {
  const read = await assertStudentPlannerRead(ctx, studentId);
  if (!read.ok || !read.student) return read;

  const { actor, roleSet } = ctx;
  const sid = String(studentId || '').trim();

  if (roleSetHasSuperAdmin(roleSet) || roleSetHasAdmin(roleSet)) return read;
  if (roleSet.has('coach') && actor.coach_id && String(read.student.coach_id || '') === String(actor.coach_id)) {
    return read;
  }

  if (roleSet.has('student') && String(actor.student_id || '') === sid) {
    if (!read.student.coach_id) return read;
    if (existingGoal?.coach_id) return forbidden(read.student);
    return read;
  }

  return forbidden(read.student);
}

/** Toplu hedef listesi: koç kendi öğrencileri, admin kurum, süper admin filtre */
export async function resolveCoachBatchStudentIds(ctx, query = {}) {
  const { actor, roleSet } = ctx;
  const explicit = String(query.student_ids || query.studentIds || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (roleSetHasSuperAdmin(roleSet)) {
    return explicit;
  }

  if (roleSetHasAdmin(roleSet)) {
    if (!actor.institution_id) return [];
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('institution_id', actor.institution_id);
    if (error) throw error;
    const allowed = new Set((data || []).map((r) => String(r.id)));
    if (!explicit.length) return [...allowed];
    return explicit.filter((id) => allowed.has(id));
  }

  if (roleSet.has('coach')) {
    if (!actor.coach_id) return [];
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('coach_id', actor.coach_id);
    if (error) throw error;
    const allowed = new Set((data || []).map((r) => String(r.id)));
    if (!explicit.length) return [...allowed];
    return explicit.filter((id) => allowed.has(id));
  }

  return [];
}

export function actorIsStudentRole(roleSet) {
  return roleSet.has('student') && !roleSetHasSuperAdmin(roleSet) && !roleSetHasAdmin(roleSet) && !roleSet.has('coach');
}

/** Koç hedefi POST için coach_id: öğrenci→null, koç→actor.coach_id, admin→öğrencinin koçu */
export function resolveGoalCoachId(ctx, student, bodyCoachId) {
  const { actor, roleSet } = ctx;
  if (roleSet.has('student') && !roleSet.has('coach') && !roleSetHasAdmin(roleSet)) {
    return null;
  }
  if (roleSet.has('coach') && actor.coach_id) {
    return actor.coach_id;
  }
  if (bodyCoachId != null) return bodyCoachId;
  return student?.coach_id ?? null;
}
