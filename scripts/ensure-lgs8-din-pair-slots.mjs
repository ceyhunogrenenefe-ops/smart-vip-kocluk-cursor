/**
 * 8C Perşembe 19:50 Din (8A ile ortak link) ve 8F Cuma 20:40 Din (8B ile ortak)
 * haftalık slot + tekrarlayan oturumları oluşturur / hizalar.
 *
 *   node scripts/ensure-lgs8-din-pair-slots.mjs           # dry-run
 *   DRY_RUN=0 node scripts/ensure-lgs8-din-pair-slots.mjs
 */
import { CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';
import { isDinKulturuSubject as isDinSubject } from '../api/_lib/lgs8-din-shared-bbb.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 90));

/** Excel: 8A+8C Perşembe 19:50, 8B+8F Cuma 20:40 */
const PAIRS = [
  {
    primary: '8A',
    secondary: '8C',
    day_of_week: 4,
    start_time: '19:50',
    end_time: '20:30',
    subject: 'DİN KÜLTÜRÜ'
  },
  {
    primary: '8B',
    secondary: '8F',
    day_of_week: 5,
    start_time: '20:40',
    end_time: '21:20',
    subject: 'DİN KÜLTÜRÜ'
  }
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

function hhmm(t) {
  return String(t || '').slice(0, 5);
}

function findDinSlot(slots, dayOfWeek, startTime) {
  return (slots || []).find(
    (s) =>
      Number(s.day_of_week) === Number(dayOfWeek) &&
      hhmm(s.start_time) === hhmm(startTime) &&
      isDinSubject(s.subject)
  );
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function listSlots(token, classId) {
  const { status, json } = await api(
    'GET',
    `/api/class-live-lessons?scope=slots&class_id=${classId}&institution_id=${INST}`,
    token
  );
  if (status >= 400) throw new Error(`slots ${classId} ${status} ${JSON.stringify(json)}`);
  return json.data || [];
}

async function ensureSessions(token, classId) {
  const from = ymd(new Date());
  const toDate = new Date();
  toDate.setUTCDate(toDate.getUTCDate() + DAYS_AHEAD);
  const to = ymd(toDate);
  return api('POST', '/api/class-live-lessons?op=ensure-sessions-range', token, {
    class_id: classId,
    institution_id: INST,
    from,
    to
  });
}

async function main() {
  console.log(`API=${API} DRY_RUN=${DRY_RUN} DAYS_AHEAD=${DAYS_AHEAD}`);
  const login = await api('POST', '/api/auth-login', null, { email: EMAIL, password: PASSWORD });
  const token = login.json?.token;
  if (!token) {
    console.error('login_failed', login.status, login.json);
    process.exit(1);
  }

  const classesRes = await api(
    'GET',
    `/api/class-live-lessons?op=list-classes&institution_id=${INST}`,
    token
  );
  const classes = classesRes.json?.data || classesRes.json?.classes || [];
  console.log('classes', classes.length);

  for (const pair of PAIRS) {
    const primary = matchClass(classes, pair.primary);
    const secondary = matchClass(classes, pair.secondary);
    console.log(`\n=== ${pair.primary}+${pair.secondary} d${pair.day_of_week} ${pair.start_time} ===`);
    console.log('  primary', primary?.name, primary?.id);
    console.log('  secondary', secondary?.name, secondary?.id);
    if (!primary?.id || !secondary?.id) {
      console.log('  skip: class missing');
      continue;
    }

    const primarySlots = await listSlots(token, primary.id);
    const secondarySlots = await listSlots(token, secondary.id);
    const src = findDinSlot(primarySlots, pair.day_of_week, pair.start_time);
    const dst = findDinSlot(secondarySlots, pair.day_of_week, pair.start_time);
    console.log('  primary din', src ? src.id : 'MISSING', src?.meeting_link?.slice?.(0, 60));
    console.log('  secondary din', dst ? dst.id : 'MISSING');

    if (!src) {
      console.log('  skip: primary Din slot missing — create primary first');
      continue;
    }

    if (!dst) {
      const body = {
        class_id: secondary.id,
        institution_id: INST,
        day_of_week: pair.day_of_week,
        start_time: pair.start_time,
        end_time: pair.end_time,
        subject: pair.subject,
        teacher_id: src.teacher_id,
        duration_minutes: 40,
        ...(src.meeting_link ? { meeting_link: src.meeting_link } : {})
      };
      if (DRY_RUN) {
        console.log('  dry-run create-slot', body);
      } else {
        const created = await api('POST', '/api/class-live-lessons?op=create-slot', token, body);
        console.log('  create-slot', created.status, created.json?.data?.id || created.json);
        if (created.status < 400 && created.json?.data?.id && src.meeting_link) {
          const patched = await api('PATCH', '/api/class-live-lessons', token, {
            kind: 'slot',
            id: created.json.data.id,
            meeting_link: src.meeting_link,
            meeting_link_moderator: src.meeting_link_moderator || null
          });
          console.log('  patch shared link', patched.status);
        }
      }
    } else if (src.meeting_link && dst.meeting_link !== src.meeting_link) {
      if (DRY_RUN) {
        console.log('  dry-run patch secondary meeting_link → primary');
      } else {
        const patched = await api('PATCH', '/api/class-live-lessons', token, {
          kind: 'slot',
          id: dst.id,
          meeting_link: src.meeting_link,
          meeting_link_moderator: src.meeting_link_moderator || null
        });
        console.log('  patch secondary link', patched.status);
      }
    } else {
      console.log('  secondary slot ok');
    }

    for (const cls of [primary, secondary]) {
      if (DRY_RUN) {
        console.log('  dry-run ensure-sessions', cls.name);
        continue;
      }
      const ens = await ensureSessions(token, cls.id);
      console.log('  ensure', cls.name, ens.status, {
        created: ens.json?.created,
        already_exists: ens.json?.already_exists,
        combined: ens.json?.combined_bbb_aligned
      });
    }
  }

  if (DRY_RUN) {
    console.log('\nDry-run. Uygulamak için: DRY_RUN=0 node scripts/ensure-lgs8-din-pair-slots.mjs');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
