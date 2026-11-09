/**
 * Junior VIP — işlem güvenilirliği senaryoları (plan ekleme, çözülen soru kaydı, canlı dersler, bütçe).
 * Bellek içi bir Supabase taklidi kullanılır: insert/update/delete gerçekten yazar, birincil anahtar
 * çakışması 23505 döner, bütçe RPC'leri SQL fonksiyonlarıyla aynı kuralları uygular (kilitli sıra).
 *
 * Çalıştırma: node --experimental-test-module-mocks --test handlers/junior-vip-assistant.test.js
 */
import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.OPENAI_API_KEY;
delete process.env.OPEN_API_KEY;
delete process.env.JUNIOR_VIP_OPENAI_API_KEY;
process.env.APP_JWT_SECRET = 'test-secret';

const INST = 'inst-1';
const S1 = 'stu-1';
const S2 = 'stu-2';
const CLASS_A = 'class-a';
const CLASS_B = 'class-b';
const T1 = 'u-teacher';

// ------------------------------------------------------------------ bellek içi veritabanı
let DB;
const FAIL = new Set();

function seed() {
  DB = {
    users: [
      { id: 'u-stu', role: 'student', roles: ['student'], name: 'Ayşe', email: 's@x.com', institution_id: INST },
      { id: 'u-stu2', role: 'student', roles: ['student'], name: 'Ali', email: 's2@x.com', institution_id: INST },
      { id: T1, role: 'teacher', roles: ['teacher'], name: 'Ahmet Hoca', email: 't@x.com', institution_id: INST },
      { id: 'u-t2', role: 'teacher', roles: ['teacher'], name: 'Zeynep Hoca', email: 't2@x.com', institution_id: INST },
      { id: 'u-super', role: 'super_admin', roles: ['super_admin'], name: 'Süper', email: 'sa@x.com', institution_id: INST }
    ],
    coaches: [],
    students: [
      { id: S1, user_id: 'u-stu', email: 's@x.com', name: 'Ayşe Yılmaz', coach_id: null, institution_id: INST, class_level: 'LGS', branch: 'A' },
      { id: S2, user_id: 'u-stu2', email: 's2@x.com', name: 'Ali Demir', coach_id: null, institution_id: INST, class_level: 'LGS', branch: 'B' }
    ],
    weekly_entries: [],
    weekly_planner_entries: [],
    coach_weekly_goals: [],
    classes: [
      { id: CLASS_A, name: '8-A LGS', institution_id: INST },
      { id: CLASS_B, name: '8-B LGS', institution_id: INST }
    ],
    class_students: [
      { class_id: CLASS_A, student_id: S1, subjects: [] },
      { class_id: CLASS_B, student_id: S2, subjects: [] }
    ],
    class_weekly_slots: [],
    class_sessions: [],
    teacher_lessons: [],
    junior_vip_budget_settings: [{ id: 1, monthly_limit_usd: 15, safety_margin_usd: 0.5, max_in_flight: 6 }],
    junior_vip_ai_ledger: [],
    junior_vip_events: []
  };
  FAIL.clear();
}
seed();

let idSeq = 0;
function query(table) {
  const filters = [];
  let mode = 'select';
  let payload = null;
  let single = null;
  let orderBy = null;
  let selectError = null;
  const apply = () => (DB[table] || []).filter((r) => filters.every((f) => f(r)));
  const exec = () => {
    if (selectError) return { data: null, error: { message: selectError, code: '42703' } };
    if (FAIL.has(table) || FAIL.has(`${table}:${mode}`)) {
      return { data: null, error: { message: `simulated ${table} failure`, code: 'XX000' } };
    }
    if (mode === 'insert') {
      const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }));
      for (const r of rows) {
        if (r.id == null) r.id = `auto-${++idSeq}`;
        if ((DB[table] || []).some((x) => String(x.id) === String(r.id))) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
      }
      DB[table] = [...(DB[table] || []), ...rows];
      return { data: single ? rows[0] : rows, error: null };
    }
    if (mode === 'update') {
      const hit = apply();
      for (const r of hit) Object.assign(r, payload);
      return { data: single ? hit[0] || null : hit, error: null };
    }
    if (mode === 'delete') {
      const hit = new Set(apply());
      DB[table] = (DB[table] || []).filter((r) => !hit.has(r));
      return { data: null, error: null, count: hit.size };
    }
    let rows = apply().map((r) => ({ ...r }));
    if (orderBy) rows.sort((a, b) => String(a[orderBy]).localeCompare(String(b[orderBy])));
    if (single) return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  };
  const b = {
    select(cols) {
      selectError = unknownSelectColumnError(table, cols);
      return b;
    },
    insert(p) {
      mode = 'insert';
      payload = p;
      return b;
    },
    update(p) {
      mode = 'update';
      payload = p;
      return b;
    },
    delete() {
      mode = 'delete';
      return b;
    },
    eq(c, v) {
      filters.push((r) => String(r[c]) === String(v));
      return b;
    },
    neq(c, v) {
      filters.push((r) => String(r[c]) !== String(v));
      return b;
    },
    is(c, v) {
      filters.push((r) => (v === null ? r[c] == null : r[c] === v));
      return b;
    },
    in(c, vals) {
      const set = new Set((vals || []).map(String));
      filters.push((r) => set.has(String(r[c])));
      return b;
    },
    gte(c, v) {
      filters.push((r) => r[c] != null && String(r[c]) >= String(v));
      return b;
    },
    lte(c, v) {
      filters.push((r) => r[c] != null && String(r[c]) <= String(v));
      return b;
    },
    ilike(c, v) {
      filters.push((r) => String(r[c] || '').toLowerCase() === String(v).toLowerCase());
      return b;
    },
    order(c) {
      if (!orderBy) orderBy = c;
      return b;
    },
    limit() {
      return b;
    },
    range() {
      return b;
    },
    not() {
      return b;
    },
    or() {
      return b;
    },
    maybeSingle() {
      single = true;
      return Promise.resolve(exec());
    },
    single() {
      single = true;
      return Promise.resolve(exec());
    },
    then(res, rej) {
      return Promise.resolve(exec()).then(res, rej);
    }
  };
  return b;
}

