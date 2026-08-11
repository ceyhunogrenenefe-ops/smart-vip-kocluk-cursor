/**
 * YILDIZLAR YKS GRUBU akşam programını (Salı–Cuma) uygular.
 * BBB: meeting_link verilmez → bbb:auto; ensure-sessions-range ardışık oda + kayıt hazırlar.
 *
 *   node scripts/apply-yks-yildizlar-evening-schedule.mjs           # dry-run
 *   DRY_RUN=0 node scripts/apply-yks-yildizlar-evening-schedule.mjs # uygula
 */
import {
  YKS_YILDIZLAR_CLASS_MATCHERS,
  YKS_YILDIZLAR_EVENING_SCHEDULE,
  YKS_YILDIZLAR_TEACHERS
} from '../api/_lib/yks-yildizlar-schedule.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 60));

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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDaysYmd(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function matchClass(classes) {
  return (
    classes.find((c) => {
      const name = String(c.name || '').toLocaleUpperCase('tr-TR');
      return YKS_YILDIZLAR_CLASS_MATCHERS.some((m) => name.includes(String(m).toLocaleUpperCase('tr-TR')));
    }) || null
  );
}

function resolveTeacherId(teacherKey) {
  return YKS_YILDIZLAR_TEACHERS[teacherKey] || null;
}

async function main() {
  console.log(`API=${API} DRY_RUN=${DRY_RUN} INST=${INST}`);

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
  const cls = matchClass(cJson.data || []);
  if (!cls) {
    console.error('class_not_found', YKS_YILDIZLAR_CLASS_MATCHERS);
    process.exit(1);
  }
  const classId = cls.id;
  console.log(`\n=== ${cls.name} (${classId}) ===`);

  const schedule = YKS_YILDIZLAR_EVENING_SCHEDULE;
  const today = ymd(new Date());
  const dateTo = addDaysYmd(today, DAYS_AHEAD);

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

  console.log(`old_slots=${oldSlots.length} future_sessions=${futureSessions.length} new_slots=${schedule.length}`);

  for (const row of schedule) {
    const tid = resolveTeacherId(row.teacher_key);
    console.log(
      `  plan d${row.day_of_week} ${row.start_time}-${row.end_time} ${row.subject} → ${row.teacher_key} ${tid || 'NO_TEACHER'}`
    );
  }

  if (DRY_RUN) {
    console.log('\nDry-run. Uygulamak için: DRY_RUN=0 node scripts/apply-yks-yildizlar-evening-schedule.mjs');
    return;
  }

  // 1) Gelecek planlı oturumları iptal
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

  // 2) Eski haftalık şablonları sil
  for (const slot of oldSlots) {
    const { status, json } = await api(
      'DELETE',
      `/api/class-live-lessons?slot_id=${encodeURIComponent(slot.id)}`,
      token
    );
    if (status >= 400) console.warn('delete_slot', slot.id, status, json);
  }

  // 3) Yeni şablonlar (BBB → meeting_link yok = bbb:auto)
  let created = 0;
  const errors = [];
  for (const row of schedule) {
    const teacherId = resolveTeacherId(row.teacher_key);
    if (!teacherId) {
      errors.push({ ...row, error: 'no_teacher' });
      continue;
    }
    const { status, json } = await api('POST', '/api/class-live-lessons?op=create-slot', token, {
      class_id: classId,
      institution_id: INST,
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
      subject: row.subject,
      teacher_id: teacherId,
      duration_minutes: row.duration_minutes
    });
    if (status < 400) {
      created += 1;
      const link = json?.data?.meeting_link || json?.meeting_link || '';
      console.log(
        `  + d${row.day_of_week} ${String(row.start_time).slice(0, 5)} ${row.subject} link=${String(link).slice(0, 48)}`
      );
    } else {
      console.error('create_slot_failed', row, status, json);
      errors.push({ ...row, error: { status, json } });
    }
  }

  // 4) Tarihli oturum + ardışık BBB hizalama
  const { status: eStatus, json: eJson } = await api(
    'POST',
    '/api/class-live-lessons?op=ensure-sessions-range',
    token,
    {
      class_id: classId,
      date_from: today,
      date_to: dateTo,
      institution_id: INST,
      purge_cancelled: true,
      ignore_cancelled: true
    }
  );
  console.log('ensure-sessions', eStatus, eJson);

  // 5) Doğrulama: bugünden itibaren örnek oturumlar
  const { json: verifyJson } = await api(
    'GET',
    `/api/class-live-lessons?scope=sessions&class_id=${classId}&institution_id=${INST}&from=${today}&to=${addDaysYmd(today, 7)}&materialize=1`,
    token
  );
  const upcoming = (verifyJson.data || [])
    .filter((s) => String(s.status) === 'scheduled')
    .slice(0, 20);
  console.log('\nVERIFY upcoming (7g):');
  for (const s of upcoming) {
    console.log({
      date: s.lesson_date,
      t: String(s.start_time || '').slice(0, 5),
      sub: s.subject,
      mid: s.bbb_meeting_id || null,
      link: String(s.meeting_link || '').slice(0, 56),
      teacher: s.teacher_name || s.teacher_id
    });
  }

  console.log(
    '\nSUMMARY',
    JSON.stringify(
      { classId, name: cls.name, created, errors: errors.length, ensure: eJson, upcoming: upcoming.length },
      null,
      2
    )
  );
  if (errors.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
