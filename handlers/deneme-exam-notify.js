/**
 * CRM → Etkinlik Formları → Deneme Kulübü sınav bildirimleri
 * GET  /api/deneme-exam-notify
 * GET  /api/deneme-exam-notify?op=directory&q=
 * GET  /api/deneme-exam-notify?op=sends&exam_id=
 * POST /api/deneme-exam-notify?op=save|targets|test|retry|sync
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import { isMissingTableError } from '../api/_lib/supabase-schema.js';
import { EXAM_CALENDAR_LEVELS, EXAM_CALENDAR_LEVEL_LABELS } from '../api/_lib/exam-calendar.js';
import { getIstanbulDateString, addCalendarDaysYmd } from '../api/_lib/istanbul-time.js';
import {
  NOTIFY_GAPS,
  NOTIFY_SCHEMA_HINT,
  examLabel,
  loadNotifySettings,
  processDenemeExamNotify,
  sendNotifyTest
} from '../api/_lib/deneme-exam-notify.js';
import { normalizeNotifySettings } from '../api/_lib/deneme-exam-notify-logic.js';

const ALLOWED_ROLES = ['super_admin', 'admin', 'crm_agent', 'coach'];
const PLATFORM_PRIMARY_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

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

function schemaMiss(error) {
  return isMissingTableError(error, 'deneme_exam_notify') || String(error?.code || '') === '42P01';
}

async function resolveInstitution(actor, roles, req, body) {
  const requested = String(body?.institution_id || req.query?.institution_id || '').trim() || null;
  if (roles.has('super_admin')) return requested || actor.institution_id || PLATFORM_PRIMARY_INSTITUTION_ID;
  if (actor.institution_id) return String(actor.institution_id);
  const { data: u } = await supabaseAdmin.from('users').select('institution_id').eq('id', actor.sub).maybeSingle();
  return u?.institution_id ? String(u.institution_id) : null;
}

async function loadExamOptions(institutionId) {
  const today = getIstanbulDateString();
  const from = addCalendarDaysYmd(today, -21);
  const to = addCalendarDaysYmd(today, 21);
  let { data, error } = await supabaseAdmin
    .from('exam_calendar')
    .select('id, level, publisher, exam_no, exam_date, status, exam_time')
    .eq('institution_id', institutionId)
    .gte('exam_date', from)
    .lte('exam_date', to)
    .order('exam_date', { ascending: true })
    .limit(80);
  if (error && String(error.message || '').includes('exam_time')) {
    const retry = await supabaseAdmin
      .from('exam_calendar')
      .select('id, level, publisher, exam_no, exam_date, status')
      .eq('institution_id', institutionId)
      .gte('exam_date', from)
      .lte('exam_date', to)
      .order('exam_date', { ascending: true })
      .limit(80);
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return (data || []).map((exam) => ({
    id: exam.id,
    title: examLabel(exam),
    exam_date: exam.exam_date,
    exam_time: exam.exam_time || null,
    level: exam.level,
    status: exam.status || null
  }));
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch (e) {
    return res.status(401).json({ error: errorMessage(e) || 'Missing token' });
  }
  const roles = await actorRoleSet(actor);
  if (!ALLOWED_ROLES.some((r) => roles.has(r))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const body = req.method === 'POST' ? parseBody(req) : {};
  const institutionId = await resolveInstitution(actor, roles, req, body);
  if (!institutionId) return res.status(400).json({ error: 'institution_required' });
  const op = String(req.query?.op || body?.op || '').trim();

  try {
    if (req.method === 'GET' && op === 'directory') {
      const q = String(req.query?.q || '').trim().slice(0, 60);
      let students = [];
      if (q.length >= 2) {
        const { data, error } = await supabaseAdmin
          .from('students')
          .select('id, name, class_level')
          .eq('institution_id', institutionId)
          .ilike('name', `%${q.replace(/[%_]/g, '')}%`)
          .order('name')
          .limit(80);
        if (error) throw error;
        students = data || [];
      }
      let classQuery = supabaseAdmin.from('classes').select('id, name, class_level').order('name').limit(200);
      classQuery = classQuery.eq('institution_id', institutionId);
      const { data: classes, error: cErr } = await classQuery;
      if (cErr) throw cErr;
      const grades = EXAM_CALENDAR_LEVELS.map((id) => ({ id, label: EXAM_CALENDAR_LEVEL_LABELS[id] || id }));
      return res.status(200).json({ students, classes: classes || [], grades });
    }

    if (req.method === 'GET' && op === 'sends') {
      const examId = String(req.query?.exam_id || '').trim();
      let q = supabaseAdmin
        .from('deneme_exam_notify_sends')
        .select('id, exam_id, student_id, step, status, scheduled_for, phone, error, sent_at, updated_at')
        .eq('institution_id', institutionId)
        .order('updated_at', { ascending: false })
        .limit(300);
      if (examId) q = q.eq('exam_id', examId);
      const { data, error } = await q;
      if (error) throw error;
      const ids = [...new Set((data || []).map((r) => r.student_id).filter((id) => id && id !== '__test__'))];
      const names = new Map();
      if (ids.length) {
        const { data: students } = await supabaseAdmin.from('students').select('id, name').in('id', ids);
        for (const s of students || []) names.set(String(s.id), s.name);
      }
      return res.status(200).json({
        data: (data || []).map((row) => ({
          ...row,
          student_name: row.student_id === '__test__' ? 'Test alıcısı' : names.get(String(row.student_id)) || 'Öğrenci'
        }))
      });
    }

    if (req.method === 'GET') {
      let settings;
      let targets = [];
      try {
        settings = await loadNotifySettings(institutionId);
        const { data, error } = await supabaseAdmin
          .from('deneme_exam_notify_targets')
          .select('id, kind, student_id, class_id, grade_level')
          .eq('institution_id', institutionId);
        if (error) throw error;
        targets = data || [];
        const studentIds = targets.filter((t) => t.kind === 'student' && t.student_id).map((t) => t.student_id);
        const classIds = targets.filter((t) => t.kind === 'class' && t.class_id).map((t) => t.class_id);
        const nameByStudent = new Map();
        const nameByClass = new Map();
        if (studentIds.length) {
          const { data: students } = await supabaseAdmin.from('students').select('id, name').in('id', studentIds);
          for (const s of students || []) nameByStudent.set(String(s.id), s.name);
        }
        if (classIds.length) {
          const { data: classes } = await supabaseAdmin.from('classes').select('id, name').in('id', classIds);
          for (const c of classes || []) nameByClass.set(String(c.id), c.name);
        }
        targets = targets.map((t) => ({
          ...t,
          label:
            t.kind === 'student'
              ? nameByStudent.get(String(t.student_id)) || 'Öğrenci'
              : t.kind === 'class'
                ? nameByClass.get(String(t.class_id)) || 'Sınıf'
                : EXAM_CALENDAR_LEVEL_LABELS[t.grade_level] || t.grade_level
        }));
      } catch (e) {
        if (schemaMiss(e)) {
          return res.status(200).json({
            schema_missing: true,
            hint: NOTIFY_SCHEMA_HINT,
            gaps: NOTIFY_GAPS,
            settings: normalizeNotifySettings({}),
            targets: [],
            exams: [],
            counts: {}
          });
        }
        throw e;
      }
      const exams = await loadExamOptions(institutionId);
      const { data: statRows, error: statErr } = await supabaseAdmin
        .from('deneme_exam_notify_sends')
        .select('status')
        .eq('institution_id', institutionId)
        .neq('exam_id', '__test__')
        .limit(5000);
      if (statErr) throw statErr;
      const counts = {};
      for (const row of statRows || []) counts[row.status] = (counts[row.status] || 0) + 1;
      return res.status(200).json({ settings, targets, exams, counts, gaps: NOTIFY_GAPS });
    }

    if (req.method === 'POST' && op === 'save') {
      const settings = normalizeNotifySettings(body.settings || body);
      const { error } = await supabaseAdmin.from('deneme_exam_notify_settings').upsert(
        {
          institution_id: institutionId,
          ...settings,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'institution_id' }
      );
      if (error) throw error;
      return res.status(200).json({ ok: true, settings });
    }

    if (req.method === 'POST' && op === 'targets') {
      const incoming = Array.isArray(body.targets) ? body.targets : [];
      const seen = new Set();
      const rows = [];
      for (const raw of incoming) {
        const kind = String(raw?.kind || '');
        if (kind === 'student' && raw.student_id) {
          const key = `student:${raw.student_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ institution_id: institutionId, kind, student_id: String(raw.student_id) });
        } else if (kind === 'class' && raw.class_id) {
          const key = `class:${raw.class_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ institution_id: institutionId, kind, class_id: String(raw.class_id) });
        } else if (kind === 'grade' && EXAM_CALENDAR_LEVELS.includes(String(raw.grade_level))) {
          const key = `grade:${raw.grade_level}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ institution_id: institutionId, kind, grade_level: String(raw.grade_level) });
        }
      }
      const studentIds = rows.filter((r) => r.kind === 'student').map((r) => r.student_id);
      if (studentIds.length) {
        const { data, error } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('institution_id', institutionId)
          .in('id', studentIds);
        if (error) throw error;
        const ok = new Set((data || []).map((s) => String(s.id)));
        for (const id of studentIds) {
          if (!ok.has(id)) return res.status(400).json({ error: 'student_not_in_institution' });
        }
      }
      const { error: delErr } = await supabaseAdmin
        .from('deneme_exam_notify_targets')
        .delete()
        .eq('institution_id', institutionId);
      if (delErr) throw delErr;
      if (rows.length) {
        const { error } = await supabaseAdmin.from('deneme_exam_notify_targets').insert(rows);
        if (error) throw error;
      }
      return res.status(200).json({ ok: true, count: rows.length });
    }

    if (req.method === 'POST' && op === 'test') {
      const settings = await loadNotifySettings(institutionId);
      const step = ['day_before', 'soon', 'karne'].includes(body.step) ? body.step : 'day_before';
      const phone = String(body.phone || settings.test_phone || '').trim();
      const result = await sendNotifyTest({ institutionId, step, phone, settings });
      return res.status(200).json(result);
    }

    if (req.method === 'POST' && op === 'retry') {
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data, error } = await supabaseAdmin
        .from('deneme_exam_notify_sends')
        .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('institution_id', institutionId)
        .eq('status', 'failed')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ ok: Boolean(data) });
    }

    if (req.method === 'POST' && op === 'sync') {
      const summary = await processDenemeExamNotify({ institutionId });
      return res.status(200).json({ ok: true, summary });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    if (schemaMiss(e)) {
      return res.status(400).json({ error: 'schema_missing', hint: NOTIFY_SCHEMA_HINT, detail: errorMessage(e) });
    }
    return res.status(500).json({ error: errorMessage(e) || 'failed' });
  }
}
