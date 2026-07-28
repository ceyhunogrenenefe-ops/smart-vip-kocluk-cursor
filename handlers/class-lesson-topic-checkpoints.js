/**
 * Grup dersi "Nerede Kaldım?" konu kayıtları
 * GET  /api/class-lesson-topic-checkpoints?scope=...
 * POST /api/class-lesson-topic-checkpoints?op=upsert|delete
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import { getTeacherAssignedClassIds } from '../api/_lib/teacher-class-scope.js';
import {
  enrichRowsWithTrend,
  loadCheckpointBySessionId,
  loadCheckpointsForClassSubject,
  loadCheckpointsForSessionIds,
  loadLatestCheckpoint
} from '../api/_lib/class-lesson-topic-checkpoint.js';
import { shouldPromptTopicCheckpoint } from '../api/_lib/class-lesson-consecutive-sessions.js';
import { isMissingTableError } from '../api/_lib/supabase-schema.js';

const TABLE = 'class_lesson_topic_checkpoints';

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

function normalizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .trim();
}

function isAdminLike(role, roleTags) {
  const r = normalizeRole(role);
  if (r === 'admin' || r === 'super_admin') return true;
  const tags = Array.isArray(roleTags) ? roleTags : [];
  return tags.includes('admin') || tags.includes('super_admin');
}

async function actorMayAccessClass(actor, role, roleTags, classId) {
  if (isAdminLike(role, roleTags)) return true;
  if (normalizeRole(role) === 'coach') return true;
  const allowed = await getTeacherAssignedClassIds(actor.sub);
  return allowed.includes(String(classId || '').trim());
}

async function loadSessionOrNull(sessionId) {
  const { data } = await supabaseAdmin
    .from('class_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  return data || null;
}

async function loadClassMeta(classId) {
  const { data } = await supabaseAdmin.from('classes').select('id,name,class_level,institution_id').eq('id', classId).maybeSingle();
  return data || null;
}

function buildClassLabel(cls) {
  if (!cls) return '';
  const level = String(cls.class_level || '').trim();
  const name = String(cls.name || '').trim();
  if (level && name) return `${level}. Sınıf ${name}`;
  if (level) return `${level}. Sınıf`;
  return name || 'Sınıf';
}

function normalizeCheckpointPayload(body, defaults = {}) {
  const topic = String(body.topic || '').trim();
  if (!topic) {
    const e = new Error('topic_required');
    e.status = 400;
    throw e;
  }
  return {
    class_session_id: body.class_session_id ? String(body.class_session_id).trim() : defaults.class_session_id || null,
    class_id: String(body.class_id || defaults.class_id || '').trim(),
    institution_id: body.institution_id ?? defaults.institution_id ?? null,
    teacher_id: String(body.teacher_id || defaults.teacher_id || '').trim(),
    subject: String(body.subject || defaults.subject || '').trim(),
    lesson_date: String(body.lesson_date || defaults.lesson_date || '').slice(0, 10),
    class_label: String(body.class_label || defaults.class_label || '').trim() || null,
    topic,
    sub_topic: String(body.sub_topic || '').trim() || null,
    book_name: String(body.book_name || '').trim() || null,
    page_number: String(body.page_number || '').trim() || null,
    note: String(body.note || '').trim() || null
  };
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = await requireAuthenticatedActor(req);
  } catch (e) {
    return res.status(401).json({ error: errorMessage(e) || 'unauthorized' });
  }

  const role = normalizeRole(actor.role);
  const roleTags = await normalizedUserRolesFromDb(actor.sub);

  try {
    if (req.method === 'GET') {
      const scope = String(req.query.scope || 'latest').trim();

      if (scope === 'by-session') {
        const sessionId = String(req.query.session_id || '').trim();
        if (!sessionId) return res.status(400).json({ error: 'session_id_required' });
        const session = await loadSessionOrNull(sessionId);
        if (!session) return res.status(404).json({ error: 'session_not_found' });
        if (!(await actorMayAccessClass(actor, role, roleTags, session.class_id))) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const { missingTable, row } = await loadCheckpointBySessionId(sessionId);
        if (missingTable) {
          return res.status(503).json({
            error: 'table_missing',
            hint: 'sql/RUN_IN_SUPABASE_class_lesson_topic_checkpoints.sql'
          });
        }
        return res.status(200).json({ data: row });
      }

      if (scope === 'for-sessions') {
        const raw = String(req.query.session_ids || req.query.session_id || '').trim();
        const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
        if (!ids.length) return res.status(400).json({ error: 'session_ids_required' });
        const { data: sessions } = await supabaseAdmin.from('class_sessions').select('id,class_id').in('id', ids);
        for (const s of sessions || []) {
          if (!(await actorMayAccessClass(actor, role, roleTags, s.class_id))) {
            return res.status(403).json({ error: 'forbidden' });
          }
        }
        const { missingTable, bySession } = await loadCheckpointsForSessionIds(ids);
        if (missingTable) {
          return res.status(503).json({
            error: 'table_missing',
            hint: 'sql/RUN_IN_SUPABASE_class_lesson_topic_checkpoints.sql'
          });
        }
        return res.status(200).json({ data: bySession });
      }

      if (scope === 'latest') {
        const classId = String(req.query.class_id || '').trim();
        const subject = String(req.query.subject || '').trim();
        if (!classId || !subject) return res.status(400).json({ error: 'class_id_and_subject_required' });
        if (!(await actorMayAccessClass(actor, role, roleTags, classId))) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const beforeDate = req.query.before_date ? String(req.query.before_date).slice(0, 10) : null;
        const { missingTable, row } = await loadLatestCheckpoint({ classId, subject, beforeDate });
        if (missingTable) {
          return res.status(503).json({
            error: 'table_missing',
            hint: 'sql/RUN_IN_SUPABASE_class_lesson_topic_checkpoints.sql'
          });
        }
        return res.status(200).json({ data: row });
      }

      if (scope === 'history') {
        const classId = String(req.query.class_id || '').trim();
        const subject = String(req.query.subject || '').trim();
        if (!classId || !subject) return res.status(400).json({ error: 'class_id_and_subject_required' });
        if (!(await actorMayAccessClass(actor, role, roleTags, classId))) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const limit = Number(req.query.limit || 40);
        const { missingTable, rows } = await loadCheckpointsForClassSubject({ classId, subject, limit });
        if (missingTable) {
          return res.status(503).json({
            error: 'table_missing',
            hint: 'sql/RUN_IN_SUPABASE_class_lesson_topic_checkpoints.sql'
          });
        }
        return res.status(200).json({ data: enrichRowsWithTrend(rows) });
      }

      if (scope === 'admin') {
        if (!isAdminLike(role, roleTags) && normalizeRole(role) !== 'coach') {
          return res.status(403).json({ error: 'forbidden' });
        }
        let q = supabaseAdmin
          .from(TABLE)
          .select('*')
          .order('lesson_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(Math.min(500, Math.max(1, Number(req.query.limit || 200))));
        const teacherId = String(req.query.teacher_id || '').trim();
        const classId = String(req.query.class_id || '').trim();
        const subject = String(req.query.subject || '').trim();
        const from = String(req.query.date_from || '').slice(0, 10);
        const to = String(req.query.date_to || '').slice(0, 10);
        if (teacherId) q = q.eq('teacher_id', teacherId);
        if (classId) q = q.eq('class_id', classId);
        if (subject) q = q.eq('subject', subject);
        if (from) q = q.gte('lesson_date', from);
        if (to) q = q.lte('lesson_date', to);
        if (actor.institution_id && isAdminLike(role, roleTags)) {
          q = q.eq('institution_id', actor.institution_id);
        }
        const { data, error } = await q;
        if (error) {
          if (isMissingTableError(error)) {
            return res.status(503).json({
              error: 'table_missing',
              hint: 'sql/RUN_IN_SUPABASE_class_lesson_topic_checkpoints.sql'
            });
          }
          return res.status(500).json({ error: error.message });
        }
        const rows = enrichRowsWithTrend(data || []);
        const teacherIds = [...new Set(rows.map((r) => r.teacher_id).filter(Boolean))];
        const classIds = [...new Set(rows.map((r) => r.class_id).filter(Boolean))];
        const [{ data: users }, { data: classes }] = await Promise.all([
          teacherIds.length
            ? supabaseAdmin.from('users').select('id,name,email').in('id', teacherIds)
            : Promise.resolve({ data: [] }),
          classIds.length ? supabaseAdmin.from('classes').select('id,name,class_level').in('id', classIds) : Promise.resolve({ data: [] })
        ]);
        const userMap = Object.fromEntries((users || []).map((u) => [u.id, u.name || u.email || u.id]));
        const classMap = Object.fromEntries(
          (classes || []).map((c) => [c.id, buildClassLabel(c)])
        );
        return res.status(200).json({
          data: rows.map((r) => ({
            ...r,
            teacher_name: userMap[r.teacher_id] || r.teacher_id,
            class_display: r.class_label || classMap[r.class_id] || r.class_id
          }))
        });
      }

      if (scope === 'prompt-check') {
        const sessionId = String(req.query.session_id || '').trim();
        if (!sessionId) return res.status(400).json({ error: 'session_id_required' });
        const session = await loadSessionOrNull(sessionId);
        if (!session) return res.status(404).json({ error: 'session_not_found' });
        if (!(await actorMayAccessClass(actor, role, roleTags, session.class_id))) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const lessonDate = String(session.lesson_date || '').slice(0, 10);
        const { data: daySessions } = await supabaseAdmin
          .from('class_sessions')
          .select('id,class_id,subject,teacher_id,lesson_date,start_time,end_time,status')
          .eq('class_id', session.class_id)
          .eq('lesson_date', lessonDate);
        const shouldPrompt = shouldPromptTopicCheckpoint(session, daySessions || []);
        const { missingTable, row } = await loadCheckpointBySessionId(sessionId);
        if (missingTable) {
          return res.status(503).json({
            error: 'table_missing',
            hint: 'sql/RUN_IN_SUPABASE_class_lesson_topic_checkpoints.sql'
          });
        }
        return res.status(200).json({
          should_prompt: shouldPrompt && !row,
          has_checkpoint: Boolean(row),
          data: row
        });
      }

      return res.status(400).json({ error: 'invalid_scope' });
    }

    if (req.method === 'POST') {
      const op = String(req.query.op || 'upsert').trim();
      const body = parseBody(req);

      if (op === 'delete') {
        const id = String(body.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id_required' });
        const { data: existing } = await supabaseAdmin.from(TABLE).select('*').eq('id', id).maybeSingle();
        if (!existing) return res.status(404).json({ error: 'not_found' });
        if (!(await actorMayAccessClass(actor, role, roleTags, existing.class_id))) {
          return res.status(403).json({ error: 'forbidden' });
        }
        if (
          !isAdminLike(role, roleTags) &&
          normalizeRole(role) === 'teacher' &&
          String(existing.teacher_id) !== String(actor.sub)
        ) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const { error } = await supabaseAdmin.from(TABLE).delete().eq('id', id);
        if (error) {
          if (isMissingTableError(error)) {
            return res.status(503).json({
              error: 'table_missing',
              hint: 'sql/RUN_IN_SUPABASE_class_lesson_topic_checkpoints.sql'
            });
          }
          return res.status(500).json({ error: error.message });
        }
        return res.status(200).json({ ok: true });
      }

      if (op === 'upsert') {
        const id = String(body.id || '').trim();
        let defaults = {};
        if (body.class_session_id) {
          const session = await loadSessionOrNull(String(body.class_session_id).trim());
          if (!session) return res.status(404).json({ error: 'session_not_found' });
          if (!(await actorMayAccessClass(actor, role, roleTags, session.class_id))) {
            return res.status(403).json({ error: 'forbidden' });
          }
          const cls = await loadClassMeta(session.class_id);
          defaults = {
            class_session_id: session.id,
            class_id: session.class_id,
            institution_id: session.institution_id ?? cls?.institution_id ?? null,
            teacher_id: session.teacher_id,
            subject: session.subject,
            lesson_date: session.lesson_date,
            class_label: buildClassLabel(cls)
          };
        } else if (id) {
          const { data: existing } = await supabaseAdmin.from(TABLE).select('*').eq('id', id).maybeSingle();
          if (!existing) return res.status(404).json({ error: 'not_found' });
          defaults = { ...existing };
        }

        const payload = normalizeCheckpointPayload(body, defaults);
        if (!payload.class_id || !payload.subject || !payload.lesson_date || !payload.teacher_id) {
          return res.status(400).json({ error: 'class_id_subject_lesson_date_required' });
        }
        if (!(await actorMayAccessClass(actor, role, roleTags, payload.class_id))) {
          return res.status(403).json({ error: 'forbidden' });
        }
        if (
          !isAdminLike(role, roleTags) &&
          normalizeRole(role) === 'teacher' &&
          String(payload.teacher_id) !== String(actor.sub)
        ) {
          return res.status(403).json({ error: 'forbidden' });
        }

        const row = {
          ...payload,
          updated_at: new Date().toISOString(),
          updated_by: actor.sub,
          created_by: id ? undefined : actor.sub
        };

        let saved;
        if (id) {
          const { data, error } = await supabaseAdmin.from(TABLE).update(row).eq('id', id).select('*').maybeSingle();
          if (error) throw error;
          saved = data;
        } else if (payload.class_session_id) {
          const { row: existing } = await loadCheckpointBySessionId(payload.class_session_id);
          if (existing?.id) {
            const { data, error } = await supabaseAdmin
              .from(TABLE)
              .update(row)
              .eq('id', existing.id)
              .select('*')
              .maybeSingle();
            if (error) throw error;
            saved = data;
          } else {
            const { data, error } = await supabaseAdmin.from(TABLE).insert(row).select('*').maybeSingle();
            if (error) throw error;
            saved = data;
          }
        } else {
          const { data, error } = await supabaseAdmin.from(TABLE).insert(row).select('*').maybeSingle();
          if (error) throw error;
          saved = data;
        }
        return res.status(200).json({ data: saved });
      }

      return res.status(400).json({ error: 'invalid_op' });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const status = Number(e?.status) || 500;
    if (isMissingTableError(e)) {
      return res.status(503).json({
        error: 'table_missing',
        hint: 'sql/RUN_IN_SUPABASE_class_lesson_topic_checkpoints.sql'
      });
    }
    console.warn('[class-lesson-topic-checkpoints]', errorMessage(e));
    return res.status(status).json({ error: errorMessage(e) || 'server_error' });
  }
}
