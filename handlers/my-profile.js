import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const uid = String(actor.sub || '').trim();
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const { data: user, error: uErr } = await supabaseAdmin
      .from('users')
      .select('id, name, email, phone, role, roles, institution_id, package, start_date, end_date')
      .eq('id', uid)
      .maybeSingle();
    if (uErr) throw uErr;
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const student = await resolveStudentRowForUser({
      userId: uid,
      email: user.email,
      institutionId: actor.institution_id ?? user.institution_id
    });

    let coach = null;
    if (actor.coach_id) {
      const { data: c } = await supabaseAdmin
        .from('coaches')
        .select('id, name, email, phone, institution_id')
        .eq('id', actor.coach_id)
        .maybeSingle();
      coach = c;
    } else if (user.email) {
      const em = String(user.email).trim().toLowerCase();
      const { data: c } = await supabaseAdmin
        .from('coaches')
        .select('id, name, email, phone, institution_id')
        .eq('email', em)
        .maybeSingle();
      coach = c;
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        user,
        student: student || null,
        coach: coach || null
      });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const userPatch = {};
      if (body.name != null) userPatch.name = String(body.name).trim();
      if (body.phone != null) userPatch.phone = String(body.phone).trim();
      if (body.email != null) {
        const em = String(body.email).trim().toLowerCase();
        if (em) userPatch.email = em;
      }
      if (body.password != null && String(body.password).length >= 6) {
        userPatch.password_hash = String(body.password);
      }

      if (!Object.keys(userPatch).length) {
        return res.status(400).json({ error: 'no_fields' });
      }

      userPatch.updated_at = new Date().toISOString();
      const { data: updatedUser, error: upErr } = await supabaseAdmin
        .from('users')
        .update(userPatch)
        .eq('id', uid)
        .select('id, name, email, phone, role, roles, institution_id')
        .single();
      if (upErr) throw upErr;

      let updatedStudent = student;
      if (student?.id && (userPatch.name || userPatch.email || userPatch.phone)) {
        const sp = { updated_at: new Date().toISOString() };
        if (userPatch.name) sp.name = userPatch.name;
        if (userPatch.email) sp.email = userPatch.email;
        if (userPatch.phone) sp.phone = userPatch.phone;
        const { data: st } = await supabaseAdmin
          .from('students')
          .update(sp)
          .eq('id', student.id)
          .select('id, name, email, phone')
          .maybeSingle();
        updatedStudent = st || student;
      }

      let updatedCoach = coach;
      if (coach?.id && (userPatch.name || userPatch.email || userPatch.phone)) {
        const cp = { updated_at: new Date().toISOString() };
        if (userPatch.name) cp.name = userPatch.name;
        if (userPatch.email) cp.email = userPatch.email;
        if (userPatch.phone) cp.phone = userPatch.phone;
        const { data: ch } = await supabaseAdmin
          .from('coaches')
          .update(cp)
          .eq('id', coach.id)
          .select('id, name, email, phone')
          .maybeSingle();
        updatedCoach = ch || coach;
      }

      return res.status(200).json({
        ok: true,
        user: updatedUser,
        student: updatedStudent,
        coach: updatedCoach
      });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg === 'Missing token' || msg === 'Token expired' || msg === 'Invalid token') {
      return res.status(401).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
}
