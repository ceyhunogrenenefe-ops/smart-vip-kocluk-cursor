import test from 'node:test';
import assert from 'node:assert/strict';
import { homeworkTargetStudentIds, weekStartDate } from './homework-weekly-plan.js';
import { homeworkModuleBlocked, COACHING_INSTITUTION_ID } from './homework-module.js';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from './quota-enforce.js';

test('sınıfa verilen ödev sınıftaki tüm öğrencileri hedefler', () => {
  const ids = homeworkTargetStudentIds({ assignee_mode: 'class' }, [
    { id: 's1' },
    { id: 's2' },
    { id: 's2' }
  ]);
  assert.deepEqual(ids, ['s1', 's2']);
});

test('seçili öğrencilere verilen ödev yalnız onları hedefler', () => {
  const ids = homeworkTargetStudentIds(
    { assignee_mode: 'students', assignee_student_ids: ['s3', ' s4 ', ''] },
    [{ id: 's1' }, { id: 's2' }]
  );
  assert.deepEqual(ids, ['s3', 's4']);
});

test('atama modu belirtilmezse sınıf kabul edilir', () => {
  const ids = homeworkTargetStudentIds({}, [{ id: 's9' }]);
  assert.deepEqual(ids, ['s9']);
});

test('ödev modülü platform ve Ders & Koçluk kurumlarında kapalı', () => {
  assert.equal(homeworkModuleBlocked(PLATFORM_PRIMARY_INSTITUTION_ID), true);
  assert.equal(homeworkModuleBlocked(COACHING_INSTITUTION_ID), true);
  assert.equal(homeworkModuleBlocked(''), true);
  assert.equal(homeworkModuleBlocked('f222d8bb-4d46-40b4-b78b-d7c1f1964af7'), false);
});

test('hafta başlangıcı pazartesiye yuvarlanır', () => {
  assert.equal(weekStartDate('2026-09-24'), '2026-09-21'); // perşembe → pazartesi
  assert.equal(weekStartDate('2026-09-21'), '2026-09-21'); // pazartesi
  assert.equal(weekStartDate('2026-09-27'), '2026-09-21'); // pazar
  assert.equal(weekStartDate('2026-09-28'), '2026-09-28'); // sonraki pazartesi
});
