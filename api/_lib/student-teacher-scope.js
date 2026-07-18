import { supabaseAdmin } from './supabase-admin.js';

/** Öğrencinin kayıtlı olduğu sınıflar */
export async function classIdsForStudent(studentId) {
  if (!studentId) return [];
  const { data } = await supabaseAdmin
    .from('class_students')
    .select('class_id')
    .eq('student_id', studentId);
  return (data || []).map((r) => r.class_id).filter(Boolean);
}

/** Öğrencinin görebileceği öğretmenler: sınıf öğretmenleri + kota + özel ders ataması */
export async function teacherIdsForStudent({ studentId, classIds: classIdsIn }) {
  if (!studentId) return [];
  const classIds = classIdsIn?.length ? classIdsIn : await classIdsForStudent(studentId);
  const teachers = new Set();
  if (classIds.length) {
    const { data } = await supabaseAdmin
      .from('class_teachers')
      .select('teacher_id')
      .in('class_id', classIds);
    for (const r of data || []) {
      if (r.teacher_id) teachers.add(String(r.teacher_id));
    }
  }
  try {
    const { data: quota } = await supabaseAdmin
      .from('student_teacher_lesson_quota')
      .select('teacher_id')
      .eq('student_id', studentId);
    for (const r of quota || []) {
      if (r.teacher_id) teachers.add(String(r.teacher_id));
    }
  } catch {
    /* kota tablosu yoksa yoksay */
  }
  for (const tid of await privateLessonTeacherIdsForStudent(studentId)) {
    teachers.add(tid);
  }
  return [...teachers];
}

/** Özel ders ataması — active yoksa / hata olursa yine de satırları dene */
async function privateLessonStudentIdsForTeacher(teacherUserId) {
  const tid = String(teacherUserId || '').trim();
  if (!tid) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('teacher_private_lesson_assignments')
      .select('student_id, active')
      .eq('teacher_id', tid);
    if (error) throw error;
    return [
      ...new Set(
        (data || [])
          .filter((r) => r.active !== false)
          .map((r) => String(r.student_id || '').trim())
          .filter(Boolean)
      )
    ];
  } catch (e1) {
    try {
      const { data, error } = await supabaseAdmin
        .from('teacher_private_lesson_assignments')
        .select('student_id')
        .eq('teacher_id', tid);
      if (error) throw error;
      return [
        ...new Set((data || []).map((r) => String(r.student_id || '').trim()).filter(Boolean))
      ];
    } catch (e2) {
      console.warn(
        '[student-teacher-scope] private assignments read failed',
        e2?.message || e1?.message || e2
      );
      return [];
    }
  }
}

async function privateLessonTeacherIdsForStudent(studentId) {
  const sid = String(studentId || '').trim();
  if (!sid) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('teacher_private_lesson_assignments')
      .select('teacher_id, active')
      .eq('student_id', sid);
    if (error) throw error;
    return [
      ...new Set(
        (data || [])
          .filter((r) => r.active !== false)
          .map((r) => String(r.teacher_id || '').trim())
          .filter(Boolean)
      )
    ];
  } catch {
    try {
      const { data } = await supabaseAdmin
        .from('teacher_private_lesson_assignments')
        .select('teacher_id')
        .eq('student_id', sid);
      return [...new Set((data || []).map((r) => String(r.teacher_id || '').trim()).filter(Boolean))];
    } catch {
      return [];
    }
  }
}

/**
 * Öğretmenin erişebileceği öğrenci id'leri: grup sınıfı + kota + özel ders ataması.
 * Özel ders atanan öğrenciler institution_id null olsa bile listede kalır.
 */
export async function studentIdsForTeacher(teacherUserId, institutionId = null) {
  if (!teacherUserId) return [];
  const students = new Set();
  const privateIds = new Set(await privateLessonStudentIdsForTeacher(teacherUserId));
  for (const id of privateIds) students.add(id);

  const { data: classLinks } = await supabaseAdmin
    .from('class_teachers')
    .select('class_id')
    .eq('teacher_id', teacherUserId);
  const classIds = (classLinks || []).map((r) => r.class_id).filter(Boolean);
  if (classIds.length) {
    const { data } = await supabaseAdmin
      .from('class_students')
      .select('student_id')
      .in('class_id', classIds);
    for (const r of data || []) {
      if (r.student_id) students.add(String(r.student_id));
    }
  }
  const quotaIds = new Set();
  try {
    const { data: quota } = await supabaseAdmin
      .from('student_teacher_lesson_quota')
      .select('student_id')
      .eq('teacher_id', teacherUserId);
    for (const r of quota || []) {
      if (r.student_id) {
        const sid = String(r.student_id);
        students.add(sid);
        quotaIds.add(sid);
      }
    }
  } catch {
    /* yoksay */
  }

  const ids = [...students];
  if (!ids.length) return [];
  if (!institutionId) return ids;

  const { data: stRows } = await supabaseAdmin
    .from('students')
    .select('id, institution_id')
    .in('id', ids);

  return (stRows || [])
    .filter((s) => {
      const sid = String(s.id);
      // Özel ders / kota ataması: kurum null/farklı olsa bile öğretmen görsün
      if (privateIds.has(sid) || quotaIds.has(sid)) return true;
      const si = s.institution_id == null ? '' : String(s.institution_id);
      return !si || si === String(institutionId);
    })
    .map((s) => String(s.id));
}

export { privateLessonStudentIdsForTeacher };
