import { supabaseAdmin } from './supabase-admin.js';
import { renderMessageTemplate } from './template-engine.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import {
  resolveAutomationSendChannel,
  sendAutomationTemplateMessage,
  sendAutomationPlainText
} from './whatsapp-automation-channel.js';
import {
  buildAttendanceSummary,
  formatCoachAttendanceSummaryMessage,
  formatLateArrivalUpdateMessage
} from './attendance-summary.js';

const FALLBACK_ABSENT =
  'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).';

export const ABSENT_WA_KINDS = ['class_absent_notice_1', 'class_absent_notice'];
export const LATE_UPDATE_KIND = 'class_attendance_late_update';
export const COACH_SUMMARY_KIND = 'class_attendance_coach_summary';
export const COACH_LATE_DELTA_KIND = 'class_attendance_coach_late_delta';

export async function attendanceAutoWaEnabled(institutionId) {
  const iid = institutionId != null && institutionId !== '' ? String(institutionId).trim() : '';
  if (!iid) return true;
  const { data, error } = await supabaseAdmin
    .from('attendance_institution_prefs')
    .select('auto_whatsapp_absent')
    .eq('institution_id', iid)
    .maybeSingle();
  if (error || !data) return true;
  return data.auto_whatsapp_absent !== false;
}

export async function logAttendanceWa({
  studentId,
  sessionId,
  kind,
  message,
  ok,
  error,
  phone,
  metaMessageId,
  metaTemplateName,
  logDate,
  channel
}) {
  try {
    await supabaseAdmin.from('message_logs').insert({
      student_id: studentId || null,
      kind,
      related_id: sessionId || null,
      message,
      status: ok ? 'sent' : 'failed',
      log_date: logDate,
      error: ok ? null : error || 'send_failed',
      phone: phone || null,
      twilio_sid: null,
      twilio_error_code: null,
      twilio_content_sid: null,
      meta_message_id: metaMessageId || null,
      meta_template_name: metaTemplateName || (channel === 'gateway' ? 'gateway_plain' : null)
    });
  } catch {
    /* yoklama akışını bozma */
  }
}

export async function attendanceWaAlreadySent(sessionId, studentId, kinds) {
  const sid = String(sessionId || '').trim();
  const stid = String(studentId || '').trim();
  if (!sid || !stid) return false;
  const kindList = Array.isArray(kinds) && kinds.length ? kinds : ABSENT_WA_KINDS;
  const { data } = await supabaseAdmin
    .from('message_logs')
    .select('id')
    .eq('related_id', sid)
    .eq('student_id', stid)
    .in('kind', kindList)
    .eq('status', 'sent')
    .limit(1);
  return Boolean(data?.length);
}

export async function coachSessionNoticeAlreadySent(sessionId, kind) {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  const { data } = await supabaseAdmin
    .from('message_logs')
    .select('id')
    .eq('related_id', sid)
    .eq('kind', kind)
    .eq('status', 'sent')
    .limit(1);
  return Boolean(data?.length);
}

/**
 * Eski düzen: yoklama WhatsApp yalnızca veliye gider. Koç/öğretmen kopyası kapalı (öğrenci bazlı).
 */
export async function sendAttendanceNoticeToStaff() {
  return { ok: true, staff: [], skipped: 'staff_notify_disabled' };
}

function sessionLogDate(session) {
  return session?.lesson_date && /^\d{4}-\d{2}-\d{2}$/.test(session.lesson_date)
    ? session.lesson_date
    : new Date().toISOString().slice(0, 10);
}

