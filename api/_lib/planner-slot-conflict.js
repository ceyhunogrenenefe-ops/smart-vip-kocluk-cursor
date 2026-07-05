import { supabaseAdmin } from './supabase-admin.js';

export function toPlannerMinutes(t) {
  const s = String(t || '').trim();
  const [h, m] = s.split(':').map((x) => parseInt(String(x || '0'), 10));
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

export function minutesToPlannerTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Etüt başlangıcını içeren saat dilimi (ör. 12:10 → 12:00–13:00) */
export function snapToContainingHourSlot(startTime) {
  const sm = toPlannerMinutes(startTime);
  if (sm == null) return { start_time: '12:00', end_time: '13:00' };
  const hourStart = Math.floor(sm / 60) * 60;
  return {
    start_time: minutesToPlannerTime(hourStart),
    end_time: minutesToPlannerTime(hourStart + 60),
  };
}

/** Çakışma: [start, end) yarı-açık */
export function timeRangesOverlapHalfOpen(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export async function findPlannerOverlapConflict(
  studentId,
  plannerDate,
  startTime,
  endTime,
  excludeId,
  ignoreIds = []
) {
  const a1 = toPlannerMinutes(startTime);
  const b1Exclusive = toPlannerMinutes(endTime);
  if (a1 == null || b1Exclusive == null) return { error: 'invalid_time_range' };
  if (b1Exclusive <= a1) return { error: 'invalid_time_range' };

  const ignoreSet = new Set((ignoreIds || []).filter(Boolean));
  if (excludeId) ignoreSet.add(excludeId);

  const { data, error } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('id,start_time,end_time')
    .eq('student_id', studentId)
    .eq('planner_date', plannerDate);
  if (error) throw error;
  for (const row of data || []) {
    if (ignoreSet.has(row.id)) continue;
    const ca = toPlannerMinutes(row.start_time);
    const cbEx = toPlannerMinutes(row.end_time);
    if (ca == null || cbEx == null) continue;
    if (cbEx <= ca) continue;
    if (timeRangesOverlapHalfOpen(a1, b1Exclusive, ca, cbEx)) return { conflictingId: row.id };
  }
  return null;
}
