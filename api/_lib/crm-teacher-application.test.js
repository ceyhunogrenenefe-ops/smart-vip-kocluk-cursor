import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTeacherApplicationMessage,
  detectTeacherApplication,
  teacherFlowReady,
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

test('şablondaki link değişkeni panel URL ile değişir', () => {
  const text = buildTeacherApplicationMessage({
    template: 'Merhaba\n🔗 [ÖĞRETMEN_BASVURU_LINKI]\nTeşekkürler',
    applicationUrl: 'https://ornek.com/ogretmen'
  });
  assert.match(text, /https:\/\/ornek\.com\/ogretmen/);
  assert.doesNotMatch(text, /\[ÖĞRETMEN_BASVURU_LINKI\]/);
});

test('şapkasız yazım ve eski değişken adı da desteklenir', () => {
  const a = buildTeacherApplicationMessage({
    template: '[OGRETMEN_BASVURU_LINKI]',
    applicationUrl: 'https://x.co/a'
  });
  assert.equal(a, 'https://x.co/a');
  const b = buildTeacherApplicationMessage({
    template: '[ÖĞRETMEN BAŞVURU LİNKİ]',
    applicationUrl: 'https://x.co/b'
  });
  assert.equal(b, 'https://x.co/b');
});

test('link yoksa değişken satırı mesaja sızmaz', () => {
  const text = buildTeacherApplicationMessage({
    template: 'Merhaba\n🔗 [ÖĞRETMEN_BASVURU_LINKI]\nTeşekkürler',
    applicationUrl: ''
  });
  assert.doesNotMatch(text, /\[/);
  assert.match(text, /Merhaba/);
  assert.match(text, /Teşekkürler/);
});

test('link tanımlı değilse otomasyon hazır sayılmaz', () => {
  assert.equal(teacherFlowReady({ teacher_application_url: '' }), false);
  assert.equal(teacherFlowReady({ teacher_application_url: '  ' }), false);
  assert.equal(teacherFlowReady({ teacher_application_url: 'https://x.co' }), true);
});