// Bütçe RPC'leri — SQL fonksiyonlarıyla aynı mantık; advisory lock yerine sıralı kuyruk
let lockChain = Promise.resolve();
function withLock(fn) {
  const run = lockChain.then(fn);
  lockChain = run.catch(() => {});
  return run;
}
async function rpc(name, args) {
  if (FAIL.has('rpc')) return { data: null, error: { message: 'rpc down' } };
  if (name === 'junior_vip_budget_reserve') {
    return withLock(async () => {
      await new Promise((r) => setTimeout(r, 1)); // eşzamanlılığı zorlamak için
      const s = DB.junior_vip_budget_settings[0];
      const rows = DB.junior_vip_ai_ledger.filter((l) => l.month_key === args.p_month);
      const committed = rows.reduce(
        (a, l) => a + (l.status === 'settled' ? Number(l.actual_usd ?? l.reserved_usd) : l.status === 'reserved' ? Number(l.reserved_usd) : 0),
        0
      );
      const inflight = rows.filter((l) => l.status === 'reserved').length;
      if (inflight >= s.max_in_flight) return { data: [{ ok: false, reason: 'too_many_in_flight', committed_usd: committed, limit_usd: s.monthly_limit_usd }], error: null };
      if (committed + args.p_amount > s.monthly_limit_usd - s.safety_margin_usd + 1e-9) { // SQL numeric kesin; JS kayan nokta toleransı
        return { data: [{ ok: false, reason: 'budget_exhausted', committed_usd: committed, limit_usd: s.monthly_limit_usd }], error: null };
      }
      const id = `res-${++idSeq}`;
      DB.junior_vip_ai_ledger.push({ id, month_key: args.p_month, service: args.p_service, model: args.p_model, status: 'reserved', reserved_usd: args.p_amount });
      return { data: [{ ok: true, reservation_id: id, committed_usd: committed + args.p_amount, limit_usd: s.monthly_limit_usd }], error: null };
    });
  }
  if (name === 'junior_vip_budget_settle') {
    const l = DB.junior_vip_ai_ledger.find((x) => x.id === args.p_id && x.status === 'reserved');
    if (l) Object.assign(l, { status: 'settled', actual_usd: args.p_actual ?? l.reserved_usd, input_tokens: args.p_input_tokens, output_tokens: args.p_output_tokens, audio_seconds: args.p_audio_seconds });
    return { data: Boolean(l), error: null };
  }
  if (name === 'junior_vip_budget_release') {
    const l = DB.junior_vip_ai_ledger.find((x) => x.id === args.p_id && x.status === 'reserved');
    if (l) Object.assign(l, { status: 'released', actual_usd: 0 });
    return { data: Boolean(l), error: null };
  }
  return { data: null, error: { message: 'unknown rpc' } };
}

const supabaseAdmin = { from: query, rpc };
import { unknownSelectColumnError } from '../api/_lib/junior-vip-db-columns.js';

mock.module('../api/_lib/supabase-admin.js', {
  namedExports: { supabaseAdmin, getSupabaseAdmin: () => supabaseAdmin, hasSupabaseServiceRoleKey: () => true }
});

const { signAuthToken } = await import('../api/_lib/auth.js');
const { default: handler } = await import('./junior-vip.js');
const { parseStudentMessage } = await import('../api/_lib/junior-vip-parse.js');
const { resolveDateExpression, istanbulToday } = await import('../api/_lib/junior-vip-dates.js');
const { addCalendarDaysYmd } = await import('../api/_lib/istanbul-time.js');
const { juniorVipStudentTurn } = await import('../api/_lib/junior-vip-assistant.js');
const budget = await import('../api/_lib/junior-vip-budget.js');
const openai = await import('../api/_lib/junior-vip-openai.js');

