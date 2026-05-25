import { randomUUID } from 'crypto';
import { supabaseAdmin } from './supabase-admin.js';
import { linkStudentToUser } from './link-student-user.js';
import { resolveStudentRowForUser } from './resolve-student-id.js';
import { normalizedUserRolesFromDb } from './user-roles-fetch.js';
import { isUuid } from './uuid.js';

export function actorLooksLikeStudent(actor, userRow, roleTags) {
  const jwtRole = String(actor?.role || '').trim().toLowerCase();
  const dbRole = String(userRow?.role || '').trim().toLowerCase();
  return roleTags.includes('student') || dbRole === 'student' || jwtRole === 'student';
}

async function findStudentRowLoose(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return null;
  const { data } = await supabaseAdmin
    .from('students')
    .select('*')
    .ilike('email', em)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function loadStudentByJwtId(studentId, userId, email) {
  const sid = String(studentId || '').trim();
  if (!sid) return null;
  const { data: row } = await supabaseAdmin.from('students').select('*').eq('id', sid).maybeSingle();
  if (!row?.id) return null;
  const uid = String(userId || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const rowUser = row.user_id != null ? String(row.user_id).trim() : '';
  const rowPlat = row.platform_user_id != null ? String(row.platform_user_id).trim() : '';
  const rowEmail = String(row.email || '').trim().toLowerCase();
  if (rowUser === uid || rowPlat === uid) return row;
  if (em && rowEmail === em && !rowUser && !rowPlat) return row;
  if (em && rowEmail === em) return row;
  return null;
}

/**
 * Öğrenci hesabı için students.id döner; yoksa güvenli şekilde oluşturur / bağlar.
 */
export async function ensureStudentProfileForActor(actor) {
  const sub = String(actor?.sub || '').trim();
  if (!sub || sub === 'anonymous') {
    return { actor, isStudent: false, hasStudentId: false, studentId: null };
  }

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('id, email, name, institution_id, role')
    .eq('id', sub)
    .maybeSingle();

  const roleTags = await normalizedUserRolesFromDb(sub);
  const isStudent = actorLooksLikeStudent(actor, userRow, roleTags);
  if (!isStudent) {
    return { actor, isStudent: false, hasStudentId: false, studentId: null };
  }

  let row = null;

  const resolved = await resolveStudentRowForUser({
    userId: sub,
    email: userRow?.email,
    institutionId: userRow?.institution_id ?? actor.institution_id ?? null
  });
  if (resolved?.id) {
    const { data } = await supabaseAdmin.from('students').select('*').eq('id', resolved.id).maybeSingle();
    row = data;
  }

  if (!row && actor.student_id) {
    row = await loadStudentByJwtId(actor.student_id, sub, userRow?.email);
  }

  if (!row && userRow?.email) {
    const loose = await findStudentRowLoose(userRow.email);
    if (loose) row = loose;
  }

  if (!row && userRow?.email) {
    const em = String(userRow.email).trim().toLowerCase();
    const newId = isUuid(sub) ? sub : randomUUID();
    const payload = {
      id: newId,
      name: String(userRow.name || 'Öğrenci').trim() || 'Öğrenci',
      email: em,
      user_id: sub,
      platform_user_id: sub,
      institution_id: userRow.institution_id || null,
      class_level: '9',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data: inserted, error } = await supabaseAdmin
      .from('students')
      .insert(payload)
      .select('*')
      .single();
    if (!error && inserted) {
      row = inserted;
    } else if (error) {
      const again = await resolveStudentRowForUser({
        userId: sub,
        email: userRow.email,
        institutionId: userRow?.institution_id ?? actor.institution_id ?? null
      });
      if (again?.id) {
        const { data } = await supabaseAdmin.from('students').select('*').eq('id', again.id).maybeSingle();
        row = data;
      }
    }
  }

  if (row?.id) {
    row = await linkStudentToUser(row, sub);
    const studentId = String(row.id);
    return {
      actor: {
        ...actor,
        role: 'student',
        student_id: studentId,
        institution_id: userRow?.institution_id ?? actor.institution_id ?? row.institution_id ?? null
      },
      isStudent: true,
      hasStudentId: true,
      studentId
    };
  }

  return {
    actor: { ...actor, role: 'student' },
    isStudent: true,
    hasStudentId: false,
    studentId: null
  };
}
