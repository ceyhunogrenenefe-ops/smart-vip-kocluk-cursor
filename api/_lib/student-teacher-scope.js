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

/** Öğrencinin görebileceği öğretmenler: sınıf öğretmenleri + kota tablosu */
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
  try {
    const { data: assigns } = await supabaseAdmin
      .from('teacher_private_lesson_assignments')
      .select('teacher_id')
      .eq('student_id', studentId)
      .eq('active', true);
    for (const r of assigns || []) {
      if (r.teacher_id) teachers.add(String(r.teacher_id));
    }
  } catch {
    /* atama tablosu yoksa yoksay */
  }
  return [...teachers];
}

/** Öğretmenin erişebileceği öğrenci kartları (sınıf + kota) */
export async function studentIdsForTeacher(teacherUserId, institutionId = null) {
  if (!teacherUserId) return [];
  const students = new Set();
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
  try {
    let q = supabaseAdmin
      .from('student_teacher_lesson_quota')
      .select('student_id')
      .eq('teacher_id', teacherUserId);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data: quota } = await q;
    for (const r of quota || []) {
      if (r.student_id) students.add(String(r.student_id));
    }
  } catch {
    /* yoksay */
  }
  try {
    let aq = supabaseAdmin
      .from('teacher_private_lesson_assignments')
      .select('student_id')
      .eq('teacher_id', teacherUserId)
      .eq('active', true);
    if (institutionId) aq = aq.eq('institution_id', institutionId);
    const { data: assigns } = await aq;
    for (const r of assigns || []) {
      if (r.student_id) students.add(String(r.student_id));
    }
  } catch {
    /* yoksay */
  }
  const ids = [...students];
  if (!institutionId || !ids.length) return ids;
  const { data: stRows } = await supabaseAdmin
    .from('students')
    .select('id')
    .in('id', ids)
    .eq('institution_id', institutionId);
  return (stRows || []).map((s) => String(s.id));
}