/** Devamsız öğrenci velisine bildirim — idempotent (aynı session+öğrenci sent ise atla). */
export async function sendAbsentNoticeForStudent({ session, className, studentId, institutionId }) {
  const channel = resolveAutomationSendChannel();
  if (channel === 'none') return { ok: false, note: 'automation_channel_not_ready', student_id: studentId };

  if (!(await attendanceAutoWaEnabled(institutionId))) {
    return { ok: true, skipped: 'auto_whatsapp_absent_disabled', student_id: studentId };
  }

  if (await attendanceWaAlreadySent(session?.id, studentId, ABSENT_WA_KINDS)) {
    return { ok: true, skipped: 'already_sent', student_id: studentId };
  }

  const { data: student } = await supabaseAdmin
    .from('students')
    .select('name, parent_phone')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return { ok: false, note: 'student_not_found', student_id: studentId };

  const lessonDate = String(session.lesson_date || '').trim();
  const lessonTime = String(session.start_time || '').slice(0, 5);
  const vars = {
    student_name: student.name || 'Öğrenciniz',
    class_name: className || 'Sınıf',
    subject: session.subject || 'Ders',
    lesson_date: lessonDate,
    lesson_time: lessonTime
  };

  const { data: templateRow } = await supabaseAdmin
    .from('message_templates')
    .select('*')
    .eq('type', 'class_absent_notice_1')
    .maybeSingle();

  const preview =
    renderMessageTemplate(templateRow?.content || FALLBACK_ABSENT, vars) ||
    renderMessageTemplate(FALLBACK_ABSENT, vars);

  const logDate = sessionLogDate(session);
  const parentPhone = normalizePhoneToE164(student.parent_phone);
  let parentResult = { ok: false, note: 'parent_phone_missing' };

  if (parentPhone) {
    const sent = templateRow?.content
      ? await sendAutomationTemplateMessage({
          phone: parentPhone,
          templateRow,
          vars,
          templateType: 'class_absent_notice_1'
        })
      : {
          ok: false,
          error: 'template_not_found',
          bodyPreview: null,
          sid: null,
          meta_template_name: null
        };

    const body = sent.bodyPreview || preview;
    await logAttendanceWa({
      studentId,
      sessionId: session.id,
      kind: 'class_absent_notice_1',
      message: body,
      ok: Boolean(sent.ok),
      error: sent.ok ? null : sent.error || 'send_failed',
      phone: parentPhone,
      metaMessageId: sent.sid || sent.gateway_message_id || null,
      metaTemplateName: sent.meta_template_name || null,
      logDate,
      channel: sent.channel || channel
    });

    parentResult = sent.ok
      ? { ok: true, channel: sent.channel || channel }
      : {
          ok: false,
          note: sent.error || 'whatsapp_failed',
          error_code: sent.errorCode != null ? String(sent.errorCode) : null
        };
  } else {
    await logAttendanceWa({
      studentId,
      sessionId: session.id,
      kind: 'class_absent_notice_1',
      message: preview,
      ok: false,
      error: 'parent_phone_missing',
      phone: null,
      logDate,
      channel
    });
  }

  return {
    ok: Boolean(parentResult.ok),
    student_id: studentId,
    channel: parentResult.channel || channel,
    note: parentResult.ok ? null : parentResult.note || null,
    error_code: parentResult.error_code || null,
    parent_ok: Boolean(parentResult.ok)
  };
}

/** absent → late: sadece ilgili veliye kısa güncelleme (idempotent). */
export async function sendLateArrivalUpdateForStudent({
  session,
  className,
  studentId,
  institutionId,
  cameraStatus
}) {
  const channel = resolveAutomationSendChannel();
  if (channel === 'none') return { ok: false, note: 'automation_channel_not_ready', student_id: studentId };
  if (!(await attendanceAutoWaEnabled(institutionId))) {
    return { ok: true, skipped: 'auto_whatsapp_absent_disabled', student_id: studentId };
  }
  if (await attendanceWaAlreadySent(session?.id, studentId, [LATE_UPDATE_KIND])) {
    return { ok: true, skipped: 'already_sent', student_id: studentId };
  }

  const { data: student } = await supabaseAdmin
    .from('students')
    .select('name, parent_phone')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return { ok: false, note: 'student_not_found', student_id: studentId };

  const text = formatLateArrivalUpdateMessage({
    studentName: student.name,
    className,
    lessonName: session.subject || 'Ders',
    attendanceStatus: 'late',
    cameraStatus,
    forCoach: false
  });

  const parentPhone = normalizePhoneToE164(student.parent_phone);
  const logDate = sessionLogDate(session);
  if (!parentPhone) {
    await logAttendanceWa({
      studentId,
      sessionId: session.id,
      kind: LATE_UPDATE_KIND,
      message: text,
      ok: false,
      error: 'parent_phone_missing',
      phone: null,
      logDate,
      channel
    });
    return { ok: false, note: 'parent_phone_missing', student_id: studentId };
  }

  const sent = await sendAutomationPlainText({
    phone: parentPhone,
    message: text,
    notificationType: LATE_UPDATE_KIND
  });

  await logAttendanceWa({
    studentId,
    sessionId: session.id,
    kind: LATE_UPDATE_KIND,
    message: text,
    ok: Boolean(sent.ok),
    error: sent.ok ? null : sent.error || 'send_failed',
    phone: parentPhone,
    metaMessageId: sent.sid || sent.gateway_message_id || null,
    metaTemplateName: sent.meta_template_name || null,
    logDate,
    channel: sent.channel || channel
  });

  return {
    ok: Boolean(sent.ok),
    student_id: studentId,
    note: sent.ok ? null : sent.error || 'whatsapp_failed',
    skipped: sent.ok ? undefined : undefined
  };
}

