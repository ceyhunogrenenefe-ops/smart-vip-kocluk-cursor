import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { randomUUID } from 'crypto';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  EDU_ANIMATIONS_BUCKET,
  EDU_SUBMISSIONS_BUCKET,
  uploadEduBuffer,
  downloadEduBuffer,
  signedEduUrl,
  removeEduObject
} from '../api/_lib/edu-panel-storage.js';
import {
  classIdsForStudent,
  teacherIdsForStudent
} from '../api/_lib/student-teacher-scope.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function isSchemaMissing(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('edu_lesson_rows') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

function isPoolSchemaMissing(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('edu_animation_pool') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

async function resolveTeacherNames(userIds) {
  const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = {};
  if (!ids.length) return map;
  const { data: users } = await supabaseAdmin.from('users').select('id,name,email').in('id', ids);
  for (const u of users || []) {
    map[String(u.id)] = u.name || u.email || u.id;
  }
  return map;
}

async function loadPoolItem(poolId) {
  const { data, error } = await supabaseAdmin
    .from('edu_animation_pool')
    .select('*')
    .eq('id', poolId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function enrichPoolItems(items) {
  const names = await resolveTeacherNames((items || []).map((i) => i.teacher_user_id));
  return (items || []).map((i) => ({
    ...i,
    teacher_name: names[String(i.teacher_user_id)] || i.teacher_user_id
  }));
}

function normalizePoolTargets(item) {
  if (Array.isArray(item?.targets) && item.targets.length > 0) {
    return item.targets
      .map((t) => ({
        program: String(t?.program || '').trim().toLowerCase(),
        class_level: String(t?.class_level || '').trim()
      }))
      .filter((t) => ['lgs', 'tyt', 'ayt'].includes(t.program) && t.class_level);
  }
  const program = String(item?.program || '').trim().toLowerCase();
  const classLevel = String(item?.class_level || '').trim();
  if (!program || !classLevel) return [];
  return [{ program, class_level: classLevel }];
}

function poolItemMatchesFilter(item, program, classLevel) {
  if (!program && !classLevel) return true;
  return normalizePoolTargets(item).some(
    (t) =>
      (!program || t.program === program) &&
      (!classLevel || t.class_level === classLevel)
  );
}

function parsePoolTargetsInput(body) {
  if (!Array.isArray(body?.targets)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of body.targets) {
    const program = String(raw?.program || '').trim().toLowerCase();
    const classLevel = String(raw?.class_level || '').trim();
    if (!['lgs', 'tyt', 'ayt'].includes(program) || !classLevel) continue;
    const key = `${program}:${classLevel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ program, class_level: classLevel });
  }
  return out;
}

function teacherCanManagePool(actor, pool, tags) {
  if (tags.includes('admin') || tags.includes('super_admin')) return true;
  return String(pool.teacher_user_id) === String(actor.sub);
}

async function assertPoolInstitutionAccess(actor, pool, tags) {
  if (!pool) return { error: 'not_found', status: 404 };
  if (!canTeach(tags)) return { error: 'forbidden', status: 403 };
  const inst = actor.institution_id || null;
  if (inst && pool.institution_id && String(pool.institution_id) !== String(inst)) {
    return { error: 'forbidden', status: 403 };
  }
  return { pool };
}

async function resolveAnimStoragePath(anim) {
  if (anim.pool_id) {
    const pool = await loadPoolItem(anim.pool_id);
    if (pool?.storage_path) return pool.storage_path;
  }
  return anim.storage_path;
}

async function attachPoolAnimationToRow(lessonRowId, poolId) {
  const pool = await loadPoolItem(poolId);
  if (!pool) return null;
  const { data: existing } = await supabaseAdmin
    .from('edu_animations')
    .select('id')
    .eq('lesson_row_id', lessonRowId)
    .eq('pool_id', poolId)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabaseAdmin
    .from('edu_animations')
    .insert({
      lesson_row_id: lessonRowId,
      pool_id: poolId,
      original_name: pool.title || pool.original_name,
      storage_path: pool.storage_path,
      file_size: pool.file_size || 0,
      display_order: 0
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const TEACHER_ROLES = new Set(['teacher', 'coach', 'admin', 'super_admin']);

async function roleTags(actor) {
  const tags = await normalizedUserRolesFromDb(actor.sub);
  const set = new Set(tags);
  if (actor.role) set.add(String(actor.role).trim());
  return [...set];
}

function canTeach(tags) {
  return tags.some((t) => TEACHER_ROLES.has(t));
}

async function resolveStudent(actor) {
  if (actor.student_id) {
    const { data } = await supabaseAdmin
      .from('students')
      .select('id, user_id, platform_user_id, institution_id')
      .eq('id', actor.student_id)
      .maybeSingle();
    if (data) {
      const uid = String(actor.sub || '');
      const rowUser = data.user_id != null ? String(data.user_id) : '';
      const rowPlat = data.platform_user_id != null ? String(data.platform_user_id) : '';
      if (!uid || rowUser === uid || rowPlat === uid) return data;
    }
  }
  let q = supabaseAdmin
    .from('students')
    .select('id, user_id, platform_user_id, institution_id')
    .or(`user_id.eq.${actor.sub},platform_user_id.eq.${actor.sub}`);
  if (actor.institution_id) q = q.eq('institution_id', actor.institution_id);
  const { data } = await q.maybeSingle();
  return data;
}

async function studentAccessContext(actor) {
  const st = await resolveStudent(actor);
  if (!st?.id) return { student: null, classIds: [], teacherIds: [] };
  const classIds = await classIdsForStudent(st.id);
  const teacherIds = await teacherIdsForStudent({ studentId: st.id, classIds });
  return { student: st, classIds, teacherIds };
}

async function studentClassIds(actor) {
  const ctx = await studentAccessContext(actor);
  return {
    student: ctx.student,
    classIds: ctx.classIds,
    teacherIds: ctx.teacherIds
  };
}

function isJunctionMissing(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('edu_lesson_row_classes') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

async function loadRowClassIdsMap(rowIds) {
  const map = new Map();
  for (const id of rowIds) map.set(id, []);
  if (!rowIds.length) return map;
  try {
    const { data, error } = await supabaseAdmin
      .from('edu_lesson_row_classes')
      .select('lesson_row_id, class_id')
      .in('lesson_row_id', rowIds);
    if (error) {
      if (isJunctionMissing(error)) return map;
      throw error;
    }
    for (const link of data || []) {
      const list = map.get(link.lesson_row_id) || [];
      list.push(String(link.class_id));
      map.set(link.lesson_row_id, list);
    }
  } catch (e) {
    if (!isJunctionMissing(e)) throw e;
  }
  return map;
}

function mergedClassIdsForRow(row, linkMap) {
  const linked = linkMap.get(row.id) || [];
  return [...new Set([String(row.class_id), ...linked].filter(Boolean))];
}

function todayIsoDate() {
  return getIstanbulDateString();
}

function normalizeDateField(v, fallback = null) {
  const s = String(v || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return fallback;
}

function defaultAvailableUntil(lessonDate) {
  const base = normalizeDateField(lessonDate, todayIsoDate());
  const d = new Date(`${base}T12:00:00+03:00`);
  d.setDate(d.getDate() + 6);
  return getIstanbulDateString(d);
}

/**
 * available_from/until yoksa (eski satırlar / şema eksik) yalnızca lesson_date'e
 * sıkıştırmak ödevleri bir gün sonra öğrenciden gizler. Bitiş yoksa açık tut.
 */
function isRowAvailableNow(row) {
  const today = todayIsoDate();
  const lesson = normalizeDateField(row.lesson_date, null);
  const from = normalizeDateField(row.available_from, lesson);
  const until = normalizeDateField(row.available_until, null);
  if (from && today < from) return false;
  if (until && today > until) return false;
  return true;
}

async function teacherScopedClassIdsForRow(actor, row, tags) {
  const linkMap = await loadRowClassIdsMap([row.id]);
  const classIds = mergedClassIdsForRow(row, linkMap);
  if (tags.includes('admin') || tags.includes('super_admin')) return classIds;
  const scoped = [];
  for (const cid of classIds) {
    if (await teacherCanAccessClass(actor, cid, tags)) scoped.push(cid);
  }
  return scoped;
}

async function syncLessonRowClasses(rowId, classIds, primaryClassId, { strict = false } = {}) {
  const unique = [...new Set(classIds.map((c) => String(c).trim()).filter(Boolean))];
  const primary = String(primaryClassId || unique[0] || '').trim();
  if (primary && !unique.includes(primary)) unique.unshift(primary);
  if (!unique.length) return { classIds: [], junctionOk: true };
  try {
    await supabaseAdmin.from('edu_lesson_row_classes').delete().eq('lesson_row_id', rowId);
    const rows = unique.map((class_id) => ({ lesson_row_id: rowId, class_id }));
    const { error } = await supabaseAdmin.from('edu_lesson_row_classes').insert(rows);
    if (error) {
      if (isJunctionMissing(error)) return { classIds: unique, junctionOk: false };
      throw error;
    }
    return { classIds: unique, junctionOk: true };
  } catch (e) {
    if (isJunctionMissing(e)) return { classIds: unique, junctionOk: false };
    if (strict) throw e;
    throw e;
  }
}

function isOptionalEduColumnMissing(err, column) {
  const msg = String(err?.message || err || '').toLowerCase();
  const col = String(column || '').toLowerCase();
  return (
    msg.includes(col) &&
    (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('column'))
  );
}

async function insertLessonRowSafe(insert) {
  const { data, error } = await supabaseAdmin.from('edu_lesson_rows').insert(insert).select().single();
  if (!error) return data;
  if (
    isOptionalEduColumnMissing(error, 'available_from') ||
    isOptionalEduColumnMissing(error, 'available_until')
  ) {
    const retryInsert = { ...insert };
    delete retryInsert.available_from;
    delete retryInsert.available_until;
    const retry = await supabaseAdmin.from('edu_lesson_rows').insert(retryInsert).select().single();
    if (retry.error) throw retry.error;
    return retry.data;
  }
  throw error;
}

async function updateLessonRowSafe(rowId, patch) {
  const attempt = { ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin
    .from('edu_lesson_rows')
    .update(attempt)
    .eq('id', rowId)
    .select()
    .single();
  if (!error) return data;
  if (
    isOptionalEduColumnMissing(error, 'available_from') ||
    isOptionalEduColumnMissing(error, 'available_until')
  ) {
    const retryPatch = { ...attempt };
    delete retryPatch.available_from;
    delete retryPatch.available_until;
    const retry = await supabaseAdmin
      .from('edu_lesson_rows')
      .update(retryPatch)
      .eq('id', rowId)
      .select()
      .single();
    if (retry.error) throw retry.error;
    return retry.data;
  }
  throw error;
}

function studentCanAccessLessonRow(ctx, row, classIdsForRow = null) {
  if (!row || !ctx.student) return false;
  const rowClasses = classIdsForRow?.length
    ? classIdsForRow
    : [String(row.class_id)].filter(Boolean);
  if (!rowClasses.some((cid) => ctx.classIds.includes(cid))) return false;
  if (row.status !== 'active') return false;
  if (!isRowAvailableNow(row)) return false;
  const inst = ctx.student.institution_id;
  if (inst && row.institution_id && String(row.institution_id) !== String(inst)) return false;
  return true;
}

function normalizeAssigneeStudentIds(raw) {
  let list = raw;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((x) => String(x || '').trim()).filter(Boolean))];
}

function normalizePoolAnimationIds(raw, legacyOne = null) {
  const fromArr = Array.isArray(raw)
    ? raw.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (fromArr.length) return [...new Set(fromArr)];
  const one = String(legacyOne || '').trim();
  return one ? [one] : [];
}

function normalizeHomeworkRow(h) {
  if (!h || typeof h !== 'object') return h;
  const pool_animation_ids = normalizePoolAnimationIds(h.pool_animation_ids, h.pool_animation_id);
  const assignee_mode = h.assignee_mode === 'students' ? 'students' : 'class';
  const assignee_student_ids = normalizeAssigneeStudentIds(h.assignee_student_ids);
  return {
    ...h,
    pool_animation_ids,
    pool_animation_id: pool_animation_ids[0] || h.pool_animation_id || null,
    assignee_mode,
    assignee_student_ids
  };
}

function studentAssignedToHomework(hw, student) {
  if (!hw || !student?.id) return false;
  const mode = hw.assignee_mode === 'students' ? 'students' : 'class';
  if (mode !== 'students') return true;
  const ids = normalizeAssigneeStudentIds(hw.assignee_student_ids);
  return ids.includes(String(student.id));
}

function homeworkPastDue(dueDate, now = Date.now()) {
  const d = String(dueDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return now > new Date(`${d}T23:59:59.999+03:00`).getTime();
}

function computeHwStats({ hw, rosterSize = 0, submissionCount = 0, now = Date.now() }) {
  const mode = hw.assignee_mode === 'students' ? 'students' : 'class';
  const total =
    mode === 'students'
      ? normalizeAssigneeStudentIds(hw.assignee_student_ids).length
      : Math.max(Number(rosterSize) || 0, Number(submissionCount) || 0);
  const submitted = Math.min(Number(submissionCount) || 0, total || Number(submissionCount) || 0);
  const remaining = Math.max(0, (total || submitted) - submitted);
  const late = homeworkPastDue(hw.due_date, now) ? remaining : 0;
  const pending = homeworkPastDue(hw.due_date, now) ? 0 : remaining;
  const denom = total || submitted || 0;
  const rate = denom > 0 ? Math.round((submitted / denom) * 100) : 0;
  return { submitted, pending, late, total: denom, rate };
}

async function fetchActiveLessonRowsForStudent(ctx) {
  const { classIds } = ctx;
  const { data: primary, error: pErr } = await supabaseAdmin
    .from('edu_lesson_rows')
    .select('*')
    .in('class_id', classIds)
    .eq('status', 'active')
    .order('lesson_date', { ascending: false });
  if (pErr) throw pErr;

  const byId = new Map();
  for (const row of primary || []) byId.set(row.id, row);

  try {
    const { data: links, error: lErr } = await supabaseAdmin
      .from('edu_lesson_row_classes')
      .select('lesson_row_id')
      .in('class_id', classIds);
    if (lErr) {
      if (!isJunctionMissing(lErr)) throw lErr;
    } else {
      const extraIds = [...new Set((links || []).map((l) => l.lesson_row_id).filter((id) => !byId.has(id)))];
      if (extraIds.length) {
        const { data: extra, error: eErr } = await supabaseAdmin
          .from('edu_lesson_rows')
          .select('*')
          .in('id', extraIds)
          .eq('status', 'active');
        if (eErr) throw eErr;
        for (const row of extra || []) byId.set(row.id, row);
      }
    }
  } catch (e) {
    if (!isJunctionMissing(e)) throw e;
  }

  const linkMap = await loadRowClassIdsMap([...byId.keys()]);
  return [...byId.values()].filter((row) =>
    studentCanAccessLessonRow(ctx, row, mergedClassIdsForRow(row, linkMap))
  );
}

async function canStudentAccessRow(ctx, row) {
  const linkMap = await loadRowClassIdsMap([row.id]);
  return studentCanAccessLessonRow(ctx, row, mergedClassIdsForRow(row, linkMap));
}

async function teacherCanAccessClass(actor, classId, tags) {
  if (tags.includes('super_admin')) return true;
  const inst = actor.institution_id || null;
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, institution_id')
    .eq('id', classId)
    .maybeSingle();
  if (!cls) return false;
  if (inst && cls.institution_id && String(cls.institution_id) !== String(inst)) return false;
  if (tags.includes('admin')) return true;
  const { data: link } = await supabaseAdmin
    .from('class_teachers')
    .select('id')
    .eq('class_id', classId)
    .eq('teacher_id', actor.sub)
    .maybeSingle();
  if (link) return true;
  const tid = String(actor.sub || '').trim();
  const [{ data: slotHit }, { data: sessionHit }] = await Promise.all([
    supabaseAdmin
      .from('class_weekly_slots')
      .select('id')
      .eq('class_id', classId)
      .eq('teacher_id', tid)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('class_sessions')
      .select('id')
      .eq('class_id', classId)
      .eq('teacher_id', tid)
      .limit(1)
      .maybeSingle()
  ]);
  if (slotHit || sessionHit) return true;

  if (tags.includes('coach') && actor.coach_id) {
    const { data: studs } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('coach_id', actor.coach_id);
    const sids = (studs || []).map((s) => s.id).filter(Boolean);
    if (sids.length) {
      const { data: cs } = await supabaseAdmin
        .from('class_students')
        .select('id')
        .eq('class_id', classId)
        .in('student_id', sids)
        .limit(1);
      if (cs?.length) return true;
    }
  }

  return false;
}

function isProgressTableMissing(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('edu_lesson_row_progress') &&
    (msg.includes('does not exist') || msg.includes('schema cache'))
  );
}

function computeProgressPoints(animationCompleted, homeworkPercent) {
  const anim = animationCompleted ? 40 : 0;
  const hw = Math.round(Math.max(0, Math.min(100, Number(homeworkPercent) || 0)) * 0.6);
  return anim + hw;
}

async function loadProgressForRow(lessonRowId, studentUserId) {
  const { data, error } = await supabaseAdmin
    .from('edu_lesson_row_progress')
    .select('*')
    .eq('lesson_row_id', lessonRowId)
    .eq('student_user_id', studentUserId)
    .maybeSingle();
  if (error) {
    if (isProgressTableMissing(error)) return null;
    throw error;
  }
  return data;
}

async function upsertLessonRowProgress({
  lessonRowId,
  studentUserId,
  studentId,
  patch
}) {
  const existing = await loadProgressForRow(lessonRowId, studentUserId);
  const animationCompleted =
    patch.animation_completed !== undefined
      ? Boolean(patch.animation_completed)
      : Boolean(existing?.animation_completed);
  const homeworkPercent =
    patch.homework_percent !== undefined
      ? Math.max(0, Math.min(100, Math.round(Number(patch.homework_percent) || 0)))
      : Number(existing?.homework_percent || 0);
  const topicCompleted =
    patch.topic_completed !== undefined
      ? Boolean(patch.topic_completed)
      : Boolean(existing?.topic_completed);
  const now = new Date().toISOString();
  const row = {
    lesson_row_id: lessonRowId,
    student_user_id: studentUserId,
    student_id: studentId || existing?.student_id || null,
    animation_completed: animationCompleted,
    animation_completed_at:
      animationCompleted && !existing?.animation_completed
        ? now
        : existing?.animation_completed_at || (animationCompleted ? now : null),
    homework_percent: homeworkPercent,
    topic_completed: topicCompleted,
    topic_completed_at:
      topicCompleted && !existing?.topic_completed
        ? now
        : existing?.topic_completed_at || (topicCompleted ? now : null),
    points: computeProgressPoints(animationCompleted, homeworkPercent),
    updated_at: now
  };

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('edu_lesson_row_progress')
      .update(row)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from('edu_lesson_row_progress')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function studentsForLessonRow(row, { actor = null, tags = [], classId = null } = {}) {
  let classIds = mergedClassIdsForRow(row, await loadRowClassIdsMap([row.id]));
  if (actor) {
    classIds = await teacherScopedClassIdsForRow(actor, row, tags);
  }
  if (classId) classIds = classIds.filter((id) => String(id) === String(classId));
  if (!classIds.length) return { students: [], classIds: [] };
  const { data: cs, error } = await supabaseAdmin
    .from('class_students')
    .select('student_id, class_id')
    .in('class_id', classIds);
  if (error) throw error;
  const studentIds = [...new Set((cs || []).map((c) => String(c.student_id)).filter(Boolean))];
  if (!studentIds.length) return { students: [], classIds };
  const classByStudent = new Map();
  for (const link of cs || []) {
    if (!classByStudent.has(link.student_id)) classByStudent.set(link.student_id, link.class_id);
  }
  const { data: students, error: sErr } = await supabaseAdmin
    .from('students')
    .select('id, name, user_id, platform_user_id')
    .in('id', studentIds);
  if (sErr) throw sErr;
  return {
    students: (students || []).map((st) => ({
      ...st,
      class_id: classByStudent.get(st.id) || classIds[0]
    })),
    classIds
  };
}

function studentUserIdFromStudent(st) {
  return String(st.platform_user_id || st.user_id || '').trim();
}

async function loadRow(id) {
  const { data, error } = await supabaseAdmin
    .from('edu_lesson_rows')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const EDU_MAX_SUBMISSION_PHOTOS = 5;
const EDU_MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const EDU_MAX_VIDEO_BYTES = 30 * 1024 * 1024;

function submissionPhotoPaths(sub) {
  const fromJson = Array.isArray(sub?.photo_paths)
    ? sub.photo_paths.map((p) => String(p || '').trim()).filter(Boolean)
    : [];
  if (fromJson.length) return fromJson;
  const legacy = String(sub?.storage_path || '').trim();
  return legacy ? [legacy] : [];
}

function submissionAllMediaPaths(sub) {
  const photos = submissionPhotoPaths(sub);
  const video = String(sub?.video_path || '').trim();
  return [...photos, ...(video ? [video] : [])];
}

function extFromMime(mime, fallback = 'jpg') {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  if (m.includes('quicktime') || m.includes('mov')) return 'mov';
  return fallback;
}

async function enrichSubmissionWithMediaUrls(sub) {
  if (!sub) return sub;
  const photoPaths = submissionPhotoPaths(sub);
  const videoPath = String(sub.video_path || '').trim() || null;
  const photo_urls = [];
  for (const path of photoPaths) {
    try {
      const url = await signedEduUrl(EDU_SUBMISSIONS_BUCKET, path, 3600);
      if (url) photo_urls.push(url);
    } catch {
      /* skip broken object */
    }
  }
  let video_url = null;
  if (videoPath) {
    try {
      video_url = await signedEduUrl(EDU_SUBMISSIONS_BUCKET, videoPath, 3600);
    } catch {
      /* skip */
    }
  }
  return {
    ...sub,
    photo_paths: photoPaths,
    photo_urls,
    video_url,
    has_media: photoPaths.length > 0 || Boolean(videoPath)
  };
}

async function removeSubmissionMediaFiles(sub) {
  const paths = submissionAllMediaPaths(sub);
  for (const path of paths) {
    try {
      await removeEduObject(EDU_SUBMISSIONS_BUCKET, path);
    } catch {
      /* best effort */
    }
  }
}

async function enrichRows(rows, { viewerStudentUserId = null } = {}) {
  if (!rows?.length) return [];
  const ids = rows.map((r) => r.id);
  const [{ data: anims }, { data: hws }, linkMap] = await Promise.all([
    supabaseAdmin.from('edu_animations').select('*').in('lesson_row_id', ids).order('display_order'),
    supabaseAdmin.from('edu_homework').select('*').in('lesson_row_id', ids).order('created_at'),
    loadRowClassIdsMap(ids)
  ]);
  const hwIds = (hws || []).map((h) => h.id);
  let subs = [];
  if (hwIds.length) {
    let subQ = supabaseAdmin.from('edu_homework_submissions').select('*').in('homework_id', hwIds);
    if (viewerStudentUserId) {
      subQ = subQ.eq('student_user_id', viewerStudentUserId);
    }
    const { data } = await subQ;
    subs = data || [];
  }
  const teacherNames = await resolveTeacherNames(rows.map((r) => r.teacher_user_id));
  return rows.map((row) => ({
    ...row,
    teacher_name: teacherNames[String(row.teacher_user_id)] || null,
    class_ids: mergedClassIdsForRow(row, linkMap),
    animations: (anims || []).filter((a) => a.lesson_row_id === row.id),
    homework: (hws || [])
      .filter((h) => h.lesson_row_id === row.id)
      .map((h) => {
        const norm = normalizeHomeworkRow(h);
        const submissions = subs.filter((s) => s.homework_id === h.id);
        return {
          ...norm,
          submissions,
          stats: computeHwStats({
            hw: norm,
            rosterSize:
              norm.assignee_mode === 'students'
                ? normalizeAssigneeStudentIds(norm.assignee_student_ids).length
                : 0,
            submissionCount: submissions.length
          })
        };
      })
  }));
}

export default async function handler(req, res) {
  try {
    let actor = requireAuthenticatedActor(req);
    const tags = await roleTags(actor);
    const resource = String(req.query?.resource || req.body?.resource || 'rows').trim();
    const rowId = String(req.query?.id || req.body?.id || '').trim();

    if (resource === 'rows') {
      if (req.method === 'GET') {
        if (tags.includes('student')) {
          actor = await enrichStudentActor(actor);
          const ctx = await studentAccessContext(actor);
          if (!ctx.student?.id) {
            return res.status(200).json({
              data: [],
              hint: 'student_profile_missing',
              message: 'Öğrenci profiliniz bulunamadı. Yöneticinizle iletişime geçin.'
            });
          }
          if (!ctx.classIds.length) {
            return res.status(200).json({
              data: [],
              hint: 'student_not_in_class',
              message: 'Henüz bir sınıfa kaydınız yok. Ödevler sınıf ataması sonrası burada görünür.'
            });
          }
          const visible = await fetchActiveLessonRowsForStudent(ctx);
          const enriched = await enrichRows(visible, { viewerStudentUserId: actor.sub });
          const published = enriched.map((row) => ({
            ...row,
            homework: (row.homework || []).filter((h) => {
              if (h.status !== 'published') return false;
              return studentAssignedToHomework(h, ctx.student);
            })
          }));
          return res.status(200).json({ data: published });
        }

        if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });

        let q = supabaseAdmin.from('edu_lesson_rows').select('*').order('lesson_date', { ascending: false });
        if (!tags.includes('super_admin') && actor.institution_id) {
          q = q.eq('institution_id', actor.institution_id);
        }
        if (tags.includes('teacher') && !tags.includes('admin') && !tags.includes('super_admin')) {
          q = q.eq('teacher_user_id', actor.sub);
        }
        const { data, error } = await q;
        if (error) throw error;
        const enriched = await enrichRows(data || []);
        /* Öğretmen kart istatistikleri: sınıf mevcudu / seçili öğrenci */
        for (const row of enriched) {
          let roster = null;
          try {
            const packed = await studentsForLessonRow(row, { actor, tags });
            roster = packed.students || [];
          } catch {
            roster = [];
          }
          row.homework = (row.homework || []).map((h) => {
            const norm = normalizeHomeworkRow(h);
            const submissions = h.submissions || [];
            const submittedStudentIds = new Set(
              submissions.map((s) => String(s.student_id || '').trim()).filter(Boolean)
            );
            const submittedUserIds = new Set(
              submissions.map((s) => String(s.student_user_id || '').trim()).filter(Boolean)
            );
            const pool =
              norm.assignee_mode === 'students'
                ? roster.filter((st) =>
                    normalizeAssigneeStudentIds(norm.assignee_student_ids).includes(String(st.id))
                  )
                : roster;
            let submitted = 0;
            for (const st of pool) {
              const uid = studentUserIdFromStudent(st);
              if (submittedStudentIds.has(String(st.id)) || (uid && submittedUserIds.has(uid))) {
                submitted += 1;
              }
            }
            return {
              ...norm,
              submissions,
              stats: computeHwStats({
                hw: norm,
                rosterSize: pool.length,
                submissionCount: submitted
              })
            };
          });
        }
        return res.status(200).json({ data: enriched });
      }

      if (req.method === 'POST') {
        if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
        const body = parseBody(req);
        const title = String(body.title || '').trim();
        const classIdsRaw = Array.isArray(body.class_ids)
          ? body.class_ids.map((c) => String(c || '').trim()).filter(Boolean)
          : [];
        const classId = String(body.class_id || classIdsRaw[0] || '').trim();
        const classIds = [...new Set(classIdsRaw.length ? classIdsRaw : classId ? [classId] : [])];
        if (!classIds.length || !title) return res.status(400).json({ error: 'class_id_and_title_required' });
        for (const cid of classIds) {
          if (!(await teacherCanAccessClass(actor, cid, tags))) {
            return res.status(403).json({ error: 'class_forbidden' });
          }
        }
        const primaryClassId = classIds[0];
        const { data: cls } = await supabaseAdmin
          .from('classes')
          .select('institution_id')
          .eq('id', primaryClassId)
          .maybeSingle();
        const lessonDate = String(body.lesson_date || new Date().toISOString().slice(0, 10));
        const availableFrom = normalizeDateField(body.available_from, lessonDate);
        const availableUntil = normalizeDateField(
          body.available_until,
          defaultAvailableUntil(lessonDate)
        );
        const insert = {
          teacher_user_id: actor.sub,
          institution_id: cls?.institution_id || actor.institution_id || null,
          class_id: primaryClassId,
          title,
          subject_name: String(body.subject_name || 'Ders').trim(),
          subject_color: String(body.subject_color || 'blue').trim(),
          lesson_date: lessonDate,
          available_from: availableFrom,
          available_until: availableUntil,
          status: ['draft', 'active', 'archived'].includes(String(body.status))
            ? String(body.status)
            : 'draft',
          notes: body.notes ? String(body.notes).trim() : null
        };
        const data = await insertLessonRowSafe(insert);
        const sync = await syncLessonRowClasses(data.id, classIds, primaryClassId);
        const [enriched] = await enrichRows([data]);
        if (!sync.junctionOk && classIds.length > 1) {
          return res.status(201).json({
            data: enriched || data,
            warning: 'junction_table_missing',
            hint: 'Çoklu sınıf tablosu henüz yok — yalnızca birincil sınıf kaydedildi. Supabase\'de 2026-06-25-edu-lesson-row-classes.sql çalıştırın.'
          });
        }
        return res.status(201).json({ data: enriched || data });
      }

      if (req.method === 'PATCH' || req.method === 'DELETE') {
        if (!rowId) return res.status(400).json({ error: 'id_required' });
        const row = await loadRow(rowId);
        if (!row) return res.status(404).json({ error: 'not_found' });
        if (String(row.teacher_user_id) !== String(actor.sub) && !tags.includes('admin') && !tags.includes('super_admin')) {
          return res.status(403).json({ error: 'forbidden' });
        }
        if (req.method === 'DELETE') {
          await supabaseAdmin.from('edu_lesson_rows').delete().eq('id', rowId);
          return res.status(200).json({ ok: true });
        }
        const body = parseBody(req);
        const patch = {};
        for (const k of [
          'title',
          'subject_name',
          'subject_color',
          'lesson_date',
          'available_from',
          'available_until',
          'status',
          'notes',
          'class_id'
        ]) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        if (patch.lesson_date) {
          patch.lesson_date = normalizeDateField(patch.lesson_date, row.lesson_date);
        }
        if (patch.available_from !== undefined) {
          patch.available_from = normalizeDateField(
            patch.available_from,
            patch.lesson_date || row.lesson_date
          );
        }
        if (patch.available_until !== undefined) {
          patch.available_until = normalizeDateField(
            patch.available_until,
            row.available_until || defaultAvailableUntil(patch.lesson_date || row.lesson_date)
          );
        }

        let junctionWarning = null;
        if (Array.isArray(body.class_ids)) {
          const classIds = [...new Set(body.class_ids.map((c) => String(c || '').trim()).filter(Boolean))];
          if (!classIds.length) {
            return res.status(400).json({ error: 'class_ids_required' });
          }
          for (const cid of classIds) {
            if (!(await teacherCanAccessClass(actor, cid, tags))) {
              return res.status(403).json({
                error: 'class_forbidden',
                hint: 'Seçilen sınıflardan birine erişim yetkiniz yok.'
              });
            }
          }
          const primary = classIds.includes(String(body.class_id || row.class_id))
            ? String(body.class_id || row.class_id)
            : classIds[0];
          patch.class_id = primary;
          const sync = await syncLessonRowClasses(rowId, classIds, primary, { strict: true });
          if (!sync.junctionOk && classIds.length > 1) {
            return res.status(503).json({
              error: 'edu_junction_schema_missing',
              hint: 'Çoklu sınıf için Supabase: sql/2026-06-25-edu-lesson-row-classes.sql'
            });
          }
          if (!sync.junctionOk) junctionWarning = 'junction_table_missing_single_class';
        }

        const data = await updateLessonRowSafe(rowId, patch);
        const [enriched] = await enrichRows([data]);
        return res.status(200).json({
          data: enriched || data,
          warning: junctionWarning || undefined
        });
      }
    }

    if (resource === 'animation') {
      if (req.method === 'POST') {
        if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
        const body = parseBody(req);
        const lessonRowId = String(body.lesson_row_id || '').trim();
        const fileName = String(body.file_name || 'animation.html').trim();
        const b64 = String(body.file_base64 || '');
        if (!lessonRowId || !b64) return res.status(400).json({ error: 'lesson_row_id_and_file_required' });
        const row = await loadRow(lessonRowId);
        if (!row || String(row.teacher_user_id) !== String(actor.sub)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'file_too_large' });
        const path = `${lessonRowId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await uploadEduBuffer({
          bucket: EDU_ANIMATIONS_BUCKET,
          path,
          buffer: buf,
          contentType: 'text/html; charset=utf-8'
        });
        const { data, error } = await supabaseAdmin
          .from('edu_animations')
          .insert({
            lesson_row_id: lessonRowId,
            original_name: fileName,
            storage_path: path,
            file_size: buf.length,
            display_order: Number(body.display_order) || 0
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json({ data });
      }
      if (req.method === 'DELETE') {
        const animId = rowId || String(req.query?.animation_id || '').trim();
        if (!animId) return res.status(400).json({ error: 'id_required' });
        const { data: anim } = await supabaseAdmin
          .from('edu_animations')
          .select('*')
          .eq('id', animId)
          .maybeSingle();
        if (!anim) return res.status(404).json({ error: 'not_found' });
        const animRow = await loadRow(anim.lesson_row_id);
        const owner = animRow?.teacher_user_id;
        if (String(owner) !== String(actor.sub) && !tags.includes('admin')) {
          return res.status(403).json({ error: 'forbidden' });
        }
        if (!anim.pool_id) {
          await removeEduObject(EDU_ANIMATIONS_BUCKET, anim.storage_path);
        }
        await supabaseAdmin.from('edu_animations').delete().eq('id', animId);
        return res.status(200).json({ ok: true });
      }
    }

    async function assertAnimationAccess(animId) {
      const { data: anim } = await supabaseAdmin
        .from('edu_animations')
        .select('storage_path, lesson_row_id, pool_id')
        .eq('id', animId)
        .maybeSingle();
      if (!anim) return { error: 'not_found', status: 404 };
      const row = await loadRow(anim.lesson_row_id);
      if (!row) return { error: 'not_found', status: 404 };
      if (tags.includes('student')) {
        actor = await enrichStudentActor(actor);
        const ctx = await studentAccessContext(actor);
        if (!(await canStudentAccessRow(ctx, row))) {
          return { error: 'forbidden', status: 403 };
        }
      } else if (String(row.teacher_user_id) !== String(actor.sub) && !tags.includes('admin') && !tags.includes('super_admin')) {
        return { error: 'forbidden', status: 403 };
      }
      return { anim, row };
    }

    if (resource === 'signed-url') {
      const animId = String(req.query?.animation_id || rowId).trim();
      if (!animId) return res.status(400).json({ error: 'animation_id_required' });
      const access = await assertAnimationAccess(animId);
      if (access.error) return res.status(access.status).json({ error: access.error });
      const url = await signedEduUrl(EDU_ANIMATIONS_BUCKET, access.anim.storage_path, 600);
      return res.status(200).json({ url });
    }

    if (resource === 'animation-html' && req.method === 'GET') {
      const animId = String(req.query?.animation_id || rowId).trim();
      if (!animId) return res.status(400).json({ error: 'animation_id_required' });
      const access = await assertAnimationAccess(animId);
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (tags.includes('student')) {
        try {
          actor = await enrichStudentActor(actor);
          const ctx = await studentAccessContext(actor);
          if (ctx.student) {
            await upsertLessonRowProgress({
              lessonRowId: access.row.id,
              studentUserId: actor.sub,
              studentId: ctx.student.id,
              patch: { animation_completed: true }
            });
          }
        } catch (e) {
          if (!isProgressTableMissing(e)) throw e;
        }
      }
      const storagePath = await resolveAnimStoragePath(access.anim);
      const buf = await downloadEduBuffer(EDU_ANIMATIONS_BUCKET, storagePath);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buf);
    }

    if (resource === 'animation-pool') {
      if (req.method === 'GET') {
        if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
        let q = supabaseAdmin.from('edu_animation_pool').select('*').order('created_at', { ascending: false });
        const inst = actor.institution_id || null;
        if (inst) q = q.eq('institution_id', inst);
        const program = String(req.query?.program || '').trim().toLowerCase();
        const classLevel = String(req.query?.class_level || '').trim();
        const subjectName = String(req.query?.subject_name || '').trim();
        const search = String(req.query?.q || '').trim().toLowerCase();
        if (subjectName) q = q.eq('subject_name', subjectName);
        const { data, error } = await q;
        if (error) {
          if (isPoolSchemaMissing(error)) {
            return res.status(503).json({
              error: 'edu_pool_schema_missing',
              hint: 'Supabase: sql/2026-07-06-edu-animation-pool.sql'
            });
          }
          throw error;
        }
        let items = data || [];
        if (program || classLevel) {
          items = items.filter((item) => poolItemMatchesFilter(item, program, classLevel));
        }
        if (search) {
          items = items.filter((item) => {
            const hay = [item.title, item.subject_name, item.topic_name]
              .map((s) => String(s || '').toLowerCase())
              .join(' ');
            return hay.includes(search);
          });
        }
        return res.status(200).json({ data: await enrichPoolItems(items) });
      }
      if (req.method === 'POST') {
        if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
        const body = parseBody(req);
        const title = String(body.title || '').trim();
        const subjectName = String(body.subject_name || '').trim();
        const topicName = String(body.topic_name || '').trim();
        const fileName = String(body.file_name || 'animation.html').trim();
        const b64 = String(body.file_base64 || '');
        let targets = parsePoolTargetsInput(body);
        if (!targets?.length) {
          const program = String(body.program || '').trim().toLowerCase();
          const classLevel = String(body.class_level || '').trim();
          if (program && classLevel && ['lgs', 'tyt', 'ayt'].includes(program)) {
            targets = [{ program, class_level: classLevel }];
          }
        }
        if (!title || !targets?.length || !subjectName || !topicName || !b64) {
          return res.status(400).json({ error: 'pool_fields_required' });
        }
        const primary = targets[0];
        const program = primary.program;
        const classLevel = primary.class_level;
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'file_too_large' });
        const poolId = randomUUID();
        const path = `pool/${poolId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await uploadEduBuffer({
          bucket: EDU_ANIMATIONS_BUCKET,
          path,
          buffer: buf,
          contentType: 'text/html; charset=utf-8'
        });
        const insertRow = {
          id: poolId,
          institution_id: actor.institution_id || null,
          teacher_user_id: actor.sub,
          title,
          program,
          class_level: classLevel,
          targets,
          subject_name: subjectName,
          topic_name: topicName,
          original_name: fileName,
          storage_path: path,
          file_size: buf.length
        };
        let { data, error } = await supabaseAdmin
          .from('edu_animation_pool')
          .insert(insertRow)
          .select()
          .single();
        if (error && isOptionalEduColumnMissing(error, 'targets')) {
          const retryRow = { ...insertRow };
          delete retryRow.targets;
          const retry = await supabaseAdmin
            .from('edu_animation_pool')
            .insert(retryRow)
            .select()
            .single();
          data = retry.data;
          error = retry.error;
        }
        if (error) {
          if (isPoolSchemaMissing(error)) {
            return res.status(503).json({
              error: 'edu_pool_schema_missing',
              hint: 'Supabase: sql/2026-07-06-edu-animation-pool.sql'
            });
          }
          throw error;
        }
        const [enriched] = await enrichPoolItems([data]);
        return res.status(201).json({ data: enriched || data });
      }
      if (req.method === 'PATCH' || req.method === 'DELETE') {
        const body = parseBody(req);
        const pid =
          rowId ||
          String(req.query?.pool_id || body?.pool_id || body?.id || '').trim();
        if (!pid) return res.status(400).json({ error: 'id_required' });
        const pool = await loadPoolItem(pid);
        if (!pool) return res.status(404).json({ error: 'not_found' });
        if (!teacherCanManagePool(actor, pool, tags)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        if (req.method === 'DELETE') {
          await supabaseAdmin.from('edu_animations').delete().eq('pool_id', pid);
          await supabaseAdmin.from('edu_homework').update({ pool_animation_id: null }).eq('pool_animation_id', pid);
          await removeEduObject(EDU_ANIMATIONS_BUCKET, pool.storage_path);
          await supabaseAdmin.from('edu_animation_pool').delete().eq('id', pid);
          return res.status(200).json({ ok: true });
        }
        const patch = {};
        for (const k of ['title', 'program', 'class_level', 'subject_name', 'topic_name']) {
          if (body[k] !== undefined) patch[k] = String(body[k]).trim();
        }
        if (patch.program && !['lgs', 'tyt', 'ayt'].includes(String(patch.program).toLowerCase())) {
          return res.status(400).json({ error: 'invalid_program' });
        }
        const targets = parsePoolTargetsInput(body);
        if (targets?.length) {
          patch.targets = targets;
          patch.program = targets[0].program;
          patch.class_level = targets[0].class_level;
        }
        if (Object.keys(patch).length === 0) {
          return res.status(400).json({ error: 'nothing_to_update' });
        }
        let { data, error } = await supabaseAdmin
          .from('edu_animation_pool')
          .update(patch)
          .eq('id', pid)
          .select()
          .single();
        if (error && isOptionalEduColumnMissing(error, 'targets')) {
          const retryPatch = { ...patch };
          delete retryPatch.targets;
          const retry = await supabaseAdmin
            .from('edu_animation_pool')
            .update(retryPatch)
            .eq('id', pid)
            .select()
            .single();
          data = retry.data;
          error = retry.error;
        }
        if (error) throw error;
        const [enriched] = await enrichPoolItems([data]);
        return res.status(200).json({ data: enriched || data });
      }
    }

    if (resource === 'pool-animation-html' && req.method === 'GET') {
      const poolId = String(req.query?.pool_id || rowId).trim();
      if (!poolId) return res.status(400).json({ error: 'pool_id_required' });
      const pool = await loadPoolItem(poolId);
      const access = await assertPoolInstitutionAccess(actor, pool, tags);
      if (access.error) return res.status(access.status).json({ error: access.error });
      const buf = await downloadEduBuffer(EDU_ANIMATIONS_BUCKET, pool.storage_path);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buf);
    }

    if (resource === 'animation-attach-pool' && req.method === 'POST') {
      if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
      const body = parseBody(req);
      const lessonRowId = String(body.lesson_row_id || '').trim();
      const poolId = String(body.pool_id || '').trim();
      if (!lessonRowId || !poolId) return res.status(400).json({ error: 'lesson_row_id_and_pool_id_required' });
      const row = await loadRow(lessonRowId);
      if (!row || String(row.teacher_user_id) !== String(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const pool = await loadPoolItem(poolId);
      const access = await assertPoolInstitutionAccess(actor, pool, tags);
      if (access.error) return res.status(access.status).json({ error: access.error });
      const data = await attachPoolAnimationToRow(lessonRowId, poolId);
      return res.status(201).json({ data });
    }

    if (resource === 'homework') {
      if (req.method === 'POST') {
        if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
        const body = parseBody(req);
        const lessonRowId = String(body.lesson_row_id || '').trim();
        const title = String(body.title || '').trim();
        if (!lessonRowId || !title) return res.status(400).json({ error: 'lesson_row_id_and_title_required' });
        const row = await loadRow(lessonRowId);
        if (!row || String(row.teacher_user_id) !== String(actor.sub)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const poolAnimationIds = normalizePoolAnimationIds(
          body.pool_animation_ids,
          body.pool_animation_id
        );
        for (const poolAnimationId of poolAnimationIds) {
          const pool = await loadPoolItem(poolAnimationId);
          const access = await assertPoolInstitutionAccess(actor, pool, tags);
          if (access.error) return res.status(access.status).json({ error: access.error });
          await attachPoolAnimationToRow(lessonRowId, poolAnimationId);
        }

        const assigneeMode = body.assignee_mode === 'students' ? 'students' : 'class';
        const assigneeStudentIds =
          assigneeMode === 'students' ? normalizeAssigneeStudentIds(body.assignee_student_ids) : [];
        if (assigneeMode === 'students' && !assigneeStudentIds.length) {
          return res.status(400).json({ error: 'assignee_students_required' });
        }

        const insertHw = {
          lesson_row_id: lessonRowId,
          title,
          book_name: body.book_name ? String(body.book_name) : null,
          question_range: body.question_range ? String(body.question_range) : null,
          description: body.description ? String(body.description) : null,
          due_date: body.due_date ? String(body.due_date).slice(0, 10) : null,
          status: body.status === 'published' ? 'published' : 'draft'
        };
        if (poolAnimationIds[0]) insertHw.pool_animation_id = poolAnimationIds[0];
        insertHw.pool_animation_ids = poolAnimationIds;
        insertHw.assignee_mode = assigneeMode;
        insertHw.assignee_student_ids = assigneeStudentIds;

        let hwResult = await supabaseAdmin.from('edu_homework').insert(insertHw).select().single();
        if (hwResult.error) {
          const dropOptional = [
            'pool_animation_ids',
            'assignee_mode',
            'assignee_student_ids',
            'pool_animation_id'
          ];
          let retried = false;
          for (const col of dropOptional) {
            if (isOptionalEduColumnMissing(hwResult.error, col) && insertHw[col] !== undefined) {
              delete insertHw[col];
              retried = true;
            }
          }
          if (retried) {
            hwResult = await supabaseAdmin.from('edu_homework').insert(insertHw).select().single();
          }
        }
        if (hwResult.error) throw hwResult.error;
        return res.status(201).json({ data: normalizeHomeworkRow(hwResult.data) });
      }
      if (req.method === 'PATCH') {
        const hwId = rowId || String(req.query?.homework_id || '').trim();
        if (!hwId) return res.status(400).json({ error: 'id_required' });
        const { data: hw } = await supabaseAdmin.from('edu_homework').select('*').eq('id', hwId).maybeSingle();
        if (!hw) return res.status(404).json({ error: 'not_found' });
        const hwRow = await loadRow(hw.lesson_row_id);
        if (String(hwRow?.teacher_user_id) !== String(actor.sub) && !tags.includes('admin')) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const body = parseBody(req);
        const patch = {};
        for (const k of ['title', 'book_name', 'question_range', 'description', 'due_date', 'status']) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        if (body.assignee_mode !== undefined) {
          patch.assignee_mode = body.assignee_mode === 'students' ? 'students' : 'class';
        }
        if (body.assignee_student_ids !== undefined) {
          patch.assignee_student_ids = normalizeAssigneeStudentIds(body.assignee_student_ids);
        }
        if (body.pool_animation_ids !== undefined || body.pool_animation_id !== undefined) {
          const ids = normalizePoolAnimationIds(body.pool_animation_ids, body.pool_animation_id);
          patch.pool_animation_ids = ids;
          patch.pool_animation_id = ids[0] || null;
          for (const pid of ids) {
            await attachPoolAnimationToRow(hw.lesson_row_id, pid);
          }
        }
        const { data, error } = await supabaseAdmin
          .from('edu_homework')
          .update(patch)
          .eq('id', hwId)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data: normalizeHomeworkRow(data) });
      }
      if (req.method === 'DELETE') {
        const hwId = rowId;
        if (!hwId) return res.status(400).json({ error: 'id_required' });
        const { data: hw } = await supabaseAdmin.from('edu_homework').select('*').eq('id', hwId).maybeSingle();
        if (!hw) return res.status(404).json({ error: 'not_found' });
        const hwRowDel = await loadRow(hw.lesson_row_id);
        if (String(hwRowDel?.teacher_user_id) !== String(actor.sub) && !tags.includes('admin')) {
          return res.status(403).json({ error: 'forbidden' });
        }
        await supabaseAdmin.from('edu_homework').delete().eq('id', hwId);
        return res.status(200).json({ ok: true });
      }
    }

    if (resource === 'submissions') {
      const hwId = String(req.query?.homework_id || '').trim();
      if (req.method === 'GET' && hwId) {
        if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
        const { data: hw } = await supabaseAdmin.from('edu_homework').select('*').eq('id', hwId).maybeSingle();
        if (!hw) return res.status(404).json({ error: 'not_found' });
        const hwRowSub = await loadRow(hw.lesson_row_id);
        if (String(hwRowSub?.teacher_user_id) !== String(actor.sub) && !tags.includes('admin')) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const { data, error } = await supabaseAdmin
          .from('edu_homework_submissions')
          .select('*')
          .eq('homework_id', hwId)
          .order('submitted_at', { ascending: false });
        if (error) throw error;
        const subs = data || [];
        const studentIds = [...new Set(subs.map((s) => s.student_id).filter(Boolean))];
        const userIds = [...new Set(subs.map((s) => s.student_user_id).filter(Boolean))];
        const nameByStudentId = {};
        const nameByUserId = {};
        if (studentIds.length) {
          const { data: students } = await supabaseAdmin
            .from('students')
            .select('id, name, user_id, platform_user_id')
            .in('id', studentIds);
          for (const st of students || []) {
            nameByStudentId[st.id] = st.name || 'Öğrenci';
            const uid = String(st.platform_user_id || st.user_id || '').trim();
            if (uid) nameByUserId[uid] = st.name || 'Öğrenci';
          }
        }
        if (userIds.length) {
          const { data: users } = await supabaseAdmin.from('users').select('id, name').in('id', userIds);
          for (const u of users || []) {
            if (!nameByUserId[u.id]) nameByUserId[u.id] = u.name || 'Öğrenci';
          }
        }
        const enriched = await Promise.all(
          subs.map(async (s) => {
            const withUrls = await enrichSubmissionWithMediaUrls(s);
            const student_name =
              (s.student_id && nameByStudentId[s.student_id]) ||
              nameByUserId[s.student_user_id] ||
              'Öğrenci';
            return { ...withUrls, student_name };
          })
        );
        return res.status(200).json({ data: enriched });
      }
      if (req.method === 'PATCH') {
        const subId = rowId;
        const body = parseBody(req);
        const { data: sub } = await supabaseAdmin
          .from('edu_homework_submissions')
          .select('*')
          .eq('id', subId)
          .maybeSingle();
        if (!sub) return res.status(404).json({ error: 'not_found' });
        const { data: subHw } = await supabaseAdmin
          .from('edu_homework')
          .select('lesson_row_id')
          .eq('id', sub.homework_id)
          .maybeSingle();
        const subRow = await loadRow(subHw?.lesson_row_id);
        const owner = subRow?.teacher_user_id;
        if (String(owner) !== String(actor.sub) && !tags.includes('admin')) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const patch = {};
        if (body.teacher_note !== undefined) patch.teacher_note = body.teacher_note;
        if (body.grade !== undefined) patch.grade = body.grade;
        if (body.status !== undefined) patch.status = body.status;
        if (body.delete_media === true) {
          await removeSubmissionMediaFiles(sub);
          patch.storage_path = null;
          patch.photo_paths = [];
          patch.video_path = null;
        }
        const { data, error } = await supabaseAdmin
          .from('edu_homework_submissions')
          .update(patch)
          .eq('id', subId)
          .select()
          .single();
        if (error) throw error;
        const enriched = await enrichSubmissionWithMediaUrls(data);
        return res.status(200).json({ data: enriched });
      }
    }

    if (resource === 'submit' && req.method === 'POST') {
      if (!tags.includes('student')) return res.status(403).json({ error: 'forbidden' });
      actor = await enrichStudentActor(actor);
      const body = parseBody(req);
      const homeworkId = String(body.homework_id || '').trim();
      if (!homeworkId) return res.status(400).json({ error: 'homework_id_required' });

      const legacyB64 = String(body.image_base64 || '').trim();
      const photosInput = Array.isArray(body.photos_base64) ? body.photos_base64 : [];
      const videoB64 = String(body.video_base64 || '').trim();
      const hasLegacyPhoto = Boolean(legacyB64);
      const hasPhotos = photosInput.length > 0 || hasLegacyPhoto;
      const hasVideo = Boolean(videoB64);
      if (!hasPhotos && !hasVideo) {
        /* Medya olmadan teslim — kayıt oluşturulur */
      }

      const { data: hw } = await supabaseAdmin.from('edu_homework').select('*').eq('id', homeworkId).maybeSingle();
      if (!hw || hw.status !== 'published') {
        return res.status(403).json({ error: 'homework_not_available' });
      }
      const lessonRow = await loadRow(hw.lesson_row_id);
      if (!lessonRow || lessonRow.status !== 'active') {
        return res.status(403).json({ error: 'homework_not_available' });
      }
      const ctx = await studentAccessContext(actor);
      if (!(await canStudentAccessRow(ctx, lessonRow))) {
        return res.status(403).json({ error: 'not_in_class' });
      }
      if (!studentAssignedToHomework(normalizeHomeworkRow(hw), ctx.student)) {
        return res.status(403).json({ error: 'not_assigned' });
      }
      const student = ctx.student;

      const { data: existing } = await supabaseAdmin
        .from('edu_homework_submissions')
        .select('*')
        .eq('homework_id', homeworkId)
        .eq('student_user_id', actor.sub)
        .maybeSingle();
      if (existing) {
        await removeSubmissionMediaFiles(existing);
      }

      const photoPaths = [];
      let videoPath = null;
      const ts = Date.now();

      const uploadPhoto = async (b64, mime, index) => {
        const buf = Buffer.from(b64, 'base64');
        if (!buf.length) throw new Error('empty_photo');
        if (buf.length > EDU_MAX_PHOTO_BYTES) throw new Error('photo_too_large');
        const ext = extFromMime(mime, 'jpg');
        const path = `${homeworkId}/${actor.sub}-${ts}-${index}.${ext}`;
        await uploadEduBuffer({
          bucket: EDU_SUBMISSIONS_BUCKET,
          path,
          buffer: buf,
          contentType: mime || 'image/jpeg'
        });
        photoPaths.push(path);
      };

      if (hasLegacyPhoto) {
        await uploadPhoto(legacyB64, body.mime || 'image/jpeg', 0);
      } else {
        const capped = photosInput.slice(0, EDU_MAX_SUBMISSION_PHOTOS);
        for (let i = 0; i < capped.length; i++) {
          const item = capped[i];
          const b64 = typeof item === 'string' ? item : String(item?.data || item?.base64 || '').trim();
          if (!b64) continue;
          const mime = typeof item === 'object' && item?.mime ? String(item.mime) : 'image/jpeg';
          await uploadPhoto(b64, mime, photoPaths.length);
        }
      }

      if (hasVideo) {
        const vBuf = Buffer.from(videoB64, 'base64');
        if (!vBuf.length) return res.status(400).json({ error: 'empty_video' });
        if (vBuf.length > EDU_MAX_VIDEO_BYTES) return res.status(400).json({ error: 'video_too_large' });
        const vMime = String(body.video_mime || 'video/mp4');
        if (!vMime.startsWith('video/')) return res.status(400).json({ error: 'invalid_video_type' });
        const vExt = extFromMime(vMime, 'mp4');
        videoPath = `${homeworkId}/${actor.sub}-${ts}-video.${vExt}`;
        await uploadEduBuffer({
          bucket: EDU_SUBMISSIONS_BUCKET,
          path: videoPath,
          buffer: vBuf,
          contentType: vMime
        });
      }

      const upsertRow = {
        homework_id: homeworkId,
        student_user_id: actor.sub,
        student_id: student?.id || null,
        storage_path: photoPaths[0] || null,
        photo_paths: photoPaths,
        video_path: videoPath,
        submitted_at: new Date().toISOString(),
        status: 'submitted'
      };

      const { data, error } = await supabaseAdmin
        .from('edu_homework_submissions')
        .upsert(upsertRow, { onConflict: 'homework_id,student_user_id' })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    if (resource === 'progress') {
      if (req.method === 'GET') {
        if (!tags.includes('student')) return res.status(403).json({ error: 'forbidden' });
        actor = await enrichStudentActor(actor);
        const lessonRowId = String(req.query?.lesson_row_id || '').trim();
        let q = supabaseAdmin
          .from('edu_lesson_row_progress')
          .select('*')
          .eq('student_user_id', actor.sub);
        if (lessonRowId) q = q.eq('lesson_row_id', lessonRowId);
        const { data, error } = await q.order('updated_at', { ascending: false });
        if (error) {
          if (isProgressTableMissing(error)) return res.status(200).json({ data: [] });
          throw error;
        }
        return res.status(200).json({ data: data || [] });
      }
      if (req.method === 'POST') {
        if (!tags.includes('student')) return res.status(403).json({ error: 'forbidden' });
        actor = await enrichStudentActor(actor);
        const body = parseBody(req);
        const lessonRowId = String(body.lesson_row_id || '').trim();
        if (!lessonRowId) return res.status(400).json({ error: 'lesson_row_id_required' });
        const row = await loadRow(lessonRowId);
        if (!row || row.status !== 'active') {
          return res.status(403).json({ error: 'lesson_not_available' });
        }
        const ctx = await studentAccessContext(actor);
        if (!(await canStudentAccessRow(ctx, row))) {
          return res.status(403).json({ error: 'not_in_class' });
        }
        const patch = {};
        if (body.animation_completed !== undefined) patch.animation_completed = Boolean(body.animation_completed);
        if (body.homework_percent !== undefined) patch.homework_percent = body.homework_percent;
        if (body.topic_completed !== undefined) patch.topic_completed = Boolean(body.topic_completed);
        try {
          const data = await upsertLessonRowProgress({
            lessonRowId,
            studentUserId: actor.sub,
            studentId: ctx.student?.id || null,
            patch
          });
          return res.status(200).json({ data });
        } catch (e) {
          if (isProgressTableMissing(e)) {
            return res.status(503).json({
              error: 'edu_progress_schema_missing',
              hint: 'Supabase: sql/2026-06-26-edu-lesson-row-progress.sql'
            });
          }
          throw e;
        }
      }
    }

    if (resource === 'row-progress' && req.method === 'GET') {
      if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
      const lessonRowId = String(req.query?.lesson_row_id || '').trim();
      if (!lessonRowId) return res.status(400).json({ error: 'lesson_row_id_required' });
      const row = await loadRow(lessonRowId);
      if (!row) return res.status(404).json({ error: 'not_found' });
      if (
        String(row.teacher_user_id) !== String(actor.sub) &&
        !tags.includes('admin') &&
        !tags.includes('super_admin')
      ) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const classFilter = String(req.query?.class_id || '').trim();
      const { students, classIds: scopedClassIds } = await studentsForLessonRow(row, {
        actor,
        tags,
        classId: classFilter || null
      });
      let classMeta = [];
      if (scopedClassIds.length) {
        const { data: clsRows } = await supabaseAdmin
          .from('classes')
          .select('id, name')
          .in('id', scopedClassIds);
        classMeta = clsRows || [];
      }
      let progressRows = [];
      try {
        const { data, error } = await supabaseAdmin
          .from('edu_lesson_row_progress')
          .select('*')
          .eq('lesson_row_id', lessonRowId);
        if (error) {
          if (!isProgressTableMissing(error)) throw error;
        } else {
          progressRows = data || [];
        }
      } catch (e) {
        if (!isProgressTableMissing(e)) throw e;
      }
      const byUser = new Map(progressRows.map((p) => [String(p.student_user_id), p]));
      const merged = students.map((st) => {
        const uid = studentUserIdFromStudent(st);
        const p = uid ? byUser.get(uid) : null;
        return {
          student_id: st.id,
          student_user_id: uid,
          student_name: st.name || 'Öğrenci',
          class_id: st.class_id || null,
          animation_completed: Boolean(p?.animation_completed),
          homework_percent: Number(p?.homework_percent || 0),
          topic_completed: Boolean(p?.topic_completed),
          points: Number(p?.points || 0),
          topic_completed_at: p?.topic_completed_at || null
        };
      });
      merged.sort((a, b) => {
        const diff = (b.points || 0) - (a.points || 0);
        if (diff !== 0) return diff;
        return String(a.student_name).localeCompare(String(b.student_name), 'tr');
      });
      return res.status(200).json({ data: merged, classes: classMeta });
    }

    if (resource === 'my-submission' && req.method === 'GET') {
      const homeworkId = String(req.query?.homework_id || '').trim();
      if (!homeworkId) return res.status(400).json({ error: 'homework_id_required' });
      const { data } = await supabaseAdmin
        .from('edu_homework_submissions')
        .select('*')
        .eq('homework_id', homeworkId)
        .eq('student_user_id', actor.sub)
        .maybeSingle();
      const enriched = data ? await enrichSubmissionWithMediaUrls(data) : null;
      return res.status(200).json({ data: enriched });
    }

    if (resource === 'teacher-students' && req.method === 'GET') {
      if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
      const lessonRowId = String(req.query?.lesson_row_id || '').trim();
      if (lessonRowId) {
        const row = await loadRow(lessonRowId);
        if (!row) return res.status(404).json({ error: 'not_found' });
        if (
          String(row.teacher_user_id) !== String(actor.sub) &&
          !tags.includes('admin') &&
          !tags.includes('super_admin')
        ) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const { students } = await studentsForLessonRow(row, { actor, tags });
        return res.status(200).json({
          data: (students || []).map((st) => ({
            id: st.id,
            name: st.name || 'Öğrenci',
            user_id: studentUserIdFromStudent(st) || null,
            class_id: st.class_id || null
          }))
        });
      }
      let classQ = supabaseAdmin.from('classes').select('id, name').eq('status', 'active');
      if (!tags.includes('super_admin') && actor.institution_id) {
        classQ = classQ.eq('institution_id', actor.institution_id);
      }
      const { data: allClasses } = await classQ;
      const accessible = [];
      for (const cls of allClasses || []) {
        if (await teacherCanAccessClass(actor, cls.id, tags)) accessible.push(cls);
      }
      if (!accessible.length) return res.status(200).json({ data: [] });
      const classIds = accessible.map((c) => c.id);
      const { data: cs } = await supabaseAdmin
        .from('class_students')
        .select('student_id, class_id')
        .in('class_id', classIds);
      const sids = [...new Set((cs || []).map((x) => String(x.student_id)).filter(Boolean))];
      if (!sids.length) return res.status(200).json({ data: [] });
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('id, name, user_id, platform_user_id')
        .in('id', sids)
        .order('name');
      const classByStudent = new Map();
      for (const link of cs || []) {
        if (!classByStudent.has(link.student_id)) classByStudent.set(link.student_id, link.class_id);
      }
      return res.status(200).json({
        data: (students || []).map((st) => ({
          id: st.id,
          name: st.name || 'Öğrenci',
          user_id: studentUserIdFromStudent(st) || null,
          class_id: classByStudent.get(st.id) || null
        }))
      });
    }

    if (resource === 'homework-stats' && req.method === 'GET') {
      if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
      const hwId = String(req.query?.homework_id || '').trim();
      if (!hwId) return res.status(400).json({ error: 'homework_id_required' });
      const { data: hw } = await supabaseAdmin.from('edu_homework').select('*').eq('id', hwId).maybeSingle();
      if (!hw) return res.status(404).json({ error: 'not_found' });
      const hwRow = await loadRow(hw.lesson_row_id);
      if (String(hwRow?.teacher_user_id) !== String(actor.sub) && !tags.includes('admin')) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const norm = normalizeHomeworkRow(hw);
      const { students } = await studentsForLessonRow(hwRow, { actor, tags });
      const roster =
        norm.assignee_mode === 'students'
          ? (students || []).filter((st) =>
              normalizeAssigneeStudentIds(norm.assignee_student_ids).includes(String(st.id))
            )
          : students || [];
      const { data: subs } = await supabaseAdmin
        .from('edu_homework_submissions')
        .select('*')
        .eq('homework_id', hwId)
        .order('submitted_at', { ascending: true });
      const submissions = subs || [];
      const submittedStudentIds = new Set(
        submissions.map((s) => String(s.student_id || '').trim()).filter(Boolean)
      );
      const submittedUserIds = new Set(
        submissions.map((s) => String(s.student_user_id || '').trim()).filter(Boolean)
      );
      let submitted = 0;
      const missing = [];
      for (const st of roster) {
        const uid = studentUserIdFromStudent(st);
        const ok = submittedStudentIds.has(String(st.id)) || (uid && submittedUserIds.has(uid));
        if (ok) submitted += 1;
        else missing.push(st.name || 'Öğrenci');
      }
      const stats = computeHwStats({
        hw: norm,
        rosterSize: roster.length,
        submissionCount: submitted
      });
      const nameByStudent = Object.fromEntries(roster.map((s) => [s.id, s.name || 'Öğrenci']));
      const sorted = [...submissions].sort(
        (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
      );
      const earliest = sorted[0]
        ? {
            name: nameByStudent[sorted[0].student_id] || 'Öğrenci',
            at: sorted[0].submitted_at
          }
        : null;
      const latest = sorted.length
        ? {
            name: nameByStudent[sorted[sorted.length - 1].student_id] || 'Öğrenci',
            at: sorted[sorted.length - 1].submitted_at
          }
        : null;
      let photoCount = 0;
      let videoCount = 0;
      for (const s of submissions) {
        if (submissionPhotoPaths(s).length) photoCount += 1;
        if (String(s.video_path || '').trim()) videoCount += 1;
      }
      const rosterStatus = roster.map((st) => {
        const uid = studentUserIdFromStudent(st);
        const ok = submittedStudentIds.has(String(st.id)) || (uid && submittedUserIds.has(uid));
        let status = 'pending';
        if (ok) status = 'submitted';
        else if (homeworkPastDue(norm.due_date)) status = 'late';
        return {
          id: st.id,
          name: st.name || 'Öğrenci',
          user_id: uid || null,
          status
        };
      });
      return res.status(200).json({
        data: {
          ...stats,
          earliest,
          latest,
          missingNames: missing,
          photoCount,
          videoCount,
          roster: rosterStatus
        }
      });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg === 'Missing token' || msg === 'Token expired' || msg === 'Invalid token') {
      return res.status(401).json({ error: msg });
    }
    if (isSchemaMissing(e)) {
      return res.status(503).json({
        error: 'edu_schema_missing',
        hint:
          'Supabase: sql/2026-05-37-edu-lesson-rows.sql, sql/2026-07-07-edu-homework-solution-media.sql, sql/2026-07-08-edu-homework-enhancements.sql ve Storage bucket edu-homework-submissions'
      });
    }
    const mediaHints = {
      photo_too_large: 'Fotoğraf en fazla 10 MB olabilir.',
      video_too_large: 'Video en fazla 30 MB olabilir.',
      empty_photo: 'Fotoğraf dosyası okunamadı.',
      empty_video: 'Video dosyası okunamadı.',
      invalid_video_type: 'Geçersiz video formatı (mp4, webm, mov).'
    };
    if (mediaHints[msg]) {
      return res.status(400).json({ error: msg, hint: mediaHints[msg] });
    }
    return res.status(500).json({ error: msg });
  }
}
