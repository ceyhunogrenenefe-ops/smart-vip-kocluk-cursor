import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

/**
 * Takvim / günlük çalışma kaydındaki ekran süresini günlük ekran süresi tablosuyla eşler.
 */
export async function syncStudentScreenTimeLog({ studentId, logDate, screenMinutes, institutionId }) {
  const sid = String(studentId || '').trim();
  const log_date = String(logDate || '').trim().slice(0, 10);
  if (!sid || !log_date) return;

  let mins = Number(screenMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return;
  mins = Math.max(0, Math.min(1440, Math.floor(mins)));

  const now = new Date().toISOString();
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('student_screen_time_logs')
    .select('id, created_at')
    .eq('student_id', sid)
    .eq('log_date', log_date)
    .maybeSingle();
  if (exErr) {
    console.warn('[sync-student-screen-time-log] lookup', errorMessage(exErr));
    return;
  }

  const row = {
    id: existing?.id ?? `sst-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    student_id: sid,
    institution_id: institutionId ?? null,
    log_date,
    screen_minutes: mins,
    updated_at: now,
    created_at: existing?.created_at ?? now
  };

  const { error } = await supabaseAdmin
    .from('student_screen_time_logs')
    .upsert(row, { onConflict: 'student_id,log_date' });
  if (error) console.warn('[sync-student-screen-time-log] upsert', errorMessage(error));
}
