import { supabaseAdmin } from './supabase-admin.js';
import { ensureStudentProfileForActor } from './ensure-student-profile.js';

/**
 * auth-login ile aynı: coaches satırı e-posta ile bulunur (JWT’de coach_id boş kalmış olabilir).
 */
export async function resolveCoachIdByUserSub(sub) {
  if (!sub || sub === 'anonymous') return null;
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', sub)
    .maybeSingle();
  const email = userRow?.email;
  if (!email) return null;
  const normalizedEmail = String(email).toLowerCase().trim();

  let { data: co } = await supabaseAdmin
    .from('coaches')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (!co?.id) {
    ({ data: co } = await supabaseAdmin
      .from('coaches')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle());
  }
  if (!co?.id) {
    const { data: byId } = await supabaseAdmin.from('coaches').select('id').eq('id', sub).maybeSingle();
    if (byId?.id) return byId.id;
  }
  return co?.id ?? null;
}

/**
 * JWT'de student_id / coach_id boşsa Supabase ile tamamlar (login ile aynı eşleme kuralları).
 */
async function enrichActorInstitutionFromDb(actor) {
  if (actor.institution_id || !actor.sub || actor.sub === 'anonymous') return actor;

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('institution_id')
    .eq('id', actor.sub)
    .maybeSingle();
  if (userRow?.institution_id) {
    return { ...actor, institution_id: userRow.institution_id };
  }

  if (actor.role === 'coach' || actor.role === 'teacher') {
    const cid = actor.coach_id || (await resolveCoachIdByUserSub(actor.sub));
    if (cid) {
      const { data: co } = await supabaseAdmin
        .from('coaches')
        .select('institution_id')
        .eq('id', cid)
        .maybeSingle();
      if (co?.institution_id) {
        return { ...actor, coach_id: cid, institution_id: co.institution_id };
      }
      if (!actor.coach_id) return { ...actor, coach_id: cid };
    }
  }

  return actor;
}

export async function enrichStudentActor(actor) {
  if (!actor) return actor;

  const sub = actor.sub;
  if (!sub || sub === 'anonymous') return actor;

  const ensured = await ensureStudentProfileForActor(actor);
  if (ensured.hasStudentId) return enrichActorInstitutionFromDb(ensured.actor);

  let next = ensured.actor;
  if ((next.role === 'coach' || next.role === 'teacher') && !next.coach_id) {
    const cid = await resolveCoachIdByUserSub(next.sub);
    if (cid) next = { ...next, coach_id: cid };
  }

  return enrichActorInstitutionFromDb(next);
}

/** Soru Sor API — öğrenci mi ve students.id bağlı mı */
export async function actorIsStudentWithProfile(actor) {
  return ensureStudentProfileForActor(actor);
}
