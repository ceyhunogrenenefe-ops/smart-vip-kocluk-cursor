import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { getStudentPhones } from '../api/_lib/meetings-resolve.js';
import { wallTimeToUtcMs, normalizeTimeForParse } from '../api/_lib/teacher-lesson-start-ms.js';
import {
  buildEventTemplateVars,
  sendEventInvites,
  aggregateParticipantStats,
  resolveEventMeetingLink,
  templateBindingsNeedLink
} from '../api/_lib/institution-event-send.js';
import { syncSeminarRegistrationsToEvents } from '../api/_lib/sync-seminar-registrations.js';
import {
  importMetaTemplateForEvents,
  listMetaTemplatesForEventsImport,
  syncApprovedMetaTemplatesForEvents
} from '../api/_lib/meta-template-import.js';

export { buildEventTemplateVars };

const MANAGE_ROLES = new Set(['super_admin', 'admin', 'coach']);
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

function canManageEvents(actor) {
  return MANAGE_ROLES.has(String(actor.role || '').trim());
}

async function resolveInstitutionId(actor) {
  if (actor.institution_id) return String(actor.institution_id);
  const { data: u } = await supabaseAdmin
    .from('users')
    .select('institution_id, email, role')
    .eq('id', actor.sub)
    .maybeSingle();
  if (u?.institution_id) return String(u.institution_id);
  const coachLookupId = actor.coach_id ? String(actor.coach_id) : null;
  if (coachLookupId) {
    const { data: c } = await supabaseAdmin
      .from('coaches')
      .select('institution_id')
      .eq('id', coachLookupId)
      .maybeSingle();
    if (c?.institution_id) return String(c.institution_id);
  }
  const role = String(actor.role || u?.role || '').trim();
  const email = String(u?.email || '').trim().toLowerCase();
  if (email && (role === 'coach' || role === 'teacher')) {
    const { data: co } = await supabaseAdmin
      .from('coaches')
      .select('institution_id')
      .ilike('email', email)
      .maybeSingle();
    if (co?.institution_id) return String(co.institution_id);
  }
  return null;
}

function sanitizeInstitutionId(raw) {
  const id = String(raw || '').trim();
  if (!id || id === 'default') return null;
  return id;
}

function resolveEffectiveInstitutionId(actor, institutionId, req, body) {
  const fromBody =
    body && typeof body === 'object' ? sanitizeInstitutionId(body.institution_id) : null;
  const fromQuery = sanitizeInstitutionId(req.query?.institution_id);
  const resolvedActorInst = sanitizeInstitutionId(institutionId);
  if (resolvedActorInst) return resolvedActorInst;
  if (fromBody) return fromBody;
  if (fromQuery) return fromQuery;
  if (actor.role === 'super_admin') return PLATFORM_PRIMARY_INSTITUTION_ID;
  return null;
}

function isMissingClassesColumnError(error) {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    msg.includes('class_level') ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('could not find') && msg.includes('column'))
  );
}

async function loadClassesForEvents(instFilter) {
  let q = supabaseAdmin.from('classes').select('id, name, class_level').order('name');
  if (instFilter) q = q.eq('institution_id', instFilter);
  const { data, error } = await q.limit(200);
  if (!error) return data || [];
  if (isMissingClassesColumnError(error)) {
    let q2 = supabaseAdmin.from('classes').select('id, name').order('name');
    if (instFilter) q2 = q2.eq('institution_id', instFilter);
    const { data: data2, error: error2 } = await q2.limit(200);
    if (error2) throw error2;
    return (data2 || []).map((c) => ({ ...c, class_level: null }));
  }
  throw error;
}

function normalizeTrParticipantPhone(raw) {
  const e164 = normalizePhoneToE164(raw);
  if (e164) return e164;
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('05')) return normalizePhoneToE164(digits);
  if (digits.length === 10 && digits.startsWith('5')) return normalizePhoneToE164(`0${digits}`);
  if (digits.length === 12 && digits.startsWith('90')) return normalizePhoneToE164(`+${digits}`);
  if (digits.length === 13 && digits.startsWith('905')) return normalizePhoneToE164(`+${digits}`);
  return null;
}

