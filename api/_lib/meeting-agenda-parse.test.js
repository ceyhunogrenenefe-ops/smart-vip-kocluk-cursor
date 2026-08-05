/**
 * Gündem yapıştırma ayrıştırıcı
 * node --test api/_lib/meeting-agenda-parse.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgendaPasteText } from './meeting-agenda-parse.js';

describe('parseAgendaPasteText', () => {
  it('parses 10 numbered items into 10 agenda drafts', () => {
    const raw = [
      '1. Günlük raporların kontrolü',
      '2. Öğrenci devamsızlıklarının değerlendirilmesi',
      '3. Veli görüşmelerinin planlanması',
      '4. Eksik ödevlerin takibi',
      '5. Deneme sonuçlarının analizi',
      '6. Koç haftalık hedefleri',
      '7. Öğretmen geri bildirimleri',
      '8. Kitap sipariş durumu',
      '9. Etkinlik takvimi',
      '10. Genel değerlendirme'
    ].join('\n');
    const items = parseAgendaPasteText(raw);
    assert.equal(items.length, 10);
    assert.equal(items[0].title, 'Günlük raporların kontrolü');
    assert.equal(items[9].title, 'Genel değerlendirme');
  });

  it('attaches following lines as description', () => {
    const items = parseAgendaPasteText('1. Ana madde\nDetay satırı\n* İkinci madde');
    assert.equal(items.length, 2);
    assert.equal(items[0].title, 'Ana madde');
    assert.match(items[0].description, /Detay satırı/);
    assert.equal(items[1].title, 'İkinci madde');
  });

  it('supports dash and star bullets', () => {
    const items = parseAgendaPasteText('- Bir\n* İki\n• Üç');
    assert.equal(items.length, 3);
  });

  it('returns empty for blank input', () => {
    assert.deepEqual(parseAgendaPasteText(''), []);
    assert.deepEqual(parseAgendaPasteText('   '), []);
  });
});
