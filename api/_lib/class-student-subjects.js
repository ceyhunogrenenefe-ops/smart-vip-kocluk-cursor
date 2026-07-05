import { supabaseAdmin } from './supabase-admin.js';
import { resolvePlannerCellSubject } from './class-schedule-plan-export.js';

export function normSubjectKey(subject) {
  return String(subject || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

/** Boş liste = sınıftaki tüm dersler (eski kayıtlar). */
export function studentHasClassSubject(enrollmentSubjects, sessionSubject) {
  const list = Array.isArray(enrollmentSubjects)
    ? enrollmentSubjects.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  if (!list.length) return true;
  const target = normSubjectKey(sessionSubject);
  if (!target) return true;
  if (list.some((s) => normSubjectKey(s) === target)) return true;
  return list.some((s) => {
    const n = normSubjectKey(s);
    if (!n) return false;
    return target.includes(n) || n.includes(target);
  });
}

export function mergeSubjectLists(...lists) {
  const set = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      const t = String(s || '').trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

/** Planlayıcı grubundan ders adları (müfredat + takvim hücreleri). */
export function collectSubjectsFromPlannerGroup(group, plannerJson = {}) {
  const pj = plannerJson && typeof plannerJson === 'object' ? plannerJson : {};
  const set = new Set();
  for (const line of group?.curriculum || []) {
    const s = String(line?.subject || '').trim();
    if (s) set.add(s);
  }
  const schedule = group?.schedule && typeof group.schedule === 'object' ? group.schedule : {};
  const periods = Array.isArray(group?.periods)
    ? group.periods
    : Array.isArray(pj.periods)
      ? pj.periods
      : [];
  const days = Array.isArray(pj.days) ? pj.days : [];
  for (const [key, cell] of Object.entries(schedule)) {
    if (!cell || typeof cell !== 'object') continue;
    const [diStr, piStr] = String(key).split('_');
    const di = Number(diStr);
    const pi = Number(piStr);
    const period = periods[pi];
    const dayLabel = days[di] || String(di);
    const subject = resolvePlannerCellSubject(cell, period, cell.teacher, dayLabel);
    if (subject) set.add(subject);
  }
  return [...set];
}

/**
 * @param {Array<{ class_id: string, student_id: string, subjects?: string[] }>} rows
 * @returns {Map<string, Map<string, string[]>>} classId -> studentId -> subjects
 */
export function buildClassStudentSubjectMap(rows) {
  const out = new Map();
  for (const row of rows || []) {
    const cid = String(row.class_id || '').trim();
    const sid = String(row.student_id || '').trim();
    if (!cid || !sid) continue;
    if (!out.has(cid)) out.set(cid, new Map());
    const subs = Array.isArray(row.subjects)
      ? row.subjects.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
    out.get(cid).set(sid, subs);
  }
  return out;
}

export function filterStudentIdsForClassSubject(map, classId, subject, studentIds) {
  const classMap = map.get(String(classId || ''));
  if (!classMap) return studentIds || [];
  return (studentIds || []).filter((sid) => {
    const enrolled = classMap.get(String(sid));
    return studentHasClassSubject(enrolled, subject);
  });
}

export async function loadClassStudentSubjectRows(classIds) {
  const ids = [...new Set((classIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin
    .from('class_students')
    .select('class_id,student_id,subjects')
    .in('class_id', ids);
  if (!error) return data || [];
  if (/subjects|schema cache|PGRST204/i.test(String(error.message || ''))) {
    const { data: fallback, error: fbErr } = await supabaseAdmin
      .from('class_students')
      .select('class_id,student_id')
      .in('class_id', ids);
    if (fbErr) throw fbErr;
    return (fallback || []).map((r) => ({ ...r, subjects: [] }));
  }
  throw error;
}

/** Plan aktarımı: gruptaki öğrencilere ders listesini birleştir. */
export async function syncPlannerGroupStudentSubjects({ classId, group, plannerJson, replace = false }) {
  const cid = String(classId || '').trim();
  if (!cid || !group) return { updated: 0 };
  const subjects = collectSubjectsFromPlannerGroup(group, plannerJson);
  if (!subjects.length) return { updated: 0 };

  const studentIds = (group.students || [])
    .map((s) => String(s?.systemId || s?.id || '').trim())
    .filter((id) => id && !id.startsWith('local-'));
  if (!studentIds.length) return { updated: 0 };

  let updated = 0;
  for (const sid of studentIds) {
    const { data: existing, error: getErr } = await supabaseAdmin
      .from('class_students')
      .select('id,subjects')
      .eq('class_id', cid)
      .eq('student_id', sid)
      .maybeSingle();
    if (getErr && /subjects|schema cache|PGRST204/i.test(String(getErr.message || ''))) {
      const { data: row } = await supabaseAdmin
        .from('class_students')
        .select('id')
        .eq('class_id', cid)
        .eq('student_id', sid)
        .maybeSingle();
      if (row?.id) {
        await supabaseAdmin.from('class_students').upsert({ class_id: cid, student_id: sid }, { onConflict: 'class_id,student_id' });
      } else {
        await supabaseAdmin.from('class_students').insert({ class_id: cid, student_id: sid });
      }
      continue;
    }
    if (getErr) throw getErr;

    const merged = replace ? subjects : mergeSubjectLists(existing?.subjects, subjects);
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('class_students')
        .update({ subjects: merged })
        .eq('id', existing.id);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await supabaseAdmin.from('class_students').insert({
        class_id: cid,
        student_id: sid,
        subjects: merged
      });
      if (error) throw error;
      updated += 1;
    }
  }
  return { updated, subjects, student_ids: studentIds };
}

function normMatchLabel(s) {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

export function plannerGroupStudentIds(group) {
  return (group?.students || [])
    .map((s) => String(s?.systemId || s?.id || '').trim())
    .filter((id) => id && !id.startsWith('local-'));
}

export function resolvePlannerGroupClassId(group, classes = []) {
  const explicit = String(group?.classId || '').trim();
  if (explicit) return explicit;
  const name = String(group?.name || '').trim();
  const gn = normMatchLabel(name);
  if (!gn) return '';
  const exact = (classes || []).find((c) => normMatchLabel(c?.name) === gn);
  if (exact?.id) return String(exact.id);
  const partial = (classes || []).find((c) => {
    const cn = normMatchLabel(c?.name);
    return cn && (cn.includes(gn) || gn.includes(cn));
  });
  return partial?.id ? String(partial.id) : '';
}

/** Tüm planlardan sınıf → öğrenci → ders kümesi */
export function buildClassStudentSubjectsIndex(plans, classes = []) {
  /** @type {Map<string, Map<string, Set<string>>>} */
  const index = new Map();
  for (const plan of plans || []) {
    const pj =
      plan?.planner_json && typeof plan.planner_json === 'object'
        ? plan.planner_json
        : plan && typeof plan === 'object' && Array.isArray(plan.groups)
          ? plan
          : null;
    if (!pj) continue;
    const groups = Array.isArray(pj.groups) ? pj.groups : [];
    for (const group of groups) {
      const classId = resolvePlannerGroupClassId(group, classes);
      if (!classId) continue;
      const subjects = collectSubjectsFromPlannerGroup(group, pj);
      if (!subjects.length) continue;
      const studentIds = plannerGroupStudentIds(group);
      if (!studentIds.length) continue;
      if (!index.has(classId)) index.set(classId, new Map());
      const sm = index.get(classId);
      for (const sid of studentIds) {
        if (!sm.has(sid)) sm.set(sid, new Set());
        for (const sub of subjects) sm.get(sid).add(sub);
      }
    }
  }
  return index;
}

async function upsertClassStudentSubjects(classId, studentId, subjects) {
  const cid = String(classId || '').trim();
  const sid = String(studentId || '').trim();
  const list = Array.isArray(subjects) ? subjects.map((s) => String(s || '').trim()).filter(Boolean) : [];
  if (!cid || !sid) return false;

  const { data: existing, error: getErr } = await supabaseAdmin
    .from('class_students')
    .select('id,subjects')
    .eq('class_id', cid)
    .eq('student_id', sid)
    .maybeSingle();

  if (getErr && /subjects|schema cache|PGRST204/i.test(String(getErr.message || ''))) {
    if (existing?.id) return false;
    const { error } = await supabaseAdmin.from('class_students').insert({ class_id: cid, student_id: sid });
    if (error) throw error;
    return true;
  }
  if (getErr) throw getErr;

  if (existing?.id) {
    const { error } = await supabaseAdmin.from('class_students').update({ subjects: list }).eq('id', existing.id);
    if (error) throw error;
    return true;
  }
  const { error } = await supabaseAdmin.from('class_students').insert({
    class_id: cid,
    student_id: sid,
    subjects: list
  });
  if (error) throw error;
  return true;
}

/** Yalnızca ders kapsamını günceller; üyelik silinmez. */
export async function patchClassStudentSubjects(classId, studentSubjectsMap, subjectOptions = []) {
  const cid = String(classId || '').trim();
  if (!cid || !studentSubjectsMap || typeof studentSubjectsMap !== 'object') {
    return { updated: 0 };
  }
  const opts = Array.isArray(subjectOptions)
    ? subjectOptions.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  let updated = 0;
  for (const [studentId, subs] of Object.entries(studentSubjectsMap)) {
    const sid = String(studentId || '').trim();
    if (!sid) continue;
    const { data: existing, error: getErr } = await supabaseAdmin
      .from('class_students')
      .select('id')
      .eq('class_id', cid)
      .eq('student_id', sid)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!existing?.id) continue;
    const picked = Array.isArray(subs) ? subs.map((s) => String(s || '').trim()).filter(Boolean) : [];
    const toStore = opts.length && picked.length >= opts.length ? [] : picked;
    const { error } = await supabaseAdmin.from('class_students').update({ subjects: toStore }).eq('id', existing.id);
    if (error) {
      if (/subjects|schema cache|PGRST204/i.test(String(error.message || ''))) continue;
      throw error;
    }
    updated += 1;
  }
  return { updated };
}

export async function patchBulkClassStudentSubjects(patches) {
  let updated = 0;
  let classesTouched = 0;
  for (const patch of patches || []) {
    const classId = String(patch?.class_id || '').trim();
    const map = patch?.student_subjects;
    const options = patch?.subject_options;
    if (!classId || !map || typeof map !== 'object') continue;
    const result = await patchClassStudentSubjects(classId, map, options);
    if (result.updated) classesTouched += 1;
    updated += result.updated;
  }
  return { updated, classes_touched: classesTouched };
}

export async function persistClassStudentSubjectsIndex(index) {
  let updated = 0;
  let classesTouched = 0;
  const samples = [];
  for (const [classId, studentMap] of index || []) {
    if (!studentMap?.size) continue;
    classesTouched += 1;
    for (const [studentId, subSet] of studentMap) {
      const subjects = [...subSet];
      const ok = await upsertClassStudentSubjects(classId, studentId, subjects);
      if (ok) {
        updated += 1;
        if (samples.length < 12) {
          samples.push({ class_id: classId, student_id: studentId, subjects });
        }
      }
    }
  }
  return { updated, classes_touched: classesTouched, samples };
}

export async function loadInstitutionClassesForSubjectSync(institutionId) {
  const instId = String(institutionId || '').trim();
  if (!instId) return [];
  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('id,name,class_level,branch,institution_id')
    .eq('institution_id', instId);
  if (error) throw error;
  return data || [];
}

export async function listInstitutionSchedulePlans(institutionId) {
  const instId = String(institutionId || '').trim();
  if (!instId) return [];
  const { data, error } = await supabaseAdmin
    .from('class_schedule_plans')
    .select('id,name,planner_json,institution_id,updated_at')
    .eq('institution_id', instId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) {
    if (String(error.message || '').includes('relation') || error.code === '42P01') return [];
    throw error;
  }
  if (data?.length) return data;
  const { data: allRows, error: allErr } = await supabaseAdmin
    .from('class_schedule_plans')
    .select('id,name,planner_json,institution_id,updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (allErr) {
    if (String(allErr.message || '').includes('relation') || allErr.code === '42P01') return [];
    throw allErr;
  }
  const instLower = instId.toLowerCase();
  return (allRows || []).filter((p) => String(p.institution_id || '').toLowerCase() === instLower);
}

/** Kurumdaki tüm kayıtlı planlardan öğrenci–ders kapsamını yazar. */
export async function syncInstitutionStudentSubjectsFromPlans(institutionId, plannerJsonExtra = null) {
  const plans = await listInstitutionSchedulePlans(institutionId);
  const classes = await loadInstitutionClassesForSubjectSync(institutionId);
  const index = buildClassStudentSubjectsIndex(plans, classes);
  if (plannerJsonExtra && typeof plannerJsonExtra === 'object') {
    const extra = buildClassStudentSubjectsIndex([plannerJsonExtra], classes);
    for (const [classId, studentMap] of extra) {
      if (!index.has(classId)) index.set(classId, new Map());
      const target = index.get(classId);
      for (const [sid, subs] of studentMap) {
        if (!target.has(sid)) target.set(sid, new Set());
        for (const sub of subs) target.get(sid).add(sub);
      }
    }
  }
  const persisted = await persistClassStudentSubjectsIndex(index);
  return {
    ...persisted,
    plans_scanned: plans.length,
    student_slots: [...index.values()].reduce((n, m) => n + m.size, 0),
    classes_in_index: index.size
  };
}
