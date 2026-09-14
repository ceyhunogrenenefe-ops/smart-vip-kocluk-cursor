/**
 * 9–10–11 + YKS (Yıldızlar) Etüt ve Deneme slot/oturumlarına ortak Lise Zoom yazar.
 * Akademik Merkez 9-11 / YKS etüt + Lise deneme ile aynı oda:
 *   https://us06web.zoom.us/j/3565095951?pwd=Rk56NGhXeEYrZkZOWEVVbG5pa0RjUT09
 *
 *   DRY_RUN=0 node scripts/apply-lise-911-yks-etut-deneme-zoom.mjs
 */
import {
  LISE_911_YKS_ZOOM_URL,
  isLiseEtutOrDenemeSubject,
  isLise911YksGrade
} from '../api/_lib/lise-911-yks-zoom.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const FORCE = process.env.FORCE !== '0' && process.env.FORCE !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 90));
const ZOOM = String(process.env.LISE_ZOOM_URL || LISE_911_YKS_ZOOM_URL).trim();
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.CONCURRENCY || 8)));

function hasExactZoom(row) {
  const m = String(row?.meeting_link || '').trim();
  const j = String(row?.join_link || '').trim();
  return m === ZOOM && (j === ZOOM || j === '' || j === m);
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
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

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function main() {
  console.log(`API=${API} DRY_RUN=${DRY_RUN} FORCE=${FORCE} ZOOM=${ZOOM}`);
  if (!ZOOM.includes('zoom.us') || !ZOOM.includes('3565095951')) {
    console.error('LISE_ZOOM_URL must be the 3565095951 Zoom URL');
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
    `/api/class-live-lessons?op=list-classes&institution_id=${INST}`,
    token
  );
  if (cStatus >= 400) {
    console.error('classes_failed', cStatus, cJson);
    process.exit(1);
  }

  const classes = (cJson.data || []).filter((c) =>
    isLise911YksGrade(c.grade || c.class_level, c.name)
  );
  console.log(
    'matched_classes',
    classes.map((c) => `${c.name} [${c.grade || c.class_level}]`).join(' | ') || '(none)'
  );
  if (!classes.length) {
    console.error('no_classes_matched');
    process.exit(2);
  }

  const today = ymd(new Date());
  const dateTo = addDays(today, DAYS_AHEAD);
  const summary = [];

  for (const cls of classes) {
    console.log(`\n=== ${cls.name} (${cls.grade || cls.class_level}) ===`);

    const { json: slotsJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=slots&class_id=${cls.id}&institution_id=${INST}`,
      token
    );
    const targetSlots = (slotsJson.data || []).filter((s) => isLiseEtutOrDenemeSubject(s.subject));
    console.log(`etut_deneme_slots=${targetSlots.length}`);

    let slotsUpdated = 0;
    let slotsFailed = 0;
    let slotsSkipped = 0;
    const slotResults = await mapPool(targetSlots, CONCURRENCY, async (slot) => {
      if (!FORCE && hasExactZoom(slot)) return 'skip';
      if (DRY_RUN) return 'ok';
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        kind: 'slot',
        id: slot.id,
        meeting_link: ZOOM
      });
      if (status >= 400) {
        console.error('slot_patch_failed', slot.id, status, json);
        return 'fail';
      }
      return 'ok';
    });
    for (const r of slotResults) {
      if (r === 'skip') slotsSkipped += 1;
      else if (r === 'fail') slotsFailed += 1;
      else slotsUpdated += 1;
    }

    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${cls.id}&institution_id=${INST}&from=${today}&to=${dateTo}&include_cancelled=1`,
      token
    );
    const targetSessions = (sessJson.data || []).filter(
      (s) => String(s.status) !== 'cancelled' && isLiseEtutOrDenemeSubject(s.subject)
    );
    console.log(`etut_deneme_sessions=${targetSessions.length}`);

    let sessionsUpdated = 0;
    let sessionsFailed = 0;
    let sessionsSkipped = 0;
    const sessResults = await mapPool(targetSessions, CONCURRENCY, async (sess) => {
      if (!FORCE && hasExactZoom(sess)) return 'skip';
      if (DRY_RUN) return 'ok';
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        id: sess.id,
        meeting_link: ZOOM,
        apply_scope: 'single'
      });
      if (status >= 400) {
        console.error('session_patch_failed', sess.id, status, json);
        return 'fail';
      }
      return 'ok';
    });
    for (const r of sessResults) {
      if (r === 'skip') sessionsSkipped += 1;
      else if (r === 'fail') sessionsFailed += 1;
      else sessionsUpdated += 1;
    }

    summary.push({
      name: cls.name,
      grade: cls.grade || cls.class_level,
      classId: cls.id,
      slots: targetSlots.length,
      slotsUpdated,
      slotsSkipped,
      slotsFailed,
      sessions: targetSessions.length,
      sessionsUpdated,
      sessionsSkipped,
      sessionsFailed
    });
  }

  console.log('\nSUMMARY');
  console.log(JSON.stringify(summary, null, 2));
  if (DRY_RUN) {
    console.log('\nDry-run. Uygula: DRY_RUN=0 node scripts/apply-lise-911-yks-etut-deneme-zoom.mjs');
  }
  if (summary.some((s) => s.slotsFailed || s.sessionsFailed)) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
