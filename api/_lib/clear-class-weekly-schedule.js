/**
 * Canlı sınıf haftalık ders programını boşaltır.
 * - class_weekly_slots silinir
 * - gelecekteki scheduled class_sessions iptal edilir
 * - class_teachers / class_students / classes dokunulmaz
 */
import { supabaseAdmin } from './supabase-admin.js';
import {
  CLEAR_SCHEDULE_CLASS_KEYS,
  canonicalizeClearClassKey,
  matchClearTargetClass
} from './clear-group-class-targets.js';

function istanbulTodayYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

async function cancelScheduledSessions({ classId, fromDate }) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(fromDate || ''))
    ? String(fromDate)
    : istanbulTodayYmd();
  const { data, error } = await supabaseAdmin
    .from('class_sessions')
    .select('id')
    .eq('class_id', classId)
    .eq('status', 'scheduled')
    .gte('lesson_date', from);
  if (error) throw error;
  const ids = [...new Set((data || []).map((r) => String(r.id || '').trim()).filter(Boolean))];
  if (!ids.length) return { cancelled: 0, from };
  let cancelled = 0;
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const { data: upd, error: uErr } = await supabaseAdmin
      .from('class_sessions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .in('id', chunk)
      .neq('status', 'cancelled')
      .select('id');
    if (uErr) throw uErr;
    cancelled += (upd || []).length;
  }
  return { cancelled, from };
}

/**
 * @param {{ classId: string, fromDate?: string, cancelFutureSessions?: boolean }} opts
 */
export async function clearClassWeeklySchedule({
  classId,
  fromDate,
  cancelFutureSessions = true
}) {
  const id = String(classId || '').trim();
  if (!id) return { ok: false, error: 'class_id_required' };

  const { data: slots, error: sErr } = await supabaseAdmin
    .from('class_weekly_slots')
    .select('id')
    .eq('class_id', id);
  if (sErr) return { ok: false, error: sErr.message };

  const slotCount = (slots || []).length;
  if (slotCount) {
    const { error: delErr } = await supabaseAdmin.from('class_weekly_slots').delete().eq('class_id', id);
    if (delErr) return { ok: false, error: delErr.message };
  }

  let sessionsCancelled = 0;
  let cancelFrom = null;
  if (cancelFutureSessions !== false) {
    const r = await cancelScheduledSessions({ classId: id, fromDate });
    sessionsCancelled = r.cancelled;
    cancelFrom = r.from;
  }

  return {
    ok: true,
    class_id: id,
    slots_deleted: slotCount,
    sessions_cancelled: sessionsCancelled,
    cancel_from: cancelFrom,
    members_untouched: true
  };
}

/**
 * @param {{
 *   classes: { id?: string, name?: string, teacher_ids?: string[], student_count?: number }[],
 *   keys?: string[],
 *   fromDate?: string,
 *   dryRun?: boolean
 * }} opts
 */
export async function clearTargetGroupClassSchedules({
  classes,
  keys = CLEAR_SCHEDULE_CLASS_KEYS,
  fromDate,
  dryRun = false
}) {
  const targetKeys = (Array.isArray(keys) && keys.length ? keys : CLEAR_SCHEDULE_CLASS_KEYS).map((k) =>
    String(k).trim().toLocaleUpperCase('tr-TR')
  );
  const results = [];

  for (const key of targetKeys) {
    const matched = matchClearTargetClass(classes, key);
    if (!matched) {
      results.push({ key, ok: false, error: 'class_not_found' });
      continue;
    }
    const cls = (classes || []).find((c) => String(c.id) === matched.id) || matched;
    if (dryRun) {
      const { count: slotCount } = await supabaseAdmin
        .from('class_weekly_slots')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', matched.id);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(fromDate || ''))
        ? String(fromDate)
        : istanbulTodayYmd();
      const { count: sessCount } = await supabaseAdmin
        .from('class_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', matched.id)
        .eq('status', 'scheduled')
        .gte('lesson_date', from);
      results.push({
        key,
        ok: true,
        dry_run: true,
        class_id: matched.id,
        name: matched.name,
        canon: canonicalizeClearClassKey(matched.name),
        slots: slotCount ?? 0,
        future_scheduled: sessCount ?? 0,
        teacher_ids: Array.isArray(cls.teacher_ids) ? cls.teacher_ids.length : undefined
      });
      continue;
    }

    const out = await clearClassWeeklySchedule({
      classId: matched.id,
      fromDate,
      cancelFutureSessions: true
    });
    results.push({
      key,
      class_id: matched.id,
      name: matched.name,
      ...out
    });
  }

  return {
    ok: results.every((r) => r.ok !== false || r.error === 'class_not_found'),
    dry_run: Boolean(dryRun),
    results
  };
}

export { CLEAR_SCHEDULE_CLASS_KEYS, canonicalizeClearClassKey, matchClearTargetClass, istanbulTodayYmd };
