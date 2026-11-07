/**
 * Junior VIP — üç panel (öğrenci / koç / öğretmen) kapsam, bağlam ve yetki testleri.
 * Veritabanı taklit edilir; OpenAI anahtarı yokken yerel niyet motoru kullanılır.
 * Çalıştırma: node --experimental-test-module-mocks --test handlers/junior-vip.test.js
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

delete process.env.OPENAI_API_KEY;
delete process.env.OPEN_API_KEY;

const INST = 'inst-1';
const C1 = 'coach-1';
const C2 = 'coach-2';
const S1 = 'stu-1';
const S2 = 'stu-2';
const S_OTHER = 'stu-other';
const T1 = 'u-teacher';
const CLASS_A = 'class-a';
const CLASS_B = 'class-b';

const today = new Date().toISOString().slice(0, 10);

const DB = {
  users: [
    { id: 'u-coach', role: 'coach', roles: ['coach'], name: 'Nadide Koç', email: 'c@x.com', institution_id: INST },
    { id: T1, role: 'teacher', roles: ['teacher'], name: 'Ahmet Hoca', email: 't@x.com', institution_id: INST },
    { id: 'u-stu', role: 'student', roles: ['student'], name: 'Ayşe', email: 's@x.com', institution_id: INST }
  ],
  coaches: [
    { id: C1, name: 'Nadide Koç', email: 'c@x.com', user_id: 'u-coach', institution_id: INST },
    { id: C2, name: 'Başka Koç', email: 'o@x.com', user_id: 'u-other', institution_id: INST }
  ],
  students: [
    { id: S1, name: 'Ayşe Yılmaz', coach_id: C1, institution_id: INST, class_level: '7', group_name: 'A' },
    { id: S2, name: 'Mehmet Kaya', coach_id: C1, institution_id: INST, class_level: '8', group_name: 'B' },
    { id: S_OTHER, name: 'Gizli Öğrenci', coach_id: C2, institution_id: INST, class_level: '8', group_name: 'C' }
  ],
  weekly_entries: [
    { id: 'e1', student_id: S1, date: today, subject: 'Matematik', topic: 'Kesirler', solved_questions: 30, correct: 25, wrong: 5, blank: 0 },
    { id: 'e2', student_id: S_OTHER, date: today, subject: 'Fen', topic: 'Hücre', solved_questions: 99, correct: 0, wrong: 0, blank: 0 }
  ],
  weekly_planner_entries: [],
  meetings: [
    { id: 'm1', coach_id: C1, student_id: S2, title: 'Veli görüşmesi', start_time: `${today}T14:30:00Z`, status: 'planned' },
    { id: 'm2', coach_id: C2, student_id: S_OTHER, title: 'Gizli görüşme', start_time: `${today}T10:00:00Z`, status: 'planned' }
  ],
  classes: [
    { id: CLASS_A, name: '8-A LGS', institution_id: INST },
    { id: CLASS_B, name: 'Başka sınıf', institution_id: INST }
  ],
  class_teachers: [{ class_id: CLASS_A, teacher_id: T1 }],
  class_students: [{ class_id: CLASS_A, student_id: S2 }, { class_id: CLASS_B, student_id: S_OTHER }],
  class_sessions: [
    { id: 'cs1', class_id: CLASS_A, teacher_id: T1, subject: 'Matematik', lesson_date: today, start_time: '19:00:00', end_time: '19:40:00', status: 'scheduled' },
    { id: 'cs2', class_id: CLASS_B, teacher_id: 'u-baska', subject: 'Fen', lesson_date: today, start_time: '18:00:00', end_time: '18:40:00', status: 'scheduled' }
  ]
};

/** Supabase sorgu zincirini taklit eden basit oluşturucu (bilinmeyen zincir metodları yok sayılır). */
function from(table) {
  let rows = [...(DB[table] || [])];
  const b = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'eq')
          return (col, v) => {
            rows = rows.filter((r) => String(r[col]) === String(v));
            return b;
          };
        if (prop === 'in')
          return (col, vals) => {
            const set = new Set((vals || []).map(String));
            rows = rows.filter((r) => set.has(String(r[col])));
            return b;
          };
        if (prop === 'gte')
          return (col, v) => {
            rows = rows.filter((r) => r[col] != null && String(r[col]) >= String(v));
            return b;
          };
        if (prop === 'lte')
          return (col, v) => {
            rows = rows.filter((r) => r[col] != null && String(r[col]) <= String(v));
            return b;
          };
        if (prop === 'ilike')
          return (col, v) => {
            rows = rows.filter((r) => String(r[col] || '').toLowerCase() === String(v).toLowerCase());
            return b;
          };
        if (prop === 'maybeSingle' || prop === 'single')
          return () => Promise.resolve({ data: rows[0] || null, error: null });
        if (prop === 'then')
          return (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        return () => b; // select, order, limit, range, not, or …
      }
    }
  );
  return b;
}

