import { supabaseAdmin } from './supabase-admin.js';

const DEFAULT_KEEP = ['8-A', '8-B', '8-E', '8-F'];

function norm(s) {
  return String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, '')
    .replace(/[._–—]/g, '-');
}

export function isKeepHolidayClass(row, keepLabels = DEFAULT_KEEP) {
  const name = norm(row?.name);
  const branch = norm(row?.branch);
  const level = String(row?.class_level || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  const levelDigits = level.replace(/\D/g, '');

  for (const label of keepLabels) {
    const n = norm(label); // 8-A
    const compact = n.replace(/-/g, ''); // 8A
    const letter = compact.replace(/^\d+/, ''); // A

    if (!compact) continue;
    if (name === n || name === compact) return true;
    if (name.includes(n) || name.includes(compact)) return true;
    // "8A YAZ KAMPI" → starts with 8A
    if (name.startsWith(compact)) return true;
    // class_level 8 / LGS + şube A (nadiren)
    if (letter && branch === letter && (levelDigits === '8' || level.includes('LGS') || level.includes('8'))) {
      return true;
    }
  }
  return false;
}

/**
 * Belirli tarihteki grup ders oturumlarını cancelled yapar (muaf sınıflar hariç).
 * Maaş özeti yalnızca status=completed saydığı için iptaller hesaba girmez.
 */
export async function cancelHolidayGroupSessions({
  lessonDate = '2026-07-15',
  keepLabels = DEFAULT_KEEP,
  dryRun = true
} = {}) {
  const date = String(lessonDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('lesson_date_invalid');
  }

  const { data: classes, error: cErr } = await supabaseAdmin
    .from('classes')
    .select('id,name,branch,class_level')
    .order('name', { ascending: true });
  if (cErr) throw cErr;

  const keep = [];
  for (const c of classes || []) {
    if (isKeepHolidayClass(c, keepLabels)) keep.push(c);
  }

  const classCatalog = (classes || []).map((c) => ({
    id: c.id,
    name: c.name,
    branch: c.branch || null,
    class_level: c.class_level || null
  }));

  if (!keep.length) {
    const err = new Error('no_keep_classes_matched');
    err.code = 'no_keep_classes_matched';
    err.classCatalog = classCatalog;
    throw err;
  }

  const keepIds = new Set(keep.map((c) => String(c.id)));
  const byClass = new Map((classes || []).map((c) => [String(c.id), c]));

  const { data: sessions, error: sErr } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,lesson_date,start_time,end_time,subject,status,teacher_id')
    .eq('lesson_date', date)
    .order('start_time', { ascending: true });
  if (sErr) throw sErr;

  const toCancel = [];
  const keptSessions = [];
  let alreadyCancelled = 0;
  for (const s of sessions || []) {
    if (String(s.status || '') === 'cancelled') {
      alreadyCancelled += 1;
      continue;
    }
    if (keepIds.has(String(s.class_id))) keptSessions.push(s);
    else toCancel.push(s);
  }

  const cancelByClass = {};
  for (const s of toCancel) {
    const c = byClass.get(String(s.class_id));
    const label = c?.name || s.class_id;
    cancelByClass[label] = (cancelByClass[label] || 0) + 1;
  }

  const result = {
    lesson_date: date,
    dry_run: dryRun,
    keep_labels: keepLabels,
    keep_classes: keep.map((c) => ({
      id: c.id,
      name: c.name,
      branch: c.branch || null,
      class_level: c.class_level || null
    })),
    total_sessions: (sessions || []).length,
    already_cancelled: alreadyCancelled,
    keep_session_count: keptSessions.length,
    cancel_count: toCancel.length,
    cancel_by_class: cancelByClass,
    keep_sessions_sample: keptSessions.slice(0, 40).map((s) => ({
      id: s.id,
      class: byClass.get(String(s.class_id))?.name || s.class_id,
      start: String(s.start_time || '').slice(0, 5),
      subject: s.subject,
      status: s.status
    })),
    updated: 0
  };

  if (dryRun || !toCancel.length) return result;

  const ids = toCancel.map((s) => s.id);
  const now = new Date().toISOString();
  const CHUNK = 200;
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin
      .from('class_sessions')
      .update({ status: 'cancelled', updated_at: now })
      .in('id', chunk)
      .neq('status', 'cancelled')
      .select('id');
    if (error) throw error;
    updated += (data || []).length;
  }
  result.updated = updated;
  result.dry_run = false;
  return result;
}

/**
 * Tatil iptalini geri al: aynı kapsamdaki cancelled oturumları tekrar scheduled yapar.
 * (Satır silinmedi — yalnızca status değişmişti.)
 */
export async function restoreHolidayGroupSessions({
  lessonDate = '2026-07-15',
  keepLabels = DEFAULT_KEEP,
  dryRun = true
} = {}) {
  const date = String(lessonDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('lesson_date_invalid');
  }

  const { data: classes, error: cErr } = await supabaseAdmin
    .from('classes')
    .select('id,name,branch,class_level')
    .order('name', { ascending: true });
  if (cErr) throw cErr;

  const keep = [];
  for (const c of classes || []) {
    if (isKeepHolidayClass(c, keepLabels)) keep.push(c);
  }
  if (!keep.length) {
    const err = new Error('no_keep_classes_matched');
    err.code = 'no_keep_classes_matched';
    throw err;
  }

  const keepIds = new Set(keep.map((c) => String(c.id)));
  const byClass = new Map((classes || []).map((c) => [String(c.id), c]));

  const { data: sessions, error: sErr } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,lesson_date,start_time,end_time,subject,status,teacher_id')
    .eq('lesson_date', date)
    .eq('status', 'cancelled')
    .order('start_time', { ascending: true });
  if (sErr) throw sErr;

  const toRestore = [];
  const skippedKeep = [];
  for (const s of sessions || []) {
    if (keepIds.has(String(s.class_id))) skippedKeep.push(s);
    else toRestore.push(s);
  }

  const restoreByClass = {};
  for (const s of toRestore) {
    const c = byClass.get(String(s.class_id));
    const label = c?.name || s.class_id;
    restoreByClass[label] = (restoreByClass[label] || 0) + 1;
  }

  const result = {
    lesson_date: date,
    dry_run: dryRun,
    keep_labels: keepLabels,
    restore_count: toRestore.length,
    restore_by_class: restoreByClass,
    skipped_keep_cancelled: skippedKeep.length,
    updated: 0
  };

  if (dryRun || !toRestore.length) return result;

  const ids = toRestore.map((s) => s.id);
  const now = new Date().toISOString();
  const CHUNK = 200;
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin
      .from('class_sessions')
      .update({ status: 'scheduled', updated_at: now })
      .in('id', chunk)
      .eq('status', 'cancelled')
      .select('id');
    if (error) throw error;
    updated += (data || []).length;
  }
  result.updated = updated;
  result.dry_run = false;
  return result;
}
