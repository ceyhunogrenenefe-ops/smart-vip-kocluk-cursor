/**
 * Soru çözüm randevu hatırlatmaları — öğrenci (1s, 15dk) + öğretmen (30dk önce liste).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { getIstanbulDateString } from './istanbul-time.js';
import { recordCronRun } from './cron-run-log.js';
import { insertQuestionNotification } from './question-help.js';
import { combineIstanbulDateTime, isSolutionLessonSubject, appointmentStatusLabel } from './solution-appointments-core.js';
import { sendAutomatedWhatsApp } from './whatsapp-outbound.js';
import { resolveAutomationSendChannel } from './whatsapp-automation-channel.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const TEACHER_BRIEF_MS = 30 * 60 * 1000;
const WINDOW_MS = 5 * 60 * 1000;

function inWindow(targetMs, nowMs) {
  return nowMs >= targetMs - WINDOW_MS && nowMs < targetMs + WINDOW_MS;
}

async function studentUserId(studentId) {
  const { data } = await supabaseAdmin
    .from('students')
    .select('user_id,platform_user_id,phone,parent_phone,name')
    .eq('id', studentId)
    .maybeSingle();
  return data;
}

async function teacherContact(teacherId) {
  const { data } = await supabaseAdmin.from('users').select('id,name,email,phone').eq('id', teacherId).maybeSingle();
  return data;
}

async function notifyStudent(ap, title, body) {
  const st = await studentUserId(ap.student_id);
  const uid = st?.user_id || st?.platform_user_id;
  if (uid) {
    await insertQuestionNotification({ userId: uid, questionId: ap.id, kind: 'solution_appointment', title, body });
  }
  const phone = st?.phone || st?.parent_phone;
  if (phone) {
    try {
      await sendAutomatedWhatsApp({
        studentId: ap.student_id,
        phone,
        message: `${title}\n${body}`,
        kind: 'solution_appointment_reminder',
        relatedId: ap.id
      });
    } catch (e) {
      console.warn('[solution-appointment-reminders] whatsapp student', ap.id, e?.message || e);
    }
  }
}

export async function runSolutionAppointmentRemindersJob(opts = {}) {
  const triggeredBy = String(opts.triggeredBy || 'cron').trim() || 'cron';
  const now = Date.now();
  const today = getIstanbulDateString();
  const log = [];
  const channel = resolveAutomationSendChannel();

  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select('*')
    .eq('appointment_date', today)
    .in('status', ['scheduled', 'in_progress']);
  if (error) throw error;

  const lessonCache = new Map();
  async function lessonSubject(lessonId) {
    if (lessonCache.has(lessonId)) return lessonCache.get(lessonId);
    const { data } = await supabaseAdmin.from('class_sessions').select('subject').eq('id', lessonId).maybeSingle();
    const sub = data?.subject || 'Soru Çözümü';
    lessonCache.set(lessonId, sub);
    return sub;
  }

  let student1h = 0;
  let student15m = 0;
  let teacherBriefs = 0;

  for (const ap of appointments || []) {
    const slotAt = combineIstanbulDateTime(ap.appointment_date, ap.slot_start).getTime();
    const subject = await lessonSubject(ap.lesson_id);
    const slotLabel = String(ap.slot_start || '').slice(0, 5);

    if (!ap.reminder_1h_sent && inWindow(slotAt - ONE_HOUR_MS, now)) {
      await notifyStudent(
        ap,
        'Randevu hatırlatması',
        `${subject} dersinizde randevunuz 1 saat sonra (${slotLabel}).`
      );
      await supabaseAdmin.from('appointments').update({ reminder_1h_sent: true }).eq('id', ap.id);
      student1h++;
      log.push({ id: ap.id, kind: '1h' });
    }

    if (!ap.reminder_15m_sent && inWindow(slotAt - FIFTEEN_MIN_MS, now)) {
      await notifyStudent(
        ap,
        'Randevu hatırlatması',
        `${subject} — randevunuza 15 dakika kaldı (${slotLabel}).`
      );
      await supabaseAdmin.from('appointments').update({ reminder_15m_sent: true }).eq('id', ap.id);
      student15m++;
      log.push({ id: ap.id, kind: '15m' });
    }
  }

  const { data: lessonsToday, error: lessonErr } = await supabaseAdmin
    .from('class_sessions')
    .select('id,subject,lesson_date,start_time,teacher_id')
    .eq('lesson_date', today)
    .eq('status', 'scheduled');
  if (lessonErr) throw lessonErr;

  const solutionLessons = (lessonsToday || []).filter((l) => isSolutionLessonSubject(l.subject));
  for (const lesson of solutionLessons) {
    const lessonStart = combineIstanbulDateTime(lesson.lesson_date, lesson.start_time).getTime();
    if (!inWindow(lessonStart - TEACHER_BRIEF_MS, now)) continue;

    const { data: lessonAps } = await supabaseAdmin
      .from('appointments')
      .select('*')
      .eq('lesson_id', lesson.id)
      .in('status', ['scheduled', 'in_progress'])
      .order('slot_start', { ascending: true });
    const pending = (lessonAps || []).filter((a) => !a.teacher_brief_sent);
    if (!pending.length) continue;

    const lines = pending.map((a) => {
      const t = String(a.slot_start || '').slice(0, 5);
      return `• ${t} — ${a.student_name || 'Öğrenci'} (${a.student_class_level || '-'}) — ${a.question_count} soru — ${appointmentStatusLabel(a.status)}`;
    });
    const body = `Bugünkü randevular (${String(lesson.start_time).slice(0, 5)} ${lesson.subject}):\n${lines.join('\n')}`;

    const teacher = await teacherContact(lesson.teacher_id);
    if (teacher?.id) {
      await insertQuestionNotification({
        userId: teacher.id,
        questionId: lesson.id,
        kind: 'solution_appointment_teacher_brief',
        title: 'Bugünkü randevu listesi',
        body
      });
    }
    if (channel !== 'none' && teacher?.phone) {
      try {
        await sendAutomatedWhatsApp({
          studentId: null,
          phone: teacher.phone,
          message: body,
          kind: 'solution_appointment_teacher_brief',
          relatedId: lesson.id
        });
      } catch (e) {
        console.warn('[solution-appointment-reminders] whatsapp teacher', lesson.id, e?.message || e);
      }
    }

    await supabaseAdmin
      .from('appointments')
      .update({ teacher_brief_sent: true })
      .in(
        'id',
        pending.map((a) => a.id)
      );
    teacherBriefs++;
    log.push({ lesson_id: lesson.id, kind: 'teacher_brief', count: pending.length });
  }

  await recordCronRun({
    jobKey: 'solution_appointment_reminders',
    ok: true,
    detail: { student1h, student15m, teacherBriefs, triggeredBy }
  });

  return { ok: true, student1h, student15m, teacherBriefs, log, triggeredBy };
}
