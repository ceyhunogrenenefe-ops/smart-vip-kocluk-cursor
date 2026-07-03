import { supabaseAdmin } from './supabase-admin.js';

/** Öğretmenin `class_teachers` tablosundaki resmi sınıf atamaları (panel / öğrenci listesi). */
export async function getTeacherPanelClassIds(teacherUserId) {
  const tid = String(teacherUserId || '').trim();
  if (!tid) return [];

  const { data: links, error: le } = await supabaseAdmin
    .from('class_teachers')
    .select('class_id')
    .eq('teacher_id', tid);
  if (le) throw le;
  return [...new Set((links || []).map((r) => r.class_id).filter(Boolean))];
}

/** Katılım / oturum erişimi: resmi atama + slot/oturum teacher_id */
export async function getTeacherAssignedClassIds(teacherUserId) {
  const tid = String(teacherUserId || '').trim();
  if (!tid) return [];

  const classIds = new Set(await getTeacherPanelClassIds(tid));

  const [{ data: slotRows }, { data: sessionRows }] = await Promise.all([
    supabaseAdmin.from('class_weekly_slots').select('class_id').eq('teacher_id', tid),
    supabaseAdmin.from('class_sessions').select('class_id').eq('teacher_id', tid)
  ]);
  for (const row of slotRows || []) {
    if (row.class_id) classIds.add(row.class_id);
  }
  for (const row of sessionRows || []) {
    if (row.class_id) classIds.add(row.class_id);
  }

  return [...classIds];
}

/**
 * Öğretmen paneli: yalnızca resmi atandığı grup sınıflarındaki öğrenci id'leri.
 * class_teachers kaydı yoksa liste boş (kurum geneli veya slot geçmişi gösterilmez).
 */
export async function getTeacherGroupClassStudentScope(teacherUserId) {
  const classIds = await getTeacherPanelClassIds(teacherUserId);
  if (!classIds.length) return { ids: [], classIds: [] };

  const { data: members, error: me } = await supabaseAdmin
    .from('class_students')
    .select('student_id')
    .in('class_id', classIds);
  if (me) throw me;
  const ids = [...new Set((members || []).map((r) => r.student_id).filter(Boolean))];
  return { ids, classIds };
}

export async function isStudentAllowedForTeacherGroupLessons(teacherUserId, studentId) {
  const scope = await getTeacherGroupClassStudentScope(teacherUserId);
  return scope.ids.includes(String(studentId || '').trim());
}

/** JWT / users.roles — öğretmen paneli kapsamı uygulanmalı mı */
export function actorIsTeacherForPanelScope(actor, roleTags = []) {
  const r = String(actor?.role || '').trim().toLowerCase();
  const tags = Array.isArray(roleTags) ? roleTags : [];
  return r === 'teacher' || tags.includes('teacher');
}

/** Slot/oturum oluşturulunca class_teachers satırını garanti et (panel kapsamı). */
export async function ensureClassTeacherLink(classId, teacherUserId) {
  const cid = String(classId || '').trim();
  const tid = String(teacherUserId || '').trim();
  if (!cid || !tid) return;
  const { data: existing } = await supabaseAdmin
    .from('class_teachers')
    .select('class_id')
    .eq('class_id', cid)
    .eq('teacher_id', tid)
    .maybeSingle();
  if (existing?.class_id) return;
  const { error } = await supabaseAdmin.from('class_teachers').insert({ class_id: cid, teacher_id: tid });
  if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
    console.warn('[ensureClassTeacherLink]', error.message || error);
  }
}