const EVENTS_SCHEMA_HINT =
  'Supabase SQL Editor\'da sırayla: 2026-06-08-institution-events-full-setup.sql, ardından 2026-06-15-institution-events-migrations-bundle.sql';

function isEventsSchemaError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    code === '42703' ||
    code === '22P02' ||
    msg.includes('institution_events') ||
    msg.includes('institution_event_participants') ||
    msg.includes('invalid input syntax for type uuid') ||
    msg.includes('schema cache') ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('does not exist') && (msg.includes('relation') || msg.includes('table')))
  );
}

function schemaHintResponse(res, statusCode, error) {
  return res.status(statusCode).json({
    error: 'events_schema_missing',
    warning: 'events_schema_missing',
    detail: String(error?.message || error || 'schema_error'),
    hint: EVENTS_SCHEMA_HINT
  });
}

function parseScheduleFromBody(body) {
  const rawMode = String(body.send_mode || '').trim();
  const sendWhatsApp = body.send_whatsapp === true || body.send_now === true;
  let send_mode = rawMode || (sendWhatsApp ? 'immediate' : 'manual');
  if (!['manual', 'immediate', 'once', 'daily'].includes(send_mode)) send_mode = 'manual';

  let scheduled_send_at = null;
  let daily_send_time = null;
  let schedule_status = 'idle';

  if (send_mode === 'once') {
    if (body.scheduled_send_at) {
      scheduled_send_at = new Date(String(body.scheduled_send_at)).toISOString();
    } else if (body.schedule_date && body.schedule_time) {
      const ms = wallTimeToUtcMs(String(body.schedule_date).slice(0, 10), body.schedule_time);
      if (ms != null) scheduled_send_at = new Date(ms).toISOString();
    }
    schedule_status = scheduled_send_at ? 'scheduled' : 'idle';
  } else if (send_mode === 'daily') {
    const t = body.daily_send_time || body.schedule_time;
    if (t) daily_send_time = normalizeTimeForParse(t);
    schedule_status = daily_send_time ? 'scheduled' : 'idle';
  }

  return { send_mode, scheduled_send_at, daily_send_time, schedule_status };
}

async function attachEventStats(rows) {
  if (!rows?.length) return [];
  const ids = rows.map((r) => r.id);
  const { data: parts } = await supabaseAdmin
    .from('institution_event_participants')
    .select('event_id, whatsapp_status')
    .in('event_id', ids);
  const statsByEvent = {};
  for (const p of parts || []) {
    if (!statsByEvent[p.event_id]) statsByEvent[p.event_id] = { total: 0, sent: 0, failed: 0, pending: 0 };
    statsByEvent[p.event_id].total++;
    const st = String(p.whatsapp_status || 'pending');
    if (st === 'sent') statsByEvent[p.event_id].sent++;
    else if (st === 'failed') statsByEvent[p.event_id].failed++;
    else statsByEvent[p.event_id].pending++;
  }
  return rows.map((r) => {
    const stats = statsByEvent[r.id] || { total: 0, sent: 0, failed: 0, pending: 0 };
    return {
      ...r,
      whatsapp_stats: stats,
      institution_event_participants: [{ count: stats.total }]
    };
  });
}

