/**
 * LGS A/B/E/F örnek programını canlı 8A/8B/8E/8F (YAZ KAMPI) sınıflarına uygular.
 *
 * Kullanım:
 *   node scripts/apply-lgs-8abef-evening-schedule.mjs           # dry-run
 *   DRY_RUN=0 node scripts/apply-lgs-8abef-evening-schedule.mjs # uygula
 *
 * Auth: ADMIN_EMAIL + ADMIN_PASSWORD veya Authorization Bearer TOKEN
 * Varsayılan: admin@smartkocluk.com / Admin123!
 */
import { LGS_8ABEF_SCHEDULE, CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const INST =
  process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
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
  return d.toISOString().slice(0, 10);
}

function addDays(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function matchClass(classes, key) {
  const matchers = CLASS_NAME_MATCHERS[key] || [];
  const found = classes.find((c) => {
    const name = String(c.name || '').toLocaleUpperCase('tr-TR');
    return matchers.some((m) => name.includes(String(m).toLocaleUpperCase('tr-TR')));
  });
  return found || null;
}

/** Eski slotlardan ders→öğretmen tercihi */
function subjectTeacherMap(slots) {
  const counts = new Map();
  for (const s of slots || []) {
    const sub = String(s.subject || '').trim().toLocaleUpperCase('tr-TR');
    const tid = String(s.teacher_id || '').trim();
    if (!sub || !tid) continue;
    const key = `${sub}|${tid}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const best = new Map();
  for (const [key, n] of counts) {
    const [sub, tid] = key.split('|');
    const prev = best.get(sub);
    if (!prev || n > prev.n) best.set(sub, { tid, n });
  }
  return best;
}

function pickTeacher({ subject, classKey, classTeachers, prefMap, etutTeachers, denemeTeachers, dinOverrides }) {
  const sub = String(subject || '').trim().toLocaleUpperCase('tr-TR');
  if (sub === 'ETÜT' || sub.includes('ETUT')) return etutTeachers[classKey];
  if (sub.includes('DENEME')) return denemeTeachers[classKey];
  if (sub.includes('DİN') && dinOverrides[classKey]) return dinOverrides[classKey];

  const pref = prefMap.get(sub)?.tid;
  if (pref && classTeachers.includes(pref)) return pref;

  // yakın eşleşme: FEN BİLGİSİ ↔ FEN BİLİMLERİ
  for (const [k, v] of prefMap) {
    if (sub.includes('FEN') && k.includes('FEN') && classTeachers.includes(v.tid)) return v.tid;
    if (sub.includes('DİN') && k.includes('DİN') && classTeachers.includes(v.tid)) return v.tid;
    if (sub.includes('İNKILAP') && k.includes('İNKILAP') && classTeachers.includes(v.tid)) return v.tid;
  }
  return classTeachers[0] || null;
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
  const classes = cJson.data || [];

  const etutTeachers = {
    '8A': 'b39225b7-5705-4d38-956f-ab1cc55dc5af', // DOĞAN AKTÜRK
    '8B': 'b39225b7-5705-4d38-956f-ab1cc55dc5af',
    '8E': 'b39225b7-5705-4d38-956f-ab1cc55dc5af',
    '8F': 'b39225b7-5705-4d38-956f-ab1cc55dc5af'
  };
  const denemeTeachers = {
    '8A': '0696c045-c341-4bfe-b65c-5fa93e93f968',
    '8B': 'f9241cc1-89dc-4e19-b42f-8785ef6fa15a',
    '8E': 'db8395cf-eb36-436c-bdc0-9f9be5e3b066',
    '8F': 'b39225b7-5705-4d38-956f-ab1cc55dc5af'
  };
  // DİN KÜLTÜRÜ — tüm sınıflarda Büşra Öztürk (birleşik ders; aynı saat serbest)
  const DIN_BUSRA = '57b3de8c-2590-46ad-bd84-566be618b448';
  const dinOverrides = {
    '8A': DIN_BUSRA,
    '8B': DIN_BUSRA,
    '8E': DIN_BUSRA,
    '8F': DIN_BUSRA
  };

  const today = ymd(new Date());
  const dateTo = addDays(today, DAYS_AHEAD);
  const summary = [];

  for (const classKey of ['8A', '8B', '8E', '8F']) {
    const cls = matchClass(classes, classKey);
    if (!cls) {
      console.error(`SKIP ${classKey}: class not found`);
      summary.push({ classKey, ok: false, error: 'class_not_found' });
      continue;
    }
    const classId = cls.id;
    const classTeachers = Array.isArray(cls.teacher_ids) ? cls.teacher_ids.map(String) : [];
    console.log(`\n=== ${classKey} ${cls.name} (${classId}) teachers=${classTeachers.length} ===`);

    const { json: slotsJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=slots&class_id=${classId}&institution_id=${INST}`,
      token
    );
    const oldSlots = slotsJson.data || [];
    const prefMap = subjectTeacherMap(oldSlots);

    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${classId}&institution_id=${INST}&from=${today}&to=${dateTo}`,
      token
    );
    const futureSessions = (sessJson.data || []).filter((s) => String(s.status) === 'scheduled');

    const schedule = LGS_8ABEF_SCHEDULE[classKey] || [];
    console.log(`old_slots=${oldSlots.length} future_sessions=${futureSessions.length} new_slots=${schedule.length}`);

    if (DRY_RUN) {
      for (const row of schedule) {
        const tid = pickTeacher({
          subject: row.subject,
          classKey,
          classTeachers,
          prefMap,
          etutTeachers,
          denemeTeachers,
          dinOverrides
        });
        console.log(
          `  plan d${row.day_of_week} ${row.start_time}-${row.end_time} ${row.subject} → ${tid || 'NO_TEACHER'}`
        );
      }
      summary.push({ classKey, ok: true, dry_run: true, new_slots: schedule.length });
      continue;
    }

    // 1) Eski gelecek oturumları iptal
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

    // 3) Yeni şablonları oluştur
    let created = 0;
    const errors = [];
    for (const row of schedule) {
      let teacherId = pickTeacher({
        subject: row.subject,
        classKey,
        classTeachers,
        prefMap,
        etutTeachers,
        denemeTeachers,
        dinOverrides
      });
      if (!teacherId) {
        errors.push({ ...row, error: 'no_teacher' });
        continue;
      }

      const alts = [teacherId, ...classTeachers.filter((t) => t !== teacherId)];
      let ok = false;
      let lastErr = null;
      for (const tid of alts) {
        const { status, json } = await api('POST', '/api/class-live-lessons?op=create-slot', token, {
          class_id: classId,
          institution_id: INST,
          day_of_week: row.day_of_week,
          start_time: row.start_time,
          end_time: row.end_time,
          subject: row.subject,
          teacher_id: tid,
          duration_minutes: row.duration_minutes,
          ...(row.meeting_link ? { meeting_link: row.meeting_link } : {})
        });
        if (status < 400) {
          created += 1;
          ok = true;
          if (tid !== teacherId) console.log(`  alt teacher ${row.subject} d${row.day_of_week} ${row.start_time} → ${tid}`);
          break;
        }
        lastErr = { status, json, tid };
        if (json?.code !== 'teacher_time_conflict') break;
      }
      if (!ok) {
        console.error('create_slot_failed', row, lastErr);
        errors.push({ ...row, error: lastErr });
      }
    }

    // 4) Tarihli oturumları üret (iptal edilenler engellemesin; gerekirse purge)
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

    summary.push({
      classKey,
      classId,
      name: cls.name,
      created,
      errors: errors.length,
      ensure: eJson
    });
  }

  console.log('\nSUMMARY');
  console.log(JSON.stringify(summary, null, 2));
  if (DRY_RUN) console.log('\nDry-run. Uygulamak için: DRY_RUN=0 node scripts/apply-lgs-8abef-evening-schedule.mjs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
