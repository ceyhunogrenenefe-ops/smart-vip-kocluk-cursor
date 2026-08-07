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

function normalizeGoalUnit(raw) {
  const u = String(raw || 'soru')
    .trim()
    .toLowerCase();
  if (u === 'dk' || u === 'dakika' || u === 'süre' || u === 'sure' || u === 'dak') return 'dakika';
  if (u === 'sayfa' || u === 'kitap') return 'sayfa';
  if (u === 'paragraf' || u === 'paragraflar' || u === 'problem' || u === 'problemler') return 'soru';
  if (u === 'sorular' || u === 'adet' || u === '') return 'soru';
  return u;
}

function completedAmountForUnit(unit, entry) {
  const u = normalizeGoalUnit(unit);
  const solved = Math.max(0, Number(entry.solved_questions ?? 0));
  const pages = Math.max(
    0,
    Number(
      entry.pages_read != null && Number.isFinite(Number(entry.pages_read))
        ? entry.pages_read
        : entry.reading_minutes ?? 0
    )
  );
  const screen = Math.max(0, Number(entry.screen_time_minutes ?? 0));
  if (u === 'sayfa') return pages;
  if (u === 'dakika') return screen;
  return solved;
}

async function pickCoachGoalId(studentId, entryDate, subjectRaw) {
  const ws = weekStartMondayYMD(entryDate);
  const subj = normSubject(subjectRaw);
  if (!subj) return null;

  const { data: goals, error } = await supabaseAdmin
    .from('coach_weekly_goals')
    .select('id,subject,quantity_unit,created_at')
    .eq('student_id', studentId)
    .eq('week_start_date', ws)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const row = (goals || []).find((g) => normSubject(g.subject) === subj);
  return row || null;
}

async function resolveSlotTimes(
  studentId,
  plannerDate,
  excludePlannerId,
  preferredStart,
  preferredEnd,
  ignoreOverlapIds = []
) {
  if (preferredStart && preferredEnd) {
    const clash = await findPlannerOverlapConflict(
      studentId,
      plannerDate,
      preferredStart,
      preferredEnd,
      excludePlannerId,
      ignoreOverlapIds
    );
    if (!clash?.conflictingId && !clash?.error) {
      return { start_time: preferredStart, end_time: preferredEnd };
    }
  }
  for (let hour = 8; hour <= 21; hour++) {
    const start = padPlannerHour(hour);
    const end = padPlannerHour(Math.min(hour + 1, 23));
    const clash = await findPlannerOverlapConflict(
      studentId,
      plannerDate,
      start,
      end,
      excludePlannerId,
      ignoreOverlapIds
    );
    if (!clash?.conflictingId && !clash?.error) return { start_time: start, end_time: end };
  }
  return { start_time: '22:00', end_time: '23:00' };
}

/**
 * weekly_entries satırına göre tek bir weekly_planner_entries satırını günceller veya oluşturur.
 * @param {object} [opts]
 * @param {string} [opts.preferredStart]
 * @param {string} [opts.preferredEnd]
 * @param {string[]} [opts.ignoreOverlapIds] — çakışma sayılmayacak plan blokları (ör. Etüt bloğu)
 */
export async function syncWeeklyEntryPlannerRow(entry, opts = {}) {
  if (!entry?.id || !entry.student_id || !entry.date) return null;

  const solved = Number(entry.solved_questions ?? 0);
  const target = Number(entry.target_questions ?? 0);
  const pages = Number(entry.pages_read ?? entry.reading_minutes ?? 0);
  const screen = Number(entry.screen_time_minutes ?? 0);
  const hasAnyProgress = solved > 0 || pages > 0 || screen > 0 || target > 0;

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('id,planner_date,start_time,end_time,coach_goal_id,planned_quantity,status')
    .eq('weekly_entry_id', entry.id)
    .maybeSingle();
  if (exErr) throw exErr;

  // İlerleme yoksa: koç hedefli bloğu silme (hedef kutusu kaybolmasın); serbest senkron bloğunu temizle
  if (!hasAnyProgress) {
    if (existing?.coach_goal_id) {
      await supabaseAdmin
        .from('weekly_planner_entries')
        .update({
          completed_quantity: 0,
          status: 'planned',
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      return existing;
    }
    if (existing?.id) {
      await supabaseAdmin.from('weekly_planner_entries').delete().eq('id', existing.id);
    }
    return null;
  }

  const matchedGoal = await pickCoachGoalId(entry.student_id, entry.date, entry.subject);
  let goalUnit = 'soru';
  let coachGoalId = existing?.coach_goal_id || matchedGoal?.id || null;
  if (coachGoalId) {
    const { data: goalRow } = await supabaseAdmin
      .from('coach_weekly_goals')
      .select('quantity_unit')
      .eq('id', coachGoalId)
      .maybeSingle();
    if (goalRow?.quantity_unit) goalUnit = goalRow.quantity_unit;
    else if (matchedGoal?.quantity_unit) goalUnit = matchedGoal.quantity_unit;
  }

  const completedQty = completedAmountForUnit(goalUnit, entry);
  const plannedQty =
    target > 0
      ? Math.max(target, completedQty)
      : existing?.planned_quantity > 0
        ? Math.max(Number(existing.planned_quantity), completedQty, 1)
        : Math.max(completedQty, 1);

  let status = 'planned';
  if (completedQty > 0 && plannedQty > 0 && completedQty >= plannedQty) status = 'completed';
  else if (completedQty > 0) status = 'partial';

  const plannerDate = padDate(entry.date);

  const topic = String(entry.topic || '').trim();
  const subject = String(entry.subject || '').trim() || 'Genel';
  const title = topic ? `📝 Günlük: ${topic}` : `📝 Günlük: ${subject}`;

  const dateChanged = existing && padDate(existing.planner_date) !== plannerDate;
  const preferredStart =
    opts.preferredStart ?? (existing && !dateChanged ? existing.start_time : null);
  const preferredEnd = opts.preferredEnd ?? (existing && !dateChanged ? existing.end_time : null);
  const ignoreOverlapIds = opts.ignoreOverlapIds ?? [];

  const { start_time, end_time } = await resolveSlotTimes(
    entry.student_id,
    plannerDate,
    existing?.id || null,
    preferredStart,
    preferredEnd,
    ignoreOverlapIds
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
      const fallback = await resolveSlotTimes(
        entry.student_id,
        plannerDate,
        existing.id,
        preferredStart,
        preferredEnd,
        ignoreOverlapIds
      );
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
