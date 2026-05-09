import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const padDate = (v) => String(v || '').trim().slice(0, 10);

const toMinutes = (t) => {
  const s = String(t || '').trim();
  const [h, m] = s.split(':').map((x) => parseInt(String(x || '0'), 10));
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
};

/** Overlap inclusive intervals [start, end] in minutes — both ends inclusive for whole-hour UX */
function timeRangesOverlap(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}

const fetchStudentMinimal = async (studentId) => {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id,coach_id,institution_id')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const assertCanReadPlanner = async (actor, studentId) => {
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

const assertStudentMutate = async (actor, studentId) => {
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

async function findOverlapConflict(studentId, plannerDate, startTime, endTime, excludeId) {
  const a1 = toMinutes(startTime);
  const b1 = toMinutes(endTime);
  if (a1 == null || b1 == null) return null;
  if (b1 <= a1) return { error: 'invalid_time_range' };

  const { data, error } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('id,start_time,end_time')
    .eq('student_id', studentId)
    .eq('planner_date', plannerDate);
  if (error) throw error;
  for (const row of data || []) {
    if (excludeId && row.id === excludeId) continue;
    const ca = toMinutes(row.start_time);
    const cb = toMinutes(row.end_time);
    if (ca == null || cb == null) continue;
    if (cb <= ca) continue;
    if (timeRangesOverlap(a1, b1, ca, cb)) return { conflictingId: row.id };
  }
  return null;
}

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

      const gate = await assertCanReadPlanner(actor, studentRaw);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      let q = supabaseAdmin
        .from('weekly_planner_entries')
        .select('*')
        .eq('student_id', studentRaw)
        .gte('planner_date', from)
        .lte('planner_date', to)
        .order('planner_date', { ascending: true })
        .order('start_time', { ascending: true });
      const { data, error } = await q;
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

      const mutate = await assertStudentMutate(actor, sid);
      if (!mutate.ok) return res.status(mutate.status).json({ error: 'forbidden' });

      const plannerDate = padDate(body.planner_date ?? body.plannerDate ?? body.date);
      const startTime = String(body.start_time ?? body.startTime ?? '').trim();
      const endTime = String(body.end_time ?? body.endTime ?? '').trim();
      const subject = String(body.subject ?? '').trim();
      const title =
        String(body.title ?? '').trim() ||
        (subject ? `${subject} çalışması` : 'Görev');
      const plannedQty = Number(body.planned_quantity ?? body.plannedQuantity ?? 0);
      const completedQty = Number(body.completed_quantity ?? body.completedQuantity ?? 0);
      let status = String(body.status || 'planned');
      const coachGoalId = body.coach_goal_id || body.coachGoalId || null;

      const allowedStatus = ['planned', 'completed', 'partial', 'missed'];
      if (!allowedStatus.includes(status)) status = 'planned';

      if (!plannerDate || !startTime || !endTime) return res.status(400).json({ error: 'date_time_required' });

      const clash = await findOverlapConflict(sid, plannerDate, startTime, endTime, null);
      if (clash?.error) return res.status(400).json({ error: clash.error });
      if (clash?.conflictingId) return res.status(409).json({ error: 'time_conflict', conflicting_id: clash.conflictingId });

      const institutionId =
        body.institution_id ?? mutate.student?.institution_id ?? actor.institution_id ?? null;

      const id =
        body.id && String(body.id).trim()
          ? String(body.id).trim()
          : `wpe-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const now = new Date().toISOString();

      const row = {
        id,
        student_id: sid,
        institution_id: institutionId,
        coach_goal_id: coachGoalId,
        subject,
        title,
        planned_quantity: Number.isFinite(plannedQty) && plannedQty >= 0 ? plannedQty : 0,
        completed_quantity: Number.isFinite(completedQty) && completedQty >= 0 ? completedQty : 0,
        planner_date: plannerDate,
        start_time: startTime,
        end_time: endTime,
        status,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabaseAdmin.from('weekly_planner_entries').insert(row).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from('weekly_planner_entries')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const mutate = await assertStudentMutate(actor, existing.student_id);
      if (!mutate.ok) return res.status(mutate.status).json({ error: 'forbidden' });

      const merged = {
        planner_date: padDate(existing.planner_date),
        start_time: existing.start_time,
        end_time: existing.end_time,
        ...(req.body || {}),
      };
      const nextDate =
        merged.planner_date ??
        merged.plannerDate ??
        merged.date ??
        padDate(existing.planner_date);
      const nextStart = String(
        merged.start_time ?? merged.startTime ?? existing.start_time
      ).trim();
      const nextEnd = String(
        merged.end_time ?? merged.endTime ?? existing.end_time
      ).trim();

      const clash = await findOverlapConflict(existing.student_id, nextDate, nextStart, nextEnd, id);
      if (clash?.error) return res.status(400).json({ error: clash.error });
      if (clash?.conflictingId) return res.status(409).json({ error: 'time_conflict', conflicting_id: clash.conflictingId });

      const patch = { ...(req.body || {}), updated_at: new Date().toISOString() };
      if (merged.plannerDate !== undefined || merged.planner_date !== undefined || merged.date !== undefined) {
        patch.planner_date = nextDate;
        delete patch.date;
        delete patch.plannerDate;
      }
      delete patch.student_id;
      delete patch.created_at;

      const { data, error } = await supabaseAdmin
        .from('weekly_planner_entries')
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
        .from('weekly_planner_entries')
        .select('id,student_id')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const mutate = await assertStudentMutate(actor, existing.student_id);
      if (!mutate.ok) return res.status(mutate.status).json({ error: 'forbidden' });

      const { error } = await supabaseAdmin.from('weekly_planner_entries').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[weekly-planner-entries]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
