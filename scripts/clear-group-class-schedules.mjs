/**
 * 5A / 6A / 6B / 7A / 8A / 8B / 8E / 8F canlı grup ders programlarını boşaltır.
 * Öğrenci ve öğretmen üyelikleri korunur — yalnızca haftalık slot + gelecek scheduled oturumlar.
 *
 * Kullanım:
 *   node scripts/clear-group-class-schedules.mjs              # dry-run
 *   DRY_RUN=0 node scripts/clear-group-class-schedules.mjs   # uygula
 */
import {
  CLEAR_SCHEDULE_CLASS_KEYS,
  canonicalizeClearClassKey,
  matchClearTargetClass
} from '../api/_lib/clear-group-class-targets.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 90));

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

function ymd(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d instanceof Date ? d : new Date());
}

function addDays(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

async function main() {
  console.log(`API=${API} DRY_RUN=${DRY_RUN} INST=${INST}`);
  console.log(`targets=${CLEAR_SCHEDULE_CLASS_KEYS.join(', ')}`);

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

  // Yeni op varsa tek istekte (deploy sonrası)
  const bulk = await api('POST', '/api/class-live-lessons?op=clear-weekly-schedule', token, {
    institution_id: INST,
    class_keys: [...CLEAR_SCHEDULE_CLASS_KEYS],
    dry_run: DRY_RUN
  });
  if (bulk.status < 400 && bulk.json?.results) {
    console.log(JSON.stringify(bulk.json, null, 2));
    if (DRY_RUN) console.log('\nDry-run. Uygulamak için: DRY_RUN=0 node scripts/clear-group-class-schedules.mjs');
    return;
  }
  console.warn('bulk_op_unavailable_fallback', bulk.status, bulk.json?.error || bulk.json);

  // Fallback: mevcut slot/session DELETE API
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

  for (const key of CLEAR_SCHEDULE_CLASS_KEYS) {
    const matched = matchClearTargetClass(classes, key);
    if (!matched) {
      console.error(`SKIP ${key}: class not found`);
      summary.push({ key, ok: false, error: 'class_not_found' });
      continue;
    }
    const cls = classes.find((c) => String(c.id) === matched.id) || matched;
    const classId = matched.id;

    const { json: slotsJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=slots&class_id=${classId}&institution_id=${INST}`,
      token
    );
    const oldSlots = slotsJson.data || [];

    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${classId}&institution_id=${INST}&from=${today}&to=${dateTo}`,
      token
    );
    const futureSessions = (sessJson.data || []).filter((s) => String(s.status) === 'scheduled');

    console.log(
      `\n=== ${key} ${matched.name} (${classId}) canon=${canonicalizeClearClassKey(matched.name)} ===`
    );
    console.log(
      `slots=${oldSlots.length} future_scheduled=${futureSessions.length} teachers=${
        Array.isArray(cls.teacher_ids) ? cls.teacher_ids.length : '?'
      }`
    );

    if (DRY_RUN) {
      summary.push({
        key,
        ok: true,
        dry_run: true,
        class_id: classId,
        name: matched.name,
        slots: oldSlots.length,
        future_scheduled: futureSessions.length
      });
      continue;
    }

    for (let i = 0; i < futureSessions.length; i += 50) {
      const chunk = futureSessions.slice(i, i + 50);
      const ids = chunk.map((s) => s.id).join(',');
      const { status, json } = await api(
        'DELETE',
        `/api/class-live-lessons?session_ids=${encodeURIComponent(ids)}`,
        token
      );
      if (status >= 400) console.warn('cancel_sessions', status, json);
      else console.log('cancelled', json.cancelled_count ?? chunk.length);
    }

    let deleted = 0;
    for (const slot of oldSlots) {
      const { status, json } = await api(
        'DELETE',
        `/api/class-live-lessons?slot_id=${encodeURIComponent(slot.id)}`,
        token
      );
      if (status >= 400) console.warn('delete_slot', slot.id, status, json);
      else deleted += 1;
    }

    summary.push({
      key,
      ok: true,
      class_id: classId,
      name: matched.name,
      slots_deleted: deleted,
      sessions_cancelled: futureSessions.length,
      members_untouched: true
    });
  }

  console.log('\nSUMMARY');
  console.log(JSON.stringify(summary, null, 2));
  if (DRY_RUN) console.log('\nDry-run. Uygulamak için: DRY_RUN=0 node scripts/clear-group-class-schedules.mjs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
