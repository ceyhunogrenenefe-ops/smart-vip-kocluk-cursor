/**
 * 8B→8F ve 8A→8C Din Kültürü haftalık slot / gelecek oturum saatlerini hizalar
 * ve BBB meeting alanlarını ortak oda anahtarına çeker.
 *
 *   node scripts/sync-lgs8-din-pair-schedules.mjs           # dry-run
 *   DRY_RUN=0 node scripts/sync-lgs8-din-pair-schedules.mjs
 */
import { LGS_8ABEF_SCHEDULE, CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';
import {
  isDinKulturuSubject,
  lgs8DinSharedMeetingFields
} from '../api/_lib/lgs8-din-shared-bbb.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 60));

const PAIRS = [
  ['8B', '8F'],
  ['8A', '8C']
];

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

function matchClass(classes, key) {
  const matchers = CLASS_NAME_MATCHERS[key] || [key];
  return (
    classes.find((c) => {
      const name = String(c.name || '').toLocaleUpperCase('tr-TR');
      return matchers.some((m) => name.includes(String(m).toLocaleUpperCase('tr-TR')));
    }) || null
  );
}

function dinTemplate(classKey) {
  return (LGS_8ABEF_SCHEDULE[classKey] || []).filter((s) => isDinKulturuSubject(s.subject));
}

async function main() {
  const login = await api('POST', '/api/auth/login', null, { email: EMAIL, password: PASSWORD });
  const token = login.json?.token || login.json?.access_token;
  if (!token) {
    console.error('Login failed', login.status, login.json);
    process.exit(1);
  }
  const classesRes = await api('GET', `/api/classes?institution_id=${INST}`, token);
  const classes = classesRes.json?.data || classesRes.json?.classes || [];
  console.log('Classes', classes.length, 'DRY_RUN', DRY_RUN);

  for (const [primaryKey, secondaryKey] of PAIRS) {
    const primary = matchClass(classes, primaryKey);
    const secondary = matchClass(classes, secondaryKey);
    const tpl = dinTemplate(primaryKey);
    console.log(`\nPair ${primaryKey}+${secondaryKey}:`, {
      primary: primary?.name,
      secondary: secondary?.name,
      dinSlots: tpl.map((s) => `d${s.day_of_week} ${s.start_time}-${s.end_time}`)
    });
    if (!primary || !secondary || !tpl.length) {
      console.log('  skip (missing class or template)');
      continue;
    }
    // Prefer applying full ABEF schedule via existing apply script for secondary Din alignment.
    console.log(
      `  → ${secondaryKey} Din saatlerini ${primaryKey} ile aynı yapın: apply-lgs-8abef-evening-schedule.mjs`
    );
    for (const slot of tpl) {
      const fields = lgs8DinSharedMeetingFields({
        subject: slot.subject,
        className: secondaryKey,
        dayOfWeek: slot.day_of_week,
        startTime: slot.start_time
      });
      console.log('  shared BBB key', fields);
    }
  }

  if (DRY_RUN) {
    console.log('\nDry-run. Programı uygulamak için:');
    console.log('  DRY_RUN=0 node scripts/apply-lgs-8abef-evening-schedule.mjs');
    console.log('  (8F Din artık 8B ile aynı Çarşamba 20:40; 8C Din 8A ile aynı)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
