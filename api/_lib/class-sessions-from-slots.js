import { supabaseAdmin } from './supabase-admin.js';
import { isoWeekdayMon1Istanbul, addCalendarDaysYmd } from './istanbul-time.js';
import { normalizeTimeHms } from './class-lesson-reminder-logic.js';
import { randomUUID } from 'crypto';
import { BBB_AUTO_MEETING_LINK, isBbbConfigured } from './bbb.js';
import { insertManyOptionalModerator } from './supabase-optional-moderator.js';

function effectiveMeetingLink(raw) {
  const link = String(raw || '').trim();
  if (link) return link;
  if (isBbbConfigured()) return BBB_AUTO_MEETING_LINK;
  return '';
}

function sessionRowFromSlot(slot, lessonDate, institutionId, scheduleBatchId) {
  const start = normalizeTimeHms(slot.start_time, '09:00:00');
  const end = normalizeTimeHms(slot.end_time, start);
  const meetingLink = effectiveMeetingLink(slot.meeting_link);
  return {
    class_id: slot.class_id,
    institution_id: slot.institution_id ?? institutionId ?? null,
    lesson_date: lessonDate,
    start_time: start,
    end_time: end,
    subject: String(slot.subject || '').trim() || 'Ders',
    teacher_id: slot.teacher_id,
    meeting_link: meetingLink,
    ...(String(slot.meeting_link_moderator || '').trim()
      ? { meeting_link_moderator: String(slot.meeting_link_moderator).trim() }
      : {}),
    ...(slot.bbb_meeting_id ? { bbb_meeting_id: slot.bbb_meeting_id } : {}),
    ...(slot.bbb_attendee_pw ? { bbb_attendee_pw: slot.bbb_attendee_pw } : {}),
    homework: slot.homework ?? null,
    status: 'scheduled',
    reminder_sent: false,
    homework_sent: false,
    ...(scheduleBatchId ? { schedule_batch_id: scheduleBatchId } : {})
  };
}

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
    .select('*')
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
    const row = sessionRowFromSlot(slot, date, instByClass.get(String(slot.class_id)) ?? null, null);
    if (!row.meeting_link) continue;
    toInsert.push(row);
    existingKeys.add(k);
  }

  if (!toInsert.length) {
    return { created: 0, slots: slotList.length, already_exists: slotList.length };
  }

  const { data: created, error: insErr } = await insertManyOptionalModerator('class_sessions', toInsert);
  if (insErr) throw insErr;

  return {
    created: (created || []).length,
    slots: slotList.length,
    already_exists: slotList.length - (created || []).length
  };
}

/**
 * Belirli bir sınıf için haftalık şablondan tarih aralığında class_sessions oluşturur.
 */
export async function ensureClassSessionsForClassInRange(classId, dateFrom, dateTo, opts = {}) {
  const cid = String(classId || '').trim();
  const from = String(dateFrom || '').trim().slice(0, 10);
  const to = String(dateTo || '').trim().slice(0, 10);
  if (!cid || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { created: 0, already_exists: 0, days_scanned: 0, skipped: [{ reason: 'date_range_invalid' }] };
  }
  if (from > to) {
    return { created: 0, already_exists: 0, days_scanned: 0, skipped: [{ reason: 'date_range_invalid' }] };
  }

  const { data: allSlots, error: slotErr } = await supabaseAdmin
    .from('class_weekly_slots')
    .select('*')
    .eq('class_id', cid);
  if (slotErr) throw slotErr;
  const slotList = allSlots || [];
  if (!slotList.length) {
    return { created: 0, already_exists: 0, days_scanned: 0, skipped: [{ reason: 'no_weekly_slots' }] };
  }

  const slotsByDow = new Map();
  for (const slot of slotList) {
    const dow = Number(slot.day_of_week);
    if (!Number.isFinite(dow)) continue;
    const arr = slotsByDow.get(dow) || [];
    arr.push(slot);
    slotsByDow.set(dow, arr);
  }

  let institutionId = slotList.find((s) => s.institution_id)?.institution_id ?? null;
  if (!institutionId) {
    const { data: cls } = await supabaseAdmin.from('classes').select('institution_id').eq('id', cid).maybeSingle();
    institutionId = cls?.institution_id ?? null;
  }

  const scheduleBatchId = opts.scheduleBatchId ? String(opts.scheduleBatchId) : randomUUID();
  let created = 0;
  let alreadyExists = 0;
  let daysScanned = 0;
  const skipped = [];

  let cur = from;
  while (cur <= to) {
    daysScanned += 1;
    const dow = isoWeekdayMon1Istanbul(cur);
    const daySlots = dow ? slotsByDow.get(dow) || [] : [];
    if (!daySlots.length) {
      cur = addCalendarDaysYmd(cur, 1);
      continue;
    }

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('class_sessions')
      .select('class_id,teacher_id,start_time,status')
      .eq('class_id', cid)
      .eq('lesson_date', cur)
      .neq('status', 'cancelled');
    if (exErr) throw exErr;

    const existingKeys = new Set(
      (existing || []).map((s) => sessionKey(s.class_id, s.teacher_id, s.start_time))
    );

    const toInsert = [];
    for (const slot of daySlots) {
      const k = sessionKey(slot.class_id, slot.teacher_id, slot.start_time);
      if (existingKeys.has(k)) {
        alreadyExists += 1;
        continue;
      }
      const row = sessionRowFromSlot(slot, cur, slot.institution_id ?? institutionId ?? null, scheduleBatchId);
      if (!row.meeting_link) {
        skipped.push({
          reason: 'bbb_failed',
          lesson_date: cur,
          subject: row.subject,
          detail: 'Toplantı bağlantısı yok (BBB API tanımlı değil)'
        });
        continue;
      }
      toInsert.push(row);
      existingKeys.add(k);
    }

    if (toInsert.length) {
      const { data: inserted, error: insErr } = await insertManyOptionalModerator('class_sessions', toInsert);
      if (insErr) {
        skipped.push({ reason: 'session_insert_failed', lesson_date: cur, detail: insErr.message });
      } else {
        created += (inserted || []).length;
      }
    }

    cur = addCalendarDaysYmd(cur, 1);
  }

  return { created, already_exists: alreadyExists, days_scanned: daysScanned, skipped, schedule_batch_id: scheduleBatchId };
}

