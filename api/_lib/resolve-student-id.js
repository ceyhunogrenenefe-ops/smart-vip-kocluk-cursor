import { supabaseAdmin } from './supabase-admin.js';

/**
 * users.id / e-posta / kurum ile students satırını bulur.
 */
export async function resolveStudentRowForUser({ userId, email, institutionId }) {
  const normalizedEmail =
    typeof email === 'string' ? email.trim().toLowerCase() : '';
  try {
    if (userId) {
      const { data: byUserFk } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (byUserFk?.id) return byUserFk;

      const { data: byPlatform } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('platform_user_id', userId)
        .maybeSingle();
      if (byPlatform?.id) return byPlatform;
    }

    if (normalizedEmail) {
      let q = supabaseAdmin.from('students').select('id').eq('email', normalizedEmail);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data: row } = await q.maybeSingle();
      if (row?.id) return row;

      const { data: rowLoose } = await supabaseAdmin
        .from('students')
        .select('id')
        .ilike('email', normalizedEmail)
        .maybeSingle();
      if (rowLoose?.id) return rowLoose;
    }

    if (userId && normalizedEmail) {
      const { data: byEmailNoInst } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (byEmailNoInst?.id) return byEmailNoInst;
    }
  } catch {
    /* yoksay */
  }
  return null;
}
