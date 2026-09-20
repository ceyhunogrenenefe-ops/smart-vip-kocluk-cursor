/**
 * CRM temsilci vardiyaları — "şu an kim görevde?".
 * Haftalık tekrar eden vardiya: gün (1 = Pazartesi) + başlangıç / bitiş saati (İstanbul).
 * end <= start ise vardiya ertesi güne taşar (ör. 22:00–02:00).
 */
import { supabaseAdmin } from './supabase-admin.js';

export const DAY_LABELS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** İstanbul saatiyle gün (1-7) ve gün içi dakika */
export function istanbulDayMinute(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(now));
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  const dayIndex = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[get('weekday')] || 1;
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return { day: dayIndex, minute: hour * 60 + minute };
}

export function timeToMinutes(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 24 || min > 59) return null;
  return h * 60 + min;
}

function prevDay(day) {
  return day === 1 ? 7 : day - 1;
}

/** Saf: vardiya verilen gün/dakikada aktif mi? (gece yarısını geçen vardiya önceki günden sayılır) */
export function shiftCoversMoment(shift, day, minute) {
  if (!shift || shift.is_active === false) return false;
  const start = timeToMinutes(shift.start_time);
  const endRaw = timeToMinutes(shift.end_time);
  if (start == null || endRaw == null) return false;
  const shiftDay = Number(shift.day_of_week);
  // 24:00 = gün sonu
  const end = endRaw === 0 ? 1440 : endRaw;
  if (end > start) {
    return shiftDay === day && minute >= start && minute < end;
  }
  // Gece yarısını geçiyor: başladığı gün start→24:00, ertesi gün 00:00→end
  if (shiftDay === day && minute >= start) return true;
  if (shiftDay === prevDay(day) && minute < end) return true;
  return false;
}

/** Saf: o an görevde olan kullanıcı kimlikleri */
export function onDutyUserIdsAt(shifts, now = Date.now()) {
  const { day, minute } = istanbulDayMinute(now);
  const ids = new Set();
  for (const s of shifts || []) {
    if (shiftCoversMoment(s, day, minute)) ids.add(String(s.user_id));
  }
  return [...ids];
}

export async function listShifts(institutionId) {
  const { data, error } = await supabaseAdmin
    .from('crm_agent_shifts')
    .select('id, user_id, day_of_week, start_time, end_time, is_active, note')
    .eq('institution_id', String(institutionId))
    .order('day_of_week')
    .order('start_time');
  if (error) {
    if (/crm_agent_shifts|does not exist/i.test(error.message || '')) return [];
    throw new Error(error.message);
  }
  return data || [];
}

/** O an görevde olan temsilciler; vardiya hiç tanımlı değilse null (kural uygulanmaz) */
export async function getOnDutyUserIds(institutionId, now = Date.now()) {
  const shifts = await listShifts(institutionId);
  if (!shifts.length) return null;
  return onDutyUserIdsAt(shifts, now);
}

export async function saveShift({ institutionId, id, userId, dayOfWeek, startTime, endTime, isActive = true, note = null, actorId = null }) {
  const day = Number(dayOfWeek);
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (!Number.isInteger(day) || day < 1 || day > 7) return { error: 'Gün seçin (Pazartesi–Pazar).' };
  if (start == null || end == null) return { error: 'Saat SS:DD biçiminde olmalı.' };
  if (start === end) return { error: 'Başlangıç ve bitiş saati aynı olamaz.' };
  const row = {
    institution_id: String(institutionId),
    user_id: String(userId || '').trim(),
    day_of_week: day,
    start_time: String(startTime).slice(0, 5),
    end_time: String(endTime).slice(0, 5),
    is_active: Boolean(isActive),
    note: note ? String(note).slice(0, 200) : null,
    updated_at: new Date().toISOString(),
    updated_by: actorId ? String(actorId) : null
  };
  if (!row.user_id) return { error: 'Temsilci seçin.' };
  if (id) {
    const { data, error } = await supabaseAdmin.from('crm_agent_shifts').update(row).eq('id', String(id)).select('*').maybeSingle();
    if (error) throw new Error(error.message);
    return { data };
  }
  const { data, error } = await supabaseAdmin.from('crm_agent_shifts').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return { data };
}

export async function deleteShift(institutionId, id) {
  const { error } = await supabaseAdmin
    .from('crm_agent_shifts')
    .delete()
    .eq('institution_id', String(institutionId))
    .eq('id', String(id));
  if (error) throw new Error(error.message);
}

/**
 * Saf: bir uyarı kime gitmeli?
 * Sorumlu temsilci görevdeyse ona; değilse o an görevde olanlara; kimse yoksa (kırmızıda) yöneticiye.
 * onDuty null → vardiya tanımlı değil, eski davranış (yalnız sorumlu temsilci).
 */
export function alertRecipients({ assignedUserId, onDuty, adminUserId = null, includeAdmin = false }) {
  const assigned = assignedUserId ? String(assignedUserId) : '';
  const out = [];
  if (onDuty == null) {
    if (assigned) out.push(assigned);
  } else if (assigned && onDuty.includes(assigned)) {
    out.push(assigned);
  } else {
    out.push(...onDuty);
  }
  if (includeAdmin && adminUserId) out.push(String(adminUserId));
  return [...new Set(out.filter(Boolean))];
}
