import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKvkkNotice,
  buildStaticSystemPrompt,
  possessiveTr,
  sanitizeSiteUrls,
  DEFAULT_KVKK_URL
} from './crm-ai-assistant-core.js';
import { crmModuleAlwaysOn } from './crm-module.js';
import { crmNameFor } from './crm-brand.js';

const brand = { isPlatform: false, name: 'Türkçe Uzmanı', siteUrl: 'https://turkceuzmani.com' };

test('platform: asistan metinleri aynen korunur', () => {
  assert.equal(buildKvkkNotice(DEFAULT_KVKK_URL), buildKvkkNotice(DEFAULT_KVKK_URL, { isPlatform: true }));
  assert.match(buildKvkkNotice(), /Online VIP Dershane’nin/);
  const p = buildStaticSystemPrompt({});
  assert.match(p, /Online VIP Dershane/);
  assert.equal(p, buildStaticSystemPrompt({ brand: { isPlatform: true } }));
});

test('kurum: asistan Online VIP adını, programlarını ve bağlantılarını kullanmaz', () => {
  const notice = buildKvkkNotice('https://turkceuzmani.com/kvkk', brand);
  assert.match(notice, /Türkçe Uzmanı’nın Eğitim Destek Asistanı/);
  assert.match(notice, /turkceuzmani\.com\/kvkk/);
  assert.doesNotMatch(notice, /Online VIP|onlinevipdershane/i);

  const p = buildStaticSystemPrompt({ brand, kbPages: [{ url: 'https://turkceuzmani.com/', title: 'Ana', content: 'Paragraf eğitimi' }] });
  assert.doesNotMatch(p, /Online VIP|onlinevipdershane|Z kitap|Soru Odası/i);
  assert.match(p, /Türkçe Uzmanı/);
  assert.match(p, /https:\/\/turkceuzmani\.com/);
  assert.match(p, /<bilgi_tabani>[\s\S]*Paragraf eğitimi/);
});

test('Türkçe iyelik eki', () => {
  assert.equal(possessiveTr('Türkçe Uzmanı'), 'Türkçe Uzmanı’nın');
  assert.equal(possessiveTr('Smart Koçluk'), 'Smart Koçluk’un');
  assert.equal(possessiveTr('Tasarı koçluk'), 'Tasarı koçluk’un');
});

test('site adresleri: platform yalnız onlinevipdershane, kurum kendi alan adı', () => {
  assert.deepEqual(sanitizeSiteUrls(['https://turkceuzmani.com/']), []);
  assert.deepEqual(
    sanitizeSiteUrls(['https://www.turkceuzmani.com/', 'https://turkceuzmani.com/a', 'https://baska.com/'], null),
    ['https://www.turkceuzmani.com/', 'https://turkceuzmani.com/a']
  );
});

test('CRM lisansı: platform her zaman açık, diğerleri değil', () => {
  assert.equal(crmModuleAlwaysOn('73323d75-eea1-4552-8bba-d50555423589'), true);
  assert.equal(crmModuleAlwaysOn('f222d8bb-4d46-40b4-b78b-d7c1f1964af7'), false);
});

test('bildirim adı', () => {
  assert.equal(crmNameFor('TÜRKÇE UZMANI'), 'TÜRKÇE UZMANI CRM');
  assert.equal(crmNameFor(''), 'CRM');
});
