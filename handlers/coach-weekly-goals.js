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

function ymdMin(a, b) {
  return ymdCmp(a, b) <= 0 ? normalizeWeekStart(a) : normalizeWeekStart(b);
}

/**
 * Koç hedefi her zaman tek bir Pazartesi–Pazar haftasına sıkıştırılır.
 * Bitiş boşsa: min(başlangıç+6 gün, haftanın pazarı) — Cumartesi+6'nın sonraki haftaya taşması engellenir.
 */
function clampGoalDatesToWeek(weekStart, goalStartRaw, goalEndRaw) {
  const weekSunday = addCalendarDaysYmd(weekStart, 6);
  let gs = normalizeWeekStart(goalStartRaw) || weekStart;
  let ge = normalizeWeekStart(goalEndRaw);
  if (!ge) {
    ge = ymdMin(addCalendarDaysYmd(gs, 6), weekSunday);
  }
  if (ymdCmp(gs, weekStart) < 0) gs = weekStart;
  if (ymdCmp(gs, weekSunday) > 0) gs = weekSunday;
  if (ymdCmp(ge, weekStart) < 0) ge = weekStart;
  if (ymdCmp(ge, weekSunday) > 0) ge = weekSunday;
  if (ymdCmp(gs, ge) > 0) ge = gs;
  return { goalStart: gs, goalEnd: ge };
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
      const weekStart = normalizeWeekStart(req.query.week_start || '');
      const weekEnd = normalizeWeekStart(req.query.week_end || '') || addCalendarDaysYmd(weekStart, 6);
      if (!studentRaw) return res.status(400).json({ error: 'student_id_required' });
      if (!weekStart) return res.status(400).json({ error: 'week_start_required' });

      const gate = await assertCanReadStudentGoals(actor, studentRaw);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      const { data: legacy, error: e1 } = await supabaseAdmin
        .from('coach_weekly_goals')
        .select('*')
        .eq('student_id', studentRaw)
        .eq('week_start_date', weekStart)
        .order('created_at', { ascending: true });
      if (e1) throw e1;

      const { data: ranged, error: e2 } = await supabaseAdmin
        .from('coach_weekly_goals')
        .select('*')
        .eq('student_id', studentRaw)
        .eq('week_start_date', weekStart)
        .not('goal_start_date', 'is', null)
        .not('goal_end_date', 'is', null)
        .lte('goal_start_date', weekEnd)
        .gte('goal_end_date', weekStart)
        .order('created_at', { ascending: true });
      if (e2) throw e2;

      const map = new Map();
      for (const r of [...(legacy || []), ...(ranged || [])]) map.set(r.id, r);
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
      const clamped = clampGoalDatesToWeek(weekStart, goalStart, goalEnd);
      goalStart = clamped.goalStart;
      goalEnd = clamped.goalEnd;

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

      const ws = normalizeWeekStart(existing.week_start_date);
      if (ws && (patch.goal_start_date != null || patch.goal_end_date != null)) {
        const nextGs =
          patch.goal_start_date != null
            ? patch.goal_start_date
            : existing.goal_start_date || existing.week_start_date;
        const nextGe =
          patch.goal_end_date != null ? patch.goal_end_date : existing.goal_end_date;
        const c = clampGoalDatesToWeek(ws, nextGs, nextGe);
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
