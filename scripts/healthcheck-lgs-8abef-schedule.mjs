/**
 * LGS 8A/8B/8E/8F program sağlık kontrolü.
 * - Her Pzt–Cum: 2 ayrı Etüt (17:00–17:40 + 17:50–18:30)
 * - Arka arkaya aynı branş: iki 40 dk dilim (birleşik 80 dk yok)
 * - Beklenen branş listesi ile birebir eşleşme
 *
 *   node scripts/healthcheck-lgs-8abef-schedule.mjs
 *   DAYS_AHEAD=14 node scripts/healthcheck-lgs-8abef-schedule.mjs
 */
import { LGS_8ABEF_SCHEDULE, CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(7, Number(process.env.DAYS_AHEAD || 14));

function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function hm(t) {
  return String(t || '').slice(0, 5);
}
function durMin(start, end) {
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}
function isoDowMon1(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const js = dt.getUTCDay(); // 0 Sun
  return js === 0 ? 7 : js;
}
function normSub(s) {
  return String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/FEN BİLGİSİ/g, 'FEN BİLİMLERİ');
}
function slotSig(row) {
  return `${row.day_of_week}|${hm(row.start_time)}|${hm(row.end_time)}|${normSub(row.subject)}`;
}

async function api(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function matchClass(classes, key) {
  const matchers = CLASS_NAME_MATCHERS[key] || [];
  return (
    classes.find((c) => {
      const name = String(c.name || '').toLocaleUpperCase('tr-TR');
      return matchers.some((m) => name.includes(String(m).toLocaleUpperCase('tr-TR')));
    }) || null
  );
}

async function main() {
  const login = await fetch(`${API}/api/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const loginJson = await login.json().catch(() => ({}));
  if (!login.ok || !loginJson.token) {
    console.error('login_failed', login.status, loginJson);
    process.exit(1);
  }
  const token = loginJson.token;
  const { json: cJson } = await api(token, `/api/class-live-lessons?scope=classes&institution_id=${INST}`);
  const classes = cJson.data || [];
  const today = ymd(new Date());
  const dateTo = addDays(today, DAYS_AHEAD);
  const failures = [];

  for (const classKey of ['8A', '8B', '8E', '8F']) {
    const cls = matchClass(classes, classKey);
    if (!cls) {
      failures.push({ classKey, error: 'class_not_found' });
      continue;
    }
    const expected = LGS_8ABEF_SCHEDULE[classKey] || [];
    const { json: slotsJson } = await api(
      token,
      `/api/class-live-lessons?scope=slots&class_id=${cls.id}&institution_id=${INST}`
    );
    const slots = slotsJson.data || [];
    const expSet = new Set(expected.map(slotSig));
    const gotSet = new Set(slots.map(slotSig));
    const missingSlots = [...expSet].filter((s) => !gotSet.has(s));
    const extraSlots = [...gotSet].filter((s) => !expSet.has(s));

    const longSlots = slots.filter(
      (s) => durMin(s.start_time, s.end_time) > 50 && !/deneme/i.test(String(s.subject || ''))
    );

    for (let dow = 1; dow <= 5; dow++) {
      const etuts = slots.filter(
        (s) => s.day_of_week === dow && /et[uü]t/i.test(String(s.subject || ''))
      );
      const starts = etuts.map((s) => hm(s.start_time)).sort();
      if (etuts.length !== 2 || starts.join(',') !== '17:00,17:50') {
        failures.push({
          classKey,
          error: 'weekday_etut_not_split',
          day_of_week: dow,
          starts,
          count: etuts.length
        });
      }
    }

    const { json: sessJson } = await api(
      token,
      `/api/class-live-lessons?scope=sessions&class_id=${cls.id}&institution_id=${INST}&from=${today}&to=${dateTo}&materialize=1`
    );
    const sessions = (sessJson.data || []).filter((s) => String(s.status) === 'scheduled');

    const byDate = new Map();
    for (const s of sessions) {
      const d = String(s.lesson_date || '').slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(s);
    }

    for (const [date, list] of byDate) {
      const dow = isoDowMon1(date);
      if (dow >= 1 && dow <= 5) {
        const etuts = list.filter((s) => /et[uü]t/i.test(String(s.subject || '')));
        const starts = etuts.map((s) => hm(s.start_time)).sort();
        if (etuts.length !== 2 || starts.join(',') !== '17:00,17:50') {
          failures.push({
            classKey,
            error: 'session_etut_not_split',
            date,
            starts,
            count: etuts.length
          });
        }
      }
      const long = list.filter(
        (s) => durMin(s.start_time, s.end_time) > 50 && !/deneme/i.test(String(s.subject || ''))
      );
      if (long.length) {
        failures.push({
          classKey,
          error: 'merged_long_session',
          date,
          rows: long.map((s) => `${hm(s.start_time)}-${hm(s.end_time)} ${s.subject}`)
        });
      }
    }

    if (slots.length !== expected.length) {
      failures.push({
        classKey,
        error: 'slot_count_mismatch',
        expected: expected.length,
        got: slots.length
      });
    }
    if (missingSlots.length || extraSlots.length) {
      failures.push({ classKey, error: 'slot_content_mismatch', missingSlots, extraSlots });
    }
    if (longSlots.length) {
      failures.push({
        classKey,
        error: 'merged_long_slot',
        rows: longSlots.map((s) => `d${s.day_of_week} ${hm(s.start_time)}-${hm(s.end_time)} ${s.subject}`)
      });
    }

    console.log(
      `${classKey} ${cls.name}: slots=${slots.length}/${expected.length} sessions=${sessions.length} ok_so_far=${!failures.some((f) => f.classKey === classKey)}`
    );
  }

  if (failures.length) {
    console.error('\nHEALTHCHECK_FAILED');
    console.error(JSON.stringify(failures, null, 2));
    process.exit(2);
  }
  console.log('\nHEALTHCHECK_OK all 8A/8B/8E/8F split etüt + split double periods');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
