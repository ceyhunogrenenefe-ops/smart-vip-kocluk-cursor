/**
 * Edesis yerel deneme atama — katalog senkron + sınıf/öğrenci junction.
 * Öğrenci Sınava Gir listesi bu atamalara göre backend’de filtrelenir.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { fetchEdesisExamsCatalog, pickEdesisCatalogExamId } from './edesis-client.js';
import { errorMessage } from './error-msg.js';

function pickExamTitle(row) {
  return String(
    row?.name ||
      row?.Name ||
      row?.examName ||
      row?.ExamName ||
      row?.sinavAdi ||
      row?.SinavAdi ||
      row?.title ||
      row?.Title ||
      ''
  ).trim();
}

function pickExamDate(row) {
  const raw =
    row?.examDate ||
    row?.ExamDate ||
    row?.date ||
    row?.Date ||
    row?.sinavTarihi ||
    row?.SinavTarihi ||
    null;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const s = String(raw).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  return d.toISOString().slice(0, 10);
}

function pickExamType(row) {
  return String(
    row?.examType ||
      row?.ExamType ||
      row?.sinavTuru ||
      row?.SinavTuru ||
      row?.type ||
      row?.Type ||
      ''
  ).trim() || null;
}

function mapCatalogRowToExamUpsert(row, institutionId) {
  const edesisExamId = pickEdesisCatalogExamId(row);
  if (!edesisExamId) return null;
  const now = new Date().toISOString();
  return {
    institution_id: institutionId || null,
    edesis_exam_id: String(edesisExamId),
    title: pickExamTitle(row) || `Deneme ${edesisExamId}`,
    exam_date: pickExamDate(row),
    exam_type: pickExamType(row),
    grade_name: String(row?.gradeName || row?.GradeName || row?.sinifAdi || '').trim() || null,
    is_online: row?.isOnline !== false && row?.IsOnline !== false,
    status: String(row?.status || row?.Status || row?.state || '').trim() || null,
    duration_seconds: Number(row?.durationSeconds || row?.sinavSuresi || row?.sure || 0) || null,
    raw: row,
    synced_at: now,
    updated_at: now
  };
}

/** Edesis GET /exams → edesis_exams upsert */
export async function syncEdesisExamCatalogToDb({ institutionId, cfg } = {}) {
  const inst = String(institutionId || '').trim() || null;
  const catalog = await fetchEdesisExamsCatalog(cfg || {}, {});
  const rows = Array.isArray(catalog.rows) ? catalog.rows : [];
  const upserts = rows
    .map((r) => mapCatalogRowToExamUpsert(r, inst))
    .filter(Boolean);

  let upserted = 0;
  const chunk = 80;
  for (let i = 0; i < upserts.length; i += chunk) {
    const slice = upserts.slice(i, i + chunk);
    const { error } = await supabaseAdmin.from('edesis_exams').upsert(slice, {
      onConflict: 'institution_id,edesis_exam_id',
      ignoreDuplicates: false
    });
    if (error) {
      // institution_id null unique davranışı farklı olabilir — tek tek dene
      if (/edesis_exams|schema cache|PGRST/i.test(errorMessage(error))) {
        throw Object.assign(new Error('edesis_exams_table_missing'), {
          code: 'SCHEMA_MISSING',
          hint: 'sql/2026-09-12-edesis-exam-assignments.sql dosyasını Supabase’te çalıştırın'
        });
      }
      throw error;
    }
    upserted += slice.length;
  }

  return {
    ok: true,
    fetched: rows.length,
    upserted,
    cached: Boolean(catalog.cached),
    totalCount: catalog.totalCount ?? rows.length
  };
}

export async function listSyncedEdesisExams({ institutionId, limit = 200 } = {}) {
  let q = supabaseAdmin
    .from('edesis_exams')
    .select(
      'id, institution_id, edesis_exam_id, title, exam_date, exam_type, grade_name, is_online, status, duration_seconds, synced_at'
    )
    .order('exam_date', { ascending: false, nullsFirst: false })
    .order('synced_at', { ascending: false })
    .limit(Math.min(500, Math.max(1, Number(limit) || 200)));
  if (institutionId) q = q.eq('institution_id', institutionId);
  const { data, error } = await q;
  if (error) {
    if (/edesis_exams|schema cache|PGRST/i.test(errorMessage(error))) {
      return { items: [], schemaMissing: true };
    }
    throw error;
  }
  return { items: data || [], schemaMissing: false };
}

