/**
 * Öğretmen özel ders müsaitlik hesaplama (Europe/Istanbul).
 * Ham satırları olduğu gibi göstermez; istisna + booking ile birleştirir.
 */
import { supabaseAdmin } from './supabase-admin.js';

export const AVAILABILITY_TZ = 'Europe/Istanbul';

/** JS: 0=Pazar ... 6=Cumartesi */
export function dayLabelTr(dow) {
  return ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][dow] || String(dow);
}

function parseHm(t) {
  const s = String(t || '').slice(0, 5);
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatHm(mins) {
  const total = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  if (mins >= 24 * 60) return '00:00';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hmToMinutes(t) {
  return parseHm(t);
}

export function minutesToHm(mins) {
  if (mins >= 24 * 60) return '00:00';
  return formatHm(mins);
}

/** end 00:00 → gün sonu 24:00 (1440) */
export function endMinutes(endTime) {
  const s = String(endTime || '').slice(0, 5);
  if (s === '00:00') return 24 * 60;
  return parseHm(s);
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function assertNoOverlap(existing, startTime, endTime, excludeId = null) {
  const s = parseHm(startTime);
  const e = endMinutes(endTime);
  if (s == null || e == null) throw new Error('invalid_time');
  if (!(s < e)) throw new Error('start_before_end_required');
  for (const row of existing || []) {
    if (excludeId && String(row.id) === String(excludeId)) continue;
    if (row.is_active === false) continue;
    const rs = parseHm(row.start_time);
    const re = endMinutes(row.end_time);
    if (rs == null || re == null) continue;
    if (rangesOverlap(s, e, rs, re)) throw new Error('overlapping_availability');
  }
}

function istanbulParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: AVAILABILITY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short'
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10),
    dow: wdMap[parts.weekday] ?? date.getDay()
  };
}

function istanbulDateAt(ymd, hm) {
  // Approximate: construct as UTC+3 wall for Istanbul (no DST as of 2016+)
  const [y, mo, d] = ymd.split('-').map(Number);
  const [hh, mm] = String(hm).slice(0, 5).split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, hh - 3, mm, 0));
}

export async function loadAvailabilityBundle(teacherId, { fromDate } = {}) {
  const todayYmd = istanbulParts().ymd;
  const exceptionFrom = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(String(fromDate))
    ? String(fromDate).slice(0, 10)
    : todayYmd;

  const [{ data: rules }, { data: exceptions }, { data: bookings }] = await Promise.all([
    supabaseAdmin
      .from('teacher_availability')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('is_active', true)
      .order('day_of_week')
      .order('start_time'),
    supabaseAdmin
      .from('teacher_availability_exceptions')
      .select('*')
      .eq('teacher_id', teacherId)
      .gte('exception_date', exceptionFrom)
      .order('exception_date'),
    supabaseAdmin
      .from('teacher_private_bookings')
      .select('id, starts_at, ends_at, status')
      .eq('teacher_id', teacherId)
      .in('status', ['held', 'confirmed'])
      .gte('starts_at', new Date().toISOString())
  ]);
  return {
    rules: rules || [],
    exceptions: exceptions || [],
    bookings: bookings || []
  };
}

/**
 * Önümüzdeki N gün için slot listesi.
 * status: free | busy | closed | past
 */
