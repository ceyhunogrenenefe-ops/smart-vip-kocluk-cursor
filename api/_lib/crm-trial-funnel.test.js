import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTrialFunnel } from './crm-trial-funnel.js';

const leads = [
  { id: 'a', grade_program: 'grade_7', stage: 'confirmed', primary_status: 'confirmed' },
  { id: 'b', grade_program: 'grade_7', stage: 'trial_lesson_scheduled', primary_status: 'tracking' },
  { id: 'c', grade_program: 'grade_11', stage: 'trial_lesson_completed', primary_status: 'tracking' },
  { id: 'd', grade_program: 'grade_11', stage: 'new_lead', primary_status: 'tracking' }
];
const history = [
  { lead_id: 'a', new_stage: 'trial_lesson_scheduled', changed_at: '2026-09-15T09:00:00Z' },
  { lead_id: 'a', new_stage: 'trial_lesson_completed', changed_at: '2026-09-16T09:00:00Z' },
  { lead_id: 'a', new_stage: 'confirmed', changed_at: '2026-09-17T09:00:00Z' },
  { lead_id: 'b', new_stage: 'trial_lesson_scheduled', changed_at: '2026-09-18T09:00:00Z' },
  { lead_id: 'c', new_stage: 'trial_lesson_completed', changed_at: '2026-09-19T09:00:00Z' },
  // aralık dışı
  { lead_id: 'd', new_stage: 'trial_lesson_scheduled', changed_at: '2026-08-01T09:00:00Z' }
];

test('sınıf bazında planlanan / katılan / katılmayan / kayıt', () => {
  const r = summarizeTrialFunnel(leads, history, '2026-09-14', '2026-09-20');
  const g7 = r.by_grade.find((x) => x.grade === 'grade_7');
  assert.deepEqual(
    { p: g7.planned, a: g7.attended, n: g7.not_attended, r: g7.registered },
    { p: 2, a: 1, n: 1, r: 1 }
  );
  const g11 = r.by_grade.find((x) => x.grade === 'grade_11');
  assert.equal(g11.planned, 1);
  assert.equal(g11.attended, 1);
  assert.equal(r.totals.planned, 3);
  assert.equal(r.totals.registered, 1);
  assert.equal(r.totals.attend_rate, 66.7);
});

test('sıralama sınıf düzenine göre, etiket Türkçe', () => {
  const r = summarizeTrialFunnel(leads, history, '2026-09-14', '2026-09-20');
  assert.deepEqual(r.by_grade.map((x) => x.label), ['7. Sınıf', '11. Sınıf']);
});

test('aralık dışındaki deneme dersi sayılmaz', () => {
  const r = summarizeTrialFunnel(leads, history, '2026-07-01', '2026-07-31');
  assert.equal(r.totals.planned, 0);
  assert.equal(r.totals.attend_rate, null);
});

test('geçmişi olmayan ama deneme aşamasında duran lead güncelleme tarihine göre sayılır', () => {
  const r = summarizeTrialFunnel(
    [{ id: 'x', grade_program: 'lgs', stage: 'trial_lesson_scheduled', primary_status: 'tracking', updated_at: '2026-09-15T10:00:00Z' }],
    [],
    '2026-09-14',
    '2026-09-20'
  );
  assert.equal(r.totals.planned, 1);
  assert.equal(r.by_grade[0].label, 'LGS');
});
