import { supabaseAdmin } from './supabase-admin.js';

/** Öğrenci kartını users.id ile ilişkilendir (my-student 404 önleme) */
export async function linkStudentToUser(studentRow, userId) {
  const uid = String(userId || '').trim();
  const sid = studentRow?.id ? String(studentRow.id).trim() : '';
  if (!uid || !sid) return studentRow;

  const patch = {};
  if (studentRow.user_id == null || String(studentRow.user_id).trim() === '') {
    patch.user_id = uid;
  }
  if (studentRow.platform_user_id == null || String(studentRow.platform_user_id).trim() === '') {
    patch.platform_user_id = uid;
  }
  if (Object.keys(patch).length === 0) return studentRow;

  const { data, error } = await supabaseAdmin
    .from('students')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', sid)
    .select('*')
    .maybeSingle();
  if (error) {
    console.warn('[link-student-user]', error.message || error);
    return { ...studentRow, ...patch };
  }
  return data || { ...studentRow, ...patch };
}
