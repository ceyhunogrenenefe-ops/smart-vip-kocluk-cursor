/**
 * Regresyon: öğrenci B kitapçığını seçince Edesis ingest
 * "Cevap anahtarı bulunamadı. KitapcikTuru=B, LessonId=20, DersGrupId=7" veriyordu.
 * Structure yalnız A satırı döndürüyor; B'nin ders / grup kimlikleri cevap anahtarında farklı.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEdesisAnswerKeyLessons,
  pickEdesisBookletLessons,
  matchIncomingToBookletLessons
} from './edesis-client.js';

const q = (kitapcikTuru, lessonId, dersGrupId, soruNo, dersSoruNumarasi, name) => ({
  denemeCevapAnahtar: { kitapcikTuru, lessonId, dersGrupId, soruNo, dersSoruNumarasi },
  lessonLessonName: name
});

const answerKey = {
  result: {
    kitapciklar: [
      {
        kitapcikTuru: 'A',
        cevaplar: [
          q('A', 1, 1, 1, 1, 'Türkçe'),
          q('A', 1, 1, 2, 2, 'Türkçe'),
          q('A', 20, 7, 3, 1, 'Tarih'),
          q('A', 20, 7, 4, 2, 'Tarih'),
          q('A', 20, 7, 5, 3, 'Tarih')
        ]
      },
      {
        kitapcikTuru: 'B',
        cevaplar: [
          q('B', 21, 8, 1, 1, 'Türkçe'),
          q('B', 21, 8, 2, 2, 'Türkçe'),
          q('B', 22, 9, 3, 1, 'Tarih'),
          q('B', 22, 9, 4, 2, 'Tarih'),
          q('B', 22, 9, 5, 3, 'Tarih')
        ]
      },
      { kitapcikTuru: 'C', cevaplar: [] }
    ]
  }
};

describe('extractEdesisAnswerKeyLessons', () => {
  it('builds per-booklet lessons with their own lessonId / dersGrupId and question counts', () => {
    const rows = extractEdesisAnswerKeyLessons(answerKey);
    const b = rows.filter((r) => r.kitapcikTuru === 'B');
    assert.deepEqual(
      b.map((r) => [r.lessonId, r.dersGrupId, r.questionCount, r.lessonName]),
      [
        [21, 8, 2, 'Türkçe'],
        [22, 9, 3, 'Tarih']
      ]
    );
    assert.equal(rows.filter((r) => r.kitapcikTuru === 'C').length, 0, 'boş kitapçık atlanır');
  });

  it('returns [] for unexpected payloads', () => {
    assert.deepEqual(extractEdesisAnswerKeyLessons(null), []);
    assert.deepEqual(extractEdesisAnswerKeyLessons({ result: {} }), []);
  });
});

describe('pickEdesisBookletLessons with answer key fallback', () => {
  const structure = {
    rows: [
      { kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, lessonName: 'Türkçe', questionCount: 2 },
      { kitapcikTuru: 'A', lessonId: 20, dersGrupId: 7, lessonName: 'Tarih', questionCount: 3 }
    ],
    answerKeyLessons: extractEdesisAnswerKeyLessons(answerKey)
  };

  it('uses B answer key ids instead of A structure ids', () => {
    const b = pickEdesisBookletLessons(structure, 'B');
    assert.deepEqual(b.map((l) => `${l.lessonId}:${l.dersGrupId}`), ['21:8', '22:9']);
  });

  it('keeps structure rows for A', () => {
    const a = pickEdesisBookletLessons(structure, 'A');
    assert.deepEqual(a.map((l) => `${l.lessonId}:${l.dersGrupId}`), ['1:1', '20:7']);
  });
});

describe('matchIncomingToBookletLessons', () => {
  const bLessons = [
    { lessonId: 21, dersGrupId: 8, lessonName: 'Türkçe', questionCount: 2 },
    { lessonId: 22, dersGrupId: 9, lessonName: 'Tarih', questionCount: 3 }
  ];

  it('maps optical answers sent with A ids onto B lessons (by order + length)', () => {
    const incoming = [
      { lessonId: 1, dersGrupId: 1, cevaplar: 'AB' },
      { lessonId: 20, dersGrupId: 7, cevaplar: 'CDE' }
    ];
    const m = matchIncomingToBookletLessons(bLessons, incoming);
    assert.deepEqual(
      m.map((x) => [x.lesson.lessonId, x.lesson.dersGrupId, x.hit?.cevaplar]),
      [
        [21, 8, 'AB'],
        [22, 9, 'CDE']
      ]
    );
  });

  it('prefers exact id match when present', () => {
    const incoming = [
      { lessonId: 22, dersGrupId: 9, cevaplar: 'XYZ' },
      { lessonId: 21, dersGrupId: 8, cevaplar: 'QW' }
    ];
    const m = matchIncomingToBookletLessons(bLessons, incoming);
    assert.equal(m[0].hit.cevaplar, 'QW');
    assert.equal(m[1].hit.cevaplar, 'XYZ');
  });

  it('leaves hit null when length does not fit (handler then reports answer_length_mismatch)', () => {
    const m = matchIncomingToBookletLessons(bLessons, [{ lessonId: 1, dersGrupId: 1, cevaplar: 'A' }]);
    assert.equal(m[0].hit, null);
    assert.equal(m[1].hit, null);
  });
});