const student = { sub: 'u-stu', role: 'student', student_id: S1, institution_id: INST, email: 's@x.com' };
const superAdmin = { sub: 'u-super', role: 'super_admin', institution_id: INST, email: 'sa@x.com' };

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

/** Konuşma yardımcı: durum belirtecini taşır, her mesaja ayrı request_id verir. */
function conversation(actor = student) {
  let token;
  let n = 0;
  return async (message, { requestId } = {}) => {
    const rid = requestId || `req-${Date.now()}-${++n}`;
    const r = await call({ method: 'POST', query: { op: 'chat' }, body: { message, state_token: token, request_id: rid }, actor });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    token = r.body.state_token;
    return { ...r.body, rid };
  };
}

const today = () => istanbulToday();
const entriesOf = (sid) => DB.weekly_entries.filter((e) => e.student_id === sid);
const plansOf = (sid) => DB.weekly_planner_entries.filter((e) => e.student_id === sid);

beforeEach(() => seed());

// ================================================================== 1. Haftalık plana kayıt

test('plan: "Bugünkü planıma matematikten çarpanlar ve katlar 80 soru ekle" → bugüne gerçekten kaydedilir', async () => {
  const say = conversation();
  const r = await say('Bugünkü planıma matematikten çarpanlar ve katlar 80 soru ekle');
  const plans = plansOf(S1);
  assert.equal(plans.length, 1, r.reply);
  assert.equal(plans[0].planner_date, today());
  assert.equal(plans[0].subject, 'MATEMATİK');
  assert.equal(plans[0].title, 'Çarpanlar ve Katlar');
  assert.equal(plans[0].planned_quantity, 80);
  assert.equal(plans[0].status, 'planned');
  assert.match(r.reply, /Planına ekledim/);
  assert.equal(r.result.kind, 'plan_added');
  assert.deepEqual(r.refresh, ['weekly-planner']);
  assert.match(r.actions[0].path, new RegExp(`^/weekly-planner\\?date=${today()}`));
  assert.equal(DB.class_sessions.length, 0, 'canlı ders programına yazılmamalı');
});

test('plan: yarına ekleme doğru gün ve haftada; mevcut çalışmaların üzerine yazmaz', async () => {
  const tomorrow = addCalendarDaysYmd(today(), 1);
  DB.weekly_planner_entries.push({
    id: 'existing', student_id: S1, planner_date: tomorrow, start_time: '16:00', end_time: '17:00',
    subject: 'TÜRKÇE', title: 'Paragraf', planned_quantity: 20, completed_quantity: 0, status: 'planned'
  });
  const say = conversation();
  const r = await say('yarın fen bilimleri basınç 40 soru planıma ekle');
  const plans = plansOf(S1).filter((p) => p.planner_date === tomorrow);
  assert.equal(plans.length, 2, r.reply);
  const added = plans.find((p) => p.id !== 'existing');
  assert.equal(added.subject, 'FEN BİLİMLERİ');
  assert.equal(added.start_time, '17:00', 'ilk boş saat (16:00 dolu)');
  assert.equal(DB.weekly_planner_entries.find((p) => p.id === 'existing').title, 'Paragraf');
  assert.match(r.reply, /yarın/);
});

test('plan: belirtilen saat doluysa üzerine yazmaz, yeni saat sorar; "fark etmez" → boş saate koyar', async () => {
  DB.weekly_planner_entries.push({
    id: 'busy', student_id: S1, planner_date: today(), start_time: '20:00', end_time: '21:00',
    subject: 'TÜRKÇE', title: 'Paragraf', planned_quantity: 20, completed_quantity: 0, status: 'planned'
  });
  const say = conversation();
  let r = await say('bugün saat 20.00 için planıma matematik üslü ifadeler 30 soru ekle');
  assert.match(r.reply, /üzerine yazmadım/);
  assert.equal(plansOf(S1).length, 1);
  r = await say('fark etmez');
  // Saat geçmişse bugün boş saat kalmamış olabilir; her iki durumda da sahte "ekledim" olmamalı
  if (/Planına ekledim/.test(r.reply)) assert.equal(plansOf(S1).length, 2);
  else assert.match(r.reply, /boş saat kalmadı/);
});

