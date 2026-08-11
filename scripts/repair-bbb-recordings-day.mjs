/**
 * Dünkü (veya verilen gün) BBB kayıtlarını yayınla + oturum recording_link onar.
 *
 *   DATE=2026-08-10 CLASSES=8A,8B,8E,8F node scripts/repair-bbb-recordings-day.mjs
 */
import { CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DATE = String(process.env.DATE || '2026-08-10').slice(0, 10);
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
  console.log(`API=${API} DATE=${DATE} classes=${CLASS_KEYS.join(',')}`);
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

  console.log('\n=== publish-bbb-recordings-day ===');
  const pub = await api('POST', '/api/class-live-lessons?op=publish-bbb-recordings-day', token, {
    date: DATE,
    attempts: 6,
    wait_ms: 3500
  });
  console.log('status', pub.status, {
    ready: pub.json.ready,
    published_attempts: pub.json.published_attempts,
    still_missing: pub.json.still_missing,
    scanned: pub.json.scanned,
    error: pub.json.error
  });
  for (const d of pub.json.details || []) {
    if (d.status !== 'already_ready') console.log(' ', d.status, d.name, d.recordId?.slice(-20));
  }

  const { json: cJson } = await api(
    'GET',
    `/api/class-live-lessons?scope=classes&institution_id=${INST}`,
    token
  );
  const classes = cJson.data || [];

  for (const classKey of CLASS_KEYS) {
    const cls = matchClass(classes, classKey);
    if (!cls) {
      console.log(classKey, 'not found');
      continue;
    }
    console.log(`\n=== repair sync ${classKey} ${cls.name} ===`);
    const { status, json } = await api('POST', '/api/class-live-lessons?op=sync-recordings-range', token, {
      class_id: cls.id,
      date_from: DATE,
      date_to: DATE,
      institution_id: INST,
      repair: true
    });
    console.log('status', status, {
      linked: json.linked,
      skipped: json.skipped,
      missing: json.missing,
      repaired: json.repaired,
      cleared: json.cleared,
      error: json.error
    });
    for (const d of json.details || []) {
      console.log(' ', d.status, d.subject, d.start_time || '', d.recordId?.slice(-16) || d.playbackUrl?.slice(-24) || '');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