async function loadEvent(id, institutionId) {
  const { data: event, error } = await supabaseAdmin
    .from('institution_events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!event) return null;
  if (institutionId && event.institution_id !== institutionId) return null;
  const { data: participants } = await supabaseAdmin
    .from('institution_event_participants')
    .select('*')
    .eq('event_id', id)
    .order('created_at', { ascending: true });
  return { ...event, participants: participants || [] };
}

async function loadEventWithStats(id, institutionId) {
  const row = await loadEvent(id, institutionId);
  if (!row) return null;
  return { ...row, whatsapp_stats: aggregateParticipantStats(row.participants) };
}

function normalizeParticipantInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const display_name = String(raw.display_name || raw.name || '').trim();
  let phone = String(raw.phone || '').trim();
  const student_id = raw.student_id ? String(raw.student_id).trim() : null;
  let source_type = String(raw.source_type || raw.recipient_kind || '').trim().toLowerCase();
  if (!source_type) {
    source_type = student_id ? 'student' : 'external';
  }
  if (!['student', 'parent', 'external'].includes(source_type)) source_type = student_id ? 'student' : 'external';
  if (!display_name && !student_id && source_type !== 'external') return null;
  if (source_type === 'external' && !display_name) return null;
  return { display_name, phone, student_id, source_type };
}

async function resolveParticipantPhone(studentId, fallbackPhone, sourceType = 'student') {
  if (!studentId) return normalizeTrParticipantPhone(fallbackPhone);
  const { data: st } = await supabaseAdmin
    .from('students')
    .select('id, name, phone, parent_phone, email')
    .eq('id', studentId)
    .maybeSingle();
  if (!st) return normalizeTrParticipantPhone(fallbackPhone);

  if (sourceType === 'parent') {
    return normalizePhoneToE164(st.parent_phone) || normalizeTrParticipantPhone(fallbackPhone);
  }

  const normalized = normalizeTrParticipantPhone(fallbackPhone);
  if (normalized) return normalized;
  const phones = await getStudentPhones(st);
  return phones[0] || normalizePhoneToE164(st.phone);
}

