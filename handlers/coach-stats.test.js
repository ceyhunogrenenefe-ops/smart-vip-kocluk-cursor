/**
 * Koç istatistikleri uç noktası — veritabanı taklit edilerek uçtan uca.
 * Çalıştırma: node --experimental-test-module-mocks --test handlers/coach-stats.test.js
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const C1 = '11111111-1111-4111-8111-111111111111';
const INST = '22222222-2222-4222-8222-222222222222';
const S1 = '33333333-3333-4333-8333-333333333331';
const S2 = '33333333-3333-4333-8333-333333333332';
const SESS_A = '44444444-4444-4444-8444-444444444441';
const SESS_B = '44444444-4444-4444-8444-444444444442';

const DB = {
  users: [],
  coaches: [{ id: C1, name: 'Nadide AKTÜRK', email: 'n@x.com', institution_id: INST }],
  students: [
    { id: S1, name: 'Ayşe', coach_id: C1, institution_id: INST, class_level: '7' },
    { id: S2, name: 'Mehmet', coach_id: C1, institution_id: INST, class_level: '7' }
  ],
  student_activity_periods: [],
  weekly_entries: [
    { student_id: S1, date: '2026-09-15', subject: 'MATEMATİK', correct: 10, wrong: 2, blank: 0, solved_questions: 12 }
  ],
  coach_weekly_goals: [
    {
      id: 'g1',
      student_id: S1,
      coach_id: C1,
      subject: 'MATEMATİK',
      quantity_unit: 'soru',
      target_quantity: 20,
      week_start_date: '2026-09-14',
      goal_start_date: '2026-09-14',
      goal_end_date: '2026-09-20'
    }
  ],
  class_sessions: [
    { id: SESS_A, lesson_date: '2026-09-15', institution_id: INST, status: 'completed', class_id: null },
    { id: SESS_B, lesson_date: '2026-09-16', institution_id: INST, status: 'completed', class_id: null }
  ],
  class_session_attendance: [
    { session_id: SESS_A, student_id: S1, status: 'present', camera_status: 'on' },
    { session_id: SESS_A, student_id: S2, status: 'present', camera_status: 'off' },
    { session_id: SESS_B, student_id: S1, status: 'present', camera_status: null },
    { session_id: SESS_B, student_id: S2, status: 'absent', camera_status: 'n_a' }
  ],
  exam_results: [
    { id: 'edesis-1', student_id: S1, date: '2026-09-19', exam_name: 'LGS Deneme 1', app_payload: { source: 'edesis' } }
  ],
  academic_deneme_join_logs: [],
  meetings: [],
  registration_stage_history: [
    { lead_id: 'L1', new_stage: 'trial_lesson_scheduled', changed_at: '2026-09-15T08:00:00Z' },
    { lead_id: 'L1', new_stage: 'trial_lesson_completed', changed_at: '2026-09-16T08:00:00Z' },
    { lead_id: 'L2', new_stage: 'trial_lesson_scheduled', changed_at: '2026-09-17T08:00:00Z' }
  ],
  registration_leads: [
    { id: 'L1', grade_program: 'grade_7', stage: 'confirmed', primary_status: 'confirmed', updated_at: '2026-09-18T08:00:00Z', institution_id: INST },
    { id: 'L2', grade_program: 'grade_11', stage: 'trial_lesson_scheduled', primary_status: 'tracking', updated_at: '2026-09-17T08:00:00Z', institution_id: INST }
  ]
};

/** Supabase sorgu zincirini taklit eden basit oluşturucu */
function from(table) {
  let rows = [...(DB[table] || [])];
  const b = {
    select() {
      return b;
    },
    order() {
      return b;
    },
    eq(col, v) {
      rows = rows.filter((r) => String(r[col]) === String(v));
      return b;
    },
    in(col, vals) {
      const set = new Set(vals.map(String));
      rows = rows.filter((r) => set.has(String(r[col])));
      return b;
    },
    gte(col, v) {
      rows = rows.filter((r) => r[col] != null && String(r[col]) >= String(v));
      return b;
    },
    lte(col, v) {
      rows = rows.filter((r) => r[col] != null && String(r[col]) <= String(v));
      return b;
    },
    not(col, op, v) {
      if (op === 'is' && v === null) rows = rows.filter((r) => r[col] != null);
      return b;
    },
    or() {
      rows = [];
      return b;
    },
    maybeSingle() {
      return Promise.resolve({ data: rows[0] || null, error: null });
    },
    then(resolve, reject) {
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    }
  };
  return b;
}

