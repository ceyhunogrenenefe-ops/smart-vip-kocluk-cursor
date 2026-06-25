/**
 * Öğretmen ders hatırlatması — süper admin gateway (Baileys) üzerinden düz metin.
 * Pencere: varsayılan ders başlamadan 12–18 dk (≈15 dk, cron 5 dk).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { getIstanbulDateString, addCalendarDaysYmd } from './istanbul-time.js';
import { recordCronRun } from './cron-run-log.js';
import { renderMessageTemplate } from './template-engine.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { isWithinReminderWindowMs } from './lesson-reminder-window.js';
import { msUntilLessonStart, normalizeTimeHms } from './class-lesson-reminder-logic.js';
import { ensureClassSessionsFromWeeklySlots } from './class-sessions-from-slots.js';
import {
  bookOrderGatewaySessionId,
  gatewayConfiguredForSession,
  probeConnectedGatewaySessionIds,
  reportReminderGatewaySessionId,
  teacherReminderGatewaySessionId,
  sendGatewayTextMessage,
  warmActiveCoachGatewaySessions
} from './whatsapp-gateway-send.js';
import { insertWhatsAppAutomationLog, alreadySentTeacherLessonReminder } from './message-log.js';

export const TEACHER_LESSON_REMINDER_KIND = 'teacher_lesson_reminder';

const DEFAULT_TEMPLATE = `Sayın {{teacher_name}},

{{lesson_name}} dersiniz {{minutes_until}} dakika sonra (saat {{lesson_time}}) başlayacaktır.
Verimli bir ders geçirmenizi temenni ederiz. Yoklama almayı unutmayınız.

İyi dersler dileriz.`;

export function teacherLessonReminderEnabled() {
  return String(process.env.TEACHER_LESSON_REMINDER_ENABLED ?? '1').trim() !== '0';
}

export function teacherReminderWindowConfig() {
  const minMinutes = Math.max(
    1,
    Math.min(55, Number(process.env.TEACHER_LESSON_REMINDER_MIN_MINUTES || 10) || 10)
  );
  const maxMinutes = Math.max(
    minMinutes + 1,
    Math.min(120, Number(process.env.TEACHER_LESSON_REMINDER_MAX_MINUTES || 25) || 25)
  );
  return {
    mode: 'narrow',
    minMinutes,
    maxMinutes,
    label: `${minMinutes}–${maxMinutes} dk kala`
  };
}

function isInTeacherReminderWindow(dateStr, timeStr, nowMs = Date.now()) {
  const until = msUntilLessonStart(dateStr, timeStr, nowMs);
  return isWithinReminderWindowMs(until, teacherReminderWindowConfig());
}

function minutesUntilLesson(dateStr, timeStr, nowMs = Date.now()) {
  const until = msUntilLessonStart(dateStr, timeStr, nowMs);
  return Math.max(1, Math.round(until / 60_000));
}

async function loadReminderTemplateContent() {
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .select('content,is_active')
    .eq('type', TEACHER_LESSON_REMINDER_KIND)
    .maybeSingle();
  if (error) throw error;
  if (data?.content && data.is_active !== false) return String(data.content);
  return DEFAULT_TEMPLATE;
}

async function loadTeachersById(ids) {
  const uniq = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data, error } = await supabaseAdmin.from('users').select('id,name,phone,email').in('id', uniq);
  if (error) throw error;
  const map = new Map();
  const missingPhone = [];
  for (const row of data || []) {
    const entry = {
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      email: row.email || ''
    };
    map.set(String(row.id), entry);
    if (!normalizePhoneToE164(entry.phone)) missingPhone.push(entry);
  }

  if (missingPhone.length) {
    const emails = [
      ...new Set(missingPhone.map((r) => String(r.email || '').toLowerCase().trim()).filter(Boolean))
    ];
    const coachByEmail = new Map();
    const coachById = new Map();
    if (emails.length) {
      const { data: coachesByEmail } = await supabaseAdmin
        .from('coaches')
        .select('id,email,phone')
        .in('email', emails);
      for (const c of coachesByEmail || []) {
        const em = String(c.email || '').toLowerCase().trim();
        if (em) coachByEmail.set(em, c);
        if (c.id) coachById.set(String(c.id), c);
      }
    }
    const { data: coachesById } = await supabaseAdmin
      .from('coaches')
      .select('id,email,phone')
      .in('id', missingPhone.map((r) => String(r.id)));
    for (const c of coachesById || []) {
      if (c.id) coachById.set(String(c.id), c);
      const em = String(c.email || '').toLowerCase().trim();
      if (em) coachByEmail.set(em, c);
    }
    for (const row of missingPhone) {
      const co =
        coachById.get(String(row.id)) ||
        coachByEmail.get(String(row.email || '').toLowerCase().trim());
      if (co?.phone) {
        const entry = map.get(String(row.id));
        if (entry && !normalizePhoneToE164(entry.phone)) entry.phone = co.phone;
      }
    }
  }

  return map;
}

function gatewaySessionCandidates(primaryId) {
  return [
    ...new Set(
      [
        primaryId,
        teacherReminderGatewaySessionId(),
        bookOrderGatewaySessionId(),
        reportReminderGatewaySessionId()
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  ];
}

async function loadClassTeachersByClassId(classIds) {
  const uniq = [...new Set(classIds.map((x) => String(x || '').trim()).filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from('class_teachers')
    .select('class_id,teacher_id')
    .in('class_id', uniq);
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    const cid = String(row.class_id || '').trim();
    const tid = String(row.teacher_id || '').trim();
    if (!cid || !tid) continue;
    if (!map.has(cid)) map.set(cid, tid);
  }
  return map;
}

function resolveSessionTeacherId(session, classTeachersByClassId) {
  const direct = String(session.teacher_id || '').trim();
  if (direct) return direct;
  return classTeachersByClassId.get(String(session.class_id || '').trim()) || '';
}

async function loadClassNames(classIds) {
  const uniq = [...new Set(classIds.map((x) => String(x || '').trim()).filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data, error } = await supabaseAdmin.from('classes').select('id,name').in('id', uniq);
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    map.set(String(row.id), String(row.name || '').trim());
  }
  return map;
}

function buildLessonLabel({ subject, title, className, kind }) {
  const name = String(subject || title || 'Canlı ders').trim();
  if (kind === 'class' && className) return `${name} (${className})`;
  return name;
}

async function sendTeacherReminder(opts) {
  const {
    relatedId,
    teacherId,
    teacherRow,
    lessonDate,
    startTime,
    lessonLabel,
    templateContent,
    gatewaySessionId,
    logDate,
    nowMs,
    log
  } = opts;

  const phone = normalizePhoneToE164(teacherRow?.phone || '');
  if (!phone) {
    log.push({ related_id: relatedId, teacher_id: teacherId, ok: false, skipped: 'no_teacher_phone' });
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId,
      kind: TEACHER_LESSON_REMINDER_KIND,
      message: `[teacher_lesson_reminder] teacher=${teacherId}`,
      status: 'failed',
      logCode: 'INVALID_PHONE',
      error: 'teacher_phone_missing',
      logDate
    });
    return { ok: false };
  }

  if (await alreadySentTeacherLessonReminder(relatedId, phone)) {
    log.push({ related_id: relatedId, teacher_id: teacherId, ok: true, skipped: 'already_sent' });
    return { ok: true, skipped: true };
  }

  const minutesUntil = String(minutesUntilLesson(lessonDate, startTime, nowMs));
  const lessonTime = normalizeTimeHms(startTime).slice(0, 5);
  const teacherName = String(teacherRow?.name || 'Öğretmenimiz').trim() || 'Öğretmenimiz';
  const text = renderMessageTemplate(templateContent, {
    teacher_name: teacherName,
    lesson_name: lessonLabel,
    subject: lessonLabel,
    lesson_time: lessonTime,
    minutes_until: minutesUntil,
    minutes: minutesUntil
  }).trim();

  const sent = await sendGatewayTextMessage({
    sessionId: gatewaySessionId,
    sessionCandidates: gatewaySessionCandidates(gatewaySessionId),
    phone,
    message: text,
    allowSharedFallback: true
  });

  await insertWhatsAppAutomationLog({
    studentId: null,
    relatedId,
    kind: TEACHER_LESSON_REMINDER_KIND,
    message: text.slice(0, 8000),
    status: sent.ok ? 'sent' : 'failed',
    logCode: sent.ok ? null : sent.errorCode || 'GATEWAY_SEND_FAILED',
    error: sent.ok ? null : sent.error || null,
    phone,
    logDate,
    meta_message_id: sent.gateway_message_id || null
  });

  log.push({
    related_id: relatedId,
    teacher_id: teacherId,
    phone,
    ok: sent.ok,
    error: sent.ok ? undefined : sent.error
  });
  return sent;
}

/**
 * @param {{ triggeredBy?: string }} [opts]
 */
