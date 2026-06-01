import { supabaseAdmin } from './supabase-admin.js';
import { isBbbJoinUrl } from './bbb.js';
import { pollBbbPresenceForSession, applyAutoAttendanceForClassSession } from './bbb-attendance.js';
import { sessionEndUtcMs, wallTimeToUtcMs } from './class-session-end-ms.js';
import { recordCronRun } from './cron-run-log.js';
import { errorMessage } from './error-msg.js';

/**
 * Planlı grup dersleri: BBB katılımcı takibi + ders bitince otomatik yoklama.
 */
export async function runBbbClassAttendanceJob() {
  const now = Date.now();
  const since = new Date(now - 3 * 24 * 3600_000).toISOString().slice(0, 10);
  const until = new Date(now + 2 * 24 * 3600_000).toISOString().slice(0, 10);

  const { data: sessions, error } = await supabaseAdmin
    .from('class_sessions')
    .select('*')
    .gte('lesson_date', since)
    .lte('lesson_date', until)
    .in('status', ['scheduled', 'completed'])
    .limit(500);
  if (error) throw error;

  const log = { polled: 0, auto_attendance: 0, errors: [] };

  for (const session of sessions || []) {
    const link = String(session.meeting_link || '').trim();
    if (!isBbbJoinUrl(link) && !session.bbb_meeting_id) continue;

    try {
      if (String(session.status) === 'scheduled') {
        const endMs = sessionEndUtcMs(session.lesson_date, session.start_time, session.end_time);
        const startMs = wallTimeToUtcMs(session.lesson_date, session.start_time);
        const windowStart = startMs != null ? startMs - 15 * 60_000 : null;
        const windowEnd = endMs != null ? endMs + 45 * 60_000 : null;
        if (windowStart != null && windowEnd != null && now >= windowStart && now <= windowEnd) {
          await pollBbbPresenceForSession(session);
          log.polled += 1;
        }
      }

      if (String(session.status) === 'completed' && !session.attendance_auto_at) {
        const endMs = sessionEndUtcMs(session.lesson_date, session.start_time, session.end_time);
        if (endMs != null && endMs > now) continue;

        const { data: classStudents } = await supabaseAdmin
          .from('class_students')
          .select('student_id')
          .eq('class_id', session.class_id);
        const studentIds = (classStudents || []).map((r) => String(r.student_id)).filter(Boolean);
        if (!studentIds.length) continue;

        const { data: cls } = await supabaseAdmin
          .from('classes')
          .select('name')
          .eq('id', session.class_id)
          .maybeSingle();

        const fresh = await supabaseAdmin
          .from('class_sessions')
          .select('*')
          .eq('id', session.id)
          .maybeSingle();
        const row = fresh.data || session;

        const result = await applyAutoAttendanceForClassSession(
          row,
          studentIds,
          cls?.name || 'Sınıf'
        );
        if (result.ok && !result.skipped) log.auto_attendance += 1;
      }
    } catch (e) {
      log.errors.push({ session_id: session.id, error: errorMessage(e) });
    }
  }

  return log;
}
