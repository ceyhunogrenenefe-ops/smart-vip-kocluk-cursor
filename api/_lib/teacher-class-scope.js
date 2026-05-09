import { supabaseAdmin } from './supabase-admin.js';

/**
 * Öğretmenin `class_teachers` ile bağlı olduğu grup sınıflarındaki öğrenci id'leri.
 * Grup dersinde atanmış sınıf yoksa liste boştur (kurum geneli öğretmen görünmez).
 */
export async function getTeacherGroupClassStudentScope(teacherUserId) {
  const tid = String(teacherUserId || '').trim();
  if (!tid) return { ids: [] };

  const { data: links, error: le } = await supabaseAdmin
    .from('class_teachers')
    .select('class_id')
    .eq('teacher_id', tid);
  if (le) throw le;
  const classIds = [...new Set((links || []).map((r) => r.class_id).filter(Boolean))];
  if (classIds.length === 0) return { ids: [] };

  const { data: members, error: me } = await supabaseAdmin
    .from('class_students')
    .select('student_id')
    .in('class_id', classIds);
  if (me) throw me;
  const ids = [...new Set((members || []).map((r) => r.student_id).filter(Boolean))];
  return { ids };
}

export async function isStudentAllowedForTeacherGroupLessons(teacherUserId, studentId) {
  const scope = await getTeacherGroupClassStudentScope(teacherUserId);
  return scope.ids.includes(String(studentId || '').trim());
}
