import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendWhatsAppUsingTemplateRow, OUTBOUND_LOG_CODE } from './whatsapp-outbound.js';
import { insertWhatsAppAutomationLog } from './message-log.js';
import { getIstanbulDateString } from './istanbul-time.js';
import { shouldSkipConsecutiveSameLesson } from './class-lesson-reminder-logic.js';

export const CLASS_LESSON_REMINDER_KIND = 'class_lesson_reminder';
export const CLASS_LESSON_REMINDER_TEMPLATE = 'class_lesson_reminder';

function uniqPhones(phoneList) {
  const seen = new Set();
  const out = [];
  for (const p of phoneList) {
    const e = normalizePhoneToE164(p);
    if (e && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out;
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
  if (!row?.content) return { ok: false, code: 'template_not_found' };
  if (row.is_active === false) return { ok: false, code: 'template_inactive' };
  if (!String(row.meta_template_name || '').trim()) return { ok: false, code: 'meta_template_name_required' };
  return { ok: true, metaName: String(row.meta_template_name).trim() };
}

/**
 * Tek oturum için grup dersi hatırlatması (cron + manuel aynı şablon / log).
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
      meeting_link:
        String(session.meeting_link || '').trim() ||
        String(process.env.APP_PUBLIC_URL || process.env.APP_BASE_URL || 'https://www.dersonlinevipkocluk.com').trim()
    };
    const phones = uniqPhones([st.parent_phone, st.phone]);
    if (!phones.length) {
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

    for (const ph of phones) {
      evaluatedAny = true;
      let sent;
      try {
        sent = await sendWhatsAppUsingTemplateRow({
          phone: ph,
          templateRow,
          vars,
          templateType: CLASS_LESSON_REMINDER_TEMPLATE
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        sent = {
          ok: false,
          logCode: OUTBOUND_LOG_CODE.META_SEND_FAILED,
          error: errMsg,
          sid: null,
          meta_template_name: metaNameDb,
          errorCode: null
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
        meta_message_id: sent.sid || null,
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
  }

  return { log, anySucceeded, hadSendFailure, evaluatedAny, source };
}

/** Yalnızca en az bir WhatsApp başarılıysa işaretle — cron “gönderildi” sanıp manuel butonu gizlemesin */
export async function markClassSessionReminderSent(sessionId, { anySucceeded }) {
  if (!sessionId || !anySucceeded) return false;
  await supabaseAdmin.from('class_sessions').update({ reminder_sent: true }).eq('id', sessionId);
  return true;
}
