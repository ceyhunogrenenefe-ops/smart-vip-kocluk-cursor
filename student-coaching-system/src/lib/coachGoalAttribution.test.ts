/**
 * Haftalık plan hedef tutarlılığı regresyon testleri.
 *
 * Çalıştırma:
 *   npx esbuild src/lib/coachGoalAttribution.test.ts --bundle --platform=node --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs
 */
import assert from 'node:assert/strict';
import {
  attributeCoachGoalCompletions,
  completedForCoachGoal,
  dedupeCoachGoalsForAnalytics,
  effectivePlannerEntryDone,
  totalCoachQuestionTargetsInRange
} from './coachGoalAnalytics';
import type { CoachWeeklyGoalRow, WeeklyPlannerEntryRow } from './weeklyPlannerApi';
import type { WeeklyEntry } from '../types';

const WEEK = '2026-09-14';
const FROM = '2026-09-14';
const TO = '2026-09-20';

function goal(id: string, subject: string, target: number, created: string, extra: Partial<CoachWeeklyGoalRow> = {}) {
  return {
    id,
    student_id: 's1',
    coach_id: 'c1',
    institution_id: null,
    subject,
    title: `${subject} ${target}`,
    target_quantity: target,
    week_start_date: WEEK,
    goal_start_date: null,
    goal_end_date: null,
    quantity_unit: 'soru',
    created_at: created,
    updated_at: created,
    ...extra
  } as CoachWeeklyGoalRow;
}

function entry(id: string, subject: string, date: string, solved: number) {
  return { id, studentId: 's1', subject, date, solvedQuestions: solved } as unknown as WeeklyEntry;
}

function block(id: string, goalId: string, date: string, planned: number, extra: Partial<WeeklyPlannerEntryRow> = {}) {
  return {
    id,
    student_id: 's1',
    institution_id: null,
    coach_goal_id: goalId,
    planner_date: date,
    start_time: '10:00',
    end_time: '11:00',
    title: 'blok',
    subject: 'Matematik',
    planned_quantity: planned,
    completed_quantity: 0,
    status: 'planned',
    weekly_entry_id: null,
    ...extra
  } as unknown as WeeklyPlannerEntryRow;
}

const A = goal('A', 'Matematik', 100, '2026-09-14T08:00:00Z');
const B = goal('B', 'Matematik', 50, '2026-09-14T09:00:00Z', { title: 'Matematik problem' });
const goals = [A, B];

// 1) Tek kayıt, aynı dersteki iki hedefe birden sayılmaz (iki hedef birden yeşile dönmez)
{
  const done = attributeCoachGoalCompletions(goals, [entry('e1', 'Matematik', '2026-09-15', 60)], FROM, TO);
  assert.equal(done.get('A'), 60);
  assert.equal(done.get('B'), 0);
}

// 2) Birinci hedef dolunca kalan ikinciye geçer
{
  const done = attributeCoachGoalCompletions(
    goals,
    [entry('e1', 'Matematik', '2026-09-15', 60), entry('e2', 'Matematik', '2026-09-16', 70)],
    FROM,
    TO
  );
  assert.equal(done.get('A'), 100);
  assert.equal(done.get('B'), 30);
}

// 3) Hedefin fazlası kabul edilir ve son hedefte görünür, toplam korunur
{
  const done = attributeCoachGoalCompletions(goals, [entry('e1', 'Matematik', '2026-09-15', 200)], FROM, TO);
  assert.equal(done.get('A'), 100);
  assert.equal(done.get('B'), 100);
  assert.equal((done.get('A') ?? 0) + (done.get('B') ?? 0), 200);
}

// 4) Öğrencinin bloğa bağladığı çalışma yalnız o bloğun hedefine sayılır
{
  const entries = [entry('e1', 'Matematik', '2026-09-15', 40), entry('e2', 'Matematik', '2026-09-16', 30)];
  const planner = [block('blok-b', 'B', '2026-09-15', 40, { weekly_entry_id: 'e1' })];
  const done = attributeCoachGoalCompletions(goals, entries, FROM, TO, planner);
  assert.equal(done.get('B'), 40);
  assert.equal(done.get('A'), 30);
}

// 5) Otomatik senkron bloğu (günlük kayıttan üretilen) hedefi zorlamaz, kayıt paylaştırılır
{
  const entries = [entry('e1', 'Matematik', '2026-09-15', 120)];
  const planner = [
    block('wpe-sync-e1', 'A', '2026-09-15', 120, { weekly_entry_id: 'e1', completed_quantity: 120, status: 'completed' })
  ];
  const done = attributeCoachGoalCompletions(goals, entries, FROM, TO, planner);
  assert.equal(done.get('A'), 100);
  assert.equal(done.get('B'), 20);
}

