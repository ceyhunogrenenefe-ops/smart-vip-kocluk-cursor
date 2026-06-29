import { randomUUID } from 'crypto';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor, actorIsStudentWithProfile } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import { insertQuestionNotification } from '../api/_lib/question-help.js';
import {
  isSolutionLessonSubject,
  buildTenMinuteSlots,
  isBookingOpen,
  canUploadFiles,
  canJoinAppointment,
  normalizeTime,
  combineIstanbulDateTime,
  SESSION_DURATION_MINUTES,
  appointmentStatusLabel
} from '../api/_lib/solution-appointments-core.js';
import {
  uploadSolutionAppointmentFile,
  refreshSignedUrl
} from '../api/_lib/solution-appointment-storage.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const VALID_QUESTION_COUNTS = new Set(['1', '2', '3', '4', '5+']);

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

function q(req, key) {
  const v = req.query?.[key];
  if (v === undefined || v === null) return '';
  return String(Array.isArray(v) ? v[0] : v).trim();
}

function isTeacherLike(role) {
  const r = String(role || '').toLowerCase();
  return r === 'teacher' || r === 'coach' || r === 'admin' || r === 'super_admin';
}

function isSchemaMissing(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '');
  return code === '42P01' || code === 'PGRST205' || msg.includes('appointments');
}

