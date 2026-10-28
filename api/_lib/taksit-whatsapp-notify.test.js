import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAKSIT_REMINDER_BODY,
  buildTaksitWhatsAppVars,
  taksitReminderPreview
} from './taksit-whatsapp-notify.js';

test('hatırlatma metninde taksit tutarı dolar', () => {
  const row = {
    veli_ad: 'Perihan',
    veli_soyad: 'Yalçın',
    ogrenci_ad: 'Emir',
    ogrenci_soyad: 'Yalçın',
    para_birimi: 'TRY',
    baslangic_tarihi: '2026-10-15'
  };
  const card = { no: 1, tutar_tl: 14000, vade_tarihi: '2026-10-15', odendi: false };
  const vars = buildTaksitWhatsAppVars(row, card, 0);
  const text = taksitReminderPreview(vars);
  assert.match(text, /14000 TL/);
  assert.match(text, /Perihan Yalçın/);
  assert.match(text, /Emir Yalçın/);
  assert.match(text, /1\. taksit/);
  assert.match(text, /15\.10\.2026/);
  assert.equal(text.includes('{{'), false);
  assert.equal((TAKSIT_REMINDER_BODY.match(/\{\{/g) || []).length, 2);
  assert.ok(!TAKSIT_REMINDER_BODY.trim().endsWith('}}'));
});
