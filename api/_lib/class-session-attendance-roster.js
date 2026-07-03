import { supabaseAdmin } from './supabase-admin.js';
import { branchesMatch } from './planner-class-student-match.js';
import {
  buildClassStudentSubjectMap,
  filterStudentIdsForClassSubject,
  loadClassStudentSubjectRows
} from './class-student-subjects.js';

async function resolveEnrollmentStudents(rawIds) {
  const ids = [...new Set((rawIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return new Map();

  const byCanonicalId = new Map();
  const unresolved = new Set(ids);

  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await supabaseAdmin
      .from('students')
      .select('id,name,school,user_id,platform_user_id')
      .in('id', chunk);
    for (const row of data || []) {
      byCanonicalId.set(String(row.id), row);
      unresolved.delete(String(row.id));
    }
  }

  const remaining = [...unresolved];
  for (let i = 0; i < remaining.length; i += 200) {
    const chunk = remaining.slice(i, i + 200);
    const [{ data: byUser }, { data: byPlatform }] = await Promise.all([
      supabaseAdmin.from('students').select('id,name,school,user_id,platform_user_id').in('user_id', chunk),
      supabaseAdmin.from('students').select('id,name,school,user_id,platform_user_id').in('platform_user_id', chunk)
    ]);
    for (const row of [...(byUser || []), ...(byPlatform || [])]) {
      byCanonicalId.set(String(row.id), row);
    }
  }

  const rawToStudent = new Map();
  for (const raw of ids) {
    if (byCanonicalId.has(raw)) {
      rawToStudent.set(raw, byCanonicalId.get(raw));
      continue;
    }
    for (const row of byCanonicalId.values()) {
      if (String(row.user_id || '') === raw || String(row.platform_user_id || '') === raw) {
        rawToStudent.set(raw, row);
        break;
      }
    }
  }
  return rawToStudent;
}

/** Tek sınıf + ders + şube filtresiyle yoklama listesi (isimler dahil). */
export async function buildClassSessionAttendanceRoster({ classId, subject }) {
  const cid = String(classId || '').trim();
  if (!cid) return [];

  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id,class_level,branch')
    .eq('id', cid)
    .maybeSingle();
  if (!cls) return [];

  const enrollmentRows = await loadClassStudentSubjectRows([cid]);
  const subjectMap = buildClassStudentSubjectMap(enrollmentRows);
  const rawIds = (enrollmentRows || [])
    .map((r) => String(r.student_id || '').trim())
    .filter(Boolean);
  const filteredIds = filterStudentIdsForClassSubject(subjectMap, cid, subject, rawIds);
  const rawToStudent = await resolveEnrollmentStudents(filteredIds);

  const seen = new Set();
  const roster = [];
  for (const raw of filteredIds) {
    const row = rawToStudent.get(raw);
    if (!row) continue;
    if (!branchesMatch(row.school, cls.branch, cls.class_level)) continue;
    const canonicalId = String(row.id);
    if (seen.has(canonicalId)) continue;
    seen.add(canonicalId);
    roster.push({
      student_id: canonicalId,
      student_name: String(row.name || '').trim() || canonicalId
    });
  }

  roster.sort((a, b) => a.student_name.localeCompare(b.student_name, 'tr', { sensitivity: 'base' }));
  return roster;
}