test('plan: aynı isteğin tekrarı (aynı request_id) mükerrer kayıt oluşturmaz', async () => {
  const say = conversation();
  const first = await say('yarın planıma matematik çarpanlar ve katlar 50 soru ekle', { requestId: 'same-1' });
  // İstemci zaman aşımı → aynı mesajı aynı kimlikle tekrar gönderir (durum belirteci eski)
  const retry = await call({
    method: 'POST',
    query: { op: 'chat' },
    body: { message: 'yarın planıma matematik çarpanlar ve katlar 50 soru ekle', request_id: 'same-1' },
    actor: student
  });
  assert.equal(plansOf(S1).length, 1);
  assert.equal(retry.body.result.duplicate, true);
  assert.match(retry.body.reply, /zaten vardı/);
  assert.ok(first.result.planner_entry_id);
});

test('plan: veritabanı yazma hatasında "ekledim" denmez', async () => {
  FAIL.add('weekly_planner_entries:insert');
  const say = conversation();
  const r = await say('yarın planıma matematik çarpanlar 30 soru ekle');
  assert.doesNotMatch(r.reply, /ekledim/i);
  assert.match(r.reply, /tamamlayamadım/);
  assert.equal(plansOf(S1).length, 0);
  // Hata giderilince "tekrar dene" aynı anahtarla tek kayıt üretir
  FAIL.clear();
  const again = await say('tekrar dene');
  assert.match(again.reply, /Planına ekledim/);
  assert.equal(plansOf(S1).length, 1);
  assert.ok(DB.junior_vip_events.some((e) => e.event_type === 'tool_failed'));
});

// ================================================================== 2. Çözülen soruları konuşarak kaydetme

test('kayıt: "Bugün 80 soru çözdüm" çok adımlı akış — yalnız eksik bilgi sorulur', async () => {
  const say = conversation();
  let r = await say('Bugün 80 soru çözdüm.');
  assert.equal(r.reply, 'Hangi dersten ve hangi konudan çözdün?');
  r = await say('Matematik.');
  assert.equal(r.reply, 'Matematikte hangi konudan?');
  r = await say('Çarpanlar ve katlar.');
  assert.match(r.reply, /^Saat kaçta çözdün\?/);
  assert.equal(entriesOf(S1).length, 0, 'bilgiler tamamlanmadan kayıt yok');
  r = await say('19.00.');
  const e = entriesOf(S1);
  assert.equal(e.length, 1, r.reply);
  assert.equal(e[0].date, today());
  assert.equal(e[0].subject, 'MATEMATİK');
  assert.equal(e[0].topic, 'Çarpanlar ve Katlar');
  assert.equal(e[0].solved_questions, 80);
  // Gerçekleşen çalışma olarak kaydedildi; planlayıcıda bloğu 19:00'da
  const block = plansOf(S1).find((p) => p.weekly_entry_id === e[0].id);
  assert.ok(block, 'planlayıcıda görünmeli');
  assert.equal(block.start_time, '19:00');
  assert.equal(block.status, 'completed');
  assert.match(r.reply, /Kaydettim/);
  assert.match(r.reply, /80 soru/);
  assert.match(r.reply, /saat 19:00/);
  assert.equal(r.result.kind, 'study_logged');
});

test('kayıt: tüm bilgiler tek mesajda → soru sormadan kaydeder, saat uydurmaz', async () => {
  const say = conversation();
  const r = await say('bugün matematik çarpanlar ve katlar 80 soru çözdüm');
  assert.match(r.reply, /Kaydettim/);
  assert.match(r.reply, /saat belirtilmedi/);
  const e = entriesOf(S1);
  assert.equal(e.length, 1);
  assert.equal(e[0].notes, null, 'saat notu uydurulmamalı');
});

test('kayıt: saat dahil tek mesaj', async () => {
  const say = conversation();
  const r = await say("bugün akşam 7'de mat çarpanlar ve katlar 80 soru çözdüm");
  assert.match(r.reply, /saat 19:00/);
  assert.equal(plansOf(S1)[0].start_time, '19:00');
});

test('kayıt: saat sorusuna "bilmiyorum" → saatsiz kaydedilir', async () => {
  const say = conversation();
  await say('Bugün 40 soru çözdüm');
  await say('Fen');
  await say('Basınç');
  const r = await say('bilmiyorum');
  assert.match(r.reply, /saat belirtilmedi/);
  assert.equal(entriesOf(S1).length, 1);
});

test('kayıt: soru sayısının sonradan düzeltilmesi ("80 değil 60") mevcut kaydı günceller', async () => {
  const say = conversation();
  await say('bugün matematik çarpanlar ve katlar 80 soru çözdüm');
  const r = await say('80 değil 60 soru');
  const e = entriesOf(S1);
  assert.equal(e.length, 1, 'yeni kayıt açılmamalı');
  assert.equal(e[0].solved_questions, 60);
  const block = plansOf(S1).find((p) => p.weekly_entry_id === e[0].id);
  assert.equal(Number(block.completed_quantity), 60);
  assert.match(r.reply, /Düzelttim/);
  assert.ok(DB.junior_vip_events.some((x) => x.event_type === 'user_correction'));
});

