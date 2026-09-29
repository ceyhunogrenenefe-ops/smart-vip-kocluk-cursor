import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_TYPES,
  CLOSING_LINE,
  SURVEY_QUESTIONS,
  buildOpeningLine,
  callStatusLabel,
  deriveCallStatus,
  recommendOpensReferral,
  summarizeByAgent,
  summarizeCalls
} from './parent-satisfaction-core.js';

describe('arama durumu türetimi', () => {
  it('görüşme yoksa aranacak', () => {
    assert.equal(deriveCallStatus(null), 'pending');
    assert.equal(deriveCallStatus(undefined), 'pending');
  });

  it('aksiyon her şeyi yener', () => {
    assert.equal(
      deriveCallStatus({ call_result: 'completed', action_required: true }),
      'action'
    );
  });

  it('aksiyon kapatıldıysa normal duruma döner', () => {
    assert.equal(
      deriveCallStatus({ call_result: 'completed', action_required: true, action_done_at: '2026-09-29' }),
      'completed'
    );
  });

  it('arama sonuçları doğru eşlenir', () => {
    assert.equal(deriveCallStatus({ call_result: 'completed' }), 'completed');
    assert.equal(deriveCallStatus({ call_result: 'call_later' }), 'call_later');
    assert.equal(deriveCallStatus({ call_result: 'unreachable' }), 'unreachable');
    assert.equal(deriveCallStatus({ call_result: 'phone_off' }), 'unreachable');
    assert.equal(deriveCallStatus({ call_result: 'wrong_number' }), 'unreachable');
  });

  it('etiketler Türkçe', () => {
    assert.equal(callStatusLabel('pending'), 'Aranacak');
    assert.equal(callStatusLabel('action'), 'Aksiyon Gerekiyor');
    assert.equal(callStatusLabel('yok'), 'Aranacak');
  });
});

describe('referans alanı', () => {
  it('yalnız olumlu tavsiyede açılır', () => {
    assert.equal(recommendOpensReferral('definitely'), true);
    assert.equal(recommendOpensReferral('maybe'), true);
    assert.equal(recommendOpensReferral('undecided'), false);
    assert.equal(recommendOpensReferral('no'), false);
    assert.equal(recommendOpensReferral(null), false);
  });
});

describe('giriş cümlesi', () => {
  it('veli ve öğrenci adı yerleşir', () => {
    const t = buildOpeningLine({ parentName: 'Ayşe Hanım', studentName: 'Mehmet' });
    assert.ok(t.includes('Ayşe Hanım'));
    assert.ok(t.includes("Mehmet'nın") || t.includes('Mehmet'));
  });
  it('ad yoksa nazik varsayılan', () => {
    const t = buildOpeningLine({});
    assert.ok(t.includes('Değerli velimiz'));
    assert.ok(t.includes('öğrencimiz'));
  });
  it('kapanış cümlesi sabit', () => {
    assert.ok(CLOSING_LINE.includes('Geri bildirimleriniz'));
  });
});

describe('anket yapısı', () => {
  it('dört soru var ve hepsinin seçeneği dolu', () => {
    assert.equal(SURVEY_QUESTIONS.length, 4);
    for (const q of SURVEY_QUESTIONS) {
      assert.ok(q.options.length >= 3, q.id);
      assert.ok(q.text.length > 20, q.id);
    }
  });
  it('sekiz aksiyon türü', () => {
    assert.equal(ACTION_TYPES.length, 8);
  });
});

describe('yönetici özeti', () => {
  const rows = [
    { call_status: 'pending', agent_user_id: 'a' },
    { call_status: 'completed', agent_user_id: 'a', has_referral: true },
    { call_status: 'unreachable', agent_user_id: 'b' },
    { call_status: 'action', agent_user_id: 'b' },
    { call_status: 'call_later', agent_user_id: null }
  ];

  it('kartlar doğru sayar', () => {
    const s = summarizeCalls(rows);
    assert.equal(s.total, 5);
    assert.equal(s.pending, 1);
    assert.equal(s.called, 4);
    assert.equal(s.completed, 1);
    assert.equal(s.unreachable, 1);
    assert.equal(s.call_later, 1);
    assert.equal(s.action, 1);
    assert.equal(s.referral, 1);
  });

  it('temsilci tablosu', () => {
    const t = summarizeByAgent(rows, { a: 'Zeynep', b: 'Ahmet' });
    const zeynep = t.find((x) => x.id === 'a');
    assert.equal(zeynep.name, 'Zeynep');
    assert.equal(zeynep.assigned, 2);
    assert.equal(zeynep.called, 1);
    assert.equal(zeynep.completed, 1);
    const atanmamis = t.find((x) => x.id === '_unassigned');
    assert.equal(atanmamis.name, 'Atanmamış');
  });

  it('boş liste sıfır döner', () => {
    assert.equal(summarizeCalls([]).total, 0);
    assert.deepEqual(summarizeByAgent([]), []);
  });
});
