import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';

/**
 * GET — Oturum açmış kullanıcının kendi `students` satırı (panel / analitik).
 * Bazı hesaplarda JWT `role` alanı `student` dışında veya eksik kalabiliyor; bu yüzden
 * yetkilendirme yalnızca rol string'ine değil, `students.user_id` / `platform_user_id` /
 * kullanıcı e-postası ile sahiplik doğrulamasına dayanır.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    let actor = requireAuthenticatedActor(req);
    actor = await enrichStudentActor(actor);

    const uid = String(actor.sub || '').trim();
    if (!uid || uid === 'anonymous') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { data: urow } = await supabaseAdmin
      .from('users')
      .select('email, institution_id')
      .eq('id', uid)
      .maybeSingle();

    const userEmail = String(urow?.email || '').trim().toLowerCase();
    const inst = actor.institution_id ?? urow?.institution_id ?? null;

    let sid = String(actor.student_id || '').trim();
    if (!sid) {
      const resolved = await resolveStudentRowForUser({
        userId: uid,
        email: userEmail || undefined,
        institutionId: inst
      });
      if (resolved?.id) sid = String(resolved.id).trim();
    }

    if (!sid) {
      return res.status(404).json({ error: 'student_profile_missing' });
    }

    const { data, error } = await supabaseAdmin.from('students').select('*').eq('id', sid).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found' });

    const rowUser = data.user_id != null ? String(data.user_id).trim() : '';
    const rowPlat = data.platform_user_id != null ? String(data.platform_user_id).trim() : '';
    const rowEmail = String(data.email || '').trim().toLowerCase();

    const linkedByFk = (rowUser && rowUser === uid) || (rowPlat && rowPlat === uid);
    const linkedByEmail =
      Boolean(userEmail) && Boolean(rowEmail) && rowEmail === userEmail && !rowUser && !rowPlat;

    if (!linkedByFk && !linkedByEmail) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.status(200).json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg === 'Missing token' ||
      msg === 'Invalid token' ||
      msg === 'Invalid signature' ||
      msg === 'Token expired'
    ) {
      return res.status(401).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
}