test('kayıt: akış sırasında düzeltme bekleyen işleme uygulanır', async () => {
  const say = conversation();
  await say('Bugün 80 soru çözdüm');
  await say('aslında 70');
  await say('Matematik çarpanlar ve katlar');
  await say('19:30');
  assert.equal(entriesOf(S1)[0].solved_questions, 70);
});

test('kayıt: plandaki eşleşen çalışma ile ilişkilendirilir; ilgisiz görev tamamlandı yapılmaz', async () => {
  DB.weekly_planner_entries.push(
    { id: 'p-mat', student_id: S1, planner_date: today(), start_time: '18:00', end_time: '19:00', subject: 'MATEMATİK', title: 'Çarpanlar ve Katlar', planned_quantity: 100, completed_quantity: 0, status: 'planned' },
    { id: 'p-mat-other', student_id: S1, planner_date: today(), start_time: '20:00', end_time: '21:00', subject: 'MATEMATİK', title: 'Üslü İfadeler', planned_quantity: 40, completed_quantity: 0, status: 'planned' },
    { id: 'p-tr', student_id: S1, planner_date: today(), start_time: '21:00', end_time: '22:00', subject: 'TÜRKÇE', title: 'Paragraf', planned_quantity: 30, completed_quantity: 0, status: 'planned' }
  );
  const say = conversation();
  const r = await say('bugün matematik çarpanlar ve katlar 80 soru çözdüm');
  const linked = DB.weekly_planner_entries.find((p) => p.id === 'p-mat');
  assert.ok(linked.weekly_entry_id, r.reply);
  assert.equal(linked.status, 'partial');
  assert.equal(Number(linked.completed_quantity), 80);
  assert.equal(DB.weekly_planner_entries.find((p) => p.id === 'p-mat-other').status, 'planned');
  assert.equal(DB.weekly_planner_entries.find((p) => p.id === 'p-tr').status, 'planned');
  assert.equal(plansOf(S1).length, 3, 'ek blok açılmadı');
  assert.match(r.reply, /80\/100/);
});

test('kayıt: aynı isteğin tekrarı mükerrer kayıt oluşturmaz', async () => {
  const body = { message: 'bugün matematik çarpanlar ve katlar 30 soru çözdüm', request_id: 'dup-x' };
  await call({ method: 'POST', query: { op: 'chat' }, body, actor: student });
  const r2 = await call({ method: 'POST', query: { op: 'chat' }, body, actor: student });
  assert.equal(entriesOf(S1).length, 1);
  assert.equal(r2.body.result.duplicate, true);
});

test('kayıt: "vazgeç" bekleyen işlemi kaydetmeden iptal eder', async () => {
  const say = conversation();
  await say('Bugün 80 soru çözdüm');
  const r = await say('vazgeç');
  assert.match(r.reply, /Hiçbir şey kaydetmedim/);
  assert.equal(entriesOf(S1).length, 0);
});

test('kayıt: belirsiz ders için tek kısa açıklama sorusu (YKS: TYT mi AYT mi)', async () => {
  DB.students[0].class_level = 'YKS-Sayısal';
  const say = conversation();
  let r = await say('bugün matematik türev 50 soru çözdüm');
  assert.equal(r.reply, 'TYT Matematik mi, AYT Matematik mi?');
  r = await say('AYT');
  assert.match(r.reply, /^Saat kaçta/); // soru-cevaba girildiği için saat (isteğe bağlı) sorulur
  r = await say('bilmiyorum');
  assert.match(r.reply, /Kaydettim/);
  assert.equal(entriesOf(S1)[0].subject, 'AYT MATEMATİK');
});

test('ders/konu eşleştirme: "mat", yazım ve dikte hataları, yazıyla sayı', () => {
  const p1 = parseStudentMessage('bugün mat çarpanlr ve katlar seksen soru çözdüm', { classLevel: 'LGS' });
  assert.equal(p1.subject, 'MATEMATİK');
  assert.equal(p1.topic, 'Çarpanlar ve Katlar');
  assert.equal(p1.quantity.value, 80);
  assert.equal(p1.intent, 'log_study');
  const p2 = parseStudentMessage('matamatik üslü ifadeler 20 soru planıma ekle', { classLevel: 'LGS' });
  assert.equal(p2.subject, 'MATEMATİK');
  assert.equal(p2.topic, 'Üslü İfadeler');
  assert.equal(p2.intent, 'add_plan');
});

// ================================================================== Tarih / gece yarısı