mock.module('../api/_lib/supabase-admin.js', {
  exports: { supabaseAdmin: { from } }
});

const { signAuthToken } = await import('../api/_lib/auth.js');
const { default: handler } = await import('./coach-stats.js');

function call(query, actor) {
  const token = signAuthToken(actor);
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
        return this;
      }
    };
    handler({ method: 'GET', query, headers: { authorization: `Bearer ${token}` } }, res);
  });
}

const admin = { sub: 'u-admin', role: 'admin', institution_id: INST };
const coach = { sub: 'u-coach', role: 'coach', coach_id: C1, institution_id: INST };
const RANGE = { from: '2026-09-14', to: '2026-09-20', institution_id: INST };

test('kamera, hedef yerleştirme ve devamsız öğrenci sayısı hesaplanır', async () => {
  const { status, body } = await call(RANGE, admin);
  assert.equal(status, 200, JSON.stringify(body));
  const c = body.coaches[0];
  // kamera: katılan ve işaretlenen 2 yoklama (1 açık, 1 kapalı); null olan sayılmaz
  assert.equal(c.camera_total, 2);
  assert.equal(c.camera_on, 1);
  assert.equal(c.camera_rate, 50);
  // hedef: 2 aktif öğrenciden 1'ine hedef girilmiş
  assert.equal(c.goal_assigned_students, 1);
  assert.equal(c.goal_assigned_rate, 50);
  assert.equal(c.absent_students, 1);
  // detay istenmedi
  assert.equal(c.students, undefined);
});

test('koç seçilip detail=1 ise öğrenci bazında kırılım gelir', async () => {
  const { body } = await call({ ...RANGE, coach_id: C1, detail: '1' }, admin);
  const rows = body.coaches[0].students;
  assert.equal(rows.length, 2);
  const ayse = rows.find((r) => r.name === 'Ayşe');
  assert.equal(ayse.report_filled_days, 1);
  assert.equal(ayse.attendance_rate, 100);
  assert.equal(ayse.camera_rate, 100);
  assert.equal(ayse.goals_count, 1);
  assert.equal(ayse.goal_target, 20);
  assert.equal(ayse.goal_completed, 12);
  assert.equal(ayse.deneme_count, 1);
  const mehmet = rows.find((r) => r.name === 'Mehmet');
  assert.equal(mehmet.attendance_absent, 1);
  assert.equal(mehmet.attendance_rate, 50);
  assert.equal(mehmet.camera_rate, 0);
  assert.equal(mehmet.goals_count, 0);
});

test('detail=1 tüm koçlar için açılmaz (koç seçilmeden)', async () => {
  const { body } = await call({ ...RANGE, detail: '1' }, admin);
  assert.equal(body.coaches[0].students, undefined);
});

test('admin CRM deneme dersi hunisini sınıf bazında görür', async () => {
  const { body } = await call(RANGE, admin);
  assert.equal(body.trial_lessons.totals.planned, 2);
  assert.equal(body.trial_lessons.totals.attended, 1);
  assert.equal(body.trial_lessons.totals.registered, 1);
  assert.deepEqual(
    body.trial_lessons.by_grade.map((g) => [g.label, g.planned, g.attended, g.registered]),
    [
      ['7. Sınıf', 1, 1, 1],
      ['11. Sınıf', 1, 0, 0]
    ]
  );
});

test('koç kendi öğrenci detayını görür ama CRM satış verisini görmez', async () => {
  const { status, body } = await call({ ...RANGE, detail: '1' }, coach);
  assert.equal(status, 200);
  assert.equal(body.coaches.length, 1);
  assert.equal(body.coaches[0].students.length, 2);
  assert.equal(body.trial_lessons, null);
});
