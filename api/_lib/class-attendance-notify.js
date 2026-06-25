import { supabaseAdmin } from './supabase-admin.js';

import { renderMessageTemplate } from './template-engine.js';

import { normalizePhoneToE164 } from './phone-whatsapp.js';

import {

  resolveAutomationSendChannel,

  sendAutomationTemplateMessage

} from './whatsapp-automation-channel.js';



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



/** Devamsız öğrenci velisine bildirim (gateway düz metin veya Meta şablon). */

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



  const { data: templateRow } = await supabaseAdmin

    .from('message_templates')

    .select('*')

    .eq('type', 'class_absent_notice_1')

    .maybeSingle();



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



  const logDate =

    session.lesson_date && /^\d{4}-\d{2}-\d{2}$/.test(session.lesson_date)

      ? session.lesson_date

      : new Date().toISOString().slice(0, 10);

  const preview =

    sent.bodyPreview ||

    renderMessageTemplate(

      templateRow?.content ||

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

      meta_message_id: sent.sid || sent.gateway_message_id || null,

      meta_template_name: sent.meta_template_name || (channel === 'gateway' ? 'gateway_plain' : null)

    });

  } catch {

    /* yoklama akışını bozma */

  }



  return sent.ok

    ? { ok: true, student_id: studentId, channel: sent.channel || channel }

    : {

        ok: false,

        student_id: studentId,

        note: sent.error || 'whatsapp_failed',

        error_code: sent.errorCode != null ? String(sent.errorCode) : null

      };

}

