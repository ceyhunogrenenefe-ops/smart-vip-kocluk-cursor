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
      .select('email, institution_id, role')
      .eq('id', uid)
      .maybeSingle();

    const userEmail = String(urow?.email || '').trim().toLowerCase();
    const inst = actor.institution_id ?? urow?.institution_id ?? null;
    const dbRole = String(urow?.role || '').trim().toLowerCase();
    const isStudentActor = dbRole === 'student' || String(actor.role || '').trim().toLowerCase() === 'student';

    const runResolve = () =>
      resolveStudentRowForUser({
        userId: uid,
        email: userEmail || undefined,
        institutionId: inst
      });

    const resolved = await runResolve();
    const resolvedId = resolved?.id ? String(resolved.id).trim() : '';
    const jwtSid = String(actor.student_id || '').trim();

    /** Önce çözümlenen kart (JWT’deki student_id silinmiş / yanlış id için yedek) */
    const candidates = [];
    if (resolvedId) candidates.push(resolvedId);
    if (jwtSid && jwtSid !== resolvedId) candidates.push(jwtSid);

    const isLinkedToActor = (row) => {
      const rowUser = row.user_id != null ? String(row.user_id).trim() : '';
      const rowPlat = row.platform_user_id != null ? String(row.platform_user_id).trim() : '';
      const rowAuth = row.auth_user_id != null ? String(row.auth_user_id).trim() : '';
      const rowEmail = String(row.email || '').trim().toLowerCase();
      const linkedByFk =
        (rowUser && rowUser === uid) ||
        (rowPlat && rowPlat === uid) ||
        (rowAuth && rowAuth === uid);
      const linkedByEmail =
        Boolean(userEmail) &&
        Boolean(rowEmail) &&
        rowEmail === userEmail &&
        !rowUser &&
        !rowPlat &&
        !rowAuth;
      /** users / JWT öğrenci + resolve ile bulunan kart (FK henüz yazılmamış olabilir) */
      const linkedByResolvedProfile =
        isStudentActor && Boolean(resolvedId) && String(row.id) === String(resolvedId);
      /** JWT student_id + aynı e-posta (eski token / geçici kart) */
      const linkedByJwtAndEmail =
        isStudentActor &&
        Boolean(jwtSid) &&
        String(row.id) === String(jwtSid) &&
        Boolean(userEmail) &&
        rowEmail === userEmail;
      return linkedByFk || linkedByEmail || linkedByResolvedProfile || linkedByJwtAndEmail;
    };

    let data = null;
    let sawRow = false;
    let sawUnlinked = false;
    for (const sid of candidates) {
      const { data: row, error } = await supabaseAdmin.from('students').select('*').eq('id', sid).maybeSingle();
      if (error) throw error;
      if (!row) continue;
      sawRow = true;
      if (isLinkedToActor(row)) {
        data = row;
        break;
      }
      sawUnlinked = true;
    }

    if (!data) {
      if (!candidates.length) {
        return res.status(404).json({ error: 'student_profile_missing' });
      }
      if (!sawUnlinked && !sawRow) {
        return res.status(404).json({ error: 'not_found' });
      }
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