mock.module('../api/_lib/supabase-admin.js', {
  namedExports: { supabaseAdmin: { from }, getSupabaseAdmin: () => ({ from }), hasSupabaseServiceRoleKey: () => true },
  exports: { supabaseAdmin: { from }, getSupabaseAdmin: () => ({ from }), hasSupabaseServiceRoleKey: () => true }
});

const { signAuthToken } = await import('../api/_lib/auth.js');
const { default: handler } = await import('./junior-vip.js');
const { JUNIOR_VIP_COACH_NAV, JUNIOR_VIP_TEACHER_NAV, navPathAllowed } = await import(
  '../api/_lib/junior-vip-nav.js'
);
const { JUNIOR_VIP_STUDENT_NAV } = await import('../api/_lib/junior-vip-student-nav.js');

const coach = { sub: 'u-coach', role: 'coach', coach_id: C1, institution_id: INST, email: 'c@x.com' };
const teacher = { sub: T1, role: 'teacher', institution_id: INST, email: 't@x.com' };
const student = { sub: 'u-stu', role: 'student', student_id: S1, institution_id: INST, email: 's@x.com' };

function call({ method = 'GET', query = {}, body, actor }) {
  const headers = actor ? { authorization: `Bearer ${signAuthToken(actor)}` } : {};
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        resolve({ status: this.statusCode, body: b });
        return this;
      }
    };
    handler({ method, query, body, headers }, res);
  });
}

const chat = (actor, message, panel) =>
  call({ method: 'POST', query: { op: 'chat' }, body: { message, history: [], ...(panel ? { panel } : {}) }, actor });

// ---------- Yetki / kapsam ----------

test('token yoksa 401', async () => {
  const { status } = await call({ query: { op: 'context' } });
  assert.equal(status, 401);
});

test('koç: panel otomatik koç, yalnızca kendi öğrencileri ve görüşmeleri', async () => {
  const { status, body } = await call({ query: { op: 'context' }, actor: coach });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.panel, 'coach');
  const ctx = body.data;
  assert.equal(ctx.student_count, 2);
  const names = ctx.students.map((s) => s.name);
  assert.deepEqual(names.sort(), ['Ayşe Yılmaz', 'Mehmet Kaya']);
  assert.ok(!JSON.stringify(ctx).includes('Gizli'), 'başka koçun öğrencisi/görüşmesi sızmamalı');
  assert.equal(ctx.students.find((s) => s.id === S1).week_solved_questions, 30);
  assert.deepEqual(ctx.students_without_entries_this_week, ['Mehmet Kaya']);
  assert.equal(ctx.today_meetings.length, 1);
  assert.equal(ctx.today_meetings[0].student, 'Mehmet Kaya');
  assert.ok(ctx.nav.some((n) => n.path === '/students'));
});

test('koç başka koçun öğrencisini öğrenci panelinde açamaz (403)', async () => {
  const { status } = await call({ query: { op: 'context', panel: 'student', student_id: S_OTHER }, actor: coach });
  assert.equal(status, 403);
});