async function resolveParticipantName(studentId, fallbackName, sourceType = 'student') {
  if (fallbackName) return fallbackName;
  if (!studentId) return 'Katılımcı';
  const { data: st } = await supabaseAdmin
    .from('students')
    .select('name, parent_name')
    .eq('id', studentId)
    .maybeSingle();
  if (!st) return 'Katılımcı';
  if (sourceType === 'parent') {
    const pn = String(st.parent_name || '').trim();
    if (pn) return pn;
    const sn = String(st.name || '').trim();
    return sn ? `${sn} Velisi` : 'Veli';
  }
  return st?.name ? String(st.name).trim() : 'Katılımcı';
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch (e) {
    return res.status(401).json({ error: errorMessage(e) || 'Missing token' });
  }

  if (!canManageEvents(actor)) {
    return res.status(403).json({ error: 'forbidden', hint: 'Yalnızca süper admin, admin ve koç.' });
  }

  const institutionId = await resolveInstitutionId(actor);
  const bodyEarly = req.method === 'POST' || req.method === 'PATCH' ? parseBody(req) : null;
  const effectiveInstitutionId = resolveEffectiveInstitutionId(actor, institutionId, req, bodyEarly);

  if (!effectiveInstitutionId && actor.role !== 'super_admin') {
    return res.status(400).json({
      error: 'institution_required',
      hint: 'Kullanıcı hesabında kurum tanımlı değil. Yöneticinize başvurun.'
    });
  }

  const op = String(req.query?.op || '').trim();
  const scope = String(req.query?.scope || '').trim();
  const eventId = String(req.query?.id || req.query?.event_id || '').trim();

  if (req.method === 'GET' && op === 'sync-seminar') {
    try {
      const out = await syncSeminarRegistrationsToEvents({ limit: 200 });
      return res.status(200).json({ data: out });
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) || 'sync_failed' });
    }
  }

  if (req.method === 'GET' && scope === 'templates') {
    let metaSync = null;
    try {
      metaSync = await syncApprovedMetaTemplatesForEvents();
    } catch (syncErr) {
      metaSync = { ok: false, synced: 0, error: errorMessage(syncErr) || 'meta_sync_failed' };
    }

    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .select('type, name, content, variables, twilio_variable_bindings, meta_template_name, meta_template_language, whatsapp_template_status, is_active, channel')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    const templates = (data || []).filter((t) => {
      const meta = String(t.meta_template_name || t.type || '').trim();
      const ch = String(t.channel || '').trim().toLowerCase();
      return meta && (ch === 'whatsapp' || ch === '' || !t.channel);
    });
    return res.status(200).json({ data: templates, meta_sync: metaSync });
  }

  if (req.method === 'GET' && scope === 'meta-templates') {
    try {
      const out = await listMetaTemplatesForEventsImport();
      if (!out.ok) {
        return res.status(400).json({
          error: out.error || 'meta_fetch_failed',
          hint: 'Vercel’de META_WHATSAPP_TOKEN ve META_WABA_ID (veya META_PHONE_NUMBER_ID) tanımlı olmalı.'
        });
      }
      return res.status(200).json({
        data: out.templates,
        waba_ids: out.waba_ids,
        template_count: out.template_count,
        waba_errors: out.waba_errors
      });
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) || 'meta_list_failed' });
    }
  }

  if (req.method === 'GET' && scope === 'classes') {
    try {
      const rows = await loadClassesForEvents(effectiveInstitutionId || undefined);
      return res.status(200).json({ data: rows });
    } catch (error) {
      if (isEventsSchemaError(error)) return schemaHintResponse(res, 503, error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'GET' && scope === 'people') {
    const instFilter = effectiveInstitutionId || undefined;
    let stQuery = supabaseAdmin
      .from('students')
      .select('id, name, phone, parent_phone, parent_name, email, institution_id, class_level')
      .order('name');
    if (instFilter) stQuery = stQuery.eq('institution_id', instFilter);
    const { data: students, error: stErr } = await stQuery.limit(2000);
    if (stErr) {
      if (isEventsSchemaError(stErr)) return schemaHintResponse(res, 503, stErr);
      return res.status(500).json({ error: stErr.message });
    }

    const studentIds = (students || []).map((s) => s.id);
    const classIdsByStudent = {};
    if (studentIds.length) {
      const { data: csRows } = await supabaseAdmin
        .from('class_students')
        .select('student_id, class_id')
        .in('student_id', studentIds);
      for (const row of csRows || []) {
        if (!classIdsByStudent[row.student_id]) classIdsByStudent[row.student_id] = [];
        classIdsByStudent[row.student_id].push(row.class_id);
      }
    }

    const people = [];
    for (const s of students || []) {
      const phones = await getStudentPhones(s);
      const studentPhone = normalizePhoneToE164(s.phone) || phones.find((p) => p !== normalizePhoneToE164(s.parent_phone)) || phones[0] || '';
      const parentPhone = normalizePhoneToE164(s.parent_phone) || '';
      people.push({
        student_id: s.id,
        name: s.name,
        phone: studentPhone || s.phone || '',
        parent_phone: parentPhone || s.parent_phone || '',
        parent_name: String(s.parent_name || '').trim(),
        class_level: s.class_level != null ? String(s.class_level) : null,
        class_ids: classIdsByStudent[s.id] || [],
        kind: 'student'
      });
    }
    return res.status(200).json({ data: people });
  }

  if (req.method === 'GET') {
    if (eventId) {
      const row = await loadEventWithStats(eventId, actor.role === 'super_admin' ? null : effectiveInstitutionId);
      if (!row) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ data: row });
    }
    let q = supabaseAdmin
      .from('institution_events')
      .select('*')
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (effectiveInstitutionId) q = q.eq('institution_id', effectiveInstitutionId);
    const { data, error } = await q;
    if (error) {
      if (isEventsSchemaError(error)) {
        return res.status(200).json({
          data: [],
          warning: 'events_schema_missing',
          hint: EVENTS_SCHEMA_HINT
        });
      }
      return res.status(500).json({
        error: error.message,
        hint: 'institution_events tablosu yoksa sql/2026-06-08-institution-events-fix-text-ids.sql çalıştırın.'
      });
    }
    const rows = data || [];
    const withStats = await attachEventStats(rows);
    return res.status(200).json({ data: withStats });
  }

  if (req.method === 'POST' && op === 'import-meta-template') {
    const body = parseBody(req);
    const metaName = String(body.meta_template_name || '').trim();
    const metaLang = String(body.meta_template_language || 'tr').trim() || 'tr';
    const displayName = String(body.display_name || '').trim();
    if (!metaName) return res.status(400).json({ error: 'meta_template_name_required' });
    try {
      const out = await importMetaTemplateForEvents({
        meta_template_name: metaName,
        meta_template_language: metaLang,
        display_name: displayName || undefined
      });
      if (!out.ok) {
        return res.status(400).json({
          error: out.error || 'import_failed',
          hint: out.hint,
          similar_names: out.similar_names,
          template_count: out.template_count,
          waba_errors: out.waba_errors
        });
      }
      return res.status(200).json({
        ok: true,
        data: {
          type: out.template?.type,
          name: out.template?.name,
          meta_template_name: out.template?.meta_template_name,
          variables: out.variables
        }
      });
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) || 'import_failed' });
    }
  }

  if (req.method === 'POST' && op === 'cancel-schedule') {
    if (!eventId) return res.status(400).json({ error: 'id_required' });
    const existing = await loadEvent(eventId, actor.role === 'super_admin' ? null : effectiveInstitutionId);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    await supabaseAdmin
      .from('institution_events')
      .update({
        schedule_status: 'cancelled',
        send_mode: 'manual',
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST' && op === 'send') {
    if (!eventId) return res.status(400).json({ error: 'id_required' });
    const event = await loadEvent(eventId, actor.role === 'super_admin' ? null : effectiveInstitutionId);
    if (!event) return res.status(404).json({ error: 'not_found' });
    const { data: sendTpl } = await supabaseAdmin
      .from('message_templates')
      .select('variables, twilio_variable_bindings')
      .eq('type', String(event.template_type || '').trim())
      .maybeSingle();
    if (templateBindingsNeedLink(sendTpl) && !resolveEventMeetingLink(event)) {
      return res.status(400).json({
        error: 'meeting_link_required',
        hint: 'Şablonda bağlantı değişkeni varsa katılım linkini doldurun.'
      });
    }
    const body = parseBody(req);
    const participantIds = Array.isArray(body.participant_ids)
      ? body.participant_ids.map((x) => String(x).trim()).filter(Boolean)
      : null;
    try {
      const out = await sendEventInvites(event, { participantIds });
      const mode = String(event.send_mode || 'manual');
      if (mode === 'once' && String(event.schedule_status || '') === 'scheduled') {
        await supabaseAdmin
          .from('institution_events')
          .update({
            schedule_status: 'completed',
            last_schedule_run_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', eventId);
      }
      return res.status(200).json(out);
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) || 'send_failed' });
    }
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const title = String(body.title || '').trim();
    const template_type = String(body.template_type || 'institution_event_invite').trim();
    if (!title) return res.status(400).json({ error: 'title_required' });
    if (!template_type) return res.status(400).json({ error: 'template_type_required' });

    const sendWhatsApp = body.send_whatsapp === true || body.send_now === true;
    const meetingLink = String(body.meeting_link || '').trim();
    const schedule = parseScheduleFromBody(body);
    const immediateSend = sendWhatsApp || schedule.send_mode === 'immediate';

    let eventTemplate = null;
    if (immediateSend) {
      const { data: tpl } = await supabaseAdmin
        .from('message_templates')
        .select('*')
        .eq('type', template_type)
        .maybeSingle();
      eventTemplate = tpl;
    }

    const instId = effectiveInstitutionId || sanitizeInstitutionId(body.institution_id);
    if (!instId) {
      return res.status(400).json({
        error: 'institution_required',
        hint: 'Kurum seçimi gerekli. Üst menüden kurum seçin veya yöneticinize başvurun.'
      });
    }

    const participantsRaw = Array.isArray(body.participants) ? body.participants : [];
    const resolvedParticipants = [];
    const skippedParticipants = [];
    for (const raw of participantsRaw) {
      const p = normalizeParticipantInput(raw);
      if (!p) continue;
      const display_name = await resolveParticipantName(p.student_id, p.display_name, p.source_type);
      const phone = await resolveParticipantPhone(p.student_id, p.phone, p.source_type);
      if (!phone) {
        skippedParticipants.push({
          display_name,
          phone: String(raw.phone || p.phone || '').trim() || null,
          reason: 'invalid_phone'
        });
        continue;
      }
      resolvedParticipants.push({
        student_id: p.student_id,
        display_name,
        phone,
        source_type: p.source_type
      });
    }
    const seminarSyncKey = String(body.seminar_sync_key || '').trim();
    if (!resolvedParticipants.length && !seminarSyncKey) {
      return res.status(400).json({
        error: 'participants_required',
        hint:
          skippedParticipants.length > 0
            ? 'Katılımcı telefon numaraları geçersiz. 05xx veya +90 formatında girin.'
            : 'En az bir katılımcı seçin veya seminer eşleme anahtarı girin (yalnızca o seminerin kayıtları eklenir).',
        skipped: skippedParticipants
      });
    }

    const now = new Date().toISOString();
    const { data: event, error: insErr } = await supabaseAdmin
      .from('institution_events')
      .insert({
        institution_id: instId,
        title,
        description: String(body.description || '').trim() || null,
        event_date: body.event_date ? String(body.event_date).slice(0, 10) : null,
        event_time: body.event_time ? String(body.event_time).slice(0, 8) : null,
        location: String(body.location || '').trim() || null,
        meeting_link: meetingLink || null,
        template_type,
        template_vars:
          body.template_vars && typeof body.template_vars === 'object' && !Array.isArray(body.template_vars)
            ? body.template_vars
            : {},
        send_mode: schedule.send_mode,
        scheduled_send_at: schedule.scheduled_send_at,
        daily_send_time: schedule.daily_send_time,
        schedule_status: schedule.schedule_status,
        seminar_sync_key: String(body.seminar_sync_key || '').trim() || null,
        seminar_auto_send: body.seminar_auto_send !== false,
        created_by: actor.sub,
        created_at: now,
        updated_at: now
      })
      .select('*')
      .maybeSingle();
    if (insErr || !event) {
      if (isEventsSchemaError(insErr)) {
        return res.status(400).json({
          error: 'events_schema_missing',
          detail: insErr?.message || 'insert_failed',
          hint: EVENTS_SCHEMA_HINT
        });
      }
      return res.status(500).json({ error: insErr?.message || 'insert_failed' });
    }

    const partRows = resolvedParticipants.map((p) => ({
      event_id: event.id,
      student_id: p.student_id,
      display_name: p.display_name,
      phone: p.phone,
      source_type: p.source_type || (p.student_id ? 'student' : 'external'),
      whatsapp_status: 'pending'
    }));
    if (partRows.length) {
      const { error: pErr } = await supabaseAdmin.from('institution_event_participants').insert(partRows);
      if (pErr) {
        await supabaseAdmin.from('institution_events').delete().eq('id', event.id);
        if (isEventsSchemaError(pErr)) {
          return res.status(400).json({
            error: 'events_schema_missing',
            detail: pErr?.message || 'participants_insert_failed',
            hint: EVENTS_SCHEMA_HINT
          });
        }
        return res.status(500).json({ error: pErr.message });
      }
    }

    let sendResult = null;
    if (immediateSend) {
      const needsLinkOnSend = templateBindingsNeedLink(eventTemplate);
      if (needsLinkOnSend && !resolveEventMeetingLink(event)) {
        sendResult = {
          ok: false,
          skipped: true,
          reason: 'meeting_link_required',
          hint: 'Etkinlik kaydedildi; bu şablon için katılım bağlantısı gerekli.'
        };
      } else if (!eventTemplate?.content) {
        sendResult = {
          ok: false,
          skipped: true,
          reason: 'template_not_found',
          hint: 'Etkinlik kaydedildi; WhatsApp şablonu bulunamadı (Supabase SQL).'
        };
      } else {
        sendResult = await sendEventInvites(event);
      }
    }

    let seminarSyncResult = null;
    if (String(body.seminar_sync_key || '').trim()) {
      try {
        seminarSyncResult = await syncSeminarRegistrationsToEvents({ limit: 100 });
      } catch (syncErr) {
        seminarSyncResult = { ok: false, error: errorMessage(syncErr) || 'seminar_sync_failed' };
      }
    }

    const full = await loadEventWithStats(event.id, null);
    return res.status(201).json({
      data: full,
      whatsapp: sendResult,
      skipped_participants: skippedParticipants,
      seminar_sync: seminarSyncResult
    });
  }

  if (req.method === 'PATCH') {
    if (!eventId) return res.status(400).json({ error: 'id_required' });
    const existing = await loadEvent(eventId, actor.role === 'super_admin' ? null : effectiveInstitutionId);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const body = parseBody(req);
    const patch = { updated_at: new Date().toISOString() };
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
    if (body.description !== undefined) patch.description = String(body.description || '').trim() || null;
    if (body.event_date !== undefined) patch.event_date = body.event_date ? String(body.event_date).slice(0, 10) : null;
    if (body.event_time !== undefined) patch.event_time = body.event_time ? String(body.event_time).slice(0, 8) : null;
    if (body.location !== undefined) patch.location = String(body.location || '').trim() || null;
    if (body.meeting_link !== undefined) patch.meeting_link = String(body.meeting_link || '').trim() || null;
    if (typeof body.template_type === 'string' && body.template_type.trim()) {
      patch.template_type = body.template_type.trim();
    }
    if (body.template_vars !== undefined && typeof body.template_vars === 'object' && !Array.isArray(body.template_vars)) {
      patch.template_vars = body.template_vars;
    }
    if (body.send_mode !== undefined || body.schedule_date || body.schedule_time || body.daily_send_time) {
      const schedule = parseScheduleFromBody({ ...existing, ...body });
      patch.send_mode = schedule.send_mode;
      patch.scheduled_send_at = schedule.scheduled_send_at;
      patch.daily_send_time = schedule.daily_send_time;
      patch.schedule_status = schedule.schedule_status;
    }
    if (body.schedule_status === 'cancelled') {
      patch.schedule_status = 'cancelled';
      patch.send_mode = 'manual';
    }
    if (body.seminar_sync_key !== undefined) {
      patch.seminar_sync_key = String(body.seminar_sync_key || '').trim() || null;
    }
    if (body.seminar_auto_send !== undefined) {
      patch.seminar_auto_send = body.seminar_auto_send !== false;
    }

    const { error } = await supabaseAdmin.from('institution_events').update(patch).eq('id', eventId);
    if (error) return res.status(500).json({ error: error.message });

    if (Array.isArray(body.participants)) {
      await supabaseAdmin.from('institution_event_participants').delete().eq('event_id', eventId);
      const resolved = [];
      for (const raw of body.participants) {
        const p = normalizeParticipantInput(raw);
        if (!p) continue;
        const display_name = await resolveParticipantName(p.student_id, p.display_name, p.source_type);
        const phone = await resolveParticipantPhone(p.student_id, p.phone, p.source_type);
        if (!phone) continue;
        resolved.push({
          event_id: eventId,
          student_id: p.student_id,
          display_name,
          phone,
          source_type: p.source_type || (p.student_id ? 'student' : 'external'),
          whatsapp_status: 'pending'
        });
      }
      if (resolved.length) {
        await supabaseAdmin.from('institution_event_participants').insert(resolved);
      }
    }

    const full = await loadEventWithStats(eventId, null);
    return res.status(200).json({ data: full });
  }

  if (req.method === 'DELETE') {
    if (!eventId) return res.status(400).json({ error: 'id_required' });
    const existing = await loadEvent(eventId, actor.role === 'super_admin' ? null : effectiveInstitutionId);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    await supabaseAdmin.from('institution_events').delete().eq('id', eventId);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
