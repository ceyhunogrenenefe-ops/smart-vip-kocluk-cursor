import { supabaseAdmin } from './supabase-admin.js';

export function toPlannerMinutes(t) {
  const s = String(t || '').trim();
  const [h, m] = s.split(':').map((x) => parseInt(String(x || '0'), 10));
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

/** Çakışma: [start, end) yarı-açık */
export function timeRangesOverlapHalfOpen(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export async function findPlannerOverlapConflict(studentId, plannerDate, startTime, endTime, excludeId) {
  const a1 = toPlannerMinutes(startTime);
  const b1Exclusive = toPlannerMinutes(endTime);
  if (a1 == null || b1Exclusive == null) return { error: 'invalid_time_range' };
  if (b1Exclusive <= a1) return { error: 'invalid_time_range' };

  const { data, error } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('id,start_time,end_time')
    .eq('student_id', studentId)
    .eq('planner_date', plannerDate);
  if (error) throw error;
  for (const row of data || []) {
    if (excludeId && row.id === excludeId) continue;
    const ca = toPlannerMinutes(row.start_time);
    const cbEx = toPlannerMinutes(row.end_time);
    if (ca == null || cbEx == null) continue;
    if (cbEx <= ca) continue;
    if (timeRangesOverlapHalfOpen(a1, b1Exclusive, ca, cbEx)) return { conflictingId: row.id };
  }
  return null;
}