test('tarih: gece yarısına yakın saatlerde İstanbul günü kullanılır', () => {
  // 2026-11-08 23:30 İstanbul = 20:30 UTC (UTC'de de 8'i ama +3 ile 00:30 olursa 9'u)
  const lateIst = new Date('2026-11-08T20:30:00Z');
  assert.equal(istanbulToday(lateIst), '2026-11-08');
  // 2026-11-09 00:30 İstanbul = 2026-11-08 21:30 UTC → UTC günü 8, İstanbul günü 9
  const afterMidnight = new Date('2026-11-08T21:30:00Z');
  assert.equal(istanbulToday(afterMidnight), '2026-11-09');
  assert.equal(resolveDateExpression('bugün', { now: afterMidnight }).date, '2026-11-09');
  assert.equal(resolveDateExpression('yarın', { now: afterMidnight }).date, '2026-11-10');
  assert.equal(resolveDateExpression('dün', { now: afterMidnight }).date, '2026-11-08');
  // 9 Kasım 2026 Pazartesi: "pazartesi" plan için bugün, kayıt için de bugün
  assert.equal(resolveDateExpression('pazartesi', { now: afterMidnight }).date, '2026-11-09');
  assert.equal(resolveDateExpression('cuma', { now: afterMidnight, direction: 'past' }).date, '2026-11-06');
  assert.equal(resolveDateExpression('cuma', { now: afterMidnight, direction: 'future' }).date, '2026-11-13');
});

test('tarih: gece yarısından sonra "bugün" kaydı İstanbul gününe yazılır (UTC gününe değil)', async () => {
  const afterMidnight = new Date('2026-11-08T21:30:00Z'); // İstanbul 9 Kasım 00:30
  const out = await juniorVipStudentTurn({
    scope: { studentId: S1 },
    message: 'bugün matematik çarpanlar ve katlar 20 soru çözdüm',
    requestId: 'midnight-1',
    now: afterMidnight
  });
  assert.match(out.reply, /Kaydettim/);
  assert.equal(entriesOf(S1)[0].date, '2026-11-09');
});

// ================================================================== 3. Canlı dersler

test('canlı ders: ekrandaki grup (şablondan üretilen) ve birebir dersler asistan tarafından da bulunur', async () => {
  const d = today();
  const { isoWeekdayMon1Istanbul } = await import('../api/_lib/istanbul-time.js');
  DB.class_weekly_slots.push({
    id: 'slot-1', class_id: CLASS_A, day_of_week: isoWeekdayMon1Istanbul(d), start_time: '17:00:00', end_time: '17:40:00',
    subject: 'Matematik', teacher_id: T1, meeting_link: 'https://meet.example/abc', institution_id: INST
  });
  DB.teacher_lessons.push({ id: 'tl-1', student_id: S1, teacher_id: 'u-t2', title: 'İngilizce', lesson_date: d, start_time: '19:00:00', end_time: '19:40:00', status: 'scheduled' });
  // Başka öğrencinin dersleri sızmamalı
  DB.class_sessions.push({ id: 'cs-other', class_id: CLASS_B, subject: 'Fen', lesson_date: d, start_time: '15:00:00', end_time: '15:40:00', status: 'scheduled', teacher_id: T1 });
  DB.teacher_lessons.push({ id: 'tl-other', student_id: S2, teacher_id: T1, title: 'Gizli', lesson_date: d, start_time: '10:00:00', status: 'scheduled' });

  const say = conversation();
  const r = await say('Bugünkü ders programımda ne var?');
  assert.equal(r.result.kind, 'live_lessons');
  assert.equal(r.result.ok, true);
  assert.equal(r.result.lessons.length, 2, r.reply);
  assert.match(r.reply, /2 canlı dersin var/);
  assert.match(r.reply, /17:00–17:40 Matematik \(8-A LGS\) — Ahmet Hoca/);
  assert.match(r.reply, /19:00–19:40 Özel ders: İngilizce — Zeynep Hoca/);
  assert.doesNotMatch(r.reply, /Fen|Gizli/);
  assert.match(r.actions[0].path, new RegExp(`^/class-schedule\\?week=${d}`));
  // Şablondan oturum gerçekten üretildi (ekran da aynı adımı yapar)
  assert.ok(DB.class_sessions.some((s) => s.class_id === CLASS_A && s.lesson_date === d));
});

test('canlı ders: iptal edilen ders iptal olarak gösterilir, "ders var" sayılmaz', async () => {
  const d = today();
  DB.class_sessions.push({ id: 'cs-x', class_id: CLASS_A, subject: 'Fen', lesson_date: d, start_time: '16:00:00', end_time: '16:40:00', status: 'cancelled', teacher_id: T1 });
  const r = await conversation()('Bugün dersim var mı?');
  assert.match(r.reply, /iptal/);
  assert.doesNotMatch(r.reply, /1 canlı dersin var/);
});

