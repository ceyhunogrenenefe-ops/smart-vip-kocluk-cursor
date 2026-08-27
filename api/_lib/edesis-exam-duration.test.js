/**
 * node --test api/_lib/edesis-exam-duration.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeEdesisExamViewBody,
  pickExamDurationSeconds,
  looksLikeEdesisAnswerKeyPdf,
  expandEdesisFileUrlCandidates,
  formatEdesisAvailableExamItem
} from './edesis-client.js';

describe('mergeEdesisExamViewBody', () => {
  it('keeps nested denemeUrl and sinavSuresi when top-level is empty', () => {
    const merged = mergeEdesisExamViewBody({
      id: 1579103,
      denemeUrl: '',
      sinavSuresi: 0,
      sinav: {
        denemeUrl: 'https://sinavzacdn.azureedge.net/soruhavuzu-deneme/abc',
        sinavSuresi: 90
      }
    });
    assert.equal(merged.sinavSuresi, 90);
    assert.match(String(merged.denemeUrl), /sinavzacdn/);
  });
});

describe('pickExamDurationSeconds', () => {
  it('treats sinavSuresi as minutes', () => {
    assert.equal(pickExamDurationSeconds({ sinavSuresi: 120 }), 7200);
    assert.equal(pickExamDurationSeconds({ sinav: { sinavSuresi: 90 }, sinavSuresi: 0 }), 5400);
  });

  it('prefers kalanSaniye over minutes', () => {
    assert.equal(pickExamDurationSeconds({ kalanSaniye: 3500, sinavSuresi: 120 }), 3500);
  });

  it('treats large values as already-seconds', () => {
    assert.equal(pickExamDurationSeconds({ sinavSuresi: 7200 }), 7200);
  });
});

describe('looksLikeEdesisAnswerKeyPdf', () => {
  it('flags hatakarnesi and cevap anahtarı', () => {
    assert.equal(
      looksLikeEdesisAnswerKeyPdf({
        url: 'https://sinavzacdn.azureedge.net/files/hatakarnesi/3226/x.pdf',
        fileName: 'Deneme Cevap Anahtari'
      }),
      true
    );
    assert.equal(
      looksLikeEdesisAnswerKeyPdf({
        url: 'https://sinavzacdn.azureedge.net/soruhavuzu-deneme/f59b1c0b-5a24-490a-a621-7f059ab465200'
      }),
      false
    );
  });
});

describe('expandEdesisFileUrlCandidates sinavzacdn', () => {
  it('adds azure booklet CDN for file GUIDs', () => {
    const urls = expandEdesisFileUrlCandidates('f59b1c0b-5a24-490a-a621-7f059ab465200', {
      baseUrl: 'https://onlinevipdershane.api.edesis.com'
    });
    assert.ok(urls.some((u) => /sinavzacdn\.azureedge\.net\/soruhavuzu-deneme\/f59b1c0b/.test(u)));
  });
});

describe('formatEdesisAvailableExamItem duration', () => {
  it('passes remainingSeconds from catalog sinavSuresi', () => {
    const item = formatEdesisAvailableExamItem(
      '1579103',
      { name: 'MAT FEN KTT 2', sinavSuresi: 40 },
      null
    );
    assert.equal(item.remainingSeconds, 2400);
  });
});
