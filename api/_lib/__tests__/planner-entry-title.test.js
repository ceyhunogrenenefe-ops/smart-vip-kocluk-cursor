import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAutoDailyPlannerTitle,
  resolvePlannerEntryTitle
} from '../planner-entry-title.js';

test('otomatik gunluk basliklari konu basligi sayilmaz', () => {
  assert.equal(isAutoDailyPlannerTitle('Günlük kayıt: Elektrokimya'), true);
  assert.equal(isAutoDailyPlannerTitle('📝 Günlük: Paragraf'), true);
  assert.equal(isAutoDailyPlannerTitle('Nükleik Asitler'), false);
});

test('mevcut konu basligi korunur', () => {
  assert.equal(resolvePlannerEntryTitle('Deneme Sınavı', 'AYT Kimya', 'Elektrokimya'), 'Deneme Sınavı');
  assert.equal(resolvePlannerEntryTitle('Günlük kayıt: X', 'Matematik', 'Logaritma'), 'Logaritma');
  assert.equal(resolvePlannerEntryTitle('', 'Matematik', ''), 'Matematik');
});
