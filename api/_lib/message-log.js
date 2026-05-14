import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { getIstanbulDateString } from './istanbul-time.js';

/**
 * Cron / otomasyon: message_logs satırı (hata yutulur — cron akışı kesilmesin).
 * @param {{
 *   studentId: string | null,
 *   relatedId: string | null,
 *   kind: string,
 *   message: string | null,
 *   status: 'sent' | 'failed' | 'skipped',
 *   logCode?: string | null,
 *   error?: string | null,
 *   phone?: string | null,
 *   logDate?: string,
 *   twilio_error_code?: string | null,
 *   meta_message_id?: string | null,
 *   meta_template_name?: string | null
 * }} p
 */
export async function insertWhatsAppAutomationLog(p) {
  const logDate = p.logDate || getIstanbulDateString();
  const phone = p.phone != null ? normalizePhoneToE164(p.phone) : null;
  const row = {
    student_id: p.studentId ?? null,
    related_id: p.relatedId ?? null,
    kind: String(p.kind || '').trim() || 'unknown',
    message: p.message != null ? String(p.message).slice(0, 8000) : null,
    status: p.status === 'sent' || p.status === 'skipped' ? p.status : 'failed',
    log_date: logDate,
    error: p.error != null ? String(p.error).slice(0, 4000) : null,
    phone: phone || null,
    twilio_sid: null,
    twilio_error_code:
      p.twilio_error_code != null && String(p.twilio_error_code).trim()
        ? String(p.twilio_error_code).trim()
        : p.logCode != null && String(p.logCode).trim()
          ? String(p.logCode).trim()
          : null,
    twilio_content_sid: null,
    meta_message_id: p.meta_message_id != null ? String(p.meta_message_id).trim() : null,
    meta_template_name: p.meta_template_name != null ? String(p.meta_template_name).trim().slice(0, 512) : null
  };
  try {
    const { error } = await supabaseAdmin.from('message_logs').insert(row);
    if (error) console.warn('[insertWhatsAppAutomationLog]', error.message);
  } catch (e) {
    console.warn('[insertWhatsAppAutomationLog]', e instanceof Error ? e.message : String(e));
  }
}

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
    .in('kind', ['lesson_reminder', 'lesson_reminder_parent'])
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