async function loadLesson(lessonId) {
  const { data, error } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,lesson_date,start_time,end_time,subject,teacher_id,status,meeting_link')
    .eq('id', lessonId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function teacherName(teacherId) {
  if (!teacherId) return 'Öğretmen';
  const { data } = await supabaseAdmin.from('users').select('name,email').eq('id', teacherId).maybeSingle();
  return data?.name || data?.email || 'Öğretmen';
}

async function studentDisplay(studentId) {
  const { data } = await supabaseAdmin
    .from('students')
    .select('id,name,class_level,user_id,platform_user_id')
    .eq('id', studentId)
    .maybeSingle();
  return data;
}

async function hydrateFiles(files) {
  const out = [];
  for (const f of files || []) {
    let url = f.file_url;
    if (f.storage_path) {
      try {
        url = (await refreshSignedUrl(f.storage_path)) || url;
      } catch {
        /* keep stored url */
      }
    }
    out.push({ ...f, file_url: url });
  }
  return out;
}

async function findExistingStudentAppointment(lessonId, studentId) {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .in('status', ['scheduled', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function upsertStudentAppointmentNote(appointmentId, studentNote) {
  if (studentNote == null) return;
  await supabaseAdmin.from('appointment_notes').upsert(
    {
      appointment_id: appointmentId,
      student_note: String(studentNote || '').trim().slice(0, 2000) || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'appointment_id' }
  );
}

async function appendAppointmentFiles(appointmentId, files) {
  for (const f of files || []) {
    const mime = String(f.mime || f.mime_type || '').trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) continue;
    const b64 = String(f.data || f.base64 || '').trim();
    if (!b64) continue;
    const bufLen = Buffer.from(b64, 'base64').length;
    if (bufLen > MAX_FILE_BYTES) continue;
    const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
    const path = `${appointmentId}/${randomUUID()}.${ext}`;
    const uploaded = await uploadSolutionAppointmentFile({
      base64: b64,
      mime,
      path,
      originalName: f.filename || f.name || null
    });
    await supabaseAdmin.from('question_files').insert({
      appointment_id: appointmentId,
      storage_path: uploaded.storage_path,
      file_url: uploaded.file_url,
      mime_type: uploaded.mime_type,
      original_name: uploaded.original_name
    });
  }
}

async function isSlotTakenByOther(lessonId, slotStart, excludeAppointmentId = null) {
  let query = supabaseAdmin
    .from('appointments')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('slot_start', slotStart)
    .in('status', ['scheduled', 'in_progress']);
  if (excludeAppointmentId) query = query.neq('id', excludeAppointmentId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function buildLessonPayload(lesson, studentId = null) {
  if (!lesson) return null;
  if (!isSolutionLessonSubject(lesson.subject)) {
    return { is_solution_lesson: false };
  }
  const slots = buildTenMinuteSlots(lesson.start_time, lesson.end_time);
  const { data: booked, error } = await supabaseAdmin
    .from('appointments')
    .select('id,student_id,slot_start,slot_end,status,question_count,student_name,student_class_level')
    .eq('lesson_id', lesson.id)
    .in('status', ['scheduled', 'in_progress']);
  if (error) throw error;

  const taken = new Map((booked || []).map((a) => [normalizeTime(a.slot_start), a]));
  const now = new Date();
  const booking_open = isBookingOpen(lesson.lesson_date, lesson.start_time, now);

  let my = null;
  if (studentId) {
    const mine = (booked || []).find((a) => String(a.student_id) === String(studentId));
    if (mine) {
      const { data: noteRow } = await supabaseAdmin
        .from('appointment_notes')
        .select('*')
        .eq('appointment_id', mine.id)
        .maybeSingle();
      const { data: fileRows } = await supabaseAdmin
        .from('question_files')
        .select('*')
        .eq('appointment_id', mine.id)
        .order('created_at', { ascending: true });
      my = {
        ...mine,
        status_label: appointmentStatusLabel(mine.status),
        can_join: canJoinAppointment(lesson.lesson_date, mine.slot_start, now),
        can_upload: canUploadFiles(lesson.lesson_date, mine.slot_start, now),
        note: noteRow || null,
        files: await hydrateFiles(fileRows || [])
      };
    }
  }

  return {
    is_solution_lesson: true,
    lesson: {
      id: lesson.id,
      subject: lesson.subject,
      lesson_date: lesson.lesson_date,
      start_time: lesson.start_time,
      end_time: lesson.end_time,
      teacher_id: lesson.teacher_id,
      teacher_name: await teacherName(lesson.teacher_id)
    },
    booking_open,
    booking_deadline_passed: !booking_open,
    slots: slots.map((slot) => {
      const key = normalizeTime(slot.slot_start);
      const ap = taken.get(key);
      const isMine = Boolean(ap && studentId && String(ap.student_id) === String(studentId));
      return {
        ...slot,
        slot_start_display: slot.slot_start.slice(0, 5),
        slot_end_display: slot.slot_end.slice(0, 5),
        available: !ap || isMine,
        appointment_id: ap?.id || null,
        taken_by_me: isMine
      };
    }),
    my_appointment: my
  };
}

async function notifyStudentUser(studentId, { title, body, appointmentId }) {
  const st = await studentDisplay(studentId);
  const uid = st?.user_id || st?.platform_user_id;
  if (!uid) return;
  await insertQuestionNotification({
    userId: uid,
    questionId: appointmentId,
    kind: 'solution_appointment',
    title,
    body
  });
}

async function handleGet(req, res, actor) {
  const scope = q(req, 'scope');
  const lessonId = q(req, 'lesson_id');
  const date = q(req, 'date') || getIstanbulDateString();
  const lessonIdsRaw = q(req, 'lesson_ids');

  if (scope === 'teacher') {
    if (!isTeacherLike(actor.role)) return res.status(403).json({ error: 'forbidden' });
    const teacherId = actor.sub;
    const { data: rows, error } = await supabaseAdmin
      .from('appointments')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('appointment_date', date)
      .in('status', ['scheduled', 'in_progress', 'completed'])
      .order('slot_start', { ascending: true });
    if (error) throw error;

    const enriched = [];
    for (const row of rows || []) {
      const st = await studentDisplay(row.student_id);
      const { data: noteRow } = await supabaseAdmin
        .from('appointment_notes')
        .select('*')
        .eq('appointment_id', row.id)
        .maybeSingle();
      const { data: fileRows } = await supabaseAdmin
        .from('question_files')
        .select('*')
        .eq('appointment_id', row.id)
        .order('created_at', { ascending: true });
      const lesson = await loadLesson(row.lesson_id);
      enriched.push({
        ...row,
        status_label: appointmentStatusLabel(row.status),
        student_name: row.student_name || st?.name || 'Öğrenci',
        student_class_level: row.student_class_level || st?.class_level || '',
        note: noteRow || null,
        files: await hydrateFiles(fileRows || []),
        lesson_subject: lesson?.subject || '',
        lesson_start: lesson?.start_time || '',
        lesson_end: lesson?.end_time || '',
        session_remaining_seconds:
          row.status === 'in_progress' && row.session_ends_at
            ? Math.max(0, Math.floor((new Date(row.session_ends_at).getTime() - Date.now()) / 1000))
            : 0
      });
    }
    return res.status(200).json({ ok: true, date, appointments: enriched });
  }

  if (scope === 'student' && lessonIdsRaw) {
    const enrichedActor = await enrichStudentActor(actor);
    const { hasStudentId, actor: stActor } = await actorIsStudentWithProfile(enrichedActor);
    if (!hasStudentId) return res.status(403).json({ error: 'student_profile_required' });
    const ids = lessonIdsRaw.split(',').map((x) => x.trim()).filter(Boolean);
    const map = {};
    for (const id of ids) {
      const lesson = await loadLesson(id);
      if (lesson) map[id] = await buildLessonPayload(lesson, stActor.student_id);
    }
    return res.status(200).json({ ok: true, lessons: map });
  }

  if (!lessonId) return res.status(400).json({ error: 'lesson_id_required' });
  const lesson = await loadLesson(lessonId);
  if (!lesson) return res.status(404).json({ error: 'lesson_not_found' });

  let studentId = null;
  if (String(actor.role || '').toLowerCase() === 'student') {
    const enrichedActor = await enrichStudentActor(actor);
    const { hasStudentId, actor: stActor } = await actorIsStudentWithProfile(enrichedActor);
    if (!hasStudentId) return res.status(403).json({ error: 'student_profile_required' });
    studentId = stActor.student_id;
  }

  const payload = await buildLessonPayload(lesson, studentId);
  return res.status(200).json({ ok: true, ...payload });
}

async function handleCreate(req, res, actor) {
  const enrichedActor = await enrichStudentActor(actor);
  const { hasStudentId, actor: stActor } = await actorIsStudentWithProfile(enrichedActor);
  if (!hasStudentId) return res.status(403).json({ error: 'student_profile_required' });

  const body = parseBody(req);
  const lessonId = String(body.lesson_id || '').trim();
  const slotStart = normalizeTime(body.slot_start);
  const slotEnd = normalizeTime(body.slot_end);
  const questionCount = String(body.question_count || '1').trim();
  const studentNote = String(body.student_note || '').trim().slice(0, 2000);
  const studentName = String(body.student_name || '').trim();
  const studentClass = String(body.student_class_level || body.class_level || '').trim();

  if (!lessonId || !slotStart || !slotEnd) return res.status(400).json({ error: 'invalid_payload' });
  if (!VALID_QUESTION_COUNTS.has(questionCount)) return res.status(400).json({ error: 'invalid_question_count' });

  const lesson = await loadLesson(lessonId);
  if (!lesson) return res.status(404).json({ error: 'lesson_not_found' });
  if (!isSolutionLessonSubject(lesson.subject)) return res.status(400).json({ error: 'not_solution_lesson' });
  if (String(lesson.status || '') !== 'scheduled') return res.status(400).json({ error: 'lesson_not_scheduled' });

  const now = new Date();
  if (!isBookingOpen(lesson.lesson_date, lesson.start_time, now)) {
    return res.status(400).json({ error: 'booking_deadline_passed', message: 'Bu ders için randevu süresi dolmuştur.' });
  }

  const validSlots = buildTenMinuteSlots(lesson.start_time, lesson.end_time);
  const match = validSlots.find(
    (s) => normalizeTime(s.slot_start) === slotStart && normalizeTime(s.slot_end) === slotEnd
  );
  if (!match) return res.status(400).json({ error: 'invalid_slot' });

  const st = await studentDisplay(stActor.student_id);
  const existingMine = await findExistingStudentAppointment(lessonId, stActor.student_id);
  const files = Array.isArray(body.files) ? body.files : [];

  if (existingMine) {
    const sameSlot =
      normalizeTime(existingMine.slot_start) === slotStart &&
      normalizeTime(existingMine.slot_end) === slotEnd;

    if (!sameSlot) {
      if (!isBookingOpen(lesson.lesson_date, lesson.start_time, now)) {
        return res.status(400).json({
          error: 'booking_deadline_passed',
          message: 'Bu ders için randevu süresi dolmuştur.'
        });
      }
      if (await isSlotTakenByOther(lessonId, slotStart, existingMine.id)) {
        return res.status(409).json({ error: 'slot_taken', message: 'Bu saat dilimi dolu.' });
      }
      await supabaseAdmin
        .from('appointments')
        .update({
          slot_start: slotStart,
          slot_end: slotEnd,
          question_count: questionCount,
          student_name: studentName || existingMine.student_name || st?.name || '',
          student_class_level: studentClass || existingMine.student_class_level || st?.class_level || '',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingMine.id);
    } else {
      await supabaseAdmin
        .from('appointments')
        .update({
          question_count: questionCount,
          student_name: studentName || existingMine.student_name || st?.name || '',
          student_class_level: studentClass || existingMine.student_class_level || st?.class_level || '',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingMine.id);
    }

    await upsertStudentAppointmentNote(existingMine.id, studentNote);
    const effectiveSlotStart = sameSlot ? existingMine.slot_start : slotStart;
    if (files.length && canUploadFiles(lesson.lesson_date, effectiveSlotStart, now)) {
      await appendAppointmentFiles(existingMine.id, files);
    }

    const payload = await buildLessonPayload(lesson, stActor.student_id);
    const message = sameSlot ? 'Randevunuz güncellendi.' : 'Randevu saatiniz güncellendi.';
    return res.status(200).json({
      ok: true,
      message,
      appointment_id: existingMine.id,
      rescheduled: !sameSlot,
      ...payload
    });
  }

  if (await isSlotTakenByOther(lessonId, slotStart)) {
    return res.status(409).json({ error: 'slot_taken', message: 'Bu saat dilimi dolu.' });
  }

  const appointmentId = randomUUID();
  const insertRow = {
    id: appointmentId,
    student_id: stActor.student_id,
    teacher_id: lesson.teacher_id,
    lesson_id: lessonId,
    appointment_date: lesson.lesson_date,
    slot_start: slotStart,
    slot_end: slotEnd,
    status: 'scheduled',
    question_count: questionCount,
    student_name: studentName || st?.name || '',
    student_class_level: studentClass || st?.class_level || '',
    created_notified: false
  };
  const { error: insErr } = await supabaseAdmin.from('appointments').insert(insertRow);
  if (insErr) throw insErr;

  await supabaseAdmin.from('appointment_notes').insert({
    appointment_id: appointmentId,
    student_note: studentNote || null
  });

  await appendAppointmentFiles(appointmentId, files);

  await notifyStudentUser(stActor.student_id, {
    title: 'Randevu oluşturuldu',
    body: `${lesson.subject} — ${slotStart.slice(0, 5)} randevunuz kaydedildi.`,
    appointmentId
  });
  await supabaseAdmin.from('appointments').update({ created_notified: true }).eq('id', appointmentId);

  const payload = await buildLessonPayload(lesson, stActor.student_id);
  return res.status(201).json({ ok: true, message: 'Randevunuz oluşturuldu.', appointment_id: appointmentId, ...payload });
}

async function handlePatch(req, res, actor) {
  const id = q(req, 'id') || String(parseBody(req).id || '').trim();
  if (!id) return res.status(400).json({ error: 'id_required' });

  const { data: ap, error } = await supabaseAdmin.from('appointments').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!ap) return res.status(404).json({ error: 'not_found' });

  const body = parseBody(req);
  const role = String(actor.role || '').toLowerCase();
  const now = new Date();

  if (role === 'student') {
    const enrichedActor = await enrichStudentActor(actor);
    const { hasStudentId, actor: stActor } = await actorIsStudentWithProfile(enrichedActor);
    if (!hasStudentId || String(ap.student_id) !== String(stActor.student_id)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const studentNote = body.student_note != null ? String(body.student_note).trim().slice(0, 2000) : null;
    const slotStart = body.slot_start != null ? normalizeTime(body.slot_start) : null;
    const slotEnd = body.slot_end != null ? normalizeTime(body.slot_end) : null;
    const questionCount =
      body.question_count != null ? String(body.question_count || '1').trim() : null;

    if (slotStart && slotEnd) {
      const lesson = await loadLesson(ap.lesson_id);
      if (!lesson) return res.status(404).json({ error: 'lesson_not_found' });
      if (!isBookingOpen(lesson.lesson_date, lesson.start_time, now)) {
        return res.status(400).json({
          error: 'booking_deadline_passed',
          message: 'Bu ders için randevu süresi dolmuştur.'
        });
      }
      const validSlots = buildTenMinuteSlots(lesson.start_time, lesson.end_time);
      const match = validSlots.find(
        (s) => normalizeTime(s.slot_start) === slotStart && normalizeTime(s.slot_end) === slotEnd
      );
      if (!match) return res.status(400).json({ error: 'invalid_slot' });
      const sameSlot =
        normalizeTime(ap.slot_start) === slotStart && normalizeTime(ap.slot_end) === slotEnd;
      if (!sameSlot && (await isSlotTakenByOther(ap.lesson_id, slotStart, ap.id))) {
        return res.status(409).json({ error: 'slot_taken', message: 'Bu saat dilimi dolu.' });
      }
      if (!sameSlot) {
        await supabaseAdmin
          .from('appointments')
          .update({
            slot_start: slotStart,
            slot_end: slotEnd,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
      }
    }

    if (questionCount && VALID_QUESTION_COUNTS.has(questionCount)) {
      await supabaseAdmin
        .from('appointments')
        .update({ question_count: questionCount, updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    const files = Array.isArray(body.files) ? body.files : [];
    const hasFileUpload = files.length > 0;
    if (hasFileUpload && !canUploadFiles(ap.appointment_date, slotStart || ap.slot_start, now)) {
      return res.status(400).json({ error: 'upload_deadline_passed', message: 'Dosya yükleme süresi doldu.' });
    }
    if (studentNote != null) {
      await upsertStudentAppointmentNote(id, studentNote);
    }
    if (hasFileUpload) {
      await appendAppointmentFiles(id, files);
    }
    const payload = await buildLessonPayload(await loadLesson(ap.lesson_id), stActor.student_id);
    return res.status(200).json({ ok: true, ...payload });
  }

  if (isTeacherLike(role)) {
    if (String(ap.teacher_id) !== String(actor.sub) && role === 'teacher') {
      return res.status(403).json({ error: 'forbidden' });
    }
    const teacherNote = body.teacher_note != null ? String(body.teacher_note).trim().slice(0, 2000) : undefined;
    const solved = body.solved != null ? Boolean(body.solved) : undefined;
    const notePatch = { appointment_id: id, updated_at: new Date().toISOString() };
    if (teacherNote !== undefined) notePatch.teacher_note = teacherNote;
    if (solved !== undefined) notePatch.solved = solved;
    await supabaseAdmin.from('appointment_notes').upsert(notePatch, { onConflict: 'appointment_id' });
    return res.status(200).json({ ok: true });
  }

  return res.status(403).json({ error: 'forbidden' });
}

async function handleOp(req, res, actor, op) {
  if (!isTeacherLike(actor.role)) return res.status(403).json({ error: 'forbidden' });
  const body = parseBody(req);
  const appointmentId = String(body.appointment_id || q(req, 'appointment_id') || '').trim();
  if (!appointmentId) return res.status(400).json({ error: 'appointment_id_required' });

  const { data: ap, error } = await supabaseAdmin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (error) throw error;
  if (!ap) return res.status(404).json({ error: 'not_found' });
  if (String(ap.teacher_id) !== String(actor.sub) && String(actor.role).toLowerCase() === 'teacher') {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (op === 'start') {
    if (ap.status !== 'scheduled') return res.status(400).json({ error: 'invalid_status' });
    const { data: active } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('lesson_id', ap.lesson_id)
      .eq('status', 'in_progress')
      .maybeSingle();
    if (active?.id && active.id !== appointmentId) {
      return res.status(409).json({ error: 'another_session_active' });
    }
    const endsAt = new Date(Date.now() + SESSION_DURATION_MINUTES * 60 * 1000).toISOString();
    await supabaseAdmin
      .from('appointments')
      .update({
        status: 'in_progress',
        session_started_at: new Date().toISOString(),
        session_ends_at: endsAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId);
    return res.status(200).json({ ok: true, session_ends_at: endsAt, duration_minutes: SESSION_DURATION_MINUTES });
  }

  if (op === 'complete') {
    if (ap.status !== 'in_progress') return res.status(400).json({ error: 'invalid_status' });
    await supabaseAdmin
      .from('appointments')
      .update({
        status: 'completed',
        session_ends_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId);
    return res.status(200).json({ ok: true, message: 'Oturum tamamlandı' });
  }

  return res.status(400).json({ error: 'unknown_op' });
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
    actor = await enrichStudentActor(actor);
  } catch (e) {
    return res.status(401).json({ error: 'unauthorized', detail: errorMessage(e) });
  }

  try {
    const op = q(req, 'op');
    if (req.method === 'GET') return await handleGet(req, res, actor);
    if (req.method === 'POST' && op === 'start') return await handleOp(req, res, actor, 'start');
    if (req.method === 'POST' && op === 'complete') return await handleOp(req, res, actor, 'complete');
    if (req.method === 'POST') return await handleCreate(req, res, actor);
    if (req.method === 'PATCH') return await handlePatch(req, res, actor);
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    console.error('[solution-appointments]', msg);
    if (isSchemaMissing(e)) {
      return res.status(400).json({
        error: 'schema_missing',
        hint: "Supabase'de sql/2026-06-21-solution-appointments.sql dosyasını çalıştırın."
      });
    }
    return res.status(500).json({ error: msg });
  }
}