export function computePublicSlots({ rules, exceptions, bookings, days = 14, slotDurationMin = 60 }) {
  const now = new Date();
  const nowP = istanbulParts(now);
  const out = [];

  for (let i = 0; i < days; i++) {
    const base = new Date(now.getTime() + i * 86400000);
    const p = istanbulParts(base);
    const ymd = p.ymd;
    const dow = p.dow;

    const dayClosed = (exceptions || []).some(
      (ex) =>
        String(ex.exception_date).slice(0, 10) === ymd &&
        ex.exception_type === 'unavailable' &&
        !ex.start_time &&
        !ex.end_time
    );

    const dayRules = (rules || []).filter((r) => Number(r.day_of_week) === dow);
    const extraAvailable = (exceptions || []).filter(
      (ex) => String(ex.exception_date).slice(0, 10) === ymd && ex.exception_type === 'available'
    );
    const partialClosed = (exceptions || []).filter(
      (ex) =>
        String(ex.exception_date).slice(0, 10) === ymd &&
        ex.exception_type === 'unavailable' &&
        ex.start_time &&
        ex.end_time
    );

    const windows = [];
    if (!dayClosed) {
      for (const r of dayRules) {
        windows.push({
          start: parseHm(r.start_time),
          end: endMinutes(r.end_time),
          dur: Number(r.slot_duration_min) || slotDurationMin
        });
      }
      for (const ex of extraAvailable) {
        windows.push({
          start: parseHm(ex.start_time),
          end: endMinutes(ex.end_time),
          dur: slotDurationMin
        });
      }
    }

    for (const w of windows) {
      if (w.start == null || w.end == null || !(w.start < w.end)) continue;
      for (let t = w.start; t + w.dur <= w.end; t += w.dur) {
        const startHm = formatHm(t);
        const endHm = formatHm(t + w.dur);
        const startsAt = istanbulDateAt(ymd, startHm);
        const endsAt = istanbulDateAt(ymd, endHm);

        let status = 'free';
        if (startsAt.getTime() <= now.getTime()) status = 'past';

        for (const pc of partialClosed) {
          const cs = parseHm(pc.start_time);
          const ce = endMinutes(pc.end_time);
          if (cs != null && ce != null && rangesOverlap(t, t + w.dur, cs, ce)) {
            status = 'closed';
            break;
          }
        }

        if (status === 'free') {
          for (const b of bookings || []) {
            const bs = new Date(b.starts_at).getTime();
            const be = new Date(b.ends_at).getTime();
            if (startsAt.getTime() < be && bs < endsAt.getTime()) {
              status = 'busy';
              break;
            }
          }
        }

        out.push({
          date: ymd,
          day_of_week: dow,
          day_label: dayLabelTr(dow),
          start_time: startHm,
          end_time: endHm,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status
        });
      }
    }

    if (dayClosed) {
      out.push({
        date: ymd,
        day_of_week: dow,
        day_label: dayLabelTr(dow),
        start_time: null,
        end_time: null,
        starts_at: null,
        ends_at: null,
        status: 'closed'
      });
    }
  }

  // Suppress unused nowP lint
  void nowP;
  return out;
}

/**
 * Tek bir saat diliminin bu tarihte müsait olup olmadığı.
 * @returns {'free'|'busy'|'closed'|'empty'|'past'}
 */
export function resolveHourSlotStatus({ rules, exceptions, bookings, date, startTime, endTime, now = new Date() }) {
  const ymd = String(date).slice(0, 10);
  const start = parseHm(startTime);
  const end = endMinutes(endTime);
  if (start == null || end == null || !(start < end)) return 'empty';

  const startsAt = istanbulDateAt(ymd, minutesToHm(start));
  const endsAt =
    end >= 24 * 60
      ? new Date(istanbulDateAt(ymd, '00:00').getTime() + 24 * 3600 * 1000)
      : istanbulDateAt(ymd, minutesToHm(end));

  if (startsAt.getTime() <= now.getTime()) return 'past';

  const dayClosed = (exceptions || []).some(
    (ex) =>
      String(ex.exception_date).slice(0, 10) === ymd &&
      ex.exception_type === 'unavailable' &&
      !ex.start_time &&
      !ex.end_time
  );
  if (dayClosed) return 'closed';

  const partialClosed = (exceptions || []).some((ex) => {
    if (String(ex.exception_date).slice(0, 10) !== ymd) return false;
    if (ex.exception_type !== 'unavailable' || !ex.start_time || !ex.end_time) return false;
    const cs = parseHm(ex.start_time);
    const ce = endMinutes(ex.end_time);
    return cs != null && ce != null && rangesOverlap(start, end, cs, ce);
  });
  if (partialClosed) return 'closed';

  const dowLocal = istanbulParts(istanbulDateAt(ymd, '12:00')).dow;

  const coveredByWeekly = (rules || []).some((r) => {
    if (Number(r.day_of_week) !== dowLocal) return false;
    const rs = parseHm(r.start_time);
    const re = endMinutes(r.end_time);
    return rs != null && re != null && rs <= start && end <= re;
  });

  const coveredByExtra = (exceptions || []).some((ex) => {
    if (String(ex.exception_date).slice(0, 10) !== ymd) return false;
    if (ex.exception_type !== 'available') return false;
    const rs = parseHm(ex.start_time);
    const re = endMinutes(ex.end_time);
    return rs != null && re != null && rs <= start && end <= re;
  });

  if (!coveredByWeekly && !coveredByExtra) return 'empty';

  for (const b of bookings || []) {
    const bs = new Date(b.starts_at).getTime();
    const be = new Date(b.ends_at).getTime();
    if (startsAt.getTime() < be && bs < endsAt.getTime()) return 'busy';
  }

  return 'free';
}