test('canlı ders: veri kaynağı hatası "ders yok" diye sunulmaz', async () => {
  FAIL.add('class_sessions');
  FAIL.add('teacher_lessons');
  const r = await conversation()('Bugün dersim var mı?');
  assert.equal(r.result.ok, false);
  assert.doesNotMatch(r.reply, /dersin görünmüyor|ders yok\b(?!")/);
  assert.match(r.reply, /ulaşamadım/);
  assert.ok(DB.junior_vip_events.some((e) => e.event_type === 'live_lessons_source_error'));
});

test('canlı ders: gerçekten ders yoksa bunu söyler; "canlı derslerimi aç" ekranı açar', async () => {
  const r = await conversation()('Canlı derslerimi aç');
  assert.equal(r.result.ok, true);
  assert.match(r.reply, /canlı dersin görünmüyor/);
  assert.match(r.actions[0].path, /^\/class-schedule/);
});

// ================================================================== 4. Yetki

test('yetki: öğrenci başka öğrencinin kimliğini gönderse de kayıt kendi hesabına gider / reddedilir', async () => {
  const r = await call({
    method: 'POST',
    query: { op: 'chat' },
    body: { message: 'bugün matematik çarpanlar ve katlar 10 soru çözdüm', student_id: S2, request_id: 'x1' },
    actor: student
  });
  assert.equal(r.status, 403);
  assert.equal(entriesOf(S2).length, 0);
});

test('yetki: başka öğrenciye ait durum belirteci kabul edilmez', async () => {
  const say1 = conversation();
  const first = await say1('Bugün 80 soru çözdüm'); // S1 için bekleyen akış
  const other = { sub: 'u-stu2', role: 'student', student_id: S2, institution_id: INST, email: 's2@x.com' };
  const r = await call({
    method: 'POST',
    query: { op: 'chat' },
    body: { message: 'Matematik çarpanlar ve katlar', state_token: first.state_token, request_id: 'y1' },
    actor: other
  });
  assert.equal(r.status, 200);
  assert.equal(entriesOf(S2).length, 0);
  assert.equal(entriesOf(S1).length, 0);
});

test('yetki: yönetici görünümü yalnız süper admin', async () => {
  assert.equal((await call({ query: { op: 'admin-overview' }, actor: student })).status, 403);
  const r = await call({ query: { op: 'admin-overview' }, actor: superAdmin });
  assert.equal(r.status, 200);
  assert.equal(r.body.budget.limit_usd, 15);
  assert.ok(r.body.events);
});

test('olay kayıtları kişisel veri içermez (mesaj metni / öğrenci kimliği yok)', async () => {
  FAIL.add('weekly_planner_entries:insert');
  await conversation()('yarın planıma matematik çarpanlar 30 soru ekle');
  const raw = JSON.stringify(DB.junior_vip_events);
  assert.ok(DB.junior_vip_events.length > 0);
  assert.doesNotMatch(raw, /stu-1|Ayşe|çarpanlar/i);
});

// ================================================================== 6. Bütçe

test('bütçe: 15 USD toplam sınırı paralel ayırmalarda aşılmaz (kullanıcı başına değil)', async () => {
  DB.junior_vip_budget_settings[0].max_in_flight = 1000;
  const attempts = Array.from({ length: 400 }, () =>
    budget.reserveBudget({ service: 'chat', model: 'gpt-4o-mini', amountUsd: 0.05 }).then(
      (r) => r,
      (e) => e
    )
  );
  const results = await Promise.all(attempts);
  const ok = results.filter((r) => r && r.id);
  const total = ok.reduce((a, r) => a + r.amount, 0);
  assert.ok(total <= 15 - 0.5 + 1e-9, `toplam ${total}`);
  assert.equal(ok.length, 290);
  assert.ok(results.some((r) => r instanceof budget.JuniorVipBudgetError && r.reason === 'budget_exhausted'));
});

test('bütçe: açık çağrı sınırı (paralel istek tavanı)', async () => {
  const rs = await Promise.all(
    Array.from({ length: 10 }, () => budget.reserveBudget({ service: 'chat', model: 'gpt-4o-mini', amountUsd: 0.001 }).catch((e) => e))
  );
  assert.equal(rs.filter((r) => r.id).length, 6);
  assert.ok(rs.some((r) => r.reason === 'too_many_in_flight'));
});

test('bütçe: veritabanına ulaşılamazsa ücretli çağrı yapılmaz (fail-closed)', async () => {
  FAIL.add('rpc');
  await assert.rejects(() => budget.reserveBudget({ service: 'chat', model: 'gpt-4o-mini', amountUsd: 0.01 }), (e) => e.reason === 'ledger_unavailable');
});

test('bütçe: çağrı öncesi azami tutar ayrılır, sonra gerçek kullanımla mutabakat; yeniden deneme yok', async () => {
  process.env.JUNIOR_VIP_OPENAI_API_KEY = 'sk-test';
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"Merhaba!","actions":[]}' } }], usage: { prompt_tokens: 120, completion_tokens: 10 } }), { status: 200 });
  };
  try {
    const out = await openai.budgetedChatCompletion({ messages: [{ role: 'user', content: 'selam' }] });
    assert.equal(calls, 1);
    const l = DB.junior_vip_ai_ledger[0];
    assert.equal(l.status, 'settled');
    assert.ok(l.reserved_usd >= l.actual_usd, 'ayrılan ≥ gerçek');
    assert.equal(l.input_tokens, 120);
    assert.ok(Math.abs(out.cost_usd - (120 * 0.15 + 10 * 0.6) / 1e6) < 1e-12);

    // 500 hatası: tek deneme, 0 USD mutabakat, yeniden deneme yok
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
    };
    await assert.rejects(() => openai.budgetedChatCompletion({ messages: [{ role: 'user', content: 'x' }] }));
    assert.equal(calls, 2);
    assert.equal(DB.junior_vip_ai_ledger[1].actual_usd, 0);

    // Ağ kopması: sonuç bilinmiyor → ayrılan tutar harcanmış sayılır
    globalThis.fetch = async () => {
      throw new Error('ECONNRESET');
    };
    await assert.rejects(() => openai.budgetedChatCompletion({ messages: [{ role: 'user', content: 'x' }] }));
    const l3 = DB.junior_vip_ai_ledger[2];
    assert.equal(l3.actual_usd, l3.reserved_usd);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.JUNIOR_VIP_OPENAI_API_KEY;
  }
});

