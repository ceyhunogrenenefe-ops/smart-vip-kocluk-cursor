import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { ensureStudentProfileForActor } from '../api/_lib/ensure-student-profile.js';
import { claimStudentForUser } from '../api/_lib/link-student-user.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

async function loadUserRow(uid) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('email, institution_id, role, name')
    .eq('id', uid)
    .maybeSingle();
  return data || null;
}

function isStudentActor(actor, urow, roleTags) {
  const dbRole = String(urow?.role || '').trim().toLowerCase();
  return (
    roleTags.includes('student') ||
    dbRole === 'student' ||
    String(actor.role || '').trim().toLowerCase() === 'student'
  );
}

async function respondWithStudentProfile(res, actor, uid, userEmail) {
  const ensured = await ensureStudentProfileForActor(actor);
  const studentId = ensured.studentId ? String(ensured.studentId).trim() : '';
  if (!studentId) {
    return res.status(200).json({
      data: null,
      reason: 'not_found',
      hint:
        'Öğrenci kartı oluşturulamadı. Çıkış yapıp tekrar giriş yapın; sorun sürerse kurum yöneticinize başvurun.'
    });
  }

  const { data: row, error } = await supabaseAdmin
    .from('students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  if (!row) {
    return res.status(200).json({ data: null, reason: 'not_found' });
  }

  const linked = await claimStudentForUser(row, uid, userEmail, true);
  return res.status(200).json({ data: linked, student_id: String(linked.id) });
}

/**
 * GET / POST — Oturum açmış öğrencinin kendi `students` satırı.
 * POST: profil yoksa oluştur / bağla (idempotent).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    let actor = requireAuthenticatedActor(req);
    actor = await enrichStudentActor(actor);

    const uid = String(actor.sub || '').trim();
    if (!uid || uid === 'anonymous') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const urow = await loadUserRow(uid);
    const userEmail = String(urow?.email || '').trim().toLowerCase();
    const roleTags = await normalizedUserRolesFromDb(uid);
    const studentActor = isStudentActor(actor, urow, roleTags);

    if (studentActor) {
      return respondWithStudentProfile(res, actor, uid, userEmail);
    }

    return res.status(200).json({ data: null, reason: 'student_profile_missing' });
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
