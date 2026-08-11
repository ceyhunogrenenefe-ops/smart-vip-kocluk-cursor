/**
 * Tamamlanan grup derslerine BBB kayıt URL'sini bağlar (recording_link).
 *
 *   node scripts/sync-class-session-recordings.mjs
 *   DATE_FROM=2026-08-10 DATE_TO=2026-08-10 CLASSES=8A,8B,8E,8F node scripts/sync-class-session-recordings.mjs
 */
import { CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DATE_FROM = String(process.env.DATE_FROM || '2026-08-10').slice(0, 10);
const DATE_TO = String(process.env.DATE_TO || DATE_FROM).slice(0, 10);
const CLASS_KEYS = String(process.env.CLASSES || '8A,8B,8E,8F')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function matchClass(classes, key) {
  const matchers = CLASS_NAME_MATCHERS[key] || [key];
  return (
    classes.find((c) => {
      const name = String(c.name || '').toLocaleUpperCase('tr-TR');
      return matchers.some((m) => name.includes(String(m).toLocaleUpperCase('tr-TR')));
    }) || null
  );
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
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  console.log(`API=${API} range=${DATE_FROM}..${DATE_TO} classes=${CLASS_KEYS.join(',')}`);
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
  const summary = [];

  for (const classKey of CLASS_KEYS) {
    const cls = matchClass(classes, classKey);
    if (!cls) {
      summary.push({ classKey, error: 'class_not_found' });
      continue;
    }
    console.log(`\n=== ${classKey} ${cls.name} ===`);
    const { status, json } = await api('POST', '/api/class-live-lessons?op=sync-recordings-range', token, {
      class_id: cls.id,
      date_from: DATE_FROM,
      date_to: DATE_TO,
      institution_id: INST
    });
    console.log('status', status, {
      linked: json.linked,
      skipped: json.skipped,
      missing: json.missing,
      scanned: json.scanned,
      error: json.error
    });
    for (const d of json.details || []) {
      if (d.status === 'linked') {
        console.log(`  + ${d.lesson_date} ${String(d.start_time || '').slice(0, 5)} ${d.subject} ← ${d.matched_by}`);
      } else if (d.status === 'recording_not_found') {
        console.log(`  ? ${d.lesson_date} ${String(d.start_time || '').slice(0, 5)} ${d.subject} not_found mid=${d.bbb_meeting_id || '-'}`);
      }
    }
    summary.push({ classKey, classId: cls.id, ...json, details: undefined });
  }

  console.log('\nSUMMARY', JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
