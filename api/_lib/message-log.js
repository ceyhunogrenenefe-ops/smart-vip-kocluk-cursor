import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { getIstanbulDateString } from './istanbul-time.js';

/**
 * Aynı ders + aynı alıcı (E.164) için başarılı hatırlatma gönderilmiş mi?
 * @param {string} lessonId
 * @param {string} phoneE164
 */
export async function alreadySentLessonReminder(lessonId, phoneE164) {
  const e164 = normalizePhoneToE164(phoneE164);
  if (!e164) return true;
  const { data, error } = await supabaseAdmin
    .from('message_logs')
    .select('id')
    .eq('kind', 'lesson_reminder')
    .eq('related_id', lessonId)
    .eq('status', 'sent')
    .eq('phone', e164)
    .maybeSingle();
  if (error) {
    console.warn('[message-log] alreadySentLessonReminder', error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Rapor hatırlatması bugün bu öğrenciye (bu telefona) gitti mi
 */
export async function alreadySentReportReminderToday(studentId, phoneE164, logDate) {
  const e164 = normalizePhoneToE164(phoneE164);
  if (!e164) return true;
  const { data, error } = await supabaseAdmin
    .from('message_logs')
    .select('id')
    .eq('kind', 'report_reminder')
    .eq('student_id', studentId)
    .eq('log_date', logDate)
    .eq('status', 'sent')
    .eq('phone', e164)
    .maybeSingle();
  if (error) {
    console.warn('[message-log] alreadySentReportReminderToday', error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * @param {{
 *   studentId: string | null,
 *   lessonId: string | null,
 *   phone: string,
 *   kind: string,
 *   body: string,
 *   status: 'sent'|'failed'|'skipped',
 *   error?: string | null,
 *   logDate?: string
 * }} p
 */
export async function insertMessageLog(p) {
  const phone = normalizePhoneToE164(p.phone);
  const row = {
    student_id: p.studentId,
    kind: p.kind,
    related_id: p.lessonId,
    message: p.body,
    status: p.status,
    log_date: p.logDate || getIstanbulDateString(),
    error: p.error || null,
    phone: phone || null
  };
  const { error } = await supabaseAdmin.from('message_logs').insert(row);
  if (error) throw error;
}
