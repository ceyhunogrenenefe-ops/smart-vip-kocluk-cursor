import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';

function normalizeIds(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
}

function studentUserId(st) {
  return String(st?.platform_user_id || st?.user_id || '').trim();
}

async function insertUserNotification({
  targetUserId,
  title,
  body,
  linkUrl,
  institutionId,
  priority = 'normal'
}) {
  const uid = String(targetUserId || '').trim();
  if (!uid) return false;
  const { error } = await supabaseAdmin.from('platform_notifications').insert({
    sender_user_id: null,
    sender_role: 'system',
    sender_name: 'Sistem',
    institution_id: institutionId || null,
    title,
    body,
    target_type: 'user',
    target_user_id: uid,
    priority,
    link_url: linkUrl || '/edu-derslerim'
  });
  if (error) {
    /* schema bazı ortamlarda sender_user_id zorunlu olabilir */
    const { error: e2 } = await supabaseAdmin.from('platform_notifications').insert({
      sender_user_id: uid,
      sender_role: 'system',
      sender_name: 'Sistem',
      institution_id: institutionId || null,
      title,
      body,
      target_type: 'user',
      target_user_id: uid,
      priority,
      link_url: linkUrl || '/edu-derslerim'
    });
    if (e2) throw e2;
  }
  return true;
}

async function loadAssigneesForHomework(hw, lessonRow) {
  const mode = hw.assignee_mode === 'students' ? 'students' : 'class';
  if (mode === 'students') {
    const ids = normalizeIds(hw.assignee_student_ids);
    if (!ids.length) return [];
    const { data } = await supabaseAdmin
      .from('students')
      .select('id, name, user_id, platform_user_id')
      .in('id', ids);
    return data || [];
  }
  const classIds = [String(lessonRow.class_id || '').trim()].filter(Boolean);
  try {
    const { data: links } = await supabaseAdmin
      .from('edu_lesson_row_classes')
      .select('class_id')
      .eq('lesson_row_id', lessonRow.id);
    for (const l of links || []) {
      const cid = String(l.class_id || '').trim();
      if (cid) classIds.push(cid);
    }
  } catch {
    /* junction yoksa sadece class_id */
  }
  const uniqueClassIds = [...new Set(classIds)];
  if (!uniqueClassIds.length) return [];
  const { data: cs } = await supabaseAdmin
    .from('class_students')
    .select('student_id')
    .in('class_id', uniqueClassIds);
  const sids = [...new Set((cs || []).map((x) => String(x.student_id)).filter(Boolean))];
  if (!sids.length) return [];
  const { data: students } = await supabaseAdmin
    .from('students')
    .select('id, name, user_id, platform_user_id')
    .in('id', sids);
  return students || [];
}

function homeworkLabel(hw) {
  const book = String(hw.book_name || '').trim();
  const pages = String(hw.question_range || '').trim();
  if (book && pages) return `${book} — s. ${pages}`;
  return String(hw.title || 'Ödev').trim() || 'Ödev';
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const today = getIstanbulDateString();
  const tomorrowMs = Date.now() + 24 * 3600 * 1000;
  const tomorrow = new Date(tomorrowMs).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  let remind24 = 0;
  let remindDue = 0;
  let overdueTeacher = 0;

  try {
    const { data: homeworks, error } = await supabaseAdmin
      .from('edu_homework')
      .select('*')
      .eq('status', 'published')
      .not('due_date', 'is', null)
      .limit(300);
    if (error) throw error;

    for (const raw of homeworks || []) {
      const due = String(raw.due_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;

      const { data: lessonRow } = await supabaseAdmin
        .from('edu_lesson_rows')
        .select('id, teacher_user_id, class_id, institution_id, title')
        .eq('id', raw.lesson_row_id)
        .maybeSingle();
      if (!lessonRow) continue;

      const assignees = await loadAssigneesForHomework(raw, lessonRow);
      const { data: subs } = await supabaseAdmin
        .from('edu_homework_submissions')
        .select('student_id, student_user_id')
        .eq('homework_id', raw.id);
      const submittedStudentIds = new Set(
        (subs || []).map((s) => String(s.student_id || '').trim()).filter(Boolean)
      );
      const submittedUserIds = new Set(
        (subs || []).map((s) => String(s.student_user_id || '').trim()).filter(Boolean)
      );
      const missing = assignees.filter((st) => {
        const uid = studentUserId(st);
        return !(submittedStudentIds.has(String(st.id)) || (uid && submittedUserIds.has(uid)));
      });
      if (!missing.length) continue;

      const label = homeworkLabel(raw);
      const link = '/edu-derslerim';

      if (due === tomorrow && !raw.remind_24h_sent_at) {
        for (const st of missing) {
          const uid = studentUserId(st);
          if (!uid) continue;
          await insertUserNotification({
            targetUserId: uid,
            title: 'Ödev hatırlatması',
            body: `"${label}" ödevinin teslimine 24 saat kaldı.`,
            linkUrl: link,
            institutionId: lessonRow.institution_id
          });
          remind24 += 1;
        }
        await supabaseAdmin
          .from('edu_homework')
          .update({ remind_24h_sent_at: new Date().toISOString() })
          .eq('id', raw.id);
      }

      if (due === today && !raw.remind_due_sent_at) {
        for (const st of missing) {
          const uid = studentUserId(st);
          if (!uid) continue;
          await insertUserNotification({
            targetUserId: uid,
            title: 'Ödev teslim günü',
            body: `"${label}" ödevinin teslim günü bugün. Hemen teslim edebilirsin.`,
            linkUrl: link,
            institutionId: lessonRow.institution_id,
            priority: 'high'
          });
          remindDue += 1;
        }
        await supabaseAdmin
          .from('edu_homework')
          .update({ remind_due_sent_at: new Date().toISOString() })
          .eq('id', raw.id);
      }

      const dueEnd = new Date(`${due}T23:59:59.999+03:00`).getTime();
      if (Date.now() > dueEnd && !raw.overdue_teacher_notified_at && missing.length) {
        const teacherId = String(lessonRow.teacher_user_id || '').trim();
        if (teacherId) {
          const names = missing
            .slice(0, 8)
            .map((s) => s.name || 'Öğrenci')
            .join(', ');
          const more = missing.length > 8 ? ` +${missing.length - 8}` : '';
          await insertUserNotification({
            targetUserId: teacherId,
            title: 'Teslim edilmeyen öğrenciler',
            body: `"${label}" için süre doldu. Teslim etmeyenler (${missing.length}): ${names}${more}`,
            linkUrl: '/edu-panel',
            institutionId: lessonRow.institution_id,
            priority: 'high'
          });
          overdueTeacher += 1;
        }
        await supabaseAdmin
          .from('edu_homework')
          .update({ overdue_teacher_notified_at: new Date().toISOString() })
          .eq('id', raw.id);
      }
    }

    await recordCronRun({
      jobKey: 'edu_homework_reminders',
      ok: true,
      meta: { remind24, remindDue, overdueTeacher, today, tomorrow }
    });
    return res.status(200).json({ ok: true, remind24, remindDue, overdueTeacher });
  } catch (e) {
    await recordCronRun({
      jobKey: 'edu_homework_reminders',
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    });
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
