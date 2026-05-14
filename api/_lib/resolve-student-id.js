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

      /** sync_supabase_auth ile doldurulan auth.users.id — JWT sub ile aynı olabiliyor */
      const rAuth = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (!rAuth.error && rAuth.data?.id) return rAuth.data;
    }

    if (normalizedEmail) {
      let q = supabaseAdmin
        .from('students')
        .select('id, user_id, platform_user_id, updated_at')
        .eq('email', normalizedEmail)
        .order('updated_at', { ascending: false });
      if (institutionId) q = q.eq('institution_id', institutionId);
      let { data: rows } = await q;

      /**
       * Kullanıcıda institution_id dolu, öğrenci kartında null/başka kurum ise
       * kurumlu sorgu boş döner → GET /api/my-student 404 (student_profile_missing).
       * FK (user_id / platform_user_id) yoksa yine de aynı e-posta ile kartı bul.
       */
      if ((!rows || rows.length === 0) && institutionId) {
        const q2 = supabaseAdmin
          .from('students')
          .select('id, user_id, platform_user_id, updated_at')
          .eq('email', normalizedEmail)
          .order('updated_at', { ascending: false });
        ({ data: rows } = await q2);
      }

      if (rows?.length === 1 && rows[0]?.id) return { id: rows[0].id };

      if (rows && rows.length > 1) {
        if (userId) {
          const byUid = rows.find((r) => r.user_id && String(r.user_id) === String(userId));
          if (byUid?.id) return { id: byUid.id };
          const byPlat = rows.find(
            (r) => r.platform_user_id && String(r.platform_user_id) === String(userId)
          );
          if (byPlat?.id) return { id: byPlat.id };
        }
        const linked = rows.find((r) => r.user_id);
        if (linked?.id) return { id: linked.id };
        if (rows[0]?.id) return { id: rows[0].id };
      } else if (rows?.[0]?.id) {
        return { id: rows[0].id };
      }

      /**
       * Kurum filtresi verildiyse başka kurumdaki aynı e-postayı dönme.
       * Kurum yoksa (eski veri): gevşek e-posta ile tek kayıt aranır.
       */
      if (!institutionId) {
        const { data: rowLoose } = await supabaseAdmin
          .from('students')
          .select('id')
          .ilike('email', normalizedEmail)
          .maybeSingle();
        if (rowLoose?.id) return rowLoose;
      }
    }

    if (userId && normalizedEmail && !institutionId) {
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
