/** FAZ 7 — personel WhatsApp bildirim kuralları */
import assert from 'node:assert/strict';
import {
  isQuietHour,
  istanbulHour,
  cleanParam,
  buildStaffAlertTemplatePayload,
  STAFF_ALERT_BODY
} from './crm-staff-alerts.js';

// İstanbul = UTC+3
const at = (hUtc, m = 0) => Date.UTC(2026, 8, 19, hUtc, m);
assert.equal(istanbulHour(at(6)), 9);
assert.equal(isQuietHour(at(5, 59)), true, '08:59 sessiz');
assert.equal(isQuietHour(at(6)), false, '09:00 açık');
assert.equal(isQuietHour(at(18, 59)), false, '21:59 açık');
assert.equal(isQuietHour(at(19)), true, '22:00 sessiz');
assert.equal(isQuietHour(at(23)), true, '02:00 sessiz');

// Meta parametre kuralları: satır sonu / sekme / çoklu boşluk yok, boş olamaz
assert.equal(cleanParam('a\nb\t c    d'), 'a b c d');
assert.equal(cleanParam(''), '-');
assert.equal(cleanParam('x'.repeat(300), 10).length, 10);

// Şablon: metin değişkenle başlamaz / bitmez, 3 konumsal değişken, örnekler eşit sayıda, sabit URL butonu
const p = buildStaffAlertTemplatePayload();
assert.equal(p.name, 'crm_staff_alert');
assert.equal(p.category, 'UTILITY');
assert.ok(!/^\{\{/.test(STAFF_ALERT_BODY.trim()) && !/\}\}\.?$/.test(STAFF_ALERT_BODY.trim()));
const vars = STAFF_ALERT_BODY.match(/\{\{\d+\}\}/g);
assert.deepEqual(vars, ['{{1}}', '{{2}}', '{{3}}']);
assert.equal(p.components[0].example.body_text[0].length, 3);
assert.equal(p.components[1].buttons[0].type, 'URL');
assert.ok(!p.components[1].buttons[0].url.includes('{{'), 'URL sabit (gönderimde parametre gerekmez)');

console.log('crm-staff-alerts: ok');
