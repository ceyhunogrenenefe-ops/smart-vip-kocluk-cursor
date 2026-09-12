/**
 * Edesis deneme atama — SQL şeması yoksa Supabase Storage JSON yedek.
 * Vercel’de SUPABASE_DB_PASSWORD olmadan da çalışır (service role yeter).
 */
import { randomUUID } from 'crypto';
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

export const EDESIS_ASSIGN_BUCKET = 'edesis-assign';
const EXAMS_PATH = 'catalog/exams.json';
const ASSIGNMENTS_PATH = 'catalog/assignments.json';

let bucketReady = false;

export async function ensureEdesisAssignStorageBackend() {
  if (bucketReady) return { ok: true, via: 'storage', created: false };
  const { data: buckets, error: listErr } = await supabaseAdmin.storage.listBuckets();
  if (listErr) throw listErr;
  const exists = (buckets || []).some((b) => b.name === EDESIS_ASSIGN_BUCKET);
  if (!exists) {
    const created = await supabaseAdmin.storage.createBucket(EDESIS_ASSIGN_BUCKET, {
      public: false,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ['application/json', 'text/plain']
    });
    if (
      created.error &&
      !/already|exists|duplicate/i.test(String(created.error.message || created.error))
    ) {
      throw created.error;
    }
  }
  // Seed empty files if missing
  await readJsonFile(EXAMS_PATH, []);
  await readJsonFile(ASSIGNMENTS_PATH, []);
  bucketReady = true;
  return { ok: true, via: 'storage', created: !exists };
}

async function readJsonFile(path, fallback) {
  const { data, error } = await supabaseAdmin.storage.from(EDESIS_ASSIGN_BUCKET).download(path);
  if (error) {
    const msg = errorMessage(error);
    if (/not found|404|Object not found/i.test(msg)) {
      await writeJsonFile(path, fallback);
      return fallback;
    }
    throw error;
  }
  const text = await data.text();
  try {
    const parsed = JSON.parse(text || 'null');
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path, value) {
  const body = Buffer.from(JSON.stringify(value, null, 0), 'utf8');
  const { error } = await supabaseAdmin.storage.from(EDESIS_ASSIGN_BUCKET).upload(path, body, {
    contentType: 'application/json',
    upsert: true,
    cacheControl: '0'
  });
  if (error) throw error;
}

export async function storageUpsertExams(rows) {
  await ensureEdesisAssignStorageBackend();
  let list = await readJsonFile(EXAMS_PATH, []);
  if (!Array.isArray(list)) list = [];

  const byKey = new Map(
    list.map((r) => [`${r.institution_id || ''}::${r.edesis_exam_id}`, r])
  );
  const now = new Date().toISOString();
  for (const row of rows || []) {
    const key = `${row.institution_id || ''}::${row.edesis_exam_id}`;
    const prev = byKey.get(key);
    byKey.set(key, {
      id: prev?.id || randomUUID(),
      ...row,
      created_at: prev?.created_at || now,
      updated_at: now,
      synced_at: row.synced_at || now
    });
  }
  const next = [...byKey.values()];
  await writeJsonFile(EXAMS_PATH, next);
  return { upserted: (rows || []).length, total: next.length };
}

export async function storageListExams({ institutionId = null, limit = 200 } = {}) {
  await ensureEdesisAssignStorageBackend();
  let list = await readJsonFile(EXAMS_PATH, []);
  if (!Array.isArray(list)) list = [];
  if (institutionId) {
    list = list.filter((r) => String(r.institution_id || '') === String(institutionId));
  }
  list.sort((a, b) => {
    const da = String(a.exam_date || '');
    const db = String(b.exam_date || '');
    if (da !== db) return db.localeCompare(da);
    return String(b.synced_at || '').localeCompare(String(a.synced_at || ''));
  });
  return list.slice(0, Math.min(500, Math.max(1, Number(limit) || 200)));
}

export async function storageListAssignments({
  institutionId = null,
  edesisExamId = null,
  limit = 300
} = {}) {
  await ensureEdesisAssignStorageBackend();
  let list = await readJsonFile(ASSIGNMENTS_PATH, []);
  if (!Array.isArray(list)) list = [];
  if (institutionId) {
    list = list.filter((r) => String(r.institution_id || '') === String(institutionId));
  }
  if (edesisExamId) {
    list = list.filter((r) => String(r.edesis_exam_id || '') === String(edesisExamId));
  }
  list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return list.slice(0, Math.min(1000, Math.max(1, Number(limit) || 300)));
}

export async function storageCreateAssignments(rows) {
  await ensureEdesisAssignStorageBackend();
  let list = await readJsonFile(ASSIGNMENTS_PATH, []);
  if (!Array.isArray(list)) list = [];
  const now = new Date().toISOString();
  const inserted = [];
  for (const row of rows || []) {
    const dup = list.find(
      (r) =>
        String(r.institution_id || '') === String(row.institution_id || '') &&
        String(r.edesis_exam_id || '') === String(row.edesis_exam_id || '') &&
        String(r.target_type || '') === String(row.target_type || '') &&
        String(r.class_id || '') === String(row.class_id || '') &&
        String(r.student_id || '') === String(row.student_id || '')
    );
    if (dup) {
      inserted.push(dup);
      continue;
    }
    const item = {
      id: randomUUID(),
      ...row,
      created_at: now
    };
    list.push(item);
    inserted.push(item);
  }
  await writeJsonFile(ASSIGNMENTS_PATH, list);
  return inserted;
}

export async function storageDeleteAssignment(assignmentId) {
  await ensureEdesisAssignStorageBackend();
  let list = await readJsonFile(ASSIGNMENTS_PATH, []);
  if (!Array.isArray(list)) list = [];
  const next = list.filter((r) => String(r.id) !== String(assignmentId));
  await writeJsonFile(ASSIGNMENTS_PATH, next);
  return { ok: true, removed: list.length - next.length };
}

export async function storageResolveExamIdsForStudent({
  studentId,
  classIds = [],
  institutionId = null
} = {}) {
  await ensureEdesisAssignStorageBackend();
  let list = await readJsonFile(ASSIGNMENTS_PATH, []);
  if (!Array.isArray(list)) list = [];
  if (institutionId) {
    list = list.filter((r) => String(r.institution_id || '') === String(institutionId));
  }
  const sid = String(studentId || '');
  const classSet = new Set((classIds || []).map(String));
  const now = Date.now();
  const examIds = new Set();
  let assignmentCount = 0;
  for (const row of list) {
    const matchStudent = row.target_type === 'student' && String(row.student_id || '') === sid;
    const matchClass =
      row.target_type === 'class' && row.class_id && classSet.has(String(row.class_id));
    if (!matchStudent && !matchClass) continue;
    if (row.starts_at && new Date(row.starts_at).getTime() > now) continue;
    if (row.ends_at && new Date(row.ends_at).getTime() < now) continue;
    assignmentCount += 1;
    const eid = String(row.edesis_exam_id || '').trim();
    if (eid) examIds.add(eid);
  }
  return { examIds, assignmentCount };
}
