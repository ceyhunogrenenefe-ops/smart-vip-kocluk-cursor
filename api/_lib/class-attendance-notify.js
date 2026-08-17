import { supabaseAdmin } from './supabase-admin.js';
import { renderMessageTemplate } from './template-engine.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import {
  resolveAutomationSendChannel,
  sendAutomationTemplateMessage
} from './whatsapp-automation-channel.js';

const FALLBACK_ABSENT =
  'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).';

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

async function logAttendanceWa({
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

/**
 * Eski düzen: yoklama WhatsApp yalnızca veliye gider. Koç/öğretmen kopyası kapalı.
 */
export async function sendAttendanceNoticeToStaff() {
  return { ok: true, staff: [], skipped: 'staff_notify_disabled' };
}

/** Devamsız öğrenci velisine bildirim (koça/öğretmene gitmez). */
export async function sendAbsentNoticeForStudent({ session, className, studentId, institutionId }) {
  const channel = resolveAutomationSendChannel();
  if (channel === 'none') return { ok: false, note: 'automation_channel_not_ready', student_id: studentId };

  if (!(await attendanceAutoWaEnabled(institutionId))) {
    return { ok: true, skipped: 'auto_whatsapp_absent_disabled', student_id: studentId };
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

  const logDate =
    session.lesson_date && /^\d{4}-\d{2}-\d{2}$/.test(session.lesson_date)
      ? session.lesson_date
      : new Date().toISOString().slice(0, 10);

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
