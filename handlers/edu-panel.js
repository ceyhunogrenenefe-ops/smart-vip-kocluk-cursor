import { requireAuthenticatedActor } from '../api/_lib/auth.js';
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

function studentCanAccessLessonRow(ctx, row) {
  if (!row || !ctx.student) return false;
  if (!ctx.classIds.includes(row.class_id)) return false;
  if (row.status !== 'active') return false;
  const inst = ctx.student.institution_id;
  if (inst && row.institution_id && String(row.institution_id) !== String(inst)) return false;
  if (!ctx.teacherIds.length) return false;
  return ctx.teacherIds.includes(String(row.teacher_user_id));
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
  return Boolean(link);
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

async function enrichRows(rows, { viewerStudentUserId = null } = {}) {
  if (!rows?.length) return [];
  const ids = rows.map((r) => r.id);
  const [{ data: anims }, { data: hws }] = await Promise.all([
    supabaseAdmin.from('edu_animations').select('*').in('lesson_row_id', ids).order('display_order'),
    supabaseAdmin.from('edu_homework').select('*').in('lesson_row_id', ids).order('created_at')
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
  return rows.map((row) => ({
    ...row,
    animations: (anims || []).filter((a) => a.lesson_row_id === row.id),
    homework: (hws || [])
      .filter((h) => h.lesson_row_id === row.id)
      .map((h) => ({
        ...h,
        submissions: subs.filter((s) => s.homework_id === h.id)
      }))
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
          if (!ctx.classIds.length || !ctx.teacherIds.length) {
            return res.status(200).json({ data: [] });
          }
          const { data, error } = await supabaseAdmin
            .from('edu_lesson_rows')
            .select('*')
            .in('class_id', ctx.classIds)
            .in('teacher_user_id', ctx.teacherIds)
            .eq('status', 'active')
            .order('lesson_date', { ascending: false });
          if (error) throw error;
          const visible = (data || []).filter((row) => studentCanAccessLessonRow(ctx, row));
          const enriched = await enrichRows(visible, { viewerStudentUserId: actor.sub });
          const published = enriched.map((row) => ({
            ...row,
            homework: (row.homework || []).filter((h) => h.status === 'published')
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
        return res.status(200).json({ data: await enrichRows(data || []) });
      }

      if (req.method === 'POST') {
        if (!canTeach(tags)) return res.status(403).json({ error: 'forbidden' });
        const body = parseBody(req);
        const classId = String(body.class_id || '').trim();
        const title = String(body.title || '').trim();
        if (!classId || !title) return res.status(400).json({ error: 'class_id_and_title_required' });
        if (!(await teacherCanAccessClass(actor, classId, tags))) {
          return res.status(403).json({ error: 'class_forbidden' });
        }
        const { data: cls } = await supabaseAdmin
          .from('classes')
          .select('institution_id')
          .eq('id', classId)
          .maybeSingle();
        const insert = {
          teacher_user_id: actor.sub,
          institution_id: cls?.institution_id || actor.institution_id || null,
          class_id: classId,
          title,
          subject_name: String(body.subject_name || 'Ders').trim(),
          subject_color: String(body.subject_color || 'blue').trim(),
          lesson_date: String(body.lesson_date || new Date().toISOString().slice(0, 10)),
          status: ['draft', 'active', 'archived'].includes(String(body.status))
            ? String(body.status)
            : 'draft',
          notes: body.notes ? String(body.notes).trim() : null
        };
        const { data, error } = await supabaseAdmin
          .from('edu_lesson_rows')
          .insert(insert)
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json({ data });
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
        for (const k of ['title', 'subject_name', 'subject_color', 'lesson_date', 'status', 'notes', 'class_id']) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        const { data, error } = await supabaseAdmin
          .from('edu_lesson_rows')
          .update(patch)
          .eq('id', rowId)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
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
        await removeEduObject(EDU_ANIMATIONS_BUCKET, anim.storage_path);
        await supabaseAdmin.from('edu_animations').delete().eq('id', animId);
        return res.status(200).json({ ok: true });
      }
    }

    async function assertAnimationAccess(animId) {
      const { data: anim } = await supabaseAdmin
        .from('edu_animations')
        .select('storage_path, lesson_row_id')
        .eq('id', animId)
        .maybeSingle();
      if (!anim) return { error: 'not_found', status: 404 };
      const row = await loadRow(anim.lesson_row_id);
      if (!row) return { error: 'not_found', status: 404 };
      if (tags.includes('student')) {
        actor = await enrichStudentActor(actor);
        const ctx = await studentAccessContext(actor);
        if (!studentCanAccessLessonRow(ctx, row)) {
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
      const buf = await downloadEduBuffer(EDU_ANIMATIONS_BUCKET, access.anim.storage_path);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buf);
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
        const { data, error } = await supabaseAdmin
          .from('edu_homework')
          .insert({
            lesson_row_id: lessonRowId,
            title,
            book_name: body.book_name ? String(body.book_name) : null,
            question_range: body.question_range ? String(body.question_range) : null,
            description: body.description ? String(body.description) : null,
            due_date: body.due_date ? String(body.due_date) : null,
            status: body.status === 'published' ? 'published' : 'draft'
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json({ data });
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
        const { data, error } = await supabaseAdmin
          .from('edu_homework')
          .update(patch)
          .eq('id', hwId)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
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
        return res.status(200).json({ data: data || [] });
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
        const { data, error } = await supabaseAdmin
          .from('edu_homework_submissions')
          .update(patch)
          .eq('id', subId)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
      }
    }

    if (resource === 'submit' && req.method === 'POST') {
      if (!tags.includes('student')) return res.status(403).json({ error: 'forbidden' });
      actor = await enrichStudentActor(actor);
      const body = parseBody(req);
      const homeworkId = String(body.homework_id || '').trim();
      const b64 = String(body.image_base64 || '');
      if (!homeworkId || !b64) return res.status(400).json({ error: 'homework_id_and_file_required' });
      const { data: hw } = await supabaseAdmin.from('edu_homework').select('*').eq('id', homeworkId).maybeSingle();
      if (!hw || hw.status !== 'published') {
        return res.status(403).json({ error: 'homework_not_available' });
      }
      const lessonRow = await loadRow(hw.lesson_row_id);
      if (!lessonRow || lessonRow.status !== 'active') {
        return res.status(403).json({ error: 'homework_not_available' });
      }
      const ctx = await studentAccessContext(actor);
      if (!studentCanAccessLessonRow(ctx, lessonRow)) {
        return res.status(403).json({ error: 'not_in_class' });
      }
      const student = ctx.student;
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ error: 'file_too_large' });
      const path = `${homeworkId}/${actor.sub}-${Date.now()}.jpg`;
      await uploadEduBuffer({
        bucket: EDU_SUBMISSIONS_BUCKET,
        path,
        buffer: buf,
        contentType: body.mime || 'image/jpeg'
      });
      const { data, error } = await supabaseAdmin
        .from('edu_homework_submissions')
        .upsert(
          {
            homework_id: homeworkId,
            student_user_id: actor.sub,
            student_id: student?.id || null,
            storage_path: path,
            submitted_at: new Date().toISOString(),
            status: 'submitted'
          },
          { onConflict: 'homework_id,student_user_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ data });
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
      return res.status(200).json({ data: data || null });
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
        hint: 'Supabase: sql/2026-05-37-edu-lesson-rows.sql ve Storage bucket edu-animations, edu-homework-submissions'
      });
    }
    return res.status(500).json({ error: msg });
  }
}
