/**
 * Özel ders saatleri — teacher_lessons tamamlanan kayıtlardan (hakediş ile aynı birim mantığı).
 * Salt okuma; hakediş tablolarına yazmaz.
 */
import {
  GROUP_LESSON_UNIT_MINUTES,
  roundUnits,
  sessionLessonUnits40
} from './class-lesson-payment-units.js';
import { errorMessage } from './error-msg.js';

export function privateLessonUnitsFromRow(row) {
  const dm = row?.duration_minutes != null ? Number(row.duration_minutes) : NaN;
  if (Number.isFinite(dm) && dm > 0) {
    return roundUnits(dm / GROUP_LESSON_UNIT_MINUTES);
  }
  return sessionLessonUnits40(row);
}

/** 40 dk birim → saat */
export function unitsToHours(units) {
  return roundUnits((Number(units) || 0) * (GROUP_LESSON_UNIT_MINUTES / 60));
}

export function monthBoundsYm(ym) {
  const raw = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split('-').map((x) => parseInt(x, 10));
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${raw}-01`,
    to: `${raw}-${String(last).padStart(2, '0')}`
  };
}

/**
 * @returns {Promise<Map<string, { system_hours: number, teachers: Map<string, { teacher_id: string, hours: number }> }>>}
 */
export async function scanPrivateLessonHoursByStudent({ supabase, from, to, institutionId }) {
  let q = supabase
    .from('teacher_lessons')
    .select(
      'id,teacher_id,student_id,duration_minutes,start_time,end_time,lesson_date,status,institution_id'
    )
    .eq('status', 'completed')
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .limit(8000);
  if (institutionId) q = q.eq('institution_id', institutionId);

  const { data, error } = await q;
  if (error) {
    if (/teacher_lessons|does not exist|schema cache|PGRST205/i.test(errorMessage(error))) {
      return new Map();
    }
    throw error;
  }

  const byStudent = new Map();
  for (const row of data || []) {
    const sid = String(row.student_id || '').trim();
    const tid = String(row.teacher_id || '').trim();
    if (!sid) continue;
    const units = privateLessonUnitsFromRow(row);
    const hours = unitsToHours(units);
    if (!byStudent.has(sid)) {
      byStudent.set(sid, { system_hours: 0, teachers: new Map() });
    }
    const cur = byStudent.get(sid);
    cur.system_hours = roundUnits(cur.system_hours + hours);
    if (tid) {
      const t = cur.teachers.get(tid) || { teacher_id: tid, hours: 0 };
      t.hours = roundUnits(t.hours + hours);
      cur.teachers.set(tid, t);
    }
  }
  return byStudent;
}