export async function listEdesisExamAssignments({
  institutionId,
  edesisExamId,
  limit = 300
} = {}) {
  let q = supabaseAdmin
    .from('edesis_exam_assignments')
    .select(
      'id, institution_id, edesis_exam_id, target_type, class_id, student_id, assigned_by, starts_at, ends_at, notes, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(Math.min(1000, Math.max(1, Number(limit) || 300)));
  if (institutionId) q = q.eq('institution_id', institutionId);
  if (edesisExamId) q = q.eq('edesis_exam_id', String(edesisExamId));
  const { data, error } = await q;
  if (error) {
    if (/edesis_exam_assignments|schema cache|PGRST/i.test(errorMessage(error))) {
      return { items: [], schemaMissing: true };
    }
    throw error;
  }
  const items = await enrichEdesisExamAssignmentRows(data || []);
  return { items, schemaMissing: false };
}

async function enrichEdesisExamAssignmentRows(rows) {
  if (!rows.length) return [];
  const classIds = [...new Set(rows.map((r) => r.class_id).filter(Boolean))];
  const studentIds = [...new Set(rows.map((r) => r.student_id).filter(Boolean))];
  const classNameById = new Map();
  const studentNameById = new Map();
  if (classIds.length) {
    const { data } = await supabaseAdmin.from('classes').select('id, name').in('id', classIds);
    for (const c of data || []) classNameById.set(c.id, c.name);
  }
  if (studentIds.length) {
    const { data } = await supabaseAdmin.from('students').select('id, name').in('id', studentIds);
    for (const s of data || []) studentNameById.set(s.id, s.name);
  }
  return rows.map((r) => ({
    ...r,
    class_name: r.class_id ? classNameById.get(r.class_id) || null : null,
    student_name: r.student_id ? studentNameById.get(r.student_id) || null : null
  }));
}

/**
 * Atama oluştur.
 * targetType=class → classIds[]
 * targetType=student → studentIds[] (students.id)
 */
export async function createEdesisExamAssignments({
  institutionId,
  edesisExamId,
  targetType,
  classIds = [],
  studentIds = [],
  assignedBy = null,
  startsAt = null,
  endsAt = null,
  notes = null
} = {}) {
  const examId = String(edesisExamId || '').trim();
  const type = String(targetType || '').trim();
  if (!examId) throw new Error('edesis_exam_id_required');
  if (type !== 'class' && type !== 'student') throw new Error('target_type_invalid');

  const inst = String(institutionId || '').trim() || null;
  const rows = [];

  if (type === 'class') {
    const ids = [...new Set((classIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
    if (!ids.length) throw new Error('class_ids_required');
    for (const classId of ids) {
      rows.push({
        institution_id: inst,
        edesis_exam_id: examId,
        target_type: 'class',
        class_id: classId,
        student_id: null,
        assigned_by: assignedBy || null,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        notes: notes || null
      });
    }
  } else {
    const ids = [...new Set((studentIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
    if (!ids.length) throw new Error('student_ids_required');
    for (const studentId of ids) {
      rows.push({
        institution_id: inst,
        edesis_exam_id: examId,
        target_type: 'student',
        class_id: null,
        student_id: studentId,
        assigned_by: assignedBy || null,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        notes: notes || null
      });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('edesis_exam_assignments')
    .upsert(rows, {
      onConflict:
        type === 'class'
          ? 'institution_id,edesis_exam_id,class_id'
          : 'institution_id,edesis_exam_id,student_id',
      ignoreDuplicates: false
    })
    .select('id, edesis_exam_id, target_type, class_id, student_id');

  if (error) {
    // Unique partial indexes may not map to onConflict — insert + ignore duplicates
    if (/no unique|ON CONFLICT|42P10/i.test(errorMessage(error))) {
      const inserted = [];
      for (const row of rows) {
        const { data: one, error: e2 } = await supabaseAdmin
          .from('edesis_exam_assignments')
          .insert(row)
          .select('id, edesis_exam_id, target_type, class_id, student_id')
          .maybeSingle();
        if (e2) {
          if (/duplicate|unique/i.test(errorMessage(e2))) continue;
          if (/edesis_exam_assignments|schema cache|PGRST/i.test(errorMessage(e2))) {
            throw Object.assign(new Error('edesis_exam_assignments_table_missing'), {
              code: 'SCHEMA_MISSING',
              hint: 'sql/2026-09-12-edesis-exam-assignments.sql dosyasını Supabase’te çalıştırın'
            });
          }
          throw e2;
        }
        if (one) inserted.push(one);
      }
      return { ok: true, assigned: inserted.length, items: inserted };
    }
    if (/edesis_exam_assignments|schema cache|PGRST/i.test(errorMessage(error))) {
      throw Object.assign(new Error('edesis_exam_assignments_table_missing'), {
        code: 'SCHEMA_MISSING',
        hint: 'sql/2026-09-12-edesis-exam-assignments.sql dosyasını Supabase’te çalıştırın'
      });
    }
    throw error;
  }

  return { ok: true, assigned: (data || []).length, items: data || [] };
}

export async function deleteEdesisExamAssignment(assignmentId) {
  const id = String(assignmentId || '').trim();
  if (!id) throw new Error('assignment_id_required');
  const { error } = await supabaseAdmin.from('edesis_exam_assignments').delete().eq('id', id);
  if (error) throw error;
  return { ok: true };
}

/**
 * Öğrencinin (students.id) erişebileceği Edesis sınav ID seti.
 * Doğrudan öğrenci ataması VEYA class_students üzerinden sınıf ataması.
 */
export async function resolveLocallyAssignedEdesisExamIdsForStudent({
  studentId,
  institutionId = null
} = {}) {
  const sid = String(studentId || '').trim();
  if (!sid) {
    return { examIds: new Set(), classIds: [], schemaMissing: false, assignmentCount: 0 };
  }

  let classIds = [];
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from('class_students')
    .select('class_id')
    .eq('student_id', sid)
    .limit(200);
  if (!memErr && memberships?.length) {
    classIds = memberships.map((m) => String(m.class_id)).filter(Boolean);
  }

  let q = supabaseAdmin
    .from('edesis_exam_assignments')
    .select('id, edesis_exam_id, target_type, class_id, student_id, starts_at, ends_at')
    .limit(2000);
  if (institutionId) q = q.eq('institution_id', institutionId);

  // (student_id = sid) OR (class_id in (...))
  if (classIds.length) {
    q = q.or(`student_id.eq.${sid},class_id.in.(${classIds.join(',')})`);
  } else {
    q = q.eq('student_id', sid);
  }

  const { data, error } = await q;
  if (error) {
    if (/edesis_exam_assignments|schema cache|PGRST/i.test(errorMessage(error))) {
      return { examIds: new Set(), classIds, schemaMissing: true, assignmentCount: 0 };
    }
    throw error;
  }

  const now = Date.now();
  const examIds = new Set();
  for (const row of data || []) {
    if (row.starts_at && new Date(row.starts_at).getTime() > now) continue;
    if (row.ends_at && new Date(row.ends_at).getTime() < now) continue;
    const eid = String(row.edesis_exam_id || '').trim();
    if (eid) examIds.add(eid);
  }

  return {
    examIds,
    classIds,
    schemaMissing: false,
    assignmentCount: (data || []).length
  };
}

/** available-exams items → yalnızca yerel atananlar */
export function filterExamItemsByLocalAssignment(items, allowedExamIds) {
  if (!(allowedExamIds instanceof Set)) return [];
  return (items || []).filter((it) => {
    const id = String(it?.examId || it?.id || '').trim();
    return id && allowedExamIds.has(id);
  });
}

/**
 * Sınava giriş / booklet / structure için yetki.
 * schemaMissing → gate kapalı (eski davranış); aksi halde atama zorunlu.
 */
export async function assertStudentMayAccessEdesisExam({
  studentId,
  edesisExamId,
  institutionId = null
} = {}) {
  const examId = String(edesisExamId || '').trim();
  if (!examId) return { ok: false, reason: 'exam_id_required' };
  const resolved = await resolveLocallyAssignedEdesisExamIdsForStudent({
    studentId,
    institutionId
  });
  if (resolved.schemaMissing) {
    return { ok: true, gated: false, reason: 'schema_missing_passthrough' };
  }
  if (!resolved.examIds.has(examId)) {
    return { ok: false, gated: true, reason: 'not_assigned' };
  }
  return { ok: true, gated: true, reason: 'assigned' };
}
