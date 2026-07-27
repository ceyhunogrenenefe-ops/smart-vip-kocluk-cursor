import { supabaseAdmin } from './supabase-admin.js';
import { isMissingTableError } from './supabase-schema.js';

const TABLE = 'class_lesson_topic_checkpoints';

export function parsePageNumber(page) {
  const raw = String(page || '').trim();
  if (!raw) return null;
  const m = raw.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Önceki kayda göre ilerleme / gerileme */
export function compareCheckpointProgress(prev, next) {
  if (!prev || !next) return 'unknown';
  const pPage = parsePageNumber(prev.page_number);
  const nPage = parsePageNumber(next.page_number);
  if (pPage != null && nPage != null) {
    if (nPage > pPage) return 'forward';
    if (nPage < pPage) return 'backward';
    return 'same';
  }
  const pTopic = String(prev.topic || '').trim().toLowerCase();
  const nTopic = String(next.topic || '').trim().toLowerCase();
  if (pTopic && nTopic) {
    if (pTopic === nTopic) return 'same';
    return 'changed';
  }
  return 'unknown';
}

export async function loadCheckpointBySessionId(sessionId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('class_session_id', sessionId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { missingTable: true, row: null };
    throw error;
  }
  return { missingTable: false, row: data || null };
}

export async function loadLatestCheckpoint({ classId, subject, beforeDate }) {
  let q = supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('class_id', classId)
    .eq('subject', String(subject || '').trim())
    .order('lesson_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (beforeDate) {
    q = q.lt('lesson_date', String(beforeDate).slice(0, 10));
  }
  const { data, error } = await q.maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { missingTable: true, row: null };
    throw error;
  }
  return { missingTable: false, row: data || null };
}

export async function loadCheckpointsForSessionIds(sessionIds) {
  const ids = [...new Set((sessionIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { missingTable: false, bySession: {} };
  const { data, error } = await supabaseAdmin.from(TABLE).select('*').in('class_session_id', ids);
  if (error) {
    if (isMissingTableError(error)) return { missingTable: true, bySession: {} };
    throw error;
  }
  const bySession = {};
  for (const row of data || []) {
    if (row.class_session_id) bySession[String(row.class_session_id)] = row;
  }
  return { missingTable: false, bySession };
}

export async function loadCheckpointsForClassSubject({ classId, subject, limit = 50 }) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('class_id', classId)
    .eq('subject', String(subject || '').trim())
    .order('lesson_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) {
    if (isMissingTableError(error)) return { missingTable: true, rows: [] };
    throw error;
  }
  return { missingTable: false, rows: data || [] };
}

export function enrichRowsWithTrend(rows) {
  const sorted = [...(rows || [])].sort((a, b) => {
    const da = String(a.lesson_date || '');
    const db = String(b.lesson_date || '');
    if (da !== db) return da.localeCompare(db);
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  const out = [];
  let prev = null;
  for (const row of sorted) {
    const trend = prev ? compareCheckpointProgress(prev, row) : 'unknown';
    out.push({ ...row, progress_trend: trend });
    prev = row;
  }
  return out.reverse();
}
