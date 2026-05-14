import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { addCalendarDaysYmd } from '../api/_lib/istanbul-time.js';

const normalizeWeekStart = (v) => String(v || '').trim().slice(0, 10);

function ymdCmp(a, b) {
  const x = normalizeWeekStart(a);
  const y = normalizeWeekStart(b);
  if (!x || !y) return 0;
  return x.localeCompare(y);
}

/**
 * Koç hedef tarih aralığını doğrular: boş bitiş → tek gün (başlangıç);
 * başlangıç/bitiş ters ise yer değiştirir. Hafta sınırına sıkıştırma yok.
 */
function normalizeGoalDateRange(goalStartRaw, goalEndRaw, fallbackStart) {
  const fb = normalizeWeekStart(fallbackStart) || normalizeWeekStart(goalStartRaw);
  let gs = normalizeWeekStart(goalStartRaw) || fb;
  let ge = normalizeWeekStart(goalEndRaw);
  if (!ge) ge = gs;
  if (ymdCmp(gs, ge) > 0) {
    const t = gs;
    gs = ge;
    ge = t;
  }
  return { goalStart: gs, goalEnd: ge };
}

/** İki YYYY-MM-DD arasındaki tam gün farkı (İstanbul öğlen) */
function ymdCalendarDayDiff(fromYmd, toYmd) {
  const a = new Date(`${normalizeWeekStart(fromYmd)}T12:00:00+03:00`).getTime();
  const b = new Date(`${normalizeWeekStart(toYmd)}T12:00:00+03:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
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

const assertCanReadStudentGoals = async (actor, studentId) => {
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

const assertCoachOrAdminGoalsWrite = async (actor, studentId) => {
  const chk = await assertCanReadStudentGoals(actor, studentId);
  if (!chk.ok || !chk.student) return chk;
  if (actor.role === 'coach' || actor.role === 'admin' || actor.role === 'super_admin') return chk;
  return { ok: false, status: 403, student: chk.student };
};

export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);

    if (req.method === 'GET') {
      const studentRaw =
        actor.role === 'student' ? String(actor.student_id || '') : String(req.query.student_id || '').trim();
      if (!studentRaw) return res.status(400).json({ error: 'student_id_required' });

      /** Analiz / rapor: `week_start` yerine tarih aralığı (YYYY-MM-DD) */
      const rangeFrom = normalizeWeekStart(req.query.range_from || '');
      const rangeTo = normalizeWeekStart(req.query.range_to || '');
      if (rangeFrom && rangeTo) {
        if (ymdCmp(rangeFrom, rangeTo) > 0) {
          return res.status(400).json({ error: 'invalid_date_range' });
        }
        const gate = await assertCanReadStudentGoals(actor, studentRaw);
        if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

        const { data: overlap, error: e1 } = await supabaseAdmin
          .from('coach_weekly_goals')
          .select('*')
          .eq('student_id', studentRaw)
          .not('goal_start_date', 'is', null)
          .not('goal_end_date', 'is', null)
          .lte('goal_start_date', rangeTo)
          .gte('goal_end_date', rangeFrom)
          .order('created_at', { ascending: true });
        if (e1) throw e1;

        const { data: legacyOpen, error: e2 } = await supabaseAdmin
          .from('coach_weekly_goals')
          .select('*')
          .eq('student_id', studentRaw)
          .or('goal_start_date.is.null,goal_end_date.is.null')
          .order('created_at', { ascending: true });
        if (e2) throw e2;

        const legacyFiltered = (legacyOpen || []).filter((row) => {
          const ws = normalizeWeekStart(row.week_start_date);
          if (!ws) return false;
          const we = addCalendarDaysYmd(ws, 6);
          return ws <= rangeTo && we >= rangeFrom;
        });

        const map = new Map();
        for (const r of [...(overlap || []), ...legacyFiltered]) map.set(r.id, r);
        return res.status(200).json({
          data: [...map.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        });
      }

      const weekStart = normalizeWeekStart(req.query.week_start || '');
      const weekEnd = normalizeWeekStart(req.query.week_end || '') || addCalendarDaysYmd(weekStart, 6);
      if (!weekStart) return res.status(400).json({ error: 'week_start_required' });

      const gate = await assertCanReadStudentGoals(actor, studentRaw);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      const { data: overlap, error: e1 } = await supabaseAdmin
        .from('coach_weekly_goals')
        .select('*')
        .eq('student_id', studentRaw)
        .not('goal_start_date', 'is', null)
        .not('goal_end_date', 'is', null)
        .lte('goal_start_date', weekEnd)
        .gte('goal_end_date', weekStart)
        .order('created_at', { ascending: true });
      if (e1) throw e1;

      const { data: legacyOpen, error: e2 } = await supabaseAdmin
        .from('coach_weekly_goals')
        .select('*')
        .eq('student_id', studentRaw)
        .eq('week_start_date', weekStart)
        .or('goal_start_date.is.null,goal_end_date.is.null')
        .order('created_at', { ascending: true });
      if (e2) throw e2;

      const map = new Map();
      for (const r of [...(overlap || []), ...(legacyOpen || [])]) map.set(r.id, r);
      return res.status(200).json({ data: [...map.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const sid = String(body.student_id || body.studentId || '').trim();
      if (!sid) return res.status(400).json({ error: 'student_id_required' });
      const weekStart = normalizeWeekStart(body.week_start_date || body.weekStartDate);
      if (!weekStart) return res.status(400).json({ error: 'week_start_required' });
      let goalStart = normalizeWeekStart(body.goal_start_date || body.goalStartDate);
      let goalEnd = normalizeWeekStart(body.goal_end_date || body.goalEndDate);
      if (!goalStart) goalStart = weekStart;
      const norm = normalizeGoalDateRange(goalStart, goalEnd, weekStart);
      goalStart = norm.goalStart;
      goalEnd = norm.goalEnd;

      const gate = await assertCoachOrAdminGoalsWrite(actor, sid);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });
      const st = gate.student;

      const subject = String(body.subject ?? '').trim();
      const title = String(body.title ?? subject ?? 'Hedef').trim() || 'Hedef';
      const targetQty = Number(body.target_quantity ?? body.targetQuantity ?? 0);
      const quantityUnit = String(body.quantity_unit || body.quantityUnit || 'soru').trim().slice(0, 40);

      const id =
        body.id && String(body.id).trim()
          ? String(body.id).trim()
          : `cwg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      const coachId =
        actor.role === 'coach' ? actor.coach_id : body.coach_id != null ? body.coach_id : st.coach_id;
      const institutionId = body.institution_id ?? st.institution_id ?? actor.institution_id ?? null;

      const now = new Date().toISOString();
      const row = {
        id,
        student_id: sid,
        coach_id: coachId ?? null,
        institution_id: institutionId,
        subject,
        title,
        target_quantity: Number.isFinite(targetQty) && targetQty >= 0 ? targetQty : 0,
        week_start_date: weekStart,
        goal_start_date: goalStart,
        goal_end_date: goalEnd,
        quantity_unit: quantityUnit || 'soru',
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabaseAdmin.from('coach_weekly_goals').insert(row).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from('coach_weekly_goals')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const gate = await assertCoachOrAdminGoalsWrite(actor, existing.student_id);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      const patch = { ...(req.body || {}), updated_at: new Date().toISOString() };
      delete patch.id;
      delete patch.student_id;
      delete patch.created_at;
      delete patch.weekStartDate;

      const ws = normalizeWeekStart(existing.week_start_date);
      const newWsRequested =
        patch.week_start_date != null ? normalizeWeekStart(patch.week_start_date) : null;

      let plannerShiftDays = 0;

      if (newWsRequested && ws && newWsRequested !== ws) {
        plannerShiftDays = ymdCalendarDayDiff(ws, newWsRequested);
        const d = plannerShiftDays;
        let gs = normalizeWeekStart(existing.goal_start_date) || ws;
        let ge = normalizeWeekStart(existing.goal_end_date);
        if (!ge) ge = addCalendarDaysYmd(ws, 6);
        gs = addCalendarDaysYmd(gs, d);
        ge = addCalendarDaysYmd(ge, d);
        patch.week_start_date = newWsRequested;
        const c = normalizeGoalDateRange(gs, ge, newWsRequested);
        patch.goal_start_date = c.goalStart;
        patch.goal_end_date = c.goalEnd;
      } else if (ws && (patch.goal_start_date != null || patch.goal_end_date != null)) {
        const nextGs =
          patch.goal_start_date != null
            ? patch.goal_start_date
            : existing.goal_start_date || existing.week_start_date;
        const nextGe =
          patch.goal_end_date != null ? patch.goal_end_date : existing.goal_end_date;
        const c = normalizeGoalDateRange(nextGs, nextGe, ws);
        patch.goal_start_date = c.goalStart;
        patch.goal_end_date = c.goalEnd;
      }

      const { data, error } = await supabaseAdmin
        .from('coach_weekly_goals')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      if (plannerShiftDays !== 0) {
        const { data: planRows, error: peErr } = await supabaseAdmin
          .from('weekly_planner_entries')
          .select('id,planner_date')
          .eq('student_id', existing.student_id)
          .eq('coach_goal_id', id);
        if (!peErr && Array.isArray(planRows) && planRows.length) {
          const nowIso = new Date().toISOString();
          for (const row of planRows) {
            const nd = addCalendarDaysYmd(row.planner_date, plannerShiftDays);
            await supabaseAdmin
              .from('weekly_planner_entries')
              .update({ planner_date: nd, updated_at: nowIso })
              .eq('id', row.id);
          }
        }
      }

      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from('coach_weekly_goals')
        .select('id,student_id')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const gate = await assertCoachOrAdminGoalsWrite(actor, existing.student_id);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      const { error } = await supabaseAdmin.from('coach_weekly_goals').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[coach-weekly-goals]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
