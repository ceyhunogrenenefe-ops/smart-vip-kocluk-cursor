/**
 * Sadece 8E + 8F Çarşamba akşam derslerini (Etüt hariç) günceller.
 * Diğer günler, Etüt, Zoom, Din öğretmeni vb. dokunulmaz.
 *
 *   node scripts/apply-lgs-ef-wednesday-only.mjs           # dry-run
 *   DRY_RUN=0 node scripts/apply-lgs-ef-wednesday-only.mjs # uygula
 */
import { LGS_8ABEF_SCHEDULE, CLASS_NAME_MATCHERS } from '../api/_lib/lgs-8abef-schedule.js';

const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 90));
const WED = 3;

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
  return String(t || '').slice(0, 5);
}
function normSub(s) {
  return String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/FEN BİLGİSİ/g, 'FEN BİLİMLERİ');
}
function isEtut(s) {
  const u = normSub(s);
  return u === 'ETÜT' || u.includes('ETÜT') || u.includes('ETUT');
}
function isoDowMon1(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const js = dt.getUTCDay();
  return js === 0 ? 7 : js;
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

/** Branş → en sık öğretmen (Etüt/Din hariç tercihen diğer günlerden) */
function subjectTeacherMap(slots) {
  const counts = new Map();
  for (const s of slots || []) {
    if (isEtut(s.subject)) continue;
    const sub = normSub(s.subject);
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

function pickTeacher(subject, prefMap, classTeachers) {
  const sub = normSub(subject);
  const pref = prefMap.get(sub)?.tid;
  if (pref) return pref;
  for (const [k, v] of prefMap) {
    if (sub.includes('FEN') && k.includes('FEN')) return v.tid;
    if (sub.includes('İNKILAP') && k.includes('İNKILAP')) return v.tid;
    if (sub.includes('İNGİLİZ') && k.includes('İNGİLİZ')) return v.tid;
  }
  return classTeachers[0] || null;
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

async function main() {
  console.log(`API=${API} DRY_RUN=${DRY_RUN} target=8E+8F Wednesday lessons only`);
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

  for (const classKey of ['8E', '8F']) {
    const cls = matchClass(classes, classKey);
    if (!cls) {
      summary.push({ classKey, error: 'class_not_found' });
      continue;
    }
    const classTeachers = Array.isArray(cls.teacher_ids) ? cls.teacher_ids.map(String) : [];
    const expectedWed = (LGS_8ABEF_SCHEDULE[classKey] || []).filter(
      (s) => Number(s.day_of_week) === WED && !isEtut(s.subject)
    );
    console.log(`\n=== ${classKey} ${cls.name} ===`);
    console.log(
      'target Wed lessons:',
      expectedWed.map((s) => `${hm(s.start_time)}-${hm(s.end_time)} ${s.subject}`).join(' | ')
    );

    const { json: slotsJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=slots&class_id=${cls.id}&institution_id=${INST}`,
      token
    );
    const slots = slotsJson.data || [];
    const prefMap = subjectTeacherMap(slots);
    const wedLessonSlots = slots.filter((s) => Number(s.day_of_week) === WED && !isEtut(s.subject));
    const wedEtutSlots = slots.filter((s) => Number(s.day_of_week) === WED && isEtut(s.subject));
    console.log(
      'current Wed lessons:',
      wedLessonSlots.map((s) => `${hm(s.start_time)} ${s.subject} (${s.teacher_name || s.teacher_id})`).join(' | ')
    );
    console.log('Wed Etüt untouched:', wedEtutSlots.length);

    // Eşleştir: aynı start_time üzerinden PATCH subject+teacher
    const byStart = new Map(wedLessonSlots.map((s) => [hm(s.start_time), s]));
    const slotPatches = [];
    for (const want of expectedWed) {
      const start = hm(want.start_time);
      const existing = byStart.get(start);
      const teacherId = pickTeacher(want.subject, prefMap, classTeachers);
      if (!existing) {
        slotPatches.push({ action: 'create', want, teacherId });
        continue;
      }
      const needSubject = normSub(existing.subject) !== normSub(want.subject);
      const needTeacher = teacherId && String(existing.teacher_id) !== String(teacherId);
      if (needSubject || needTeacher) {
        slotPatches.push({
          action: 'patch',
          id: existing.id,
          start: start,
          from: `${normSub(existing.subject)}/${existing.teacher_name || existing.teacher_id}`,
          to: `${normSub(want.subject)}/${teacherId}`,
          subject: want.subject,
          teacher_id: teacherId,
          end_time: want.end_time,
          needTeacher
        });
      } else {
        slotPatches.push({ action: 'ok', id: existing.id, start, subject: want.subject });
      }
      byStart.delete(start);
    }
    // Fazla Çarşamba ders slotu (olmamalı) — silme; sadece rapor
    for (const [, extra] of byStart) {
      slotPatches.push({
        action: 'extra_slot',
        id: extra.id,
        subject: extra.subject,
        start: hm(extra.start_time)
      });
    }

    for (const p of slotPatches) console.log('  slot', p);

    // Önce yalnızca branş (öğretmen yok) — İnkılap öğretmeni 8E↔8F saati değişiminde çakışmasın
    if (!DRY_RUN) {
      for (const p of slotPatches) {
        if (p.action === 'patch') {
          const body = { kind: 'slot', id: p.id, subject: p.subject };
          if (p.end_time) body.end_time = p.end_time;
          const { status, json } = await api('PATCH', '/api/class-live-lessons', token, body);
          if (status >= 400) console.error('  slot_subject_fail', status, json);
        } else if (p.action === 'create') {
          const { status, json } = await api('POST', '/api/class-live-lessons?op=create-slot', token, {
            class_id: cls.id,
            institution_id: INST,
            day_of_week: WED,
            start_time: p.want.start_time,
            end_time: p.want.end_time,
            subject: p.want.subject,
            teacher_id: p.teacherId,
            duration_minutes: p.want.duration_minutes
          });
          if (status >= 400) console.error('  slot_create_fail', status, json);
        }
      }
    }

    summary.push({
      classKey,
      classId: cls.id,
      classTeachers,
      prefMap: Object.fromEntries([...prefMap.entries()].map(([k, v]) => [k, v.tid])),
      slotPatches,
      expectedWed
    });
  }

  // Öğretmen PATCH sırası (İnkılap 8E/8F çapraz saat):
  // 1) 8E 19:00 → İngilizce  2) 8F 20:40 → Fen  3) 8E 20:40 → İnkılap  4) 8F 19:00 → İnkılap
  const teacherOrder = [
    { classKey: '8E', start: '19:00' },
    { classKey: '8F', start: '20:40' },
    { classKey: '8E', start: '20:40' },
    { classKey: '8F', start: '19:00' }
  ];
  console.log('\n--- teacher slot patches (ordered) ---');
  for (const step of teacherOrder) {
    const row = summary.find((s) => s.classKey === step.classKey);
    if (!row) continue;
    const target = (row.slotPatches || []).find(
      (x) => x.action === 'patch' && x.needTeacher && x.start === step.start && x.teacher_id
    );
    if (!target?.id) {
      console.log(`  skip teacher ${step.classKey} ${step.start}`);
      continue;
    }
    console.log(`  teacher ${step.classKey} ${step.start} → ${target.subject} ${target.teacher_id}`);
    if (DRY_RUN) continue;
    const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
      kind: 'slot',
      id: target.id,
      teacher_id: target.teacher_id,
      subject: target.subject
    });
    if (status >= 400) console.error('  slot_teacher_fail', status, json);
  }

  // Oturumlar: önce branş (tüm 8E+8F), sonra öğretmenler güvenli sırada
  console.log('\n--- wednesday session subjects ---');
  const sessionMeta = [];
  for (const classKey of ['8E', '8F']) {
    const row = summary.find((s) => s.classKey === classKey);
    const cls = matchClass(classes, classKey);
    if (!cls || !row) continue;
    const prefMap = new Map(
      Object.entries(row.prefMap || {}).map(([k, tid]) => [k, { tid, n: 1 }])
    );
    const classTeachers = row.classTeachers || [];
    const expectedWed = row.expectedWed || [];
    const wantByStart = new Map(expectedWed.map((s) => [hm(s.start_time), s]));

    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${cls.id}&institution_id=${INST}&from=${today}&to=${dateTo}`,
      token
    );
    const sessions = (sessJson.data || []).filter(
      (s) =>
        String(s.status) === 'scheduled' &&
        isoDowMon1(String(s.lesson_date).slice(0, 10)) === WED &&
        !isEtut(s.subject)
    );

    let subjectPatched = 0;
    let subjectFail = 0;
    for (const s of sessions) {
      const want = wantByStart.get(hm(s.start_time));
      if (!want) continue;
      if (normSub(s.subject) === normSub(want.subject)) continue;
      console.log(`  ${classKey} ${s.lesson_date} ${hm(s.start_time)} subject ${normSub(s.subject)} → ${normSub(want.subject)}`);
      if (DRY_RUN) {
        subjectPatched += 1;
        continue;
      }
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        kind: 'session',
        id: s.id,
        subject: want.subject
        // end_time gönderme: conflict gate tetiklenir, öğretmen henüz güncellenmemiş olabilir
      });
      if (status >= 400) {
        console.error('  sess_subject_fail', status, json);
        subjectFail += 1;
      } else subjectPatched += 1;
    }

    sessionMeta.push({ classKey, classId: cls.id, prefMap, classTeachers, wantByStart, subjectPatched, subjectFail });
  }

  console.log('\n--- wednesday session teachers (ordered) ---');
  // Aynı tarih için: 8E 19:00 → 8F 20:40 → 8E 20:40 → 8F 19:00
  const allWedDates = new Set();
  const sessionsByClass = new Map();
  for (const meta of sessionMeta) {
    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${meta.classId}&institution_id=${INST}&from=${today}&to=${dateTo}`,
      token
    );
    const sessions = (sessJson.data || []).filter(
      (s) =>
        String(s.status) === 'scheduled' &&
        isoDowMon1(String(s.lesson_date).slice(0, 10)) === WED &&
        !isEtut(s.subject)
    );
    sessionsByClass.set(meta.classKey, sessions);
    for (const s of sessions) allWedDates.add(String(s.lesson_date).slice(0, 10));
  }

  let teacherPatched = 0;
  let teacherFail = 0;
  let teacherOk = 0;
  for (const d of [...allWedDates].sort()) {
    for (const step of teacherOrder) {
      const meta = sessionMeta.find((m) => m.classKey === step.classKey);
      if (!meta) continue;
      const list = sessionsByClass.get(step.classKey) || [];
      const s = list.find((x) => String(x.lesson_date).slice(0, 10) === d && hm(x.start_time) === step.start);
      if (!s) continue;
      const want = meta.wantByStart.get(step.start);
      if (!want) continue;
      const teacherId = pickTeacher(want.subject, meta.prefMap, meta.classTeachers);
      if (!teacherId || String(s.teacher_id) === String(teacherId)) {
        teacherOk += 1;
        continue;
      }
      console.log(`  ${step.classKey} ${d} ${step.start} teacher → ${teacherId.slice(0, 8)} (${normSub(want.subject)})`);
      if (DRY_RUN) {
        teacherPatched += 1;
        continue;
      }
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        kind: 'session',
        id: s.id,
        teacher_id: teacherId,
        subject: want.subject
      });
      if (status >= 400) {
        console.error('  sess_teacher_fail', status, json);
        teacherFail += 1;
      } else {
        teacherPatched += 1;
        s.teacher_id = teacherId;
        s.subject = want.subject;
      }
    }
  }

  for (const meta of sessionMeta) {
    const row = summary.find((s) => s.classKey === meta.classKey);
    if (!row) continue;
    row.subjectPatched = meta.subjectPatched;
    row.subjectFail = meta.subjectFail;
    delete row.slotPatches;
    delete row.expectedWed;
    delete row.prefMap;
    delete row.classTeachers;
  }

  console.log('\nSUMMARY', JSON.stringify({ summary, teacherPatched, teacherFail, teacherOk }, null, 2));
  if (DRY_RUN) console.log('\nDry-run. Uygulamak: DRY_RUN=0 node scripts/apply-lgs-ef-wednesday-only.mjs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
