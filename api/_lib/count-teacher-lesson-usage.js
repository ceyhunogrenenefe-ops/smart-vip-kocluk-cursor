import { supabaseAdmin } from './supabase-admin.js';
import { lessonUnitsFromDurationMinutes } from './lesson-duration-units.js';

/**
 * Yalnızca tamamlanan derslerin toplam paket birimi (status = completed).
 * Her satırın `duration_minutes` süresine göre birim düşülür.
 *
 * @param {object} [options]
 * @param {string} [options.excludeLessonId] — PATCH ile iptal→aktif vb. hesaplarda mevcut satırı hariç tut
 */
export async function sumLessonUnitsUsed(studentId, teacherId, options = {}) {
  const excludeId = options.excludeLessonId ? String(options.excludeLessonId).trim() : '';

  const { data, error } = await supabaseAdmin
    .from('teacher_lessons')
    .select('id, duration_minutes')
    .eq('student_id', studentId)
    .eq('teacher_id', teacherId)
    .eq('status', 'completed');

  if (error) throw error;

  let sum = 0;
  for (const r of data || []) {
    if (excludeId && r.id === excludeId) continue;
    const dm = r.duration_minutes != null ? Number(r.duration_minutes) : 60;
    sum += lessonUnitsFromDurationMinutes(dm);
  }
  return sum;
}