// 6) Elle tamamlandı + günlük kayıt aynı çalışmayı iki kez saymaz (büyük olan alınır)
{
  const entries = [entry('e1', 'Matematik', '2026-09-15', 60)];
  const planner = [block('blok-a', 'A', '2026-09-15', 80, { status: 'completed', completed_quantity: 80 })];
  const done = attributeCoachGoalCompletions([A], entries, FROM, TO, planner);
  assert.equal(done.get('A'), 80);
}

// 7) Farklı ders birbirini etkilemez
{
  const T = goal('T', 'Türkçe', 40, '2026-09-14T10:00:00Z');
  const done = attributeCoachGoalCompletions(
    [A, T],
    [entry('e1', 'Matematik', '2026-09-15', 30), entry('e2', 'Türkçe', '2026-09-15', 25)],
    FROM,
    TO
  );
  assert.equal(done.get('A'), 30);
  assert.equal(done.get('T'), 25);
}

// 8) Hedef aralığı dışındaki kayıt sayılmaz
{
  const done = attributeCoachGoalCompletions([A], [entry('e1', 'Matematik', '2026-09-22', 50)], FROM, TO);
  assert.equal(done.get('A'), 0);
}

// 9) Tek hedef API'si: diğer hedefler verilince paylaştırma yapılır
{
  const entries = [entry('e1', 'Matematik', '2026-09-15', 60)];
  assert.equal(completedForCoachGoal(B, entries, FROM, TO, [], goals), 0);
  assert.equal(completedForCoachGoal(A, entries, FROM, TO, [], goals), 60);
}

// 10) Takvim bloğu hedefin fazlasını gösterir (planlanana kırpılmaz)
{
  const b = block('blok', 'A', '2026-09-15', 50, { weekly_entry_id: 'e1' });
  assert.equal(effectivePlannerEntryDone(A, b, [entry('e1', 'Matematik', '2026-09-15', 70)]), 70);
}

// 11) Analiz: aynı haftaya aynı dersten verilen ayrı hedefler korunur, hedef toplamı eksik görünmez
{
  const kept = dedupeCoachGoalsForAnalytics(goals, FROM, TO);
  assert.equal(kept.length, 2);
  assert.equal(totalCoachQuestionTargetsInRange(goals, FROM, TO), 150);
}

// 12) Birebir aynı kaydedilmiş kopya ve eski döneme ait çakışan hedef elenir
{
  const copy = goal('A2', 'Matematik', 100, '2026-09-14T08:05:00Z');
  const old = goal('OLD', 'Matematik', 300, '2026-09-01T08:00:00Z', {
    week_start_date: '2026-09-07',
    goal_start_date: '2026-09-07',
    goal_end_date: '2026-09-15'
  });
  const kept = dedupeCoachGoalsForAnalytics([A, copy, B, old], FROM, TO).map((g) => g.id).sort();
  assert.deepEqual(kept, ['A', 'B']);
}

// 13) Ardışık haftaların aynı ders hedefleri (tarihleri kesişmiyor) ikisi de sayılır
{
  const w1 = goal('W1', 'Matematik', 100, '2026-09-14T08:00:00Z', {
    goal_start_date: '2026-09-14',
    goal_end_date: '2026-09-20'
  });
  const w2 = goal('W2', 'Matematik', 150, '2026-09-21T08:00:00Z', {
    week_start_date: '2026-09-21',
    goal_start_date: '2026-09-21',
    goal_end_date: '2026-09-27'
  });
  const kept = dedupeCoachGoalsForAnalytics([w1, w2], '2026-09-14', '2026-09-27').map((g) => g.id).sort();
  assert.deepEqual(kept, ['W1', 'W2']);
  assert.equal(totalCoachQuestionTargetsInRange([w1, w2], '2026-09-14', '2026-09-27'), 250);
}

// 14) Paragraf ve problem hedefleri toplam soru hedefine dahil
{
  const m = goal('M', 'Matematik', 100, '2026-09-14T08:00:00Z');
  const pr = goal('P', 'Paragraf Çözme', 40, '2026-09-14T08:01:00Z', { quantity_unit: 'paragraf' });
  const pb = goal('Q', 'Problem Çözme', 20, '2026-09-14T08:02:00Z', { quantity_unit: 'problem' });
  assert.equal(totalCoachQuestionTargetsInRange([m, pr, pb], FROM, TO), 160);
}

console.log('coachGoalAttribution tests ok (14 senaryo)');
