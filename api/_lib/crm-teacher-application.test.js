import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTeacherApplication,
  withTeacherApplicationTag,
  TEACHER_APPLICATION_TAG
} from './crm-teacher-application.js';

test('açık başvuru kalıpları yakalanır', () => {
  const ornekler = [
    'Merhaba, öğretmen başvurusu yapmak istiyorum',
    'Kurumunuzda öğretmen alımı var mı acaba?',
    'İş başvurusu için CV gönderebilir miyim',
    'Özgeçmişimi paylaşmak istiyorum',
    'Matematik öğretmeni olarak çalışmak istiyorum',
    'Öğretmen ihtiyacınız var mı?'
  ];
  for (const m of ornekler) {
    const r = detectTeacherApplication(m);
    assert.equal(r.match, true, m);
    assert.equal(r.confidence, 'high', m);
  }
});

test('rol + niyet birleşimi orta güvenle yakalanır', () => {
  const r = detectTeacherApplication('Fen bilimleri öğretmeniyim, kurumunuzda görev almak istiyorum');
  assert.equal(r.match, true);
  assert.equal(r.confidence, 'medium');
});

test('veli mesajları başvuru sayılmaz', () => {
  const ornekler = [
    'Öğretmenim ne zaman gelecek?',
    'Öğretmenime iletir misiniz, yarın gelemeyeceğiz',
    'Çocuğumun öğretmeni ile görüşmek istiyorum',
    'Öğretmen değişikliği talep ediyoruz'
  ];
  for (const m of ornekler) {
    const r = detectTeacherApplication(m);
    assert.equal(r.match, false, m);
  }
});

test('kayıt / fiyat soran aday mesajı başvuru sayılmaz', () => {
  const ornekler = [
    'Merhaba, 8. sınıf için fiyat bilgisi alabilir miyim?',
    'Kayıt için ne yapmam gerekiyor?',
    'LGS kursunuz var mı?',
    'Deneme sınavı ne zaman?'
  ];
  for (const m of ornekler) {
    assert.equal(detectTeacherApplication(m).match, false, m);
  }
});

test('çok kısa veya boş mesaj yakalanmaz', () => {
  assert.equal(detectTeacherApplication('').match, false);
  assert.equal(detectTeacherApplication('cv').match, false);
  assert.equal(detectTeacherApplication(null).match, false);
});

test('büyük harf ve şapkalı yazım fark etmez', () => {
  assert.equal(detectTeacherApplication('ÖĞRETMEN BAŞVURUSU YAPMAK İSTİYORUM').match, true);
  assert.equal(detectTeacherApplication('öğretmen başvurusu').match, true);
});

test('etiket eklenir, var olan etiketler korunur', () => {
  const meta = withTeacherApplicationTag({ tags: ['Sıcak'], note: 'x' });
  assert.deepEqual(meta.tags, ['Sıcak', TEACHER_APPLICATION_TAG]);
  assert.equal(meta.teacher_application, true);
  assert.equal(meta.note, 'x');
});

test('etiket iki kez eklenmez', () => {
  const once = withTeacherApplicationTag({});
  const twice = withTeacherApplicationTag(once);
  assert.equal(twice.tags.filter((t) => t === TEACHER_APPLICATION_TAG).length, 1);
});