export async function runTeacherLessonReminderJob(opts = {}) {
  const triggeredBy = String(opts.triggeredBy || 'cron').trim() || 'cron';
  const logDate = getIstanbulDateString();
  const now = Date.now();
  const log = [];
  const windowCfg = teacherReminderWindowConfig();

  if (!teacherLessonReminderEnabled()) {
    await recordCronRun({
      jobKey: 'teacher_lesson_reminders',
      ok: true,
      skipped: 'disabled',
      detail: { triggered_by: triggeredBy }
    });
    return { ok: true, skipped: 'disabled', log, triggeredBy };
  }

  const gatewaySessionId = teacherReminderGatewaySessionId();
  if (!gatewayConfiguredForSession(gatewaySessionId)) {
    await recordCronRun({
      jobKey: 'teacher_lesson_reminders',
      ok: true,
      skipped: 'gateway_not_configured',
      detail: { triggered_by: triggeredBy, session_suffix: gatewaySessionId?.slice(-8) || null }
    });
    return {
      ok: true,
      skipped: 'gateway_not_configured',
      hint: 'WHATSAPP_GATEWAY_UPSTREAM, APP_JWT_SECRET, BOOK_ORDER_GATEWAY_SESSION_ID (süper admin QR oturumu)',
      log,
      triggeredBy
    };
  }

  await ensureClassSessionsFromWeeklySlots(logDate);
  await ensureClassSessionsFromWeeklySlots(addCalendarDaysYmd(logDate, 1));

  const tomorrow = addCalendarDaysYmd(logDate, 1);
  const [{ data: classToday }, { data: classTomorrow }, { data: privateToday }, { data: privateTomorrow }] =
    await Promise.all([
      supabaseAdmin
        .from('class_sessions')
        .select('id,class_id,lesson_date,start_time,subject,teacher_id,status')
        .eq('lesson_date', logDate)
        .eq('status', 'scheduled'),
      supabaseAdmin
        .from('class_sessions')
        .select('id,class_id,lesson_date,start_time,subject,teacher_id,status')
        .eq('lesson_date', tomorrow)
        .eq('status', 'scheduled'),
      supabaseAdmin
        .from('teacher_lessons')
        .select('id,lesson_date,start_time,title,teacher_id,status')
        .eq('lesson_date', logDate)
        .eq('status', 'scheduled'),
      supabaseAdmin
        .from('teacher_lessons')
        .select('id,lesson_date,start_time,title,teacher_id,status')
        .eq('lesson_date', tomorrow)
        .eq('status', 'scheduled')
    ]);

  const classSessions = [...(classToday || []), ...(classTomorrow || [])].filter((s) =>
    isInTeacherReminderWindow(s.lesson_date, s.start_time, now)
  );
  const privateLessons = [...(privateToday || []), ...(privateTomorrow || [])].filter((l) =>
    isInTeacherReminderWindow(l.lesson_date, l.start_time, now)
  );

  if (!classSessions.length && !privateLessons.length) {
    await recordCronRun({
      jobKey: 'teacher_lesson_reminders',
      ok: true,
      messagesSent: 0,
      messagesFailed: 0,
      detail: {
        due: 0,
        window_label: windowCfg.label,
        log_date: logDate,
        triggered_by: triggeredBy
      }
    });
    return { ok: true, due: 0, window_label: windowCfg.label, log, triggeredBy };
  }

  const sessionCandidates = gatewaySessionCandidates(gatewaySessionId);
  const warmResults = await warmActiveCoachGatewaySessions(sessionCandidates);
  const connectedIds = await probeConnectedGatewaySessionIds(sessionCandidates);
  const effectiveGatewaySessionId = connectedIds[0] || gatewaySessionId;

  const classIds = classSessions.map((s) => s.class_id);
  const [classNamesById, classTeachersByClassId, templateContent] = await Promise.all([
    loadClassNames(classIds),
    loadClassTeachersByClassId(classIds),
    loadReminderTemplateContent()
  ]);

  const teacherIds = [
    ...classSessions.map((s) => resolveSessionTeacherId(s, classTeachersByClassId)),
    ...privateLessons.map((l) => l.teacher_id)
  ];
  const teachersById = await loadTeachersById(teacherIds);

  let sentOk = 0;
  let sentFail = 0;

  for (const session of classSessions) {
    const teacherId = resolveSessionTeacherId(session, classTeachersByClassId);
    if (!teacherId) {
      log.push({ related_id: session.id, ok: false, skipped: 'no_teacher_id' });
      continue;
    }
    const teacherRow = teachersById.get(teacherId);
    if (!teacherRow) {
      log.push({ related_id: session.id, teacher_id: teacherId, ok: false, skipped: 'teacher_user_not_found' });
      continue;
    }
    const className = classNamesById.get(String(session.class_id || '')) || '';
    const lessonLabel = buildLessonLabel({
      subject: session.subject,
      className,
      kind: 'class'
    });
    const result = await sendTeacherReminder({
      relatedId: session.id,
      teacherId,
      teacherRow,
      lessonDate: session.lesson_date,
      startTime: session.start_time,
      lessonLabel,
      templateContent,
      gatewaySessionId: effectiveGatewaySessionId,
      logDate,
      nowMs: now,
      log
    });
    if (result.skipped) continue;
    if (result.ok) sentOk += 1;
    else sentFail += 1;
  }

  for (const lesson of privateLessons) {
    const teacherId = String(lesson.teacher_id || '').trim();
    if (!teacherId) continue;
    const teacherRow = teachersById.get(teacherId);
    if (!teacherRow) {
      log.push({ related_id: lesson.id, teacher_id: teacherId, ok: false, skipped: 'teacher_user_not_found' });
      continue;
    }
    const lessonLabel = buildLessonLabel({ title: lesson.title, kind: 'private' });
    const result = await sendTeacherReminder({
      relatedId: lesson.id,
      teacherId,
      teacherRow,
      lessonDate: lesson.lesson_date,
      startTime: lesson.start_time,
      lessonLabel,
      templateContent,
      gatewaySessionId: effectiveGatewaySessionId,
      logDate,
      nowMs: now,
      log
    });
    if (result.skipped) continue;
    if (result.ok) sentOk += 1;
    else sentFail += 1;
  }

  await recordCronRun({
    jobKey: 'teacher_lesson_reminders',
    ok: sentFail === 0,
    messagesSent: sentOk,
    messagesFailed: sentFail,
    detail: {
      due_class: classSessions.length,
      due_private: privateLessons.length,
      window_label: windowCfg.label,
      gateway_session_suffix: effectiveGatewaySessionId.slice(-8),
      gateway_connected_count: connectedIds.length,
      gateway_probe_empty: connectedIds.length === 0,
      warm: warmResults,
      log_date: logDate,
      triggered_by: triggeredBy
    }
  });

  return {
    ok: true,
    sent: sentOk,
    failed: sentFail,
    due_class: classSessions.length,
    due_private: privateLessons.length,
    window_label: windowCfg.label,
    log,
    triggeredBy
  };
}
