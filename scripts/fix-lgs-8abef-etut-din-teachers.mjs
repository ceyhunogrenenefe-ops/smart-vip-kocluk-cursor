/**
 * 8A/8B/8E/8F: Etüt → DOĞAN AKTÜRK, DİN KÜLTÜRÜ → Büşra Öztürk
 * (şablon + gelecek oturumlar)
 *
 *   DRY_RUN=0 node scripts/fix-lgs-8abef-etut-din-teachers.mjs
 */
import { CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 60));

const DOGAN = 'b39225b7-5705-4d38-956f-ab1cc55dc5af';
const BUSRA = '57b3de8c-2590-46ad-bd84-566be618b448';

function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function isEtut(s) {
  const u = String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  return u === 'ETÜT' || u.includes('ETÜT') || u.includes('ETUT');
}
function isDin(s) {
  const u = String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  // "DİN" (U+0130) — ASCII [iı] regex Türkçe büyük İ'de başarısız olur
  return u.includes('DİN') || /\bDIN\b/.test(u.replace(/İ/g, 'I'));
}
function targetTeacher(subject) {
  if (isEtut(subject)) return DOGAN;
  if (isDin(subject)) return BUSRA;
  return null;
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
  console.log(`API=${API} DRY_RUN=${DRY_RUN}`);
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

  for (const classKey of ['8A', '8B', '8E', '8F']) {
    const cls = matchClass(classes, classKey);
    if (!cls) {
      summary.push({ classKey, error: 'class_not_found' });
      continue;
    }
    console.log(`\n=== ${classKey} ${cls.name} ===`);

    const { json: slotsJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=slots&class_id=${cls.id}&institution_id=${INST}`,
      token
    );
    const slots = (slotsJson.data || []).filter((s) => targetTeacher(s.subject));
    let slotsOk = 0;
    let slotsFail = 0;
    for (const slot of slots) {
      const tid = targetTeacher(slot.subject);
      if (String(slot.teacher_id) === tid) {
        slotsOk += 1;
        continue;
      }
      console.log(
        `  slot d${slot.day_of_week} ${String(slot.start_time).slice(0, 5)} ${slot.subject}: ${slot.teacher_name} → ${tid}`
      );
      if (DRY_RUN) {
        slotsOk += 1;
        continue;
      }
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        kind: 'slot',
        id: slot.id,
        teacher_id: tid
      });
      if (status >= 400) {
        console.error('  slot_fail', status, json);
        slotsFail += 1;
      } else slotsOk += 1;
    }

    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${cls.id}&institution_id=${INST}&from=${today}&to=${dateTo}`,
      token
    );
    const sessions = (sessJson.data || []).filter(
      (s) => String(s.status) === 'scheduled' && targetTeacher(s.subject)
    );
    let sessOk = 0;
    let sessFail = 0;
    for (const sess of sessions) {
      const tid = targetTeacher(sess.subject);
      if (String(sess.teacher_id) === tid) {
        sessOk += 1;
        continue;
      }
      if (DRY_RUN) {
        sessOk += 1;
        continue;
      }
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        id: sess.id,
        teacher_id: tid,
        apply_scope: 'single'
      });
      if (status >= 400) {
        console.error('  sess_fail', sess.lesson_date, status, json);
        sessFail += 1;
      } else sessOk += 1;
    }

    summary.push({
      classKey,
      slots: slots.length,
      slotsOk,
      slotsFail,
      sessions: sessions.length,
      sessOk,
      sessFail
    });
  }

  console.log('\nSUMMARY', JSON.stringify(summary, null, 2));
  if (DRY_RUN) console.log('\nDry-run. Uygula: DRY_RUN=0 node scripts/fix-lgs-8abef-etut-din-teachers.mjs');
  if (summary.some((s) => s.slotsFail || s.sessFail || s.error)) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
