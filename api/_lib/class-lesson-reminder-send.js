import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { insertWhatsAppAutomationLog, alreadySentClassLessonReminder } from './message-log.js';
import { getIstanbulDateString } from './istanbul-time.js';
import { shouldSkipConsecutiveSameLesson, shouldSkipClassLessonReminder } from './class-lesson-reminder-logic.js';
import { resolveGuestShareUrlForClassSession } from './guest-join-share-url.js';
import { sendAutomationTemplateMessage } from './whatsapp-automation-channel.js';
import { OUTBOUND_LOG_CODE } from './whatsapp-outbound.js';
import { getClassLessonReminderPhone } from './meetings-resolve.js';

export const CLASS_LESSON_REMINDER_KIND = 'class_lesson_reminder';
export const CLASS_LESSON_REMINDER_TEMPLATE = 'class_lesson_reminder';

/** Meta üzerinden grup dersi hatırlatması — varsayılan kapalı; Vercel: CLASS_LESSON_REMINDER_META_ENABLED=1 */
export function isClassLessonReminderMetaEnabled() {
  return String(process.env.CLASS_LESSON_REMINDER_META_ENABLED ?? '0').trim() === '1';
}

/** Tüm grup hatırlatma cron/manuel — env ile zorla kapat (CLASS_LESSON_REMINDER_ENABLED=0) */
export function isClassLessonReminderForceDisabled() {
  const v = String(process.env.CLASS_LESSON_REMINDER_ENABLED ?? '').trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'off' || v === 'paused';
}

