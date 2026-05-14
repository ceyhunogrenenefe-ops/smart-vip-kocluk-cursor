import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { sendAutomatedWhatsApp } from '../api/_lib/whatsapp-outbound.js';
import { renderMessageTemplate } from '../api/_lib/template-engine.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

const TEMPLATE_TYPE = 'class_absent_notice_1';
const ABSENT_KINDS = ['class_absent_notice_1', 'class_absent_notice'];
const PREVIEW_FALLBACK =
  'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).';

async function attendanceAutoWaEnabled(institutionId) {
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

function permanentAbsentSendFailure(err) {
  const e = String(err || '').toLowerCase();
  return (
    e.includes('parent_phone') ||
    e.includes('invalid_phone') ||
    e.includes('meta_template_name_required') ||
    e.includes('template_not_found') ||
    e.includes('template_variables_invalid')
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  if (!metaWhatsAppConfigured()) {
    await recordCronRun({
      jobKey: 'absent_student_notification',
      ok: true,
      skipped: 'meta_whatsapp_not_ready',
      detail: { path: 'class-absent-notify-retry' }
    });
    return res.status(200).json({ ok: true, skipped: 'meta_whatsapp_not_ready' });
  }

  const sinceIso = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data: fails, error: qErr } = await supabaseAdmin
    .from('message_logs')
    .select('id, student_id, related_id, kind, error, phone, message')
    .in('kind', ABSENT_KINDS)
    .eq('status', 'failed')
    .is('meta_message_id', null)
    .gte('sent_at', sinceIso)
    .order('sent_at', { ascending: true })
    .limit(40);

  if (qErr) {
    await recordCronRun({ jobKey: 'absent_student_notification', ok: false, detail: { error: qErr.message } });
    return res.status(500).json({ ok: false, error: qErr.message });
  }

  const log = [];
  let sentOk = 0;
  let sentFail = 0;

  for (const row of fails || []) {
    const relatedId = row.related_id ? String(row.related_id).trim() : '';
    const studentId = row.student_id ? String(row.student_id).trim() : '';
    if (!relatedId || !studentId) {
      log.push({ id: row.id, skipped: 'missing_related_or_student' });
      continue;
    }
    if (permanentAbsentSendFailure(row.error)) {
      log.push({ id: row.id, skipped: 'permanent_failure' });
      continue;
    }

    const { data: session } = await supabaseAdmin.from('class_sessions').select('*').eq('id', relatedId).maybeSingle();
    if (!session) {
      log.push({ id: row.id, skipped: 'session_not_found' });
      continue;
    }

    const allowAuto = await attendanceAutoWaEnabled(
      session.institution_id != null ? String(session.institution_id).trim() : ''
    );
    if (!allowAuto) {
      log.push({ id: row.id, skipped: 'auto_whatsapp_absent_disabled' });
      continue;
    }

    const { data: cls } = await supabaseAdmin.from('classes').select('name').eq('id', session.class_id).maybeSingle();
    const className = cls?.name || 'Sınıf';

    const { data: student } = await supabaseAdmin
      .from('students')
      .select('name, parent_phone')
      .eq('id', studentId)
      .maybeSingle();
    if (!student) {
      log.push({ id: row.id, skipped: 'student_not_found' });
      continue;
    }

    const parentPhone = normalizePhoneToE164(student.parent_phone);
    if (!parentPhone) {
      log.push({ id: row.id, skipped: 'parent_phone_missing' });
      continue;
    }

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
      templateType: TEMPLATE_TYPE,
      vars
    });

    const preview = sent.bodyPreview || renderMessageTemplate(PREVIEW_FALLBACK, vars);

    if (sent.ok) {
      sentOk += 1;
      await supabaseAdmin
        .from('message_logs')
        .update({
          status: 'sent',
          error: null,
          kind: 'class_absent_notice_1',
          phone: parentPhone,
          message: preview,
          meta_message_id: sent.sid || null,
          meta_template_name: sent.meta_template_name || null,
          twilio_error_code: sent.errorCode != null ? String(sent.errorCode) : null
        })
        .eq('id', row.id);
      log.push({ id: row.id, ok: true, meta_message_id: sent.sid });
    } else {
      sentFail += 1;
      await supabaseAdmin
        .from('message_logs')
        .update({
          error: sent.error || 'send_failed',
          twilio_error_code: sent.errorCode != null ? String(sent.errorCode) : null
        })
        .eq('id', row.id);
      log.push({ id: row.id, ok: false, error: sent.error });
    }
  }

  await recordCronRun({
    jobKey: 'absent_student_notification',
    ok: true,
    messagesSent: sentOk,
    messagesFailed: sentFail,
    detail: {
      examined: (fails || []).length,
      note: 'Birincil gönderim yoklama kaydı (mark-attendance) sırasında anlık çalışır; bu cron başarısız kayıtları yeniden dener.'
    }
  });

  return res.status(200).json({
    ok: true,
    examined: (fails || []).length,
    retried_ok: sentOk,
    retried_failed: sentFail,
    log
  });
}
