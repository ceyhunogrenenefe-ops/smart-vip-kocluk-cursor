import { supabaseAdmin } from './supabase-admin.js';
import { bbbGetMeetingAttendeeNames, isBbbJoinUrl } from './bbb.js';
import {
  pollBbbPresenceForSession,
  matchStudentsByBbbNames,
  mergeSeenNames,
  resolveBbbMeetingIdFromSession
} from './bbb-attendance.js';
import { sendAbsentNoticeForStudent } from './class-attendance-notify.js';
import { wallTimeToUtcMs, sessionEndUtcMs } from './class-session-end-ms.js';

/** Ders başlangıcından sonra bu süre geçmeden erken devamsızlık işlenmez (varsayılan 10 dk). */
export const BBB_EARLY_ABSENT_GRACE_MS =
  Math.max(1, Number(process.env.BBB_EARLY_ABSENT_GRACE_MINUTES || 10) || 10) * 60_000;

async function absentWaAlreadySent(sessionId, studentId) {
  const { data } = await supabaseAdmin
    .from('message_logs')
    .select('id')
    .eq('related_id', sessionId)
    .eq('student_id', studentId)
    .in('kind', ['class_absent_notice_1', 'class_absent_notice'])
    .eq('status', 'sent')
    .limit(1);
  return Boolean(data?.length);
}

/**
 * Ders başladıktan 10 dk sonra hâlâ BBB’de görünmeyen öğrenciler: yoklama absent + Meta şablon.
 * Sonradan BBB’ye giren otomatik kayıtlı absent ise present yapılır (marked_by boş).
 */
export async function applyEarlyBbbAbsentCheck(session, classStudentIds, className, nowMs = Date.now()) {
  if (!session?.id) return { ok: false, reason: 'no_session' };
  if (String(session.status || '') !== 'scheduled') {
    return { ok: true, skipped: 'not_scheduled' };
  }
  const link = String(session.meeting_link || '').trim();
  if (!isBbbJoinUrl(link) && !session.bbb_meeting_id) {
    return { ok: true, skipped: 'not_bbb' };
  }

  const startMs = wallTimeToUtcMs(session.lesson_date, session.start_time);
  const endMs = sessionEndUtcMs(session.lesson_date, session.start_time, session.end_time);
  if (startMs == null) return { ok: false, reason: 'no_start' };
  if (nowMs < startMs + BBB_EARLY_ABSENT_GRACE_MS) {
    return { ok: true, skipped: 'before_grace', grace_minutes: BBB_EARLY_ABSENT_GRACE_MS / 60_000 };
  }
  if (endMs != null && nowMs > endMs) {
    return { ok: true, skipped: 'after_class' };
  }

  await pollBbbPresenceForSession(session);
  const { data: freshRow } = await supabaseAdmin
    .from('class_sessions')
    .select('*')
    .eq('id', session.id)
    .maybeSingle();
  const row = freshRow || session;

  let attendeeNames = mergeSeenNames(row.bbb_seen_names, []);
  const meetingId = resolveBbbMeetingIdFromSession(row);
  if (meetingId) {
    attendeeNames = mergeSeenNames(attendeeNames, await bbbGetMeetingAttendeeNames(meetingId));
  }

  const { data: students, error: stErr } = await supabaseAdmin
    .from('students')
    .select('id, name')
    .in('id', classStudentIds);
  if (stErr) throw stErr;

  const statusByStudent = matchStudentsByBbbNames(students || [], attendeeNames);

  const { data: priorRows } = await supabaseAdmin
    .from('class_session_attendance')
    .select('student_id, status, marked_by')
    .eq('session_id', session.id);
  const priorMap = new Map(
    (priorRows || []).map((r) => [
      String(r.student_id),
      { status: String(r.status || ''), marked_by: r.marked_by }
    ])
  );

  const instKey = row.institution_id != null ? String(row.institution_id).trim() : '';
  let marked_present = 0;
  let marked_absent = 0;
  let notified = 0;
  const absent_whatsapp = [];

  for (const sid of classStudentIds) {
    const prior = priorMap.get(sid);
    const isPresentNow = statusByStudent.get(sid) === 'present';

    if (isPresentNow) {
      if (prior?.status === 'absent' && !prior.marked_by) {
        const { error } = await supabaseAdmin.from('class_session_attendance').upsert(
          {
            session_id: session.id,
            student_id: sid,
            status: 'present',
            marked_by: null,
            marked_at: new Date().toISOString()
          },
          { onConflict: 'session_id,student_id' }
        );
        if (!error) marked_present += 1;
      }
      continue;
    }

    if (prior?.status === 'present' || prior?.status === 'late') continue;
    if (prior?.marked_by) continue;

    const { error: upErr } = await supabaseAdmin.from('class_session_attendance').upsert(
      {
        session_id: session.id,
        student_id: sid,
        status: 'absent',
        marked_by: null,
        marked_at: new Date().toISOString()
      },
      { onConflict: 'session_id,student_id' }
    );
    if (upErr) throw upErr;
    marked_absent += 1;

    if (await absentWaAlreadySent(session.id, sid)) continue;

    try {
      const r = await sendAbsentNoticeForStudent({
        session: row,
        className,
        studentId: sid,
        institutionId: instKey
      });
      if (r.ok && !r.skipped) notified += 1;
      absent_whatsapp.push({ student_id: sid, ...r });
    } catch (e) {
      absent_whatsapp.push({
        student_id: sid,
        ok: false,
        note: e instanceof Error ? e.message : 'exception'
      });
    }
  }

  if (attendeeNames.length) {
    await supabaseAdmin
      .from('class_sessions')
      .update({ bbb_seen_names: attendeeNames, updated_at: new Date().toISOString() })
      .eq('id', session.id);
  }

  return {
    ok: true,
    marked_absent,
    marked_present,
    notified,
    attendee_names: attendeeNames.length,
    absent_whatsapp
  };
}
