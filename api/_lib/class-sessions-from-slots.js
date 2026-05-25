import { supabaseAdmin } from './supabase-admin.js';
import { isoWeekdayMon1Istanbul } from './istanbul-time.js';
import { normalizeTimeHms } from './class-lesson-reminder-logic.js';

function sessionKey(classId, teacherId, startTime) {
  return `${String(classId || '')}|${String(teacherId || '')}|${normalizeTimeHms(startTime)}`;
}

/**
 * Haftalık şablondan (class_weekly_slots) o gün için eksik class_sessions satırlarını oluşturur.
 * Cron hatırlatması yalnızca class_sessions üzerinden çalışır; şablon tek başına yetmez.
 */
export async function ensureClassSessionsFromWeeklySlots(lessonDate) {
  const date = String(lessonDate || '').trim().slice(0, 10);
  const dow = isoWeekdayMon1Istanbul(date);
  if (!dow) return { created: 0, slots: 0, already_exists: 0 };

  const { data: slots, error: slotErr } = await supabaseAdmin
    .from('class_weekly_slots')
    .select('class_id,institution_id,day_of_week,start_time,end_time,subject,teacher_id,meeting_link,homework')
    .eq('day_of_week', dow);
  if (slotErr) throw slotErr;
  const slotList = slots || [];
  if (!slotList.length) return { created: 0, slots: 0, already_exists: 0 };

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('class_sessions')
    .select('class_id,teacher_id,start_time,status')
    .eq('lesson_date', date)
    .neq('status', 'cancelled');
  if (exErr) throw exErr;

  const existingKeys = new Set(
    (existing || []).map((s) => sessionKey(s.class_id, s.teacher_id, s.start_time))
  );

  const classIdsNeedingInst = [
    ...new Set(
      slotList.filter((s) => !s.institution_id).map((s) => String(s.class_id || '')).filter(Boolean)
    )
  ];
  const instByClass = new Map();
  if (classIdsNeedingInst.length) {
    const { data: classes } = await supabaseAdmin
      .from('classes')
      .select('id,institution_id')
      .in('id', classIdsNeedingInst);
    for (const c of classes || []) {
      instByClass.set(String(c.id), c.institution_id ?? null);
    }
  }

  const toInsert = [];
  for (const slot of slotList) {
    const k = sessionKey(slot.class_id, slot.teacher_id, slot.start_time);
    if (existingKeys.has(k)) continue;
    const start = normalizeTimeHms(slot.start_time, '09:00:00');
    const end = normalizeTimeHms(slot.end_time, start);
    toInsert.push({
      class_id: slot.class_id,
      institution_id: slot.institution_id ?? instByClass.get(String(slot.class_id)) ?? null,
      lesson_date: date,
      start_time: start,
      end_time: end,
      subject: String(slot.subject || '').trim() || 'Ders',
      teacher_id: slot.teacher_id,
      meeting_link: String(slot.meeting_link || '').trim(),
      homework: slot.homework ?? null,
      status: 'scheduled',
      reminder_sent: false,
      homework_sent: false
    });
    existingKeys.add(k);
  }

  if (!toInsert.length) {
    return { created: 0, slots: slotList.length, already_exists: slotList.length };
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from('class_sessions')
    .insert(toInsert)
    .select('id');
  if (insErr) throw insErr;

  return {
    created: (created || []).length,
    slots: slotList.length,
    already_exists: slotList.length - (created || []).length
  };
}