test('koç kendi öğrencisini öğrenci panelinde görebilir (taklit / önizleme)', async () => {
  const { status, body } = await call({ query: { op: 'context', panel: 'student', student_id: S1 }, actor: coach });
  assert.equal(status, 200);
  assert.equal(body.panel, 'student');
  assert.equal(body.data.student.id, S1);
});

test('koç öğretmen paneli isteyemez (403)', async () => {
  const { status } = await call({ query: { op: 'context', panel: 'teacher' }, actor: coach });
  assert.equal(status, 403);
});

test('öğretmen: panel otomatik öğretmen, yalnızca kendi sınıf ve dersleri, öğrenci adı yok', async () => {
  const { status, body } = await call({ query: { op: 'context' }, actor: teacher });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.panel, 'teacher');
  const ctx = body.data;
  assert.deepEqual(ctx.classes, ['8-A LGS']);
  assert.equal(ctx.today_sessions.length, 1);
  assert.equal(ctx.today_sessions[0].class, '8-A LGS');
  assert.equal(ctx.teacher.name, 'Ahmet Hoca');
  const raw = JSON.stringify(ctx);
  assert.ok(!raw.includes('Başka sınıf') && !raw.includes('Mehmet') && !raw.includes('Gizli'));
});

test('öğretmen koç paneli isteyemez (403)', async () => {
  const { status } = await call({ query: { op: 'context', panel: 'coach' }, actor: teacher });
  assert.equal(status, 403);
});

test('öğretmen öğrenci verisini öğrenci paneli üzerinden okuyamaz (403)', async () => {
  const { status } = await call({ query: { op: 'context', panel: 'student', student_id: S2 }, actor: teacher });
  assert.equal(status, 403);
});

test('öğrenci: varsayılan öğrenci paneli (geriye uyum)', async () => {
  const { status, body } = await call({ query: { op: 'context' }, actor: student });
  assert.equal(status, 200);
  assert.equal(body.panel, 'student');
  assert.equal(body.data.student.id, S1);
  assert.equal(body.data.today_entries.length, 1);
});

test('öğrenci başka öğrencinin verisini isteyemez (403)', async () => {
  const { status } = await call({ query: { op: 'context', student_id: S2 }, actor: student });
  assert.equal(status, 403);
});

test('öğrenci koç/öğretmen paneli isteyemez (403)', async () => {
  assert.equal((await call({ query: { op: 'context', panel: 'coach' }, actor: student })).status, 403);
  assert.equal((await call({ query: { op: 'context', panel: 'teacher' }, actor: student })).status, 403);
});

test('capabilities: anahtar yoksa sunucu ses çözümü kapalı bildirilir', async () => {
  const { status, body } = await call({ query: { op: 'capabilities' }, actor: coach });
  assert.equal(status, 200);
  assert.equal(body.server_transcribe, false);
  assert.equal(body.panel, 'coach');
});

test('transcribe anahtarsız 503 (koç da çağırabilir — eskiden öğrenci zorunluydu)', async () => {
  const { status, body } = await call({
    method: 'POST',
    query: { op: 'transcribe' },
    body: { audio_base64: Buffer.alloc(500).toString('base64'), mime: 'audio/webm', panel: 'coach' },
    actor: coach
  });
  assert.equal(status, 503);
  assert.equal(body.error, 'transcribe_unavailable');
});

// ---------- Sesli komut → yönlendirme / yanıt (yerel motor) ----------

test('koç: "bugün görüşmelerim neler" → kendi görüşmesi özetlenir', async () => {
  const { status, body } = await chat(coach, 'Bugün görüşmelerim neler?');
  assert.equal(status, 200);
  assert.equal(body.panel, 'coach');
  assert.match(body.reply, /1 görüşmen var/);
  assert.match(body.reply, /Mehmet Kaya/);
  assert.equal(body.actions[0].path, '/meetings');
  assert.equal(body.proposed_study_log, null);
});

