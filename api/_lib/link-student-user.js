import { supabaseAdmin } from './supabase-admin.js';

/** Öğrenci kartını users.id ile ilişkilendir (my-student 404 önleme) */
export async function linkStudentToUser(studentRow, userId) {
  return claimStudentForUser(studentRow, userId, null, false);
}

/**
 * E-posta eşleşiyorsa boş veya hatalı FK alanlarını düzeltir (kullanıcı yönetimi senkron hatası).
 * forceEmailClaim: aynı e-postadaki kartı bu oturuma bağla (user_id başka / boş).
 */
export async function claimStudentForUser(studentRow, userId, userEmail, forceEmailClaim = true) {
  const uid = String(userId || '').trim();
  const sid = studentRow?.id ? String(studentRow.id).trim() : '';
  if (!uid || !sid) return studentRow;

  const rowEmail = String(studentRow.email || '').trim().toLowerCase();
  const em = String(userEmail || '').trim().toLowerCase();
  const emailMatch = Boolean(em && rowEmail && rowEmail === em);

  const rowUser = studentRow.user_id != null ? String(studentRow.user_id).trim() : '';
  const rowPlat = studentRow.platform_user_id != null ? String(studentRow.platform_user_id).trim() : '';

  if (rowUser === uid && rowPlat === uid) return studentRow;

  const patch = {};
  const canForce = forceEmailClaim && emailMatch;

  if (!rowUser || (canForce && rowUser !== uid)) patch.user_id = uid;
  if (!rowPlat || (canForce && rowPlat !== uid)) patch.platform_user_id = uid;

  if (!Object.keys(patch).length) return studentRow;

  const { data, error } = await supabaseAdmin
    .from('students')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', sid)
    .select('*')
    .maybeSingle();
  if (error) {
    console.warn('[claim-student-for-user]', error.message || error);
    return { ...studentRow, ...patch };
  }
  return data || { ...studentRow, ...patch };
}
