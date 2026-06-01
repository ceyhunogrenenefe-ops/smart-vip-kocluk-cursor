import { supabaseAdmin } from './supabase-admin.js';
import { metaWhatsAppConfigured } from './meta-whatsapp.js';
import { sendAutomatedWhatsApp } from './whatsapp-outbound.js';
import { renderMessageTemplate } from './template-engine.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';

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

/** Devamsız öğrenci velisine Meta şablon (class_absent_notice_1). */
export async function sendAbsentNoticeForStudent({ session, className, studentId, institutionId }) {
  const waReady = metaWhatsAppConfigured();
  if (!waReady) return { ok: false, note: 'meta_whatsapp_not_ready', student_id: studentId };
  if (!(await attendanceAutoWaEnabled(institutionId))) {
    return { ok: true, skipped: 'auto_whatsapp_absent_disabled', student_id: studentId };
  }

  const { data: student } = await supabaseAdmin
    .from('students')
    .select('name, parent_phone')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return { ok: false, note: 'student_not_found', student_id: studentId };
  const parentPhone = normalizePhoneToE164(student.parent_phone);
  if (!parentPhone) return { ok: false, note: 'parent_phone_missing', student_id: studentId };

  const lessonDate = String(session.lesson_date || '').trim();
  const lessonTime = String(session.start_time || '').slice(0, 5);
  const vars = {
    student_name: student.name || 'Öğrenciniz',
    class_name: className || 'Sınıf',
    subject: session.subject || 'Ders',
    lesson_date: lessonDate,
    lesson_time: lessonTime
  };

  const sent = await sendAutomatedWhatsApp({
    phone: parentPhone,
    templateType: 'class_absent_notice_1',
    vars
  });

  const logDate =
    session.lesson_date && /^\d{4}-\d{2}-\d{2}$/.test(session.lesson_date)
      ? session.lesson_date
      : new Date().toISOString().slice(0, 10);
  const preview =
    sent.bodyPreview ||
    renderMessageTemplate(
      'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).',
      vars
    );

  try {
    await supabaseAdmin.from('message_logs').insert({
      student_id: studentId,
      kind: 'class_absent_notice_1',
      related_id: session.id,
      message: preview,
      status: sent.ok ? 'sent' : 'failed',
      log_date: logDate,
      error: sent.ok ? null : sent.error || 'send_failed',
      phone: parentPhone,
      twilio_sid: null,
      twilio_error_code: sent.errorCode || null,
      twilio_content_sid: null,
      meta_message_id: sent.sid || null,
      meta_template_name: sent.meta_template_name || null
    });
  } catch {
    /* yoklama akışını bozma */
  }

  return sent.ok
    ? { ok: true, student_id: studentId }
    : {
        ok: false,
        student_id: studentId,
        note: sent.error || 'whatsapp_failed',
        error_code: sent.errorCode != null ? String(sent.errorCode) : null
      };
}