/** Aktarım sonrası: linki boş planlı oturumlara bbb:auto yazar (Canlı Grup Dersi «Katıl» ile aynı). */
export async function backfillClassSessionMeetingLinksInRange(classId, dateFrom, dateTo) {
  if (!isBbbConfigured()) return { updated: 0 };
  const cid = String(classId || '').trim();
  const from = String(dateFrom || '').trim().slice(0, 10);
  const to = String(dateTo || '').trim().slice(0, 10);
  if (!cid || !from || !to) return { updated: 0 };

  const { data, error } = await supabaseAdmin
    .from('class_sessions')
    .select('id,meeting_link')
    .eq('class_id', cid)
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .eq('status', 'scheduled');
  if (error) return { updated: 0, error: error.message };

  const toFix = (data || []).filter((s) => !String(s.meeting_link || '').trim());
  if (!toFix.length) return { updated: 0 };

  let updated = 0;
  for (const s of toFix) {
    const { error: uErr } = await supabaseAdmin
      .from('class_sessions')
      .update({ meeting_link: BBB_AUTO_MEETING_LINK })
      .eq('id', s.id);
    if (!uErr) updated += 1;
  }
  return { updated };
}

/** Oturumlarda eksik kurum kimliğini sınıftan tamamlar (liste filtresi için). */
export async function backfillClassSessionInstitutionId(classId, institutionId) {
  const cid = String(classId || '').trim();
  const instId = String(institutionId || '').trim();
  if (!cid || !instId || !/^[0-9a-f-]{36}$/i.test(instId)) return { updated: 0 };

  const { data, error } = await supabaseAdmin
    .from('class_sessions')
    .select('id,institution_id')
    .eq('class_id', cid)
    .is('institution_id', null);
  if (error) return { updated: 0, error: error.message };
  if (!(data || []).length) return { updated: 0 };

  const { error: uErr } = await supabaseAdmin
    .from('class_sessions')
    .update({ institution_id: instId })
    .eq('class_id', cid)
    .is('institution_id', null);
  if (uErr) return { updated: 0, error: uErr.message };
  return { updated: (data || []).length };
}

/** Haftalık şablonda eksik toplantı linklerini tamamlar. */
export async function backfillClassWeeklySlotMeetingLinks(classId) {
  if (!isBbbConfigured()) return { updated: 0 };
  const cid = String(classId || '').trim();
  if (!cid) return { updated: 0 };

  const { data, error } = await supabaseAdmin
    .from('class_weekly_slots')
    .select('id,meeting_link')
    .eq('class_id', cid);
  if (error) return { updated: 0, error: error.message };

  const toFix = (data || []).filter((s) => !String(s.meeting_link || '').trim());
  if (!toFix.length) return { updated: 0 };

  let updated = 0;
  for (const s of toFix) {
    const { error: uErr } = await supabaseAdmin
      .from('class_weekly_slots')
      .update({ meeting_link: BBB_AUTO_MEETING_LINK })
      .eq('id', s.id);
    if (!uErr) updated += 1;
  }
  return { updated };
}