/** Sınıf için baskın koç (öğrenci coach_id çoğunluğu). */
export async function resolveClassCoach(studentIds) {
  const ids = [...new Set((studentIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return { coach: null, reason: 'no_students' };

  const { data: students, error } = await supabaseAdmin
    .from('students')
    .select('id, coach_id')
    .in('id', ids);
  if (error) return { coach: null, reason: error.message };

  const counts = new Map();
  for (const s of students || []) {
    const cid = String(s.coach_id || '').trim();
    if (!cid) continue;
    counts.set(cid, (counts.get(cid) || 0) + 1);
  }
  if (!counts.size) return { coach: null, reason: 'coach_not_assigned' };

  let bestId = null;
  let bestN = 0;
  for (const [cid, n] of counts) {
    if (n > bestN) {
      bestId = cid;
      bestN = n;
    }
  }

  const { data: coach } = await supabaseAdmin
    .from('coaches')
    .select('id, name, phone, email')
    .eq('id', bestId)
    .maybeSingle();
  if (!coach) return { coach: null, reason: 'coach_not_found' };

  let phone = normalizePhoneToE164(coach.phone);
  if (!phone && coach.email) {
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('phone')
      .eq('email', coach.email)
      .maybeSingle();
    phone = normalizePhoneToE164(userRow?.phone);
  }
  return {
    coach: {
      id: coach.id,
      name: coach.name || 'Koç',
      phone: phone || null
    },
    reason: phone ? null : 'coach_phone_missing'
  };
}

async function resolveTeacherName(teacherId) {
  const tid = String(teacherId || '').trim();
  if (!tid) return 'Öğretmen';
  const { data: user } = await supabaseAdmin.from('users').select('name').eq('id', tid).maybeSingle();
  if (user?.name) return user.name;
  const { data: coach } = await supabaseAdmin.from('coaches').select('name').eq('id', tid).maybeSingle();
  return coach?.name || 'Öğretmen';
}

/** Ders başına tek toplu koç raporu (idempotent). */
export async function sendCoachLessonAttendanceSummary({
  session,
  className,
  rows,
  studentIds,
  institutionId
}) {
  const channel = resolveAutomationSendChannel();
  if (channel === 'none') {
    return { ok: false, note: 'automation_channel_not_ready', warning: null };
  }
  if (!(await attendanceAutoWaEnabled(institutionId))) {
    return { ok: true, skipped: 'auto_whatsapp_absent_disabled' };
  }
  if (await coachSessionNoticeAlreadySent(session?.id, COACH_SUMMARY_KIND)) {
    return { ok: true, skipped: 'already_sent' };
  }

  const resolved = await resolveClassCoach(studentIds);
  if (!resolved.coach) {
    return {
      ok: true,
      skipped: resolved.reason || 'coach_not_assigned',
      warning:
        resolved.reason === 'coach_phone_missing'
          ? 'Koçun WhatsApp telefon numarası bulunamadı.'
          : 'Bu sınıf için koç/rehber öğretmen tanımlanmamış.'
    };
  }
  if (!resolved.coach.phone) {
    return {
      ok: true,
      skipped: 'coach_phone_missing',
      warning: 'Koçun WhatsApp telefon numarası bulunamadı.',
      coach_name: resolved.coach.name
    };
  }

  const teacherName = await resolveTeacherName(session.teacher_id);
  const lessonDateTime = `${session.lesson_date || ''} ${String(session.start_time || '').slice(0, 5)}`.trim();
  const summary = buildAttendanceSummary(rows);
  const text = formatCoachAttendanceSummaryMessage({
    className,
    lessonName: session.subject || 'Ders',
    teacherName,
    coachName: resolved.coach.name,
    lessonDateTime,
    summary
  });

  const sent = await sendAutomationPlainText({
    phone: resolved.coach.phone,
    message: text,
    notificationType: COACH_SUMMARY_KIND,
    coachId: resolved.coach.id
  });

  await logAttendanceWa({
    studentId: null,
    sessionId: session.id,
    kind: COACH_SUMMARY_KIND,
    message: text,
    ok: Boolean(sent.ok),
    error: sent.ok ? null : sent.error || 'send_failed',
    phone: resolved.coach.phone,
    metaMessageId: sent.sid || sent.gateway_message_id || null,
    metaTemplateName: sent.meta_template_name || null,
    logDate: sessionLogDate(session),
    channel: sent.channel || channel
  });

  return {
    ok: Boolean(sent.ok),
    coach_name: resolved.coach.name,
    note: sent.ok ? null : sent.error || 'whatsapp_failed',
    warning: sent.ok ? null : 'Yoklama kaydedildi ancak koç WhatsApp bildirimi gönderilemedi.'
  };
}

/** absent→late sonrası koça kısa güncelleme (tam raporu tekrarlama). */
export async function sendCoachLateArrivalDelta({
  session,
  className,
  lateRows,
  allRows,
  studentIds,
  institutionId
}) {
  if (!lateRows?.length) return { ok: true, skipped: 'no_late_rows' };
  const channel = resolveAutomationSendChannel();
  if (channel === 'none') return { ok: false, note: 'automation_channel_not_ready' };
  if (!(await attendanceAutoWaEnabled(institutionId))) {
    return { ok: true, skipped: 'auto_whatsapp_absent_disabled' };
  }

  // Öğrenci bazlı dedupe: her late öğrenci için bir kez koç delta
  const pending = [];
  for (const row of lateRows) {
    const sid = String(row.student_id || '').trim();
    if (!sid) continue;
    if (await attendanceWaAlreadySent(session?.id, sid, [COACH_LATE_DELTA_KIND])) continue;
    pending.push(row);
  }
  if (!pending.length) return { ok: true, skipped: 'already_sent' };

  const resolved = await resolveClassCoach(studentIds);
  if (!resolved.coach?.phone) {
    return {
      ok: true,
      skipped: resolved.reason || 'coach_phone_missing',
      warning:
        resolved.reason === 'coach_not_assigned' || !resolved.coach
          ? 'Bu sınıf için koç/rehber öğretmen tanımlanmamış.'
          : 'Koçun WhatsApp telefon numarası bulunamadı.'
    };
  }

  const summary = buildAttendanceSummary(allRows);
  const presentLike = summary.present + summary.late;
  const chunks = pending.map((row) =>
    formatLateArrivalUpdateMessage({
      studentName: row.student_name || row.name || 'Öğrenci',
      className,
      lessonName: session.subject || 'Ders',
      attendanceStatus: 'late',
      cameraStatus: row.camera_status,
      forCoach: true,
      previousLabel: 'Katılmadı',
      presentCount: presentLike,
      totalCount: summary.total
    })
  );
  const text = chunks.join('\n\n---\n\n');

  const sent = await sendAutomationPlainText({
    phone: resolved.coach.phone,
    message: text,
    notificationType: COACH_LATE_DELTA_KIND,
    coachId: resolved.coach.id
  });

  for (const row of pending) {
    await logAttendanceWa({
      studentId: row.student_id,
      sessionId: session.id,
      kind: COACH_LATE_DELTA_KIND,
      message: text,
      ok: Boolean(sent.ok),
      error: sent.ok ? null : sent.error || 'send_failed',
      phone: resolved.coach.phone,
      metaMessageId: sent.sid || sent.gateway_message_id || null,
      metaTemplateName: sent.meta_template_name || null,
      logDate: sessionLogDate(session),
      channel: sent.channel || channel
    });
  }

  return {
    ok: Boolean(sent.ok),
    coach_name: resolved.coach.name,
    note: sent.ok ? null : sent.error || 'whatsapp_failed'
  };
}
