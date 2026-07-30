import { supabaseAdmin } from './supabase-admin.js';
import { normalizedUserRolesFromDb } from './user-roles-fetch.js';
import { getTeacherPanelClassIds } from './teacher-class-scope.js';
import { loadPeriodsForStudents, isActiveFromPeriods } from './student-activity.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { getIstanbulDateString } from './istanbul-time.js';

function normRole(r) {
  return String(r || '').trim().toLowerCase();
}

/** class-live-lessons getManagedClassIds ile uyumlu kapsam */
export async function getScopedClassIds(actor) {
  const role = normRole(actor.role);
  const roleTags = await normalizedUserRolesFromDb(actor.sub);
  const hasTeacher = roleTags.includes('teacher') || role === 'teacher';
  const hasCoach = roleTags.includes('coach') || role === 'coach';
  const hasAdmin =
    role === 'admin' ||
    role === 'super_admin' ||
    roleTags.includes('admin') ||
    roleTags.includes('super_admin');

  if (hasAdmin && !hasTeacher && !hasCoach) return null;

  const classIds = new Set();

  if (roleTags.includes('teacher') || role === 'teacher') {
    for (const cid of await getTeacherPanelClassIds(actor.sub)) {
      classIds.add(cid);
    }
  }

  if (roleTags.includes('coach') || role === 'coach') {
    const cid = actor.coach_id ? String(actor.coach_id).trim() : '';
    if (cid) {
      const { data: studs, error: se } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('coach_id', cid);
      if (se) throw se;
      const studentIds = [...new Set((studs || []).map((s) => String(s.id).trim()).filter(Boolean))];
      if (studentIds.length) {
        const { data: cs, error: ce } = await supabaseAdmin
          .from('class_students')
          .select('class_id')
          .in('student_id', studentIds);
        if (ce) throw ce;
        for (const row of cs || []) {
          if (row.class_id) classIds.add(row.class_id);
        }
      }
    }
  }

  if (hasTeacher || hasCoach) return [...classIds];
  return [];
}

export function assertClassIdsAllowed(requestedIds, allowedIds) {
  const req = [...new Set((requestedIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!req.length) return { ok: false, error: 'class_ids_required' };
  if (allowedIds === null) return { ok: true, classIds: req };
  const allowed = new Set(allowedIds || []);
  for (const id of req) {
    if (!allowed.has(id)) return { ok: false, error: 'class_forbidden', class_id: id };
  }
  return { ok: true, classIds: req };
}

export async function loadScopedClasses(actor) {
  const allowed = await getScopedClassIds(actor);
  let q = supabaseAdmin.from('classes').select('id, name, institution_id').order('name');
  if (allowed !== null) {
    if (!allowed.length) return [];
    q = q.in('id', allowed);
  } else if (actor.institution_id) {
    q = q.eq('institution_id', actor.institution_id);
  }
  const { data: classes, error } = await q;
  if (error) throw error;
  if (!classes?.length) return [];

  const classIds = classes.map((c) => c.id);
  const { data: members, error: me } = await supabaseAdmin
    .from('class_students')
    .select('class_id, student_id')
    .in('class_id', classIds);
  if (me) throw me;

  const studentIds = [...new Set((members || []).map((r) => r.student_id).filter(Boolean))];
  const todayTr = getIstanbulDateString();
  const periodsMap = await loadPeriodsForStudents(studentIds);

  const { data: studentRows, error: se } = studentIds.length
    ? await supabaseAdmin
        .from('students')
        .select('id, phone, coach_id')
        .in('id', studentIds)
    : { data: [], error: null };
  if (se) throw se;

  const studentById = new Map((studentRows || []).map((s) => [String(s.id), s]));
  const classCounts = new Map();
  for (const m of members || []) {
    const st = studentById.get(String(m.student_id));
    if (!st) continue;
    const periods = periodsMap.get(String(st.id)) || [];
    if (!isActiveFromPeriods(periods, todayTr, { coachId: st.coach_id })) continue;
    const phone = normalizePhoneToE164(st.phone);
    if (!phone) continue;
    classCounts.set(m.class_id, (classCounts.get(m.class_id) || 0) + 1);
  }

  return classes.map((c) => ({
    id: c.id,
    name: c.name || 'Sınıf',
    active_student_count: classCounts.get(c.id) || 0
  }));
}

export async function resolveGatewayBulkRecipients(actor, classIds) {
  const allowed = await getScopedClassIds(actor);
  const check = assertClassIdsAllowed(classIds, allowed);
  if (!check.ok) return check;

  const { data: members, error: me } = await supabaseAdmin
    .from('class_students')
    .select('class_id, student_id')
    .in('class_id', check.classIds);
  if (me) throw me;

  const studentIds = [...new Set((members || []).map((r) => r.student_id).filter(Boolean))];
  if (!studentIds.length) {
    return { ok: true, recipients: [], total: 0 };
  }

  const todayTr = getIstanbulDateString();
  const periodsMap = await loadPeriodsForStudents(studentIds);
  const { data: rows, error } = await supabaseAdmin
    .from('students')
    .select('id, name, phone, coach_id')
    .in('id', studentIds);
  if (error) throw error;

  const seen = new Set();
  const recipients = [];
  for (const st of rows || []) {
    const sid = String(st.id);
    if (seen.has(sid)) continue;
    const periods = periodsMap.get(sid) || [];
    if (!isActiveFromPeriods(periods, todayTr, { coachId: st.coach_id })) continue;
    const phone = normalizePhoneToE164(st.phone);
    if (!phone) continue;
    seen.add(sid);
    recipients.push({
      student_id: sid,
      name: st.name || 'Öğrenci',
      phone_e164: phone,
      class_ids: (members || [])
        .filter((m) => String(m.student_id) === sid && check.classIds.includes(m.class_id))
        .map((m) => m.class_id)
    });
  }

  return { ok: true, recipients, total: recipients.length };
}
