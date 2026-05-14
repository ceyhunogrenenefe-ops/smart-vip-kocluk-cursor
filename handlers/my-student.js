import { requireAuth } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

/**
 * GET — Oturum açmış öğrencinin tam `students` satırı (panel / analitik tek kaynak).
 * JWT’de student_id boş kalsa bile enrichStudentActor doldurur.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    let actor = requireAuth(req);
    actor = await enrichStudentActor(actor);
    if (String(actor.role || '').toLowerCase() !== 'student') {
      return res.status(403).json({ error: 'forbidden' });
    }
    const sid = String(actor.student_id || '').trim();
    if (!sid) {
      return res.status(404).json({ error: 'student_profile_missing' });
    }
    const { data, error } = await supabaseAdmin.from('students').select('*').eq('id', sid).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Missing token' || msg === 'Invalid token') return res.status(401).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
}