test('bütçe doldu: ücretli çağrı yapılmaz; plan/kayıt/ders komutları modelsiz çalışmaya devam eder', async () => {
  process.env.JUNIOR_VIP_OPENAI_API_KEY = 'sk-test';
  DB.junior_vip_ai_ledger.push({ id: 'full', month_key: istanbulToday().slice(0, 7), service: 'chat', model: 'gpt-4o-mini', status: 'settled', reserved_usd: 14.8, actual_usd: 14.8 });
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('should not be called');
  };
  try {
    const say = conversation();
    const free = await say('bana bir motivasyon sözü söyler misin');
    assert.equal(calls, 0);
    assert.match(free.reply, /Serbest sohbet bu ay için şu an kapalı/);
    const plan = await say('yarın planıma matematik çarpanlar ve katlar 20 soru ekle');
    assert.match(plan.reply, /Planına ekledim/);
    const log = await say('bugün fen basınç 15 soru çözdüm');
    assert.match(log.reply, /Kaydettim/);
    const live = await say('bugün dersim var mı');
    assert.equal(live.result.kind, 'live_lessons');
    const nav = await say('haftalık planı aç');
    assert.equal(nav.actions[0].path, '/weekly-planner');
    assert.equal(calls, 0, 'yapılandırılmış işlemlerde model çağrısı yok');
    assert.ok(DB.junior_vip_events.some((e) => e.event_type === 'budget_blocked'));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.JUNIOR_VIP_OPENAI_API_KEY;
  }
});

test('bütçe: ses çözümü de bütçeye tabi; bütçe doluysa 429 ve çağrı yok', async () => {
  process.env.JUNIOR_VIP_OPENAI_API_KEY = 'sk-test';
  DB.junior_vip_ai_ledger.push({ id: 'full', month_key: istanbulToday().slice(0, 7), service: 'chat', model: 'gpt-4o-mini', status: 'settled', reserved_usd: 14.9, actual_usd: 14.9 });
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{}', { status: 200 });
  };
  try {
    const r = await call({
      method: 'POST',
      query: { op: 'transcribe' },
      body: { audio_base64: Buffer.alloc(20000).toString('base64'), mime: 'audio/webm' },
      actor: student
    });
    assert.equal(r.status, 429);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.JUNIOR_VIP_OPENAI_API_KEY;
  }
});

test('bütçe: ay anahtarı İstanbul takvimine göre (UTC 31 Ekim 22:30 = İstanbul 1 Kasım)', async () => {
  const { istanbulMonthKey } = await import('../api/_lib/junior-vip-dates.js');
  assert.equal(istanbulMonthKey(new Date('2026-10-31T22:30:00Z')), '2026-11');
  assert.equal(istanbulMonthKey(new Date('2026-10-31T20:30:00Z')), '2026-10');
});

test('katalog: sunucu ders/konu kataloğu ön yüz konu havuzuyla güncel', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  if (!existsSync(new URL('../student-coaching-system/node_modules/esbuild', import.meta.url))) {
    t.skip('ön yüz bağımlılıkları kurulu değil (student-coaching-system: npm ci)');
    return;
  }
  const r = spawnSync(process.execPath, ['scripts/build-junior-vip-catalog.mjs', '--check'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('düzeltme: saat ifadesi soru sayısını değiştirmez', async () => {
  const say = conversation();
  await say('bugün matematik çarpanlar ve katlar 80 soru çözdüm');
  await say("aslında saat 20'de çözdüm");
  assert.equal(entriesOf(S1)[0].solved_questions, 80);
});
