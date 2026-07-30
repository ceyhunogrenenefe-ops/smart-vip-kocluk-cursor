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

function parseChannel(v) {
  return String(v || '').trim().toLowerCase() === 'parent' ? 'parent' : 'student';
}

function parseStudentIds(v) {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.map((x) => String(x || '').trim()).filter(Boolean))];
}

function phoneForChannel(st, channel) {
  if (channel === 'parent') {
    return normalizePhoneToE164(st.parent_phone) || null;
  }
  return normalizePhoneToE164(st.phone) || null;
}

async function loadActiveMembersForClasses(classIds) {
  const { data: members, error: me } = await supabaseAdmin
    .from('class_students')
    .select('class_id, student_id')
    .in('class_id', classIds);
  if (me) throw me;

  const studentIds = [...new Set((members || []).map((r) => r.student_id).filter(Boolean))];
  if (!studentIds.length) {
    return { members: [], students: [], periodsMap: new Map(), todayTr: getIstanbulDateString() };
  }

  const todayTr = getIstanbulDateString();
  const periodsMap = await loadPeriodsForStudents(studentIds);
  const { data: rows, error } = await supabaseAdmin
    .from('students')
    .select('id, name, phone, parent_phone, coach_id')
    .in('id', studentIds);
  if (error) throw error;

  const students = (rows || []).filter((st) => {
    const periods = periodsMap.get(String(st.id)) || [];
    return isActiveFromPeriods(periods, todayTr, { coachId: st.coach_id });
  });

  return { members: members || [], students, periodsMap, todayTr };
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
  const { members, students } = await loadActiveMembersForClasses(classIds);
  const studentById = new Map(students.map((s) => [String(s.id), s]));

  const studentCounts = new Map();
  const parentCounts = new Map();
  for (const m of members) {
    const st = studentById.get(String(m.student_id));
    if (!st) continue;
    if (phoneForChannel(st, 'student')) {
      studentCounts.set(m.class_id, (studentCounts.get(m.class_id) || 0) + 1);
    }
    if (phoneForChannel(st, 'parent')) {
      parentCounts.set(m.class_id, (parentCounts.get(m.class_id) || 0) + 1);
    }
  }

  return classes.map((c) => ({
    id: c.id,
    name: c.name || 'Sınıf',
    active_student_count: studentCounts.get(c.id) || 0,
    active_parent_count: parentCounts.get(c.id) || 0
  }));
}

/** Seçilen sınıflardaki aktif öğrenciler (dropdown / kısmi seçim için) */
export async function loadClassStudentsForBulk(actor, classIds, channel = 'student') {
  const allowed = await getScopedClassIds(actor);
  const check = assertClassIdsAllowed(classIds, allowed);
  if (!check.ok) return check;

  const ch = parseChannel(channel);
  const { members, students } = await loadActiveMembersForClasses(check.classIds);
  const studentById = new Map(students.map((s) => [String(s.id), s]));
  const seen = new Set();
  const list = [];

  for (const m of members) {
    const sid = String(m.student_id);
    if (seen.has(sid)) continue;
    if (!check.classIds.includes(m.class_id)) continue;
    const st = studentById.get(sid);
    if (!st) continue;
    const phone = phoneForChannel(st, ch);
    seen.add(sid);
    list.push({
      student_id: sid,
      name: st.name || 'Öğrenci',
      has_phone: Boolean(phone),
      class_id: m.class_id
    });
  }

  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
  return { ok: true, students: list, channel: ch };
}

/**
 * @param {object} actor
 * @param {string[]} classIds
 * @param {{ channel?: 'student'|'parent', studentIds?: string[]|null }} [opts]
 *   studentIds null/undefined = sınıfın tamamı; boş dizi = kimse; dolu = yalnızca bunlar
 */
export async function resolveGatewayBulkRecipients(actor, classIds, opts = {}) {
  const allowed = await getScopedClassIds(actor);
  const check = assertClassIdsAllowed(classIds, allowed);
  if (!check.ok) return check;

  const channel = parseChannel(opts.channel);
  const filterIds = parseStudentIds(opts.studentIds);
  const filterSet = filterIds ? new Set(filterIds) : null;

  const { members, students } = await loadActiveMembersForClasses(check.classIds);
  const studentById = new Map(students.map((s) => [String(s.id), s]));

  // Kısmi seçimde istenen id'lerin sınıfta ve yetkili olduğundan emin ol
  if (filterSet) {
    const allowedStudentIds = new Set();
    for (const m of members) {
      if (check.classIds.includes(m.class_id)) allowedStudentIds.add(String(m.student_id));
    }
    for (const sid of filterSet) {
      if (!allowedStudentIds.has(sid)) {
        return { ok: false, error: 'student_forbidden', student_id: sid };
      }
    }
  }

  const seenPhone = new Set();
  const seenStudent = new Set();
  const recipients = [];

  for (const m of members) {
    const sid = String(m.student_id);
    if (!check.classIds.includes(m.class_id)) continue;
    if (filterSet && !filterSet.has(sid)) continue;
    if (seenStudent.has(sid)) continue;

    const st = studentById.get(sid);
    if (!st) continue;
    const phone = phoneForChannel(st, channel);
    if (!phone) continue;
    if (seenPhone.has(phone)) {
      seenStudent.add(sid);
      continue;
    }

    seenStudent.add(sid);
    seenPhone.add(phone);
    recipients.push({
      student_id: sid,
      name: st.name || 'Öğrenci',
      phone_e164: phone,
      channel,
      class_ids: members
        .filter((x) => String(x.student_id) === sid && check.classIds.includes(x.class_id))
        .map((x) => x.class_id)
    });
  }

  return { ok: true, recipients, total: recipients.length, channel };
}
