/**
 * Ders bitince (~10 dk) veliye öğretmen yorum daveti WhatsApp
 * Cron: /api/cron/teacher-review-invites (*/5)
 */
import crypto from 'crypto';
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { getIstanbulDateString } from './istanbul-time.js';
import { recordCronRun } from './cron-run-log.js';
import { renderMessageTemplate } from './template-engine.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendNotification } from './message-service.js';
import { metaWhatsAppConfigured, loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';
import { insertWhatsAppAutomationLog } from './message-log.js';

export const TEACHER_REVIEW_INVITE_KIND = 'teacher_review_invite';

const DEFAULT_TEMPLATE = `Sayın {{parent_name}},

{{student_name}} öğrencimizin {{teacher_name}} öğretmenimizle dersi tamamlandı.
Lütfen öğretmenimizi değerlendirin:
{{review_link}}

Online VIP Dershane`;

function wallTimeToUtcMs(lessonDate, timeStr) {
  const s = String(timeStr || '').trim();
  let t = '00:00:00';
  if (/^\d{1,2}:\d{2}$/.test(s)) t = `${s}:00`;
  else if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) t = s;
  const ms = new Date(`${lessonDate}T${t}+03:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function publicAppBase() {
  return String(process.env.PUBLIC_APP_URL || process.env.APP_URL || 'https://www.dersonlinevipkocluk.com')
    .trim()
    .replace(/\/$/, '');
}

async function alreadySentInvite(lessonId, phoneE164) {
  const e164 = normalizePhoneToE164(phoneE164);
  if (!e164 || !lessonId) return true;
  const { data, error } = await supabaseAdmin
    .from('message_logs')
    .select('id')
    .eq('kind', TEACHER_REVIEW_INVITE_KIND)
    .eq('related_id', String(lessonId))
    .eq('status', 'sent')
    .eq('phone', e164)
    .maybeSingle();
  if (error) {
    console.warn('[teacher-review-invite] alreadySent', error.message);
    return false;
  }
  return Boolean(data);
}

async function loadTemplateContent() {
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .select('content,is_active')
    .eq('type', TEACHER_REVIEW_INVITE_KIND)
    .maybeSingle();
  if (error) throw error;
  if (data?.content && data.is_active !== false) return String(data.content);
  return DEFAULT_TEMPLATE;
}

function newInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function ensureInviteToken(lesson) {
  const { data: rows, error: findErr } = await supabaseAdmin
    .from('teacher_review_invite_tokens')
    .select('token, used_at, expires_at')
    .eq('lesson_id', lesson.id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  if (findErr) throw findErr;
  const existing = Array.isArray(rows) ? rows[0] : null;
  if (existing?.token) return existing.token;

  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: invite, error: insErr } = await supabaseAdmin
    .from('teacher_review_invite_tokens')
    .insert({
      token,
      teacher_id: lesson.teacher_id,
      student_id: lesson.student_id,
      lesson_id: lesson.id,
      parent_name: lesson.parent_name || null,
      expires_at: expiresAt,
      created_by: null
    })
    .select('token')
    .maybeSingle();
  if (insErr) throw insErr;
  return invite?.token || token;
}

/**
 * @param {{ triggeredBy?: string }} [opts]
 */
export async function runTeacherReviewInviteJob(opts = {}) {
  const triggeredBy = String(opts.triggeredBy || 'cron').trim() || 'cron';
  const logDate = getIstanbulDateString();
  const now = Date.now();
  const minAgo = now - 15 * 60 * 1000; // 0–15 dk pencere (cron 5 dk → ~10 dk hedef)
  const log = [];

  if (String(process.env.TEACHER_REVIEW_INVITE_ENABLED ?? '1').trim() === '0') {
    await recordCronRun({
      jobKey: 'teacher_review_invites',
      ok: true,
      skipped: 'disabled',
      detail: { triggered_by: triggeredBy }
    });
    return { ok: true, skipped: 'disabled', log, triggeredBy };
  }

  await loadMetaWhatsAppSecretsFromDb();
  if (!metaWhatsAppConfigured()) {
    await recordCronRun({
      jobKey: 'teacher_review_invites',
      ok: true,
      skipped: 'meta_not_configured',
      detail: { triggered_by: triggeredBy }
    });
    return { ok: true, skipped: 'meta_not_configured', log, triggeredBy };
  }

  const today = logDate;
  const yday = new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString('en-CA', {
    timeZone: 'Europe/Istanbul'
  });

  const { data: lessons, error } = await supabaseAdmin
    .from('teacher_lessons')
    .select('id, teacher_id, student_id, title, lesson_date, end_time, status')
    .eq('status', 'completed')
    .in('lesson_date', [today, yday])
    .limit(400);
  if (error) throw error;

  const due = (lessons || []).filter((l) => {
    const endMs = wallTimeToUtcMs(l.lesson_date, l.end_time);
    return endMs != null && endMs <= now && endMs >= minAgo;
  });

  if (!due.length) {
    await recordCronRun({
      jobKey: 'teacher_review_invites',
      ok: true,
      messagesSent: 0,
      messagesFailed: 0,
      detail: { due: 0, log_date: logDate, triggered_by: triggeredBy }
    });
    return { ok: true, due: 0, log, triggeredBy };
  }

  const studentIds = [...new Set(due.map((l) => String(l.student_id || '')).filter(Boolean))];
  const teacherIds = [...new Set(due.map((l) => String(l.teacher_id || '')).filter(Boolean))];

  const [{ data: students }, { data: teachers }, { data: profiles }, templateContent] = await Promise.all([
    supabaseAdmin
      .from('students')
      .select('id, name, full_name, parent_name, parent_phone')
      .in('id', studentIds),
    supabaseAdmin.from('users').select('id, name').in('id', teacherIds),
    supabaseAdmin.from('teacher_profiles').select('user_id, display_name').in('user_id', teacherIds),
    loadTemplateContent()
  ]);

  const studentById = new Map((students || []).map((s) => [String(s.id), s]));
  const teacherById = new Map((teachers || []).map((t) => [String(t.id), t]));
  const profileById = new Map((profiles || []).map((p) => [String(p.user_id), p]));

  let sentOk = 0;
  let sentFail = 0;

  for (const lesson of due) {
    const stud = studentById.get(String(lesson.student_id || ''));
    const phone = normalizePhoneToE164(stud?.parent_phone || '');
    if (!phone) {
      log.push({ lesson_id: lesson.id, ok: false, skipped: 'no_parent_phone' });
      continue;
    }
    if (await alreadySentInvite(lesson.id, phone)) {
      log.push({ lesson_id: lesson.id, ok: true, skipped: 'already_sent' });
      continue;
    }

    try {
      const token = await ensureInviteToken({
        ...lesson,
        parent_name: stud?.parent_name || null
      });
      const reviewLink = `${publicAppBase()}/review/public?token=${encodeURIComponent(token)}`;
      const teacherName =
        String(profileById.get(String(lesson.teacher_id))?.display_name || '').trim() ||
        String(teacherById.get(String(lesson.teacher_id))?.name || '').trim() ||
        'Öğretmenimiz';
      const studentName =
        String(stud?.full_name || stud?.name || '').trim() || 'Öğrencimiz';
      const parentName = String(stud?.parent_name || '').trim() || 'Veli';

      const vars = {
        parent_name: parentName,
        student_name: studentName,
        teacher_name: teacherName,
        review_link: reviewLink
      };
      const text = renderMessageTemplate(templateContent, vars).trim();

      const sent = await sendNotification({
        notificationType: TEACHER_REVIEW_INVITE_KIND,
        phone,
        plainText: text,
        vars
      });

      await insertWhatsAppAutomationLog({
        studentId: lesson.student_id || null,
        relatedId: lesson.id,
        kind: TEACHER_REVIEW_INVITE_KIND,
        message: text.slice(0, 8000),
        status: sent.ok ? 'sent' : 'failed',
        error: sent.ok ? null : sent.error || null,
        phone,
        logDate,
        meta_message_id: sent.sid || sent.meta_message_id || null,
        meta_template_name: sent.meta_template_name || 'ogretmen_yorum_daveti'
      });

      log.push({ lesson_id: lesson.id, phone, ok: sent.ok, error: sent.ok ? undefined : sent.error });
      if (sent.ok) sentOk += 1;
      else sentFail += 1;
    } catch (e) {
      const msg = errorMessage(e);
      log.push({ lesson_id: lesson.id, ok: false, error: msg });
      sentFail += 1;
      await insertWhatsAppAutomationLog({
        studentId: lesson.student_id || null,
        relatedId: lesson.id,
        kind: TEACHER_REVIEW_INVITE_KIND,
        message: null,
        status: 'failed',
        error: msg,
        phone,
        logDate
      });
    }
  }

  await recordCronRun({
    jobKey: 'teacher_review_invites',
    ok: sentFail === 0,
    messagesSent: sentOk,
    messagesFailed: sentFail,
    detail: {
      due: due.length,
      log_date: logDate,
      triggered_by: triggeredBy,
      channel: 'meta_api'
    }
  });

  return {
    ok: true,
    sent: sentOk,
    failed: sentFail,
    due: due.length,
    log,
    triggeredBy
  };
}
