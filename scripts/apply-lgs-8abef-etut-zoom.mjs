/**
 * 8A/8B/8E/8F Etüt (17:00–17:40 + 17:50–18:30) BBB → ortak Zoom linki.
 *
 *   DRY_RUN=0 node scripts/apply-lgs-8abef-etut-zoom.mjs
 */
import { LGS_8ABEF_ETUT_ZOOM_URL, CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 60));
const ZOOM = String(process.env.ETUT_ZOOM_URL || LGS_8ABEF_ETUT_ZOOM_URL).trim();

const ETUT_STARTS = new Set(['17:00:00', '17:00', '17:50:00', '17:50']);

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
  const s = String(t || '');
  return s.length >= 5 ? s.slice(0, 5) : s;
}
function isEtutSubject(s) {
  return /et[uü]t/i.test(String(s || ''));
}
function isEtutEveningSlot(row) {
  if (!isEtutSubject(row.subject)) return false;
  const start = String(row.start_time || '');
  const startHm = hm(start);
  return ETUT_STARTS.has(start) || ETUT_STARTS.has(startHm) || startHm === '17:00' || startHm === '17:50';
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
  console.log(`API=${API} DRY_RUN=${DRY_RUN} ZOOM=${ZOOM}`);
  if (!ZOOM.includes('zoom.us')) {
    console.error('invalid_zoom_url');
    process.exit(1);
  }

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

  const { status: cStatus, json: cJson } = await api(
    'GET',
    `/api/class-live-lessons?scope=classes&institution_id=${INST}`,
    token
  );
  if (cStatus >= 400) {
    console.error('classes_failed', cStatus, cJson);
    process.exit(1);
  }
  const classes = cJson.data || [];
  const today = ymd(new Date());
  const dateTo = addDays(today, DAYS_AHEAD);
  const summary = [];

  for (const classKey of ['8A', '8B', '8E', '8F']) {
    const cls = matchClass(classes, classKey);
    if (!cls) {
      summary.push({ classKey, ok: false, error: 'class_not_found' });
      continue;
    }
    console.log(`\n=== ${classKey} ${cls.name} ===`);

    const { json: slotsJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=slots&class_id=${cls.id}&institution_id=${INST}`,
      token
    );
    const etutSlots = (slotsJson.data || []).filter(isEtutEveningSlot);
    console.log(`etut_slots=${etutSlots.length}`);

    let slotsUpdated = 0;
    let slotsFailed = 0;
    for (const slot of etutSlots) {
      if (String(slot.meeting_link || '').trim() === ZOOM) {
        slotsUpdated += 1;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  [dry] slot d${slot.day_of_week} ${hm(slot.start_time)} ${slot.meeting_link} → ZOOM`);
        slotsUpdated += 1;
        continue;
      }
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        kind: 'slot',
        id: slot.id,
        meeting_link: ZOOM
      });
      if (status >= 400) {
        console.error('slot_patch_failed', slot.id, status, json);
        slotsFailed += 1;
      } else {
        slotsUpdated += 1;
      }
    }

    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${cls.id}&institution_id=${INST}&from=${today}&to=${dateTo}&include_cancelled=1`,
      token
    );
    const etutSessions = (sessJson.data || []).filter(
      (s) => String(s.status) !== 'cancelled' && isEtutEveningSlot(s)
    );
    console.log(`etut_sessions=${etutSessions.length}`);

    let sessionsUpdated = 0;
    let sessionsFailed = 0;
    for (const sess of etutSessions) {
      if (String(sess.meeting_link || '').trim() === ZOOM) {
        sessionsUpdated += 1;
        continue;
      }
      if (DRY_RUN) {
        sessionsUpdated += 1;
        continue;
      }
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        id: sess.id,
        meeting_link: ZOOM,
        apply_scope: 'single'
      });
      if (status >= 400) {
        console.error('session_patch_failed', sess.id, status, json);
        sessionsFailed += 1;
      } else {
        sessionsUpdated += 1;
      }
    }

    summary.push({
      classKey,
      classId: cls.id,
      name: cls.name,
      slots: etutSlots.length,
      slotsUpdated,
      slotsFailed,
      sessions: etutSessions.length,
      sessionsUpdated,
      sessionsFailed
    });
  }

  console.log('\nSUMMARY');
  console.log(JSON.stringify(summary, null, 2));
  const failed = summary.some((s) => s.slotsFailed || s.sessionsFailed || s.error);
  if (DRY_RUN) console.log('\nDry-run. Uygulamak: DRY_RUN=0 node scripts/apply-lgs-8abef-etut-zoom.mjs');
  if (failed) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
