import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWhatsAppInteractive,
  buildInstagramQuickReplies,
  interactiveSupported
} from './crm-interactive-message.js';
import { GRADE_LEVELS, GRADE_OPTIONS, gradeOptionsForLevel } from './crm-auto-greeting-core.js';

const levels = GRADE_LEVELS.map((l) => ({ key: l.key, label: l.label }));

describe('WhatsApp seçmeli mesaj', () => {
  it('3 kademe reply button olur', () => {
    const p = buildWhatsAppInteractive({ text: 'Kademe?', options: levels });
    assert.equal(p.type, 'button');
    assert.equal(p.action.buttons.length, 3);
    assert.equal(p.action.buttons[0].reply.id, 'ilkokul');
    assert.equal(p.action.buttons[2].reply.title, 'Lise / Mezun');
  });

  it('4-10 seçenek liste olur', () => {
    const p = buildWhatsAppInteractive({
      text: 'Sınıf?',
      options: gradeOptionsForLevel('ortaokul'),
      listButtonLabel: 'Sınıf seç'
    });
    assert.equal(p.type, 'list');
    assert.equal(p.action.sections[0].rows.length, 4);
    assert.equal(p.action.button, 'Sınıf seç');
  });

  it('lise kademesi 5 satırla sığar', () => {
    const p = buildWhatsAppInteractive({ text: 'Sınıf?', options: gradeOptionsForLevel('lise') });
    assert.equal(p.action.sections[0].rows.length, 5);
  });

  it('12 sınıfın tamamı WhatsApp listesine sığmaz — bu yüzden iki adım var', () => {
    assert.equal(buildWhatsAppInteractive({ text: 'Sınıf?', options: GRADE_OPTIONS }), null);
    assert.equal(interactiveSupported('whatsapp', GRADE_OPTIONS), false);
    assert.equal(interactiveSupported('whatsapp', levels), true);
  });

  it('metin veya seçenek yoksa null', () => {
    assert.equal(buildWhatsAppInteractive({ text: '', options: levels }), null);
    assert.equal(buildWhatsAppInteractive({ text: 'x', options: [] }), null);
  });
});

describe('Instagram quick reply', () => {
  it('kademeleri quick reply yapar', () => {
    const p = buildInstagramQuickReplies({ text: 'Kademe?', options: levels });
    assert.equal(p.quick_replies.length, 3);
    assert.equal(p.quick_replies[1].payload, 'ortaokul');
    assert.equal(p.quick_replies[1].content_type, 'text');
  });

  it('başlık 20 karakteri aşarsa null (numaralı metne düşülür)', () => {
    const long = [{ key: 'a', label: 'Bu başlık yirmi karakterden çok daha uzun' }];
    assert.equal(buildInstagramQuickReplies({ text: 'x', options: long }), null);
  });

  it('13ten fazla seçenek null', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ key: String(i), label: `S${i}` }));
    assert.equal(buildInstagramQuickReplies({ text: 'x', options: many }), null);
  });
});
