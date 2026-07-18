/**
 * Planlanmış BBB join URL'lerindeki eski host'u yeni özel alan adına taşır.
 * Checksum host içermez; yalnızca origin/path kökü değişir.
 *
 * Kullanım:
 *   node scripts/rewrite-bbb-join-hosts.mjs
 *   DRY_RUN=0 node scripts/rewrite-bbb-join-hosts.mjs
 *
 * Ortam:
 *   TARGET_BBB_API_BASE=https://ders.dersonlinevipkocluk.com/bigbluebutton/api/
 *   (veya BBB_API_ENDPOINT / BBB_PUBLIC_API_BASE)
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const PAGE = 500;

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

function trimSlash(v) {
  return String(v || '').trim().replace(/\/+$/, '');
}

function normalizeBbbApiBase(raw) {
  const base = trimSlash(raw);
  if (!base) return '';
  if (base.includes('/api')) return `${base}/`;
  return `${base}/api/`;
}

const TARGET_API_BASE = normalizeBbbApiBase(
  process.env.TARGET_BBB_API_BASE ||
    process.env.BBB_PUBLIC_API_BASE ||
    process.env.BBB_API_ENDPOINT ||
    process.env.BBB_URL ||
    ''
);

if (!TARGET_API_BASE) {
  console.error('TARGET_BBB_API_BASE / BBB_API_ENDPOINT gerekli.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function isBbbJoinUrl(s) {
  return /meetingID=/i.test(s) && /\/join/i.test(s);
}

function rewriteJoinUrl(raw) {
  const s = String(raw || '').trim();
  if (!s || s === 'bbb:auto') return { changed: false, value: s };
  if (!isBbbJoinUrl(s) && !(/bigbluebutton|biggerbluebutton/i.test(s) && /\/join/i.test(s))) {
    return { changed: false, value: s };
  }
  try {
    const u = new URL(s);
    const qs = u.searchParams.toString();
    const next = qs ? `${TARGET_API_BASE}join?${qs}` : `${TARGET_API_BASE}join`;
    if (next === s) return { changed: false, value: s };
    return { changed: true, value: next, fromHost: u.host };
  } catch {
    return { changed: false, value: s };
  }
}

const TABLES = [
  {
    table: 'class_sessions',
    cols: ['meeting_link', 'meeting_link_moderator'],
    select: 'id, meeting_link, meeting_link_moderator, lesson_date, status'
  },
  {
    table: 'class_weekly_slots',
    cols: ['meeting_link', 'meeting_link_moderator'],
    select: 'id, meeting_link, meeting_link_moderator'
  },
  {
    table: 'teacher_lessons',
    cols: ['meeting_link', 'meeting_link_moderator'],
    select: 'id, meeting_link, meeting_link_moderator, lesson_date, status'
  },
  {
    table: 'meetings',
    cols: ['meet_link', 'link_bbb'],
    select: 'id, meet_link, link_bbb, meeting_date, status'
  },
  {
    table: 'institution_events',
    cols: ['meeting_link'],
    select: 'id, meeting_link'
  }
];

async function fetchAll(table, select) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(select).range(from, from + PAGE - 1);
    if (error) {
      if (/does not exist|schema cache|PGRST/i.test(error.message || '')) {
        console.warn(`[skip] ${table}: ${error.message}`);
        return null;
      }
      throw error;
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  console.log('=== BBB join host rewrite ===');
  console.log('TARGET_API_BASE:', TARGET_API_BASE);
  console.log('DRY_RUN:', DRY_RUN);

  const summary = [];

  for (const spec of TABLES) {
    const rows = await fetchAll(spec.table, spec.select);
    if (!rows) {
      summary.push({ table: spec.table, scanned: 0, toUpdate: 0, updated: 0, skipped: true });
      continue;
    }

    let toUpdate = 0;
    let updated = 0;
    const hostCounts = new Map();

    for (const row of rows) {
      const patch = {};
      let rowChanged = false;
      for (const col of spec.cols) {
        const r = rewriteJoinUrl(row[col]);
        if (r.changed) {
          patch[col] = r.value;
          rowChanged = true;
          if (r.fromHost) hostCounts.set(r.fromHost, (hostCounts.get(r.fromHost) || 0) + 1);
        }
      }
      if (!rowChanged) continue;
      toUpdate += 1;
      if (DRY_RUN) continue;
      const { error } = await sb.from(spec.table).update(patch).eq('id', row.id);
      if (error) {
        console.error(`Update failed ${spec.table} ${row.id}:`, error.message);
        continue;
      }
      updated += 1;
    }

    console.log(
      `\n${spec.table}: scanned=${rows.length} toUpdate=${toUpdate} updated=${updated}` +
        (hostCounts.size
          ? ` hosts=${[...hostCounts.entries()].map(([h, n]) => `${h}:${n}`).join(', ')}`
          : '')
    );
    summary.push({
      table: spec.table,
      scanned: rows.length,
      toUpdate,
      updated: DRY_RUN ? 0 : updated,
      hosts: Object.fromEntries(hostCounts)
    });
  }

  console.log('\n=== Özet ===');
  console.log(JSON.stringify(summary, null, 2));
  if (DRY_RUN) {
    console.log('\nÖnizleme tamam. Yazmak için: DRY_RUN=0 node scripts/rewrite-bbb-join-hosts.mjs');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
