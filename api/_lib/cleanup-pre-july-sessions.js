import { supabaseAdmin } from './supabase-admin.js';

const PAGE = 1000;

async function fetchAllSessionsBeforeCutoff(cutoff) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('class_sessions')
      .select('id, class_id, lesson_date, status, subject, start_time')
      .lt('lesson_date', cutoff)
      .order('lesson_date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchClassesMap(classIds) {
  const map = new Map();
  const ids = [...new Set(classIds)];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabaseAdmin.from('classes').select('id, name, institution_id').in('id', chunk);
    if (error) throw error;
    for (const c of data || []) map.set(c.id, c);
  }
  return map;
}

function summarizeByClass(sessions, classMap) {
  const byClass = new Map();
  for (const s of sessions) {
    const cid = s.class_id;
    if (!byClass.has(cid)) byClass.set(cid, []);
    byClass.get(cid).push(s);
  }
  return [...byClass.entries()]
    .map(([classId, list]) => {
      const cls = classMap.get(classId);
      const statuses = {};
      for (const s of list) statuses[s.status] = (statuses[s.status] || 0) + 1;
      return {
        class_id: classId,
        class_name: cls?.name || '(bilinmiyor)',
        count: list.length,
        statuses,
        earliest: list[0]?.lesson_date,
        latest: list[list.length - 1]?.lesson_date
      };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * 1 Temmuz öncesi planlı grup ders oturumlarını (class_sessions) tüm sınıflardan siler.
 * Haftalık şablonlar (class_weekly_slots) dokunulmaz.
 */
export async function cleanupPreJulyClassSessions({ cutoff = '2026-07-01', dryRun = true } = {}) {
  const dateCutoff = String(cutoff || '2026-07-01').trim().slice(0, 10);
  const sessions = await fetchAllSessionsBeforeCutoff(dateCutoff);

  const byStatus = {};
  for (const s of sessions) byStatus[s.status] = (byStatus[s.status] || 0) + 1;

  const classMap = await fetchClassesMap(sessions.map((s) => s.class_id));
  const byClass = summarizeByClass(sessions, classMap);
  const sessionIds = sessions.map((s) => s.id);

  if (dryRun) {
    return {
      cutoff: dateCutoff,
      dry_run: true,
      total: sessions.length,
      by_status: byStatus,
      by_class: byClass,
      deleted: 0,
      remaining: sessions.length
    };
  }

  let deleted = 0;
  for (let i = 0; i < sessionIds.length; i += 200) {
    const chunk = sessionIds.slice(i, i + 200);
    const { error, count } = await supabaseAdmin.from('class_sessions').delete({ count: 'exact' }).in('id', chunk);
    if (error) throw error;
    deleted += count ?? chunk.length;
  }

  const remaining = await fetchAllSessionsBeforeCutoff(dateCutoff);
  return {
    cutoff: dateCutoff,
    dry_run: false,
    total: sessions.length,
    by_status: byStatus,
    by_class: byClass,
    deleted,
    remaining: remaining.length
  };
}