test('koç: "bu hafta çalışmayan öğrencilerim" → yalnızca kendi öğrencileri', async () => {
  const { body } = await chat(coach, 'Bu hafta çalışmayan öğrencilerim kim');
  assert.match(body.reply, /Mehmet Kaya/);
  assert.doesNotMatch(body.reply, /Gizli/);
});

test('koç: "öğrencilerimi aç" → /students', async () => {
  const { body } = await chat(coach, 'öğrencilerimi aç');
  assert.equal(body.actions[0].path, '/students');
});

test('koç: "haftalık planı aç" → /weekly-planner', async () => {
  const { body } = await chat(coach, 'haftalık planı aç');
  assert.equal(body.actions[0].path, '/weekly-planner');
});

test('koç: "20 soru çözdüm" kayıt önerisi üretmez (yalnızca öğrenci)', async () => {
  const { body } = await chat(coach, 'matematik 20 soru çözdüm');
  assert.equal(body.proposed_study_log, null);
});

test('öğretmen: "bugün derslerim" → kendi dersi', async () => {
  const { body } = await chat(teacher, 'bugün derslerim neler');
  assert.equal(body.panel, 'teacher');
  assert.match(body.reply, /1 dersin var/);
  assert.match(body.reply, /8-A LGS/);
  assert.equal(body.actions[0].path, '/class-live-lessons');
});

test('öğretmen: "yoklama raporunu aç" → /attendance-report', async () => {
  const { body } = await chat(teacher, 'yoklama raporunu aç');
  assert.equal(body.actions[0].path, '/attendance-report');
});

test('öğrenci: "haftalık planı aç" → /weekly-planner, "30 soru çözdüm" → onaylı kayıt önerisi', async () => {
  const nav = await chat(student, 'haftalık planı aç');
  assert.equal(nav.body.actions[0].path, '/weekly-planner');
  const log = await chat(student, 'matematik kesirler 30 soru çözdüm');
  assert.equal(log.body.proposed_study_log.solved_questions, 30);
  assert.equal(log.body.proposed_study_log.subject, 'Matematik');
});

// ---------- Katalog güvenliği ----------

test('yönlendirme yalnızca panel kataloğundaki rotalara izin verir', () => {
  assert.equal(navPathAllowed(JUNIOR_VIP_COACH_NAV, '/students'), true);
  assert.equal(navPathAllowed(JUNIOR_VIP_COACH_NAV, '/system-management'), false);
  assert.equal(navPathAllowed(JUNIOR_VIP_TEACHER_NAV, '/students'), false);
  assert.equal(navPathAllowed(JUNIOR_VIP_STUDENT_NAV, '/academic-center?tab=exam'), true);
  assert.equal(navPathAllowed(JUNIOR_VIP_STUDENT_NAV, '/coach-dashboard'), false);
});

test('her katalog rotası, ilgili rol için ROUTE_ALLOWED_ROLES’ta izinli', () => {
  const src = readFileSync(new URL('../student-coaching-system/src/config/rolePermissions.ts', import.meta.url), 'utf8');
  const allowed = new Map();
  for (const m of src.matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)) {
    allowed.set(m[1], [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  }
  const check = (nav, role) => {
    for (const n of nav) {
      let p = n.path.split('?')[0];
      // Alt rota (ör. /student-dashboard/denemeler) üst rotanın iznini kullanır.
      while (!allowed.has(p) && p.lastIndexOf('/') > 0) p = p.slice(0, p.lastIndexOf('/'));
      assert.ok(allowed.has(p), `${n.path} rolePermissions'ta yok`);
      assert.ok(allowed.get(p).includes(role), `${n.path} → ${role} izinli değil`);
    }
  };
  check(JUNIOR_VIP_COACH_NAV, 'coach');
  check(JUNIOR_VIP_TEACHER_NAV, 'teacher');
  check(JUNIOR_VIP_STUDENT_NAV, 'student');
});