export async function loadClassLessonReminderTemplate() {
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .select('*')
    .eq('type', CLASS_LESSON_REMINDER_TEMPLATE)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function validateClassLessonReminderTemplate(row) {
  if (isClassLessonReminderForceDisabled()) {
    return { ok: false, code: 'class_lesson_reminders_suspended' };
  }
  if (!row?.content) return { ok: false, code: 'template_not_found' };
  if (row.is_active === false) return { ok: false, code: 'template_inactive' };
  return { ok: true, metaName: String(row.meta_template_name || '').trim() || null };
}

/** Cron yarışını önler: reminder_sent=false iken atomik işaretle */
export async function claimClassSessionReminder(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return false;
  const { data, error } = await supabaseAdmin
    .from('class_sessions')
    .update({ reminder_sent: true })
    .eq('id', id)
    .eq('reminder_sent', false)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function releaseClassSessionReminderClaim(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return;
  await supabaseAdmin.from('class_sessions').update({ reminder_sent: false }).eq('id', id);
}

/**
 * Tek oturum için grup dersi hatırlatması (cron + manuel aynı şablon / log).
 * Her öğrenci için yalnızca bir numaraya (veli öncelikli) gateway/Meta üzerinden tek mesaj.
 */
export async function sendClassLessonReminderForSession(p) {
  const session = p.session;
  const templateRow = p.templateRow;
  const metaNameDb = String(templateRow?.meta_template_name || '').trim();
  const logDate =
    p.logDate ||
    (session?.lesson_date && /^\d{4}-\d{2}-\d{2}$/.test(String(session.lesson_date))
      ? String(session.lesson_date)
      : getIstanbulDateString());
  const className = p.className || 'Sınıf';
  const studentIds = p.studentIds || [];
  const studentById = p.studentById || new Map();
  const studentDaySessions = p.studentDaySessions || new Map();
  const applyConsecutiveSkip = p.applyConsecutiveSkip === true;
  const source = p.source === 'manual' ? 'manual' : 'cron';

  if (shouldSkipClassLessonReminder(session?.subject)) {
    return {
      log: [
        {
          session_id: session.id,
          class_id: session.class_id,
          ok: true,
          skipped: 'excluded_subject',
          note: 'Deneme veya rehberlik dersi — grup hatırlatması gönderilmez',
          subject: session.subject || ''
        }
      ],
      anySucceeded: true,
      hadSendFailure: false,
      evaluatedAny: false,
      source
    };
  }

  /** @type {object[]} */
  const log = [];
  let anySucceeded = false;
  let hadSendFailure = false;
  let evaluatedAny = false;

  if (!studentIds.length) {
    return {
      log: [
        {
          session_id: session.id,
          class_id: session.class_id,
          ok: false,
          skipped: 'no_students_in_class',
          note: 'Sınıfa kayıtlı öğrenci yok'
        }
      ],
      anySucceeded: false,
      hadSendFailure: false,
      evaluatedAny: false,
      source
    };
  }

  for (const sid of studentIds) {
    const st = studentById.get(String(sid));
    if (!st) continue;

    if (applyConsecutiveSkip) {
      const ordered = studentDaySessions.get(String(sid)) || [];
      if (shouldSkipConsecutiveSameLesson(ordered, session.id)) {
        evaluatedAny = true;
        log.push({
          session_id: session.id,
          student_id: st.id,
          ok: true,
          skipped: 'consecutive_same_lesson',
          note: 'Önceki oturumla aynı sınıf/konu/link — tekrar hatırlatma yok'
        });
        continue;
      }
    }

    const vars = {
      student_name: st.name || 'Öğrenci',
      class_name: className,
      subject: session.subject || 'Ders',
      lesson_time: String(session.start_time || '').slice(0, 5),
      meeting_link: await resolveGuestShareUrlForClassSession(session)
    };

    const ph = getClassLessonReminderPhone(st);
    if (!ph) {
      evaluatedAny = true;
      const code = OUTBOUND_LOG_CODE.INVALID_PHONE;
      await insertWhatsAppAutomationLog({
        studentId: st.id,
        relatedId: session.id,
        kind: CLASS_LESSON_REMINDER_KIND,
        message: `[${CLASS_LESSON_REMINDER_KIND}] session=${session.id} source=${source}`,
        status: 'failed',
        logCode: code,
        error: 'no_valid_phone_for_student',
        logDate
      });
      log.push({ session_id: session.id, student_id: st.id, ok: false, log_code: code });
      continue;
    }

    evaluatedAny = true;

    if (await alreadySentClassLessonReminder(session.id, ph)) {
      log.push({
        session_id: session.id,
        student_id: st.id,
        phone: ph,
        ok: true,
        skipped: 'already_sent',
        note: 'Bu oturum için bu numaraya hatırlatma zaten gönderilmiş'
      });
      anySucceeded = true;
      continue;
    }

    let sent;
    try {
      sent = await sendAutomationTemplateMessage({
        phone: ph,
        templateRow,
        vars,
        templateType: CLASS_LESSON_REMINDER_TEMPLATE,
        coachId: st.coach_id || null
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      sent = {
        ok: false,
        logCode: OUTBOUND_LOG_CODE.META_SEND_FAILED,
        error: errMsg,
        sid: null,
        gateway_message_id: null,
        meta_template_name: metaNameDb,
        errorCode: null,
        channel: 'unknown'
      };
    }

    const lc = sent.logCode || (sent.ok ? null : OUTBOUND_LOG_CODE.META_SEND_FAILED);
    if (!sent.ok) hadSendFailure = true;
    else anySucceeded = true;

    await insertWhatsAppAutomationLog({
      studentId: st.id,
      relatedId: session.id,
      kind: CLASS_LESSON_REMINDER_KIND,
      message: `[${CLASS_LESSON_REMINDER_KIND}] session=${session.id} source=${source}`,
      status: sent.ok ? 'sent' : 'failed',
      logCode: lc || undefined,
      error: sent.ok ? null : sent.error || null,
      phone: ph,
      logDate,
      twilio_error_code: sent.errorCode != null ? String(sent.errorCode) : null,
      meta_message_id: sent.sid || sent.gateway_message_id || null,
      meta_template_name: sent.meta_template_name || metaNameDb
    });

    log.push({
      session_id: session.id,
      student_id: st.id,
      phone: ph,
      ok: sent.ok,
      channel: sent.channel,
      meta_message_id: sent.sid,
      twilio_error_code: sent.errorCode,
      error: sent.ok ? undefined : sent.error,
      log_code: lc
    });
  }

  return { log, anySucceeded, hadSendFailure, evaluatedAny, source };
}

/** Yalnızca en az bir WhatsApp başarılıysa işaretle — cron “gönderildi” sanıp manuel butonu gizlemesin */
export async function markClassSessionReminderSent(sessionId, { anySucceeded }) {
  if (!sessionId || !anySucceeded) return false;
  await supabaseAdmin.from('class_sessions').update({ reminder_sent: true }).eq('id', sessionId);
  return true;
}
