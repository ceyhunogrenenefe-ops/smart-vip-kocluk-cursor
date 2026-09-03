/**
 * 8A/8B/8E/8F: aynı gün+saat+branş için çift planlı oturumları temizler.
 * Her anahtar için en eski (tercihen Zoom linkli) oturumu bırakır, diğerlerini iptal eder.
 *
 *   node scripts/cleanup-lgs-8abef-duplicate-sessions.mjs           # dry-run
 *   DRY_RUN=0 node scripts/cleanup-lgs-8abef-duplicate-sessions.mjs # uygula
 */
import { CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 90));

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
function normSub(s) {
  return String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
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
function hasZoom(s) {
  return /zoom\.us/i.test(String(s.meeting_link || ''));
}
function pickKeep(rows) {
  const sorted = [...rows].sort((a, b) => {
    const za = hasZoom(a) ? 0 : 1;
    const zb = hasZoom(b) ? 0 : 1;
    if (za !== zb) return za - zb;
    const ca = String(a.created_at || '');
    const cb = String(b.created_at || '');
    if (ca !== cb) return ca.localeCompare(cb);
    return String(a.id).localeCompare(String(b.id));
  });
  return { keep: sorted[0], drop: sorted.slice(1) };
}

async function api(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`API=${API} DRY_RUN=${DRY_RUN} DAYS_AHEAD=${DAYS_AHEAD}`);
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
  const { json: cJson } = await api(
    'GET',
    `/api/class-live-lessons?scope=classes&institution_id=${INST}`,
    token
  );
  const classes = cJson.data || [];
  const today = ymd(new Date());
  const dateTo = addDays(today, DAYS_AHEAD);
  const summary = [];
  const allDropIds = [];

  for (const classKey of ['8A', '8B', '8E', '8F']) {
    const cls = matchClass(classes, classKey);
    if (!cls) {
      summary.push({ classKey, error: 'class_not_found' });
      continue;
    }
    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${cls.id}&institution_id=${INST}&from=${today}&to=${dateTo}`,
      token
    );
    const sessions = (sessJson.data || []).filter((s) => String(s.status) === 'scheduled');
    const byKey = new Map();
    for (const s of sessions) {
      const k = `${String(s.lesson_date).slice(0, 10)}|${hm(s.start_time)}|${hm(s.end_time)}|${normSub(s.subject)}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(s);
    }

    let dupGroups = 0;
    let dropCount = 0;
    const bySubject = new Map();
    for (const [k, rows] of byKey) {
      if (rows.length < 2) continue;
      dupGroups += 1;
      const { keep, drop } = pickKeep(rows);
      const sub = k.split('|').pop();
      bySubject.set(sub, (bySubject.get(sub) || 0) + drop.length);
      dropCount += drop.length;
      for (const d of drop) allDropIds.push(d.id);
      if (dupGroups <= 4) {
        console.log(
          `  ${classKey} ${k}: keep=${keep.id.slice(0, 8)} drop=${drop.map((d) => d.id.slice(0, 8)).join(',')}`
        );
      }
    }
    console.log(
      `${classKey} ${cls.name}: scheduled=${sessions.length} dup_groups=${dupGroups} to_cancel=${dropCount}`,
      Object.fromEntries(bySubject)
    );
    summary.push({
      classKey,
      classId: cls.id,
      scheduled: sessions.length,
      dup_groups: dupGroups,
      to_cancel: dropCount,
      by_subject: Object.fromEntries(bySubject)
    });
  }

  console.log(`\nTOTAL_TO_CANCEL=${allDropIds.length}`);
  if (DRY_RUN) {
    console.log('Dry-run. Uygulamak için: DRY_RUN=0 node scripts/cleanup-lgs-8abef-duplicate-sessions.mjs');
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  let cancelled = 0;
  for (let i = 0; i < allDropIds.length; i += 50) {
    const chunk = allDropIds.slice(i, i + 50);
    const ids = chunk.join(',');
    const { status, json } = await api(
      'DELETE',
      `/api/class-live-lessons?session_ids=${encodeURIComponent(ids)}`,
      token
    );
    if (status >= 400) {
      console.error('cancel_fail', status, json);
    } else {
      cancelled += Number(json.cancelled_count || chunk.length);
      console.log('cancelled_chunk', json.cancelled_count ?? chunk.length);
    }
  }

  // Doğrulama: Etüt gün başına 2
  const verify = [];
  for (const classKey of ['8A', '8B', '8E', '8F']) {
    const cls = matchClass(classes, classKey);
    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${cls.id}&institution_id=${INST}&from=${today}&to=${addDays(today, 14)}`,
      token
    );
    const sessions = (sessJson.data || []).filter((s) => String(s.status) === 'scheduled');
    const byKey = new Map();
    for (const s of sessions) {
      const k = `${String(s.lesson_date).slice(0, 10)}|${hm(s.start_time)}|${hm(s.end_time)}|${normSub(s.subject)}`;
      byKey.set(k, (byKey.get(k) || 0) + 1);
    }
    const remainingDups = [...byKey.values()].filter((n) => n > 1).length;
    const etutByDate = new Map();
    for (const s of sessions) {
      if (!normSub(s.subject).includes('ETÜT') && !normSub(s.subject).includes('ETUT')) continue;
      const d = String(s.lesson_date).slice(0, 10);
      if (!etutByDate.has(d)) etutByDate.set(d, []);
      etutByDate.get(d).push(hm(s.start_time));
    }
    const badEtutDays = [];
    for (const [d, starts] of etutByDate) {
      const sorted = [...starts].sort();
      if (sorted.length !== 2 || sorted.join(',') !== '17:00,17:50') {
        badEtutDays.push({ d, starts: sorted });
      }
    }
    verify.push({ classKey, remainingDups, badEtutDays: badEtutDays.slice(0, 5), etutDays: etutByDate.size });
  }

  console.log('\nDONE', { cancelled, verify });
  console.log(JSON.stringify({ summary, cancelled, verify }, null, 2));
  if (verify.some((v) => v.remainingDups || v.badEtutDays.length)) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
