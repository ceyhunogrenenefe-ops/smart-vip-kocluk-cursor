/**
 * 1 Temmuz 2026 öncesi tarihli grup ders oturumlarını (class_sessions) tüm sınıflardan siler.
 * Haftalık şablonlar (class_weekly_slots) ve planlayıcı taslakları (class_schedule_plans) dokunulmaz.
 *
 * Kullanım:
 *   node scripts/cleanup-pre-july-sessions.mjs              # önizleme (silmez)
 *   DRY_RUN=0 node scripts/cleanup-pre-july-sessions.mjs    # sil
 *   CUTOFF=2026-07-01 node scripts/cleanup-pre-july-sessions.mjs
 *
 * Ortam: .env.vercel.prod.secrets, .env.vercel.prod, student-coaching-system/.env.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const CUTOFF = String(process.env.CUTOFF || '2026-07-01').trim();
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

for (const f of [
  'student-coaching-system/.env.local',
  '.env.local',
  '.env.vercel.local',
  '.env.vercel.prod',
  '.env.vercel.prod.secrets',
  '.env.production',
  '.env.prod.live',
  '.env.vercel.runtime'
]) {
  loadDotEnv(path.join(root, f));
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const PAGE = 1000;

async function fetchAllSessionsBeforeCutoff() {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from('class_sessions')
      .select('id, class_id, lesson_date, status, subject, start_time')
      .lt('lesson_date', CUTOFF)
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
    const { data, error } = await sb.from('classes').select('id, name, institution_id').in('id', chunk);
    if (error) throw error;
    for (const c of data || []) map.set(c.id, c);
  }
  return map;
}

async function countAttendanceForSessions(sessionIds) {
  if (!sessionIds.length) return 0;
  let total = 0;
  for (let i = 0; i < sessionIds.length; i += 200) {
    const chunk = sessionIds.slice(i, i + 200);
    const { count, error } = await sb
      .from('class_session_attendance')
      .select('*', { count: 'exact', head: true })
      .in('session_id', chunk);
    if (error) throw error;
    total += count || 0;
  }
  return total;
}

async function countAppointmentsForSessions(sessionIds) {
  if (!sessionIds.length) return 0;
  let total = 0;
  for (let i = 0; i < sessionIds.length; i += 200) {
    const chunk = sessionIds.slice(i, i + 200);
    const { count, error } = await sb
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .in('lesson_id', chunk);
    if (error) {
      if (/relation.*does not exist/i.test(error.message || '')) return 0;
      throw error;
    }
    total += count || 0;
  }
  return total;
}

async function deleteSessionsBatch(ids) {
  const { error, count } = await sb.from('class_sessions').delete({ count: 'exact' }).in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}

async function main() {
  console.log('=== Pre-July class_sessions cleanup ===');
  console.log('Cutoff (exclusive): lesson_date <', CUTOFF);
  console.log('Mode:', DRY_RUN ? 'DRY RUNNING (önizleme, silinmez)' : 'DELETE (canlı silme)');
  console.log('Supabase:', url.replace(/https:\/\/([^.]+).*/, 'https://$1...'));

  const sessions = await fetchAllSessionsBeforeCutoff();
  console.log('\nToplam oturum (tüm durumlar):', sessions.length);

  const byStatus = {};
  for (const s of sessions) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  }
  console.log('Duruma göre:', byStatus);

  const classMap = await fetchClassesMap(sessions.map((s) => s.class_id));
  const byClass = new Map();
  for (const s of sessions) {
    const cid = s.class_id;
    if (!byClass.has(cid)) byClass.set(cid, []);
    byClass.get(cid).push(s);
  }

  console.log('\nSınıf bazında (lesson_date < ' + CUTOFF + '):');
  const classRows = [...byClass.entries()]
    .map(([classId, list]) => {
      const cls = classMap.get(classId);
      const statusBreakdown = {};
      for (const s of list) statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1;
      return {
        class_id: classId,
        class_name: cls?.name || '(bilinmiyor)',
        institution_id: cls?.institution_id || null,
        count: list.length,
        statuses: statusBreakdown,
        earliest: list[0]?.lesson_date,
        latest: list[list.length - 1]?.lesson_date
      };
    })
    .sort((a, b) => b.count - a.count);

  for (const row of classRows) {
    console.log(
      `  ${row.class_name} (${row.class_id.slice(0, 8)}…): ${row.count} oturum`,
      row.statuses,
      `[${row.earliest} … ${row.latest}]`
    );
  }

  const sessionIds = sessions.map((s) => s.id);
  const attendanceCount = await countAttendanceForSessions(sessionIds);
  const appointmentCount = await countAppointmentsForSessions(sessionIds);
  console.log('\nCascade etkilenecek kayıtlar:');
  console.log('  class_session_attendance:', attendanceCount);
  console.log('  appointments (soru çözüm):', appointmentCount);
  console.log('\nDokunulmayan tablolar: class_weekly_slots, class_schedule_plans, weekly_planner_entries, edu_lesson_rows');

  if (DRY_RUN) {
    console.log('\nSilme atlandı (DRY_RUN). Gerçek silme için: DRY_RUN=0 node scripts/cleanup-pre-july-sessions.mjs');
    return;
  }

  let deleted = 0;
  for (let i = 0; i < sessionIds.length; i += 200) {
    const chunk = sessionIds.slice(i, i + 200);
    deleted += await deleteSessionsBatch(chunk);
    process.stdout.write(`\rSilindi: ${deleted}/${sessionIds.length}`);
  }
  console.log('\n\nSilme tamamlandı. class_sessions silinen:', deleted);

  const remaining = await fetchAllSessionsBeforeCutoff();
  console.log('Doğrulama — kalan oturum (<' + CUTOFF + '):', remaining.length);
}

main().catch((e) => {
  console.error('HATA:', e.message || e);
  process.exit(1);
});
