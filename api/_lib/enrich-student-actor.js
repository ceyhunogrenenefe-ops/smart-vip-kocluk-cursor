import { supabaseAdmin } from './supabase-admin.js';
import { resolveStudentRowForUser } from './resolve-student-id.js';

/**
 * auth-login ile aynı: coaches satırı e-posta ile bulunur (JWT’de coach_id boş kalmış olabilir).
 */
async function resolveCoachIdByUserSub(sub) {
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
export async function enrichStudentActor(actor) {
  if (!actor) return actor;

  if (actor.role === 'student') {
    const sub = actor.sub;
    if (!sub || sub === 'anonymous') return actor;

    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('email, institution_id')
      .eq('id', sub)
      .maybeSingle();

    const resolved = await resolveStudentRowForUser({
      userId: sub,
      email: userRow?.email,
      institutionId: userRow?.institution_id ?? actor.institution_id ?? null
    });

    /** JWT’deki student_id eski/yanlış olabilir (aynı e-posta başka kurum); her istekte canonical eşleşmeyi zorunlu kıl */
    if (resolved?.id && resolved.id !== actor.student_id) {
      return { ...actor, student_id: resolved.id };
    }
    if (!actor.student_id && resolved?.id) {
      return { ...actor, student_id: resolved.id };
    }
  }

  /**
   * Koç ve öğretmen: JWT'de coach_id boşsa coaches tablosundan e-posta/id ile tamamla (auth-login ile uyumlu).
   * Öğretmen+koç hesaplarında JWT bazen coach_id taşımıyor; coach-whatsapp-schedule vb. 403 vermesin.
   */
  if ((actor.role === 'coach' || actor.role === 'teacher') && !actor.coach_id) {
    const cid = await resolveCoachIdByUserSub(actor.sub);
    if (cid) return { ...actor, coach_id: cid };
  }

  return actor;
}
