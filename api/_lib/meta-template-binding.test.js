import test from 'node:test';
import assert from 'node:assert/strict';
import { isParameterCountMismatch, resolveBindingFromMetaBody, templateSkeleton } from './meta-template-binding.js';

const FALLBACK =
  'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).';
const NEW_DB = 'Sayın velimiz, öğrencimiz {{student_name}}, {{subject}} dersine katılmamıştır. Bilginize.';

test('pozisyonel Meta gövdesi bilinen metinle eşlenir (devamsızlık şablonu)', () => {
  const meta =
    'Sayın veli, {{1}} {{2}} tarihinde {{3}} başlangıçlı {{4}} sınıfı {{5}} grup canlı dersine katılmamıştır (yoklama: gelmedi).';
  const b = resolveBindingFromMetaBody(meta, [NEW_DB, FALLBACK]);
  assert.deepEqual(b.variables, ['student_name', 'lesson_date', 'lesson_time', 'class_name', 'subject']);
  assert.equal(b.named, false);
  assert.equal(b.content, FALLBACK);
});

test('adlı Meta gövdesi doğrudan kullanılır', () => {
  const b = resolveBindingFromMetaBody(FALLBACK, [NEW_DB]);
  assert.equal(b.named, true);
  assert.deepEqual(b.variables, ['student_name', 'lesson_date', 'lesson_time', 'class_name', 'subject']);
});

test('eşlenemeyen pozisyonel gövde null döner', () => {
  assert.equal(resolveBindingFromMetaBody('Merhaba {{1}}, {{2}} bilgi', [NEW_DB]), null);
});

test('iskelet boşluk/büyük harf farkını yok sayar', () => {
  assert.equal(templateSkeleton('A  {{x}}\nB'), templateSkeleton('a {{1}} b'));
});

test('132000 hatası tanınır', () => {
  assert.ok(isParameterCountMismatch({ error: '(#132000) Number of parameters does not match the expected number of params' }));
  assert.ok(isParameterCountMismatch({ errorCode: '132000' }));
  assert.ok(!isParameterCountMismatch({ error: 'template_not_found' }));
});
