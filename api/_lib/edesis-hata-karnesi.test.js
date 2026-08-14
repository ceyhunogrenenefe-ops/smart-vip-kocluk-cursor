/**
 * node --test api/_lib/edesis-hata-karnesi.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEdesisHataKitapcigiReport,
  isEdesisHataKarnesiReport,
  pickEdesisHataKarnesiReport
} from './edesis-client.js';

describe('isEdesisHataKitapcigiReport', () => {
  it('detects hata kitapçığı by name', () => {
    assert.equal(isEdesisHataKitapcigiReport({ fileName: 'Hata Kitapçığı.pdf' }), true);
    assert.equal(isEdesisHataKitapcigiReport({ analysisName: 'Toplu hata kitapcigi' }), true);
  });

  it('does not treat hata karnesi as kitapçık', () => {
    assert.equal(isEdesisHataKitapcigiReport({ fileName: 'Hata Karnesi.pdf' }), false);
  });
});

describe('isEdesisHataKarnesiReport', () => {
  it('matches isHataKarnesi flag', () => {
    assert.equal(isEdesisHataKarnesiReport({ isHataKarnesi: true, fileName: 'rapor.pdf' }), true);
  });

  it('matches HataKarnesi reportType', () => {
    assert.equal(isEdesisHataKarnesiReport({ reportType: 'HataKarnesi', fileName: 'analiz-raporu.pdf' }), true);
  });

  it('matches nested ogrenciAnalizRapor', () => {
    assert.equal(
      isEdesisHataKarnesiReport({
        analizAdi: 'Deneme 12',
        ogrenciAnalizRapor: { isHataKarnesi: true, raporTuru: 1, fileName: 'hk.pdf' }
      }),
      true
    );
  });

  it('rejects OncelikliKonu analytics', () => {
    assert.equal(
      isEdesisHataKarnesiReport({
        reportType: 'OncelikliKonu',
        fileName: 'analiz-raporu.pdf',
        analysisName: 'Öncelikli konu'
      }),
      false
    );
  });

  it('rejects hata kitapçığı even if PDF', () => {
    assert.equal(
      isEdesisHataKarnesiReport({
        fileName: 'Hata Kitapçığı.pdf',
        reportType: 'HataKitapcigi'
      }),
      false
    );
  });

  it('rejects exam karne-like names without hata karnesi', () => {
    assert.equal(isEdesisHataKarnesiReport({ fileName: 'Karne.pdf', reportType: 'ExamReport' }), false);
  });
});

describe('pickEdesisHataKarnesiReport', () => {
  const items = [
    {
      reportType: 'OncelikliKonu',
      fileName: 'analiz-raporu.pdf',
      examId: '100',
      creationTime: '2026-08-14T10:00:00Z'
    },
    {
      reportType: 'HataKarnesi',
      fileName: 'hata-karnesi.pdf',
      examId: '100',
      reportUrl: 'https://cdn.example/hata-100.pdf',
      creationTime: '2026-08-10T10:00:00Z'
    },
    {
      reportType: 'HataKarnesi',
      fileName: 'hata-karnesi.pdf',
      examId: '200',
      reportUrl: 'https://cdn.example/hata-200.pdf',
      creationTime: '2026-08-14T12:00:00Z'
    },
    {
      fileName: 'Hata Kitapçığı.pdf',
      examId: '100',
      reportUrl: 'https://cdn.example/kitapcik.pdf'
    }
  ];

  it('prefers the matching exam and ignores kitapçık', () => {
    const picked = pickEdesisHataKarnesiReport(items, { examId: '100' });
    assert.equal(picked?.examId, '100');
    assert.equal(picked?.reportType, 'HataKarnesi');
    assert.equal(String(picked?.fileName || '').includes('Kitapçık'), false);
  });

  it('falls back to newest hata karnesi when exam has no dedicated file', () => {
    const picked = pickEdesisHataKarnesiReport(items, { examId: '999' });
    assert.equal(picked?.examId, '200');
  });

  it('returns null when only kitapçık / öncelikli konu exist', () => {
    const picked = pickEdesisHataKarnesiReport([items[0], items[3]], { examId: '100' });
    assert.equal(picked, null);
  });
});
