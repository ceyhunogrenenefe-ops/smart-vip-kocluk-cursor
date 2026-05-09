import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const padDate = (v) => String(v || '').trim().slice(0, 10);

const fetchStudentMinimal = async (studentId) => {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id,coach_id,institution_id')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const assertRead = async (actor, studentId) => {
  const st = await fetchStudentMinimal(studentId);
  if (!st) return { ok: false, status: 404, student: null };
  if (actor.role === 'super_admin') return { ok: true, student: st };
  if (actor.role === 'admin') {
    if (!hasInstitutionAccess(actor, st.institution_id)) return { ok: false, status: 403, student: st };
    return { ok: true, student: st };
  }
  if (actor.role === 'coach') {
    if (!actor.coach_id || st.coach_id !== actor.coach_id) return { ok: false, status: 403, student: st };
    return { ok: true, student: st };
  }
  if (actor.role === 'student' && actor.student_id === studentId) return { ok: true, student: st };
  return { ok: false, status: 403, student: st };
};

const assertStudentWrite = async (actor, studentId) => {
  if (actor.role === 'super_admin' || actor.role === 'admin') {
    const st = await fetchStudentMinimal(studentId);
    if (!st) return { ok: false, status: 404, student: st };
    if (actor.role === 'admin' && !hasInstitutionAccess(actor, st.institution_id))
      return { ok: false, status: 403, student: st };
    return { ok: true, student: st };
  }
  if (actor.role === 'student') {
    if (!actor.student_id || actor.student_id !== studentId) return { ok: false, status: 403, student: null };
    const st = await fetchStudentMinimal(studentId);
    if (!st) return { ok: false, status: 404, student: null };
    return { ok: true, student: st };
  }
  return { ok: false, status: 403, student: null };
};

export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);

    if (req.method === 'GET') {
      const studentRaw =
        actor.role === 'student' ? String(actor.student_id || '') : String(req.query.student_id || '').trim();
      const from = padDate(req.query.from);
      const to = padDate(req.query.to);
      if (!studentRaw) return res.status(400).json({ error: 'student_id_required' });
      if (!from || !to) return res.status(400).json({ error: 'from_to_required' });

      const gate = await assertRead(actor, studentRaw);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      const { data, error } = await supabaseAdmin
        .from('student_screen_time_logs')
        .select('*')
        .eq('student_id', studentRaw)
        .gte('log_date', from)
        .lte('log_date', to)
        .order('log_date', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const sid =
        actor.role === 'student'
          ? String(actor.student_id || '')
          : String(body.student_id || body.studentId || '').trim();
      if (!sid) return res.status(400).json({ error: 'student_id_required' });

      const gate = await assertStudentWrite(actor, sid);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      const logDate = padDate(body.log_date ?? body.logDate);
      if (!logDate) return res.status(400).json({ error: 'log_date_required' });

      let mins = Number(body.screen_minutes ?? body.screenMinutes ?? 0);
      if (!Number.isFinite(mins)) mins = 0;
      mins = Math.max(0, Math.min(1440, Math.floor(mins)));

      const institutionId = body.institution_id ?? gate.student?.institution_id ?? actor.institution_id ?? null;
      const notes = body.notes != null ? String(body.notes).slice(0, 500) : null;

      const id =
        body.id && String(body.id).trim()
          ? String(body.id).trim()
          : `sst-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const now = new Date().toISOString();

      const row = {
        id,
        student_id: sid,
        institution_id: institutionId,
        log_date: logDate,
        screen_minutes: mins,
        notes,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabaseAdmin
        .from('student_screen_time_logs')
        .upsert(row, { onConflict: 'student_id,log_date' })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from('student_screen_time_logs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const gate = await assertStudentWrite(actor, existing.student_id);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      const patch = { updated_at: new Date().toISOString() };
      const b = req.body || {};
      if (b.screen_minutes !== undefined || b.screenMinutes !== undefined) {
        let m = Number(b.screen_minutes ?? b.screenMinutes);
        if (!Number.isFinite(m)) m = 0;
        patch.screen_minutes = Math.max(0, Math.min(1440, Math.floor(m)));
      }
      if (typeof b.notes === 'string') patch.notes = b.notes.slice(0, 500);

      const { data, error } = await supabaseAdmin
        .from('student_screen_time_logs')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from('student_screen_time_logs')
        .select('id,student_id')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const gate = await assertStudentWrite(actor, existing.student_id);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      const { error } = await supabaseAdmin.from('student_screen_time_logs').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[student-screen-time]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
