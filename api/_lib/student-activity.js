/**
 * Öğrenci aktiflik dönemleri — tarih bazlı aktif kontrolü.
 * Dönemi olmayan öğrenci varsayılan olarak aktif kabul edilir (geçiş güvenliği).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { isMissingTableError } from './supabase-schema.js';

export const PERIOD_TYPES = ['summer', 'school_year', 'custom'];
export const ACTIVITY_STATUSES = ['active', 'passive'];

export function padYmd(v) {
  return String(v || '').trim().slice(0, 10);
}

export function dateInRange(ymd, startYmd, endYmd) {
  const d = padYmd(ymd);
  const s = padYmd(startYmd);
  const e = endYmd == null || endYmd === '' ? null : padYmd(endYmd);
  if (!d || !s) return false;
  if (d < s) return false;
  if (e && d > e) return false;
  return true;
}

/**
 * Tek öğrenci + tarih: dönem listesi üzerinden aktif mi?
 * @param {Array<{status:string,start_date:string,end_date?:string|null,coach_id?:string|null}>} periods
 * @param {string} reportDate YYYY-MM-DD
 * @param {{ coachId?: string|null }} [opts]
 */
export function isActiveFromPeriods(periods, reportDate, opts = {}) {
  const ymd = padYmd(reportDate);
  if (!ymd) return true;
  const list = Array.isArray(periods) ? periods : [];
  const coachId = opts.coachId != null ? String(opts.coachId).trim() : '';

  const relevant = list.filter((p) => {
    if (coachId && p.coach_id != null && String(p.coach_id).trim() && String(p.coach_id) !== coachId) {
      return false;
    }
    return dateInRange(ymd, p.start_date, p.end_date);
  });

  if (!relevant.length) {
    // Hiç dönem yok veya bu tarihe denk gelmiyor:
    // - hiç dönem yoksa → varsayılan aktif
    // - dönemler var ama tarih kapsanmıyorsa → pasif (kapalı aralık dışı)
    if (!list.length) return true;
    if (coachId) {
      const forCoach = list.filter(
        (p) => !p.coach_id || String(p.coach_id) === coachId
      );
      if (!forCoach.length) return true;
    }
    return false;
  }

  // Aynı tarihte aktif dönem varsa aktif; yalnızca passive varsa pasif
  if (relevant.some((p) => String(p.status) === 'active')) return true;
  if (relevant.every((p) => String(p.status) === 'passive')) return false;
  return true;
}

/**
 * İki tarih aralığı çakışıyor mu? (status fark etmez — aynı öğrenci için)
 */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const as = padYmd(aStart);
  const ae = aEnd == null || aEnd === '' ? '9999-12-31' : padYmd(aEnd);
  const bs = padYmd(bStart);
  const be = bEnd == null || bEnd === '' ? '9999-12-31' : padYmd(bEnd);
  if (!as || !bs) return false;
  return as <= be && bs <= ae;
}

export async function loadPeriodsForStudents(studentIds, { coachId } = {}) {
  const ids = [...new Set((studentIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return new Map();

  const out = new Map();
  const CHUNK = 200;
  try {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      let q = supabaseAdmin
        .from('student_activity_periods')
        .select('*')
        .in('student_id', chunk)
        .order('start_date', { ascending: true });
      if (coachId) q = q.or(`coach_id.eq.${coachId},coach_id.is.null`);
      const { data, error } = await q;
      if (error) {
        if (isMissingTableError(error, 'student_activity_periods')) return out;
        throw error;
      }
      for (const row of data || []) {
        const sid = String(row.student_id);
        if (!out.has(sid)) out.set(sid, []);
        out.get(sid).push(row);
      }
    }
  } catch (e) {
    if (isMissingTableError(e, 'student_activity_periods')) return out;
    throw e;
  }
  return out;
}

/**
 * isStudentActiveOnDate(studentId, coachId, reportDate)
 */
export async function isStudentActiveOnDate(studentId, coachId, reportDate) {
  const sid = String(studentId || '').trim();
  if (!sid) return false;
  const map = await loadPeriodsForStudents([sid], { coachId: coachId || undefined });
  return isActiveFromPeriods(map.get(sid) || [], reportDate, { coachId });
}

/**
 * Birden fazla öğrenci için belirli günde aktif olan ID seti.
 * Tablo yoksa / dönem yoksa tümü aktif.
 */
export async function filterStudentIdsActiveOnDate(studentIds, reportDate, { coachId } = {}) {
  const ids = [...new Set((studentIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return new Set();
  const map = await loadPeriodsForStudents(ids, { coachId });
  if (!map.size) {
    // Tablo boş veya yok → hepsi aktif
    return new Set(ids);
  }
  const active = new Set();
  for (const sid of ids) {
    if (isActiveFromPeriods(map.get(sid) || [], reportDate, { coachId })) {
      active.add(sid);
    }
  }
  return active;
}

/**
 * coach-stats: her gün için aktif öğrenci sayısı (beklenen slot).
 */
export function countActiveStudentDays(studentIds, dayList, periodsByStudent, coachId) {
  let n = 0;
  for (const sid of studentIds) {
    const periods = periodsByStudent.get(String(sid)) || [];
    for (const day of dayList) {
      if (isActiveFromPeriods(periods, day, { coachId })) n += 1;
    }
  }
  return n;
}

/**
 * Bugünkü görüntülenen durum: active | passive | scheduled
 */
export function resolveDisplayStatus(periods, todayYmd, coachId) {
  const today = padYmd(todayYmd);
  const list = Array.isArray(periods) ? periods : [];
  if (isActiveFromPeriods(list, today, { coachId })) {
    return { status: 'active', label: 'Aktif' };
  }
  const futureActive = list.find(
    (p) =>
      String(p.status) === 'active' &&
      padYmd(p.start_date) > today &&
      (!coachId || !p.coach_id || String(p.coach_id) === String(coachId))
  );
  if (futureActive) {
    return { status: 'scheduled', label: 'Planlanmış', starts: padYmd(futureActive.start_date) };
  }
  if (!list.length) return { status: 'active', label: 'Aktif' };
  return { status: 'passive', label: 'Pasif' };
}

export async function writeActivityAudit({
  studentId,
  periodId,
  actorUserId,
  action,
  previousValue,
  newValue
}) {
  try {
    await supabaseAdmin.from('student_activity_audit_logs').insert({
      student_id: studentId || null,
      period_id: periodId || null,
      actor_user_id: actorUserId || null,
      action: String(action || 'update'),
      previous_value: previousValue ?? null,
      new_value: newValue ?? null,
      created_at: new Date().toISOString()
    });
  } catch {
    /* best-effort */
  }
}

export async function assertNoActiveOverlap({
  studentId,
  coachId,
  startDate,
  endDate,
  excludeId,
  status
}) {
  // Yalnızca active dönemler arasında çakışmayı engelle
  if (String(status) !== 'active') return;
  const map = await loadPeriodsForStudents([studentId], { coachId });
  const existing = (map.get(String(studentId)) || []).filter((p) => String(p.status) === 'active');
  for (const p of existing) {
    if (excludeId && String(p.id) === String(excludeId)) continue;
    if (coachId && p.coach_id && String(p.coach_id) !== String(coachId)) continue;
    if (rangesOverlap(startDate, endDate, p.start_date, p.end_date)) {
      const err = new Error(
        `Aktif dönem çakışıyor: ${padYmd(p.start_date)} – ${p.end_date ? padYmd(p.end_date) : 'süresiz'}`
      );
      err.code = 'activity_period_overlap';
      throw err;
    }
  }
}
