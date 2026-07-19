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
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

export async function loadAvailabilityBundle(teacherId) {
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
      .gte('exception_date', istanbulParts().ymd)
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
