import { supabaseAdmin } from './supabase-admin.js';
import { renderMessageTemplate } from './template-engine.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import {
  resolveAutomationSendChannel,
  sendAutomationTemplateMessage,
  sendAutomationPlainText
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

async function resolveUserPhone(userId) {
  const id = String(userId || '').trim();
  if (!id) return null;
  const { data: u } = await supabaseAdmin.from('users').select('id,name,phone,email').eq('id', id).maybeSingle();
  if (!u) return null;
  let phone = normalizePhoneToE164(u.phone);
  if (!phone && u.email) {
    const em = String(u.email).toLowerCase().trim();
    const { data: coach } = await supabaseAdmin.from('coaches').select('phone').ilike('email', em).maybeSingle();
    phone = normalizePhoneToE164(coach?.phone);
  }
  if (!phone) return null;
  return { id: String(u.id), name: u.name || 'Öğretmen', phone, role: 'teacher' };
}

async function resolveCoachPhone(coachId) {
  const id = String(coachId || '').trim();
  if (!id) return null;
  const { data: coach } = await supabaseAdmin
    .from('coaches')
    .select('id,name,phone,email')
    .eq('id', id)
    .maybeSingle();
  if (!coach) return null;
  let phone = normalizePhoneToE164(coach.phone);
  if (!phone && coach.email) {
    const em = String(coach.email).toLowerCase().trim();
    const { data: u } = await supabaseAdmin.from('users').select('phone').ilike('email', em).maybeSingle();
    phone = normalizePhoneToE164(u?.phone);
  }
  if (!phone) return null;
  return { id: String(coach.id), name: coach.name || 'Koç', phone, role: 'coach' };
}

/**
 * Öğrencinin koçu + ders öğretmeni + sınıf öğretmenleri (benzersiz telefon).
 * @returns {Promise<{ role: string, id: string, name: string, phone: string }[]>}
 */
export async function resolveAttendanceStaffRecipients({ studentId, session }) {
  const out = [];
  const seenPhone = new Set();
  const push = (rec) => {
    if (!rec?.phone) return;
    const key = String(rec.phone);
    if (seenPhone.has(key)) return;
    seenPhone.add(key);
    out.push(rec);
  };

  const sid = String(studentId || '').trim();
  if (sid) {
    const { data: stu } = await supabaseAdmin.from('students').select('coach_id').eq('id', sid).maybeSingle();
    if (stu?.coach_id) push(await resolveCoachPhone(stu.coach_id));
  }

  const teacherIds = new Set();
  const sessionTeacher = String(session?.teacher_id || '').trim();
  if (sessionTeacher) teacherIds.add(sessionTeacher);
  const classId = String(session?.class_id || '').trim();
  if (classId) {
    const { data: cts } = await supabaseAdmin
      .from('class_teachers')
      .select('teacher_id')
      .eq('class_id', classId);
    for (const row of cts || []) {
      const tid = String(row.teacher_id || '').trim();
      if (tid) teacherIds.add(tid);
    }
  }
  for (const tid of teacherIds) {
    push(await resolveUserPhone(tid));
  }

  return out;
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
 * Veliye giden yoklama metninin aynısını koç / öğretmene düz metin olarak gönder.
 */
export async function sendAttendanceNoticeToStaff({
  studentId,
  session,
  message,
  excludePhones = [],
  kind = 'class_absent_notice_staff'
}) {
  const channel = resolveAutomationSendChannel();
  if (channel === 'none') {
    return { ok: false, note: 'automation_channel_not_ready', staff: [] };
  }
  const text = String(message || '').trim();
  if (!text) return { ok: false, note: 'empty_message', staff: [] };

  const exclude = new Set(
    (excludePhones || []).map((p) => normalizePhoneToE164(p)).filter(Boolean)
  );
  const recipients = (await resolveAttendanceStaffRecipients({ studentId, session })).filter(
    (r) => !exclude.has(r.phone)
  );

  const logDate =
    session?.lesson_date && /^\d{4}-\d{2}-\d{2}$/.test(String(session.lesson_date))
      ? String(session.lesson_date)
      : new Date().toISOString().slice(0, 10);

  const staff = [];
  for (const rec of recipients) {
    const staffText = `[Yoklama — ${rec.role === 'coach' ? 'Koç' : 'Öğretmen'} bilgilendirme]\n${text}`;
    try {
      const sent = await sendAutomationPlainText({
        phone: rec.phone,
        message: staffText,
        notificationType: kind
      });
      await logAttendanceWa({
        studentId,
        sessionId: session?.id,
        kind,
        message: staffText,
        ok: Boolean(sent.ok),
        error: sent.ok ? null : sent.error || 'send_failed',
        phone: rec.phone,
        metaMessageId: sent.sid || sent.gateway_message_id || null,
        metaTemplateName: sent.meta_template_name || null,
        logDate,
        channel: sent.channel || channel
      });
      staff.push({
        role: rec.role,
        id: rec.id,
        name: rec.name,
        phone: rec.phone,
        ok: Boolean(sent.ok),
        note: sent.ok ? null : sent.error || 'send_failed'
      });
    } catch (e) {
      staff.push({
        role: rec.role,
        id: rec.id,
        name: rec.name,
        phone: rec.phone,
        ok: false,
        note: e instanceof Error ? e.message : 'exception'
      });
    }
  }

  return {
    ok: staff.length === 0 ? true : staff.some((s) => s.ok),
    staff,
    skipped: staff.length === 0 ? 'no_staff_phone' : undefined
  };
}

/** Devamsız öğrenci velisine bildirim + aynı anda koç/öğretmen. */
export async function sendAbsentNoticeForStudent({ session, className, studentId, institutionId }) {
  const channel = resolveAutomationSendChannel();
  if (channel === 'none') return { ok: false, note: 'automation_channel_not_ready', student_id: studentId };

  if (!(await attendanceAutoWaEnabled(institutionId))) {
    return { ok: true, skipped: 'auto_whatsapp_absent_disabled', student_id: studentId };
  }

  const { data: student } = await supabaseAdmin
    .from('students')
    .select('name, parent_phone, coach_id')
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

  const staffResult = await sendAttendanceNoticeToStaff({
    studentId,
    session,
    message: preview,
    excludePhones: parentPhone ? [parentPhone] : [],
    kind: 'class_absent_notice_staff'
  });

  const ok = Boolean(parentResult.ok) || Boolean(staffResult.ok && staffResult.staff?.some((s) => s.ok));

  return {
    ok,
    student_id: studentId,
    channel: parentResult.channel || channel,
    note: parentResult.ok ? null : parentResult.note || null,
    error_code: parentResult.error_code || null,
    parent_ok: Boolean(parentResult.ok),
    staff: staffResult.staff || [],
    staff_ok: Boolean(staffResult.ok)
  };
}
