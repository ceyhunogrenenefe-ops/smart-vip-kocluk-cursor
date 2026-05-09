import { supabaseAdmin } from './supabase-admin.js';
import { findPlannerOverlapConflict } from './planner-slot-conflict.js';

function padPlannerHour(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

function padDate(v) {
  return String(v || '').trim().slice(0, 10);
}

/** Pazartesi hafta başı yyyy-mm-dd (yerel takvim) */
export function weekStartMondayYMD(dateStr) {
  const parts = padDate(dateStr).split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return padDate(dateStr);
  const dt = new Date(y, m, d);
  const dow = dt.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diff);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function normSubject(s) {
  return String(s ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

async function pickCoachGoalId(studentId, entryDate, subjectRaw) {
  const ws = weekStartMondayYMD(entryDate);
  const subj = normSubject(subjectRaw);
  if (!subj) return null;

  const { data: goals, error } = await supabaseAdmin
    .from('coach_weekly_goals')
    .select('id,subject,created_at')
    .eq('student_id', studentId)
    .eq('week_start_date', ws)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const row = (goals || []).find((g) => normSubject(g.subject) === subj);
  return row?.id || null;
}

async function resolveSlotTimes(studentId, plannerDate, excludePlannerId, preferredStart, preferredEnd) {
  if (preferredStart && preferredEnd) {
    const clash = await findPlannerOverlapConflict(
      studentId,
      plannerDate,
      preferredStart,
      preferredEnd,
      excludePlannerId
    );
    if (!clash?.conflictingId && !clash?.error) {
      return { start_time: preferredStart, end_time: preferredEnd };
    }
  }
  for (let hour = 8; hour <= 21; hour++) {
    const start = padPlannerHour(hour);
    const end = padPlannerHour(Math.min(hour + 1, 23));
    const clash = await findPlannerOverlapConflict(studentId, plannerDate, start, end, excludePlannerId);
    if (!clash?.conflictingId && !clash?.error) return { start_time: start, end_time: end };
  }
  return { start_time: '22:00', end_time: '23:00' };
}

/**
 * weekly_entries satırına göre tek bir weekly_planner_entries satırını günceller veya oluşturur.
 */
export async function syncWeeklyEntryPlannerRow(entry) {
  if (!entry?.id || !entry.student_id || !entry.date) return null;

  const solved = Number(entry.solved_questions ?? 0);
  const target = Number(entry.target_questions ?? 0);
  if (!(solved > 0 || target > 0)) {
    await supabaseAdmin.from('weekly_planner_entries').delete().eq('weekly_entry_id', entry.id);
    return null;
  }

  const plannedQty = target > 0 ? Math.max(target, solved) : Math.max(solved, 1);
  const completedQty = solved;
  let status = 'planned';
  if (completedQty > 0 && target > 0 && completedQty >= target) status = 'completed';
  else if (completedQty > 0) status = 'partial';

  const plannerDate = padDate(entry.date);
  const coachGoalId = await pickCoachGoalId(entry.student_id, entry.date, entry.subject);

  const topic = String(entry.topic || '').trim();
  const subject = String(entry.subject || '').trim() || 'Genel';
  const title = topic ? `📝 Günlük: ${topic}` : `📝 Günlük: ${subject}`;

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('id,planner_date,start_time,end_time')
    .eq('weekly_entry_id', entry.id)
    .maybeSingle();
  if (exErr) throw exErr;

  const dateChanged = existing && padDate(existing.planner_date) !== plannerDate;
  const preferredStart = existing && !dateChanged ? existing.start_time : null;
  const preferredEnd = existing && !dateChanged ? existing.end_time : null;

  const { start_time, end_time } = await resolveSlotTimes(
    entry.student_id,
    plannerDate,
    existing?.id || null,
    preferredStart,
    preferredEnd
  );

  const institutionId = entry.institution_id || null;
  const now = new Date().toISOString();

  const payload = {
    student_id: entry.student_id,
    institution_id: institutionId,
    coach_goal_id: coachGoalId,
    subject,
    title,
    planned_quantity: plannedQty,
    completed_quantity: completedQty,
    planner_date: plannerDate,
    start_time,
    end_time,
    status,
    weekly_entry_id: entry.id,
    updated_at: now,
  };

  if (existing?.id) {
    const clash = await findPlannerOverlapConflict(
      entry.student_id,
      plannerDate,
      start_time,
      end_time,
      existing.id
    );
    if (clash?.conflictingId || clash?.error) {
      const fallback = await resolveSlotTimes(entry.student_id, plannerDate, existing.id, null, null);
      payload.start_time = fallback.start_time;
      payload.end_time = fallback.end_time;
    }
    const { data, error } = await supabaseAdmin
      .from('weekly_planner_entries')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const id = `wpe-sync-${entry.id}`;
  const insertRow = {
    id,
    ...payload,
    created_at: now,
  };
  const { data, error } = await supabaseAdmin.from('weekly_planner_entries').insert(insertRow).select().single();
  if (error) throw error;
  return data;
}
