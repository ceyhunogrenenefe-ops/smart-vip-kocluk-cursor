import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LESSON_DURATION_MINUTES,
  GROUP_LESSON_UNIT_MINUTES,
  sessionLessonUnits40,
  completedSessionMinutes
} from './class-lesson-payment-units.js';
import { privateLessonUnitsFromRow, unitsToMinutes } from './private-lesson-fee-hours.js';

test('kurum standardı 40 dakika, eski ad aynı sabiti verir', () => {
  assert.equal(LESSON_DURATION_MINUTES, 40);
  assert.equal(GROUP_LESSON_UNIT_MINUTES, LESSON_DURATION_MINUTES);
});

test('süreden ders adedi: 40/80/120/160 dakika', () => {
  // Kurum kuralı — 60 dakika = 1 ders mantığı hiçbir yerde kullanılmaz
  assert.equal(privateLessonUnitsFromRow({ duration_minutes: 40 }), 1);
  assert.equal(privateLessonUnitsFromRow({ duration_minutes: 80 }), 2);
  assert.equal(privateLessonUnitsFromRow({ duration_minutes: 120 }), 3);
  assert.equal(privateLessonUnitsFromRow({ duration_minutes: 160 }), 4);
});

test('60 dakika 1 ders DEĞİL, 1.5 derstir', () => {
  assert.equal(privateLessonUnitsFromRow({ duration_minutes: 60 }), 1.5);
});

test('18:00–19:20 dersi 80 dakika ve 2 ders', () => {
  const row = { start_time: '18:00:00', end_time: '19:20:00' };
  assert.equal(completedSessionMinutes(row), 80);
  assert.equal(sessionLessonUnits40(row), 2);
  // duration_minutes yoksa saatlerden hesaplanır
  assert.equal(privateLessonUnitsFromRow(row), 2);
});

test('süre yazılmışsa saatler yerine süre esas alınır', () => {
  const row = { duration_minutes: 120, start_time: '18:00:00', end_time: '19:20:00' };
  assert.equal(privateLessonUnitsFromRow(row), 3);
});

test('süre de saat de yoksa tek ders sayılır', () => {
  assert.equal(privateLessonUnitsFromRow({}), 1);
  assert.equal(privateLessonUnitsFromRow({ duration_minutes: 0 }), 1);
});

test('ders adedinden dakikaya geri dönüş', () => {
  assert.equal(unitsToMinutes(2), 80);
  assert.equal(unitsToMinutes(1), 40);
  assert.equal(unitsToMinutes(0), 0);
  assert.equal(unitsToMinutes(2.25), 90);
});

test('ücret ders adedi üzerinden çıkar', () => {
  // 80 dk ders, 950 ₺/ders → 1900 ₺. Saate çevirseydik 1267 ₺ çıkardı.
  const units = privateLessonUnitsFromRow({ duration_minutes: 80 });
  assert.equal(units * 950, 1900);
});