/**
 * Haftalık şablona bir saat ekle (bitişik aralıkları birleştirir).
 * @returns {Promise<{rules: any[]}>}
 */
export async function addWeeklyHour({ teacherId, profileId, dayOfWeek, startTime, endTime, durationMin = 60 }) {
  const start = parseHm(startTime);
  const end = endMinutes(endTime);
  if (start == null || end == null || !(start < end)) throw new Error('invalid_time');

  const { data: existing, error: loadErr } = await supabaseAdmin
    .from('teacher_availability')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .order('start_time');
  if (loadErr) throw loadErr;

  const already = (existing || []).some((r) => {
    const rs = parseHm(r.start_time);
    const re = endMinutes(r.end_time);
    return rs != null && re != null && rs <= start && end <= re;
  });
  if (already) return { rules: existing || [] };

  // Merge overlapping / adjacent
  let mergeStart = start;
  let mergeEnd = end;
  const toDeactivate = [];
  for (const r of existing || []) {
    const rs = parseHm(r.start_time);
    const re = endMinutes(r.end_time);
    if (rs == null || re == null) continue;
    if (rs <= mergeEnd && mergeStart <= re) {
      mergeStart = Math.min(mergeStart, rs);
      mergeEnd = Math.max(mergeEnd, re);
      toDeactivate.push(r.id);
    }
  }

  if (toDeactivate.length) {
    const { error } = await supabaseAdmin
      .from('teacher_availability')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', toDeactivate)
      .eq('teacher_id', teacherId);
    if (error) throw error;
  }

  const { error: insErr } = await supabaseAdmin.from('teacher_availability').insert({
    teacher_id: teacherId,
    profile_id: profileId,
    day_of_week: dayOfWeek,
    start_time: minutesToHm(mergeStart),
    end_time: minutesToHm(mergeEnd),
    slot_duration_min: durationMin,
    is_active: true,
    timezone: AVAILABILITY_TZ,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (insErr) throw insErr;
  return { ok: true };
}

/**
 * Haftalık şablondan bir saati çıkar (aralığı böler).
 */
export async function removeWeeklyHour({ teacherId, dayOfWeek, startTime, endTime }) {
  const start = parseHm(startTime);
  const end = endMinutes(endTime);
  if (start == null || end == null || !(start < end)) throw new Error('invalid_time');

  const { data: existing, error: loadErr } = await supabaseAdmin
    .from('teacher_availability')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true);
  if (loadErr) throw loadErr;

  for (const r of existing || []) {
    const rs = parseHm(r.start_time);
    const re = endMinutes(r.end_time);
    if (rs == null || re == null) continue;
    if (!rangesOverlap(start, end, rs, re)) continue;

    await supabaseAdmin
      .from('teacher_availability')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', r.id)
      .eq('teacher_id', teacherId);

    // left remnant
    if (rs < start) {
      await supabaseAdmin.from('teacher_availability').insert({
        teacher_id: teacherId,
        profile_id: r.profile_id,
        day_of_week: dayOfWeek,
        start_time: minutesToHm(rs),
        end_time: minutesToHm(start),
        slot_duration_min: r.slot_duration_min || 60,
        is_active: true,
        timezone: AVAILABILITY_TZ,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    // right remnant
    if (end < re) {
      await supabaseAdmin.from('teacher_availability').insert({
        teacher_id: teacherId,
        profile_id: r.profile_id,
        day_of_week: dayOfWeek,
        start_time: minutesToHm(end),
        end_time: minutesToHm(re),
        slot_duration_min: r.slot_duration_min || 60,
        is_active: true,
        timezone: AVAILABILITY_TZ,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }
  return { ok: true };
}

/**
 * Tarih+saat için müsait / değil toggle.
 * Açınca haftalık şablona yazar (sonraki haftalara aktarılır).
 * Bu tarihe özel kapama varsa kaldırır.
 * Kapatınca haftalık şablondan çıkarır (sonraki haftalara da yansır).
 */
export async function toggleHourSlot({ teacherId, profileId, date, startTime, endTime }) {
  const ymd = String(date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error('invalid_date');
  const start = parseHm(startTime);
  const end = endMinutes(endTime);
  if (start == null || end == null || !(start < end)) throw new Error('invalid_time');

  const bundle = await loadAvailabilityBundle(teacherId, { fromDate: ymd });
  const status = resolveHourSlotStatus({
    ...bundle,
    date: ymd,
    startTime,
    endTime
  });

  if (status === 'past') throw new Error('past_slot');
  if (status === 'busy') throw new Error('busy_slot');

  const dow = istanbulParts(istanbulDateAt(ymd, '12:00')).dow;
  const startHm = minutesToHm(start);
  const endHm = minutesToHm(end);

  const isOpen = status === 'free';

  if (isOpen) {
    // Kapat → haftalık şablondan çıkar + bu güne partial unavailable bırakma (şablon yeter)
    await removeWeeklyHour({ teacherId, dayOfWeek: dow, startTime: startHm, endTime: endHm });

    // Bu tarih için available exception varsa temizle
    const extra = (bundle.exceptions || []).filter((ex) => {
      if (String(ex.exception_date).slice(0, 10) !== ymd) return false;
      if (ex.exception_type !== 'available') return false;
      const rs = parseHm(ex.start_time);
      const re = endMinutes(ex.end_time);
      return rs != null && re != null && rangesOverlap(start, end, rs, re);
    });
    if (extra.length) {
      await supabaseAdmin
        .from('teacher_availability_exceptions')
        .delete()
        .in(
          'id',
          extra.map((e) => e.id)
        );
    }
    return { status: 'empty', action: 'closed' };
  }

  // Aç → tam gün kapalıysa kaldır, partial unavailable temizle, haftalık şablona ekle
  const fullDay = (bundle.exceptions || []).filter(
    (ex) =>
      String(ex.exception_date).slice(0, 10) === ymd &&
      ex.exception_type === 'unavailable' &&
      !ex.start_time &&
      !ex.end_time
  );
  if (fullDay.length) {
    await supabaseAdmin
      .from('teacher_availability_exceptions')
      .delete()
      .in(
        'id',
        fullDay.map((e) => e.id)
      );
  }

  const partial = (bundle.exceptions || []).filter((ex) => {
    if (String(ex.exception_date).slice(0, 10) !== ymd) return false;
    if (ex.exception_type !== 'unavailable' || !ex.start_time || !ex.end_time) return false;
    const rs = parseHm(ex.start_time);
    const re = endMinutes(ex.end_time);
    return rs != null && re != null && rangesOverlap(start, end, rs, re);
  });
  if (partial.length) {
    await supabaseAdmin
      .from('teacher_availability_exceptions')
      .delete()
      .in(
        'id',
        partial.map((e) => e.id)
      );
  }

  await addWeeklyHour({
    teacherId,
    profileId,
    dayOfWeek: dow,
    startTime: startHm,
    endTime: endHm,
    durationMin: end - start
  });

  return { status: 'free', action: 'opened' };
}
