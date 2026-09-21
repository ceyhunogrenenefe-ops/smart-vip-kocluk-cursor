import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSiteLeadMessage,
  isPaidAdAttribution,
  isSiteLeadHoneypot,
  parseSiteLeadPayload,
  siteLeadIdempotencyKey,
  siteLeadNotes
} from './site-leads.js';

test('parseSiteLeadPayload maps iletisim / callback fields', () => {
  const p = parseSiteLeadPayload({
    ad_soyad: 'Ayşe Yılmaz',
    telefon: '0532 123 45 67',
    email: 'ayse@example.com',
    sinif: '8. Sınıf',
    program: 'LGS Hazırlık',
    not: 'Ana sayfa — sizi arayalım',
    form_kind: 'iletisim',
    page: 'https://www.onlinevipdershane.com/iletisim.html?utm_source=facebook&utm_campaign=lgs-form'
  });
  assert.equal(p.normalizedPhone, '05321234567');
  assert.equal(p.gradeProgram, 'lgs');
  assert.equal(p.source, 'website_form_ad');
  assert.equal(p.paidAd, true);
  assert.equal(p.name, 'Ayşe Yılmaz');
  assert.match(formatSiteLeadMessage(p), /Reklam formu/);
  assert.match(formatSiteLeadMessage(p), /LGS Hazırlık/);
  assert.match(siteLeadNotes(p), /website_form_ad/);
});

test('parseSiteLeadPayload maps assessment contact + answers', () => {
  const p = parseSiteLeadPayload({
    op: 'submit',
    source: 'ucretsiz-ogrenci-analizi',
    contact: { parentName: 'Mehmet Kaya', phone: '+90 555 111 22 33', email: 'm@k.com' },
    answers: { sinif: '11. Sınıf', zayif_ders: 'Matematik' },
    utm: { source: 'instagram', medium: 'cpc', campaign: 'yks-analiz' },
    landingPage: 'https://onlinevipdershane.com/ucretsiz-ogrenci-analizi.html'
  });
  assert.equal(p.formKind, 'assessment');
  assert.equal(p.normalizedPhone, '05551112233');
  assert.equal(p.gradeProgram, 'grade_11');
  assert.equal(p.source, 'website_form_ad');
  assert.match(formatSiteLeadMessage(p), /Ücretsiz öğrenci analizi/);
  assert.match(formatSiteLeadMessage(p), /zayif_ders: Matematik/);
});

test('organic site form is website_form not ad', () => {
  const p = parseSiteLeadPayload({
    ad_soyad: 'Ali Veli',
    telefon: '5321234567',
    sinif: '5. Sınıf',
    page: 'https://www.onlinevipdershane.com/iletisim.html'
  });
  assert.equal(p.source, 'website_form');
  assert.equal(p.paidAd, false);
  assert.equal(p.gradeProgram, 'grade_5');
});

test('isPaidAdAttribution detects fbclid / cpc', () => {
  assert.equal(isPaidAdAttribution({ utm_source: 'google', utm_medium: 'cpc' }), true);
  assert.equal(isPaidAdAttribution({}, { page: 'https://x.com/?fbclid=abc' }), true);
  assert.equal(isPaidAdAttribution({ utm_source: 'newsletter' }), false);
});

test('honeypot fields are detected', () => {
  assert.equal(isSiteLeadHoneypot({ ad_soyad: 'A', website: 'http://spam' }), true);
  assert.equal(isSiteLeadHoneypot({ ad_soyad: 'A', telefon: '05321234567' }), false);
});

test('grade inferred from free-text note when sinif empty', () => {
  const p = parseSiteLeadPayload({
    ad_soyad: 'Deniz Ak',
    telefon: '5321234567',
    not: 'YKS 11. sınıf için koçluk istiyoruz'
  });
  assert.equal(p.gradeProgram, 'grade_11');
});

test('aynı gönderim tarayıcıdan da sunucudan da gelse tek kayıt olur', () => {
  // crm-site-lead.js ham form alanlarını, site sunucusu normalize edilmiş alanları yollar
  const browser = parseSiteLeadPayload({
    form_kind: 'iletisim',
    ad_soyad: 'Vildan Odabaş',
    telefon: '05068329481',
    sinif: '10',
    program: '3 Günlük Ücretsiz Deneme Dersi',
    page: 'https://onlinevipdershane.com/'
  });
  const server = parseSiteLeadPayload({
    form_kind: 'iletisim',
    ad_soyad: 'Vildan Odabaş',
    telefon: '+905068329481',
    sinif: '10',
    program: '3 Günlük Ücretsiz Deneme Dersi'
  });
  assert.equal(siteLeadIdempotencyKey(browser), siteLeadIdempotencyKey(server));
});

test('farklı numara ve farklı form türü ayrı kayıt olur', () => {
  const base = { form_kind: 'iletisim', ad_soyad: 'A B', telefon: '05068329481' };
  const key = siteLeadIdempotencyKey(parseSiteLeadPayload(base));
  assert.notEqual(key, siteLeadIdempotencyKey(parseSiteLeadPayload({ ...base, telefon: '05321112233' })));
  assert.notEqual(key, siteLeadIdempotencyKey(parseSiteLeadPayload({ ...base, form_kind: 'kayit' })));
});
