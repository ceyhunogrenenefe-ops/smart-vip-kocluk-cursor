import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LISE_911_YKS_ZOOM_URL,
  isLise911YksGrade,
  isLiseEtutOrDenemeSubject,
  lise911YksZoomIfApplicable
} from './lise-911-yks-zoom.js';

describe('lise 9-11 / YKS etüt-deneme Zoom', () => {
  it('detects 9-11 / YKS grades and skips YÖS / ortaokul', () => {
    assert.equal(isLise911YksGrade('9', '9-A SINIFI'), true);
    assert.equal(isLise911YksGrade('10', '2026-2027 10 A SINIFI'), true);
    assert.equal(isLise911YksGrade('11', '11 B'), true);
    assert.equal(isLise911YksGrade('YKS SAYISAL', 'YILDIZLAR YKS GRUBU'), true);
    assert.equal(isLise911YksGrade('12', '12A'), true);
    assert.equal(isLise911YksGrade('YÖS', 'YÖS 2026 EKİM'), false);
    assert.equal(isLise911YksGrade('8', '8A'), false);
    assert.equal(isLise911YksGrade('LGS', '8F'), false);
  });

  it('matches etüt and deneme subjects', () => {
    assert.equal(isLiseEtutOrDenemeSubject('Etüt'), true);
    assert.equal(isLiseEtutOrDenemeSubject('ETUT'), true);
    assert.equal(isLiseEtutOrDenemeSubject('DENEME'), true);
    assert.equal(isLiseEtutOrDenemeSubject('DENEME ANALİZİ'), true);
    assert.equal(isLiseEtutOrDenemeSubject('MATEMATİK'), false);
  });

  it('returns shared Zoom only for lise etüt/deneme', () => {
    assert.equal(
      lise911YksZoomIfApplicable({ subject: 'Etüt', className: '9-A', classLevel: '9' }),
      LISE_911_YKS_ZOOM_URL
    );
    assert.equal(
      lise911YksZoomIfApplicable({ subject: 'DENEME', className: 'YILDIZLAR YKS', classLevel: 'YKS' }),
      LISE_911_YKS_ZOOM_URL
    );
    assert.equal(
      lise911YksZoomIfApplicable({ subject: 'FİZİK', className: '11 A', classLevel: '11' }),
      null
    );
    assert.equal(
      lise911YksZoomIfApplicable({ subject: 'Etüt', className: '8A', classLevel: '8' }),
      null
    );
  });
});
