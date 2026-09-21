import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIMARY_4567_ZOOM_URL,
  LGS8_ETUT_ZOOM_URL,
  LISE_YKS_ZOOM_URL,
  isPrimary4567Grade,
  isSeventhGrade,
  isPrimary4567JoinSubject,
  primary4567ZoomIfApplicable
} from './primary-4567-zoom.js';
import { linksForInstitution } from './academic-center-links-store.js';

describe('primary 4-7 Zoom', () => {
  it('matches 4-7 class levels and names, not 8/LGS/lise', () => {
    assert.equal(isPrimary4567Grade(4, '4A'), true);
    assert.equal(isPrimary4567Grade('5', '5A'), true);
    assert.equal(isPrimary4567Grade('6. Sınıf', ''), true);
    assert.equal(isPrimary4567Grade(7, '7A'), true);
    assert.equal(isPrimary4567Grade('', '4A'), true);
    assert.equal(isPrimary4567Grade(8, '8A'), false);
    assert.equal(isPrimary4567Grade('LGS', '8F'), false);
    assert.equal(isPrimary4567Grade(3, '3A'), false);
    assert.equal(isPrimary4567Grade(2, '2A'), false);
    assert.equal(isPrimary4567Grade('9', '9A'), false);
    assert.equal(isPrimary4567Grade('YKS', ''), false);
  });

  it('detects seventh grade separately from 4-6 and 8', () => {
    assert.equal(isSeventhGrade(7, '7A'), true);
    assert.equal(isSeventhGrade('7', ''), true);
    assert.equal(isSeventhGrade('LGS', '7A'), true);
    assert.equal(isSeventhGrade(5, '5A'), false);
    assert.equal(isSeventhGrade(8, '8A'), false);
    assert.equal(isSeventhGrade('', '4-7. Sınıf Etüt'), false);
  });

  it('keeps 4-7 when the program tag is LGS but the class is 5A/7A', () => {
    assert.equal(isPrimary4567Grade('LGS', '7A'), true);
    assert.equal(isPrimary4567Grade('LGS', '5A'), true);
    assert.equal(isPrimary4567Grade('LGS', '6. Sınıf'), true);
    assert.equal(isPrimary4567Grade('LGS', ''), false);
    assert.equal(isPrimary4567Grade('LGS', '8A'), false);
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '7A', classLevel: 'LGS' }),
      LGS8_ETUT_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ÖDEV TAKİBİ', className: '5A', classLevel: 'LGS' }),
      PRIMARY_4567_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '8A', classLevel: 'LGS' }),
      null,
      '8. sınıf etüt değişmez'
    );
  });

  it('matches etüt / ödev / kitap / deneme and skips math + analiz', () => {
    assert.equal(isPrimary4567JoinSubject('ETÜT'), true);
    assert.equal(isPrimary4567JoinSubject('ETÜT & KİTAP OKUMA'), true);
    assert.equal(isPrimary4567JoinSubject('ÖDEV SAATİ'), true);
    assert.equal(isPrimary4567JoinSubject('ÖDEV & KİTAP OKUMA'), true);
    assert.equal(isPrimary4567JoinSubject('ödev takibi'), true);
    assert.equal(isPrimary4567JoinSubject('KİTAP OKUMA'), true);
    assert.equal(isPrimary4567JoinSubject('DENEME SINAVI'), true);
    assert.equal(isPrimary4567JoinSubject('MATEMATİK'), false);
    assert.equal(isPrimary4567JoinSubject('FEN BİLİMLERİ'), false);
    assert.equal(isPrimary4567JoinSubject('DENEME ANALİZİ'), false);
  });

  it('returns 4-6 Zoom for etüt; 7th grade etüt and 7th/8th grade deneme use LGS8 Zoom', () => {
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '5A', classLevel: '5' }),
      PRIMARY_4567_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '7A', classLevel: 7 }),
      LGS8_ETUT_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'DENEME SINAVI', className: '7A', classLevel: 7 }),
      LGS8_ETUT_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ÖDEV TAKİBİ', className: '7A', classLevel: '7' }),
      PRIMARY_4567_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '8A', classLevel: '8' }),
      null,
      '8. sınıf etüt değişmez'
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'DENEME SINAVI', className: '8A 2026-2027 DÖNEM', classLevel: 'LGS' }),
      LGS8_ETUT_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'DENEME SINAVI SÖZEL', className: '', classLevel: 'LGS' }),
      LGS8_ETUT_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'DENEME SINAVI', className: '5A', classLevel: 5 }),
      PRIMARY_4567_ZOOM_URL,
      '5. sınıf deneme 4-7 Zoom kalır'
    );
    // Etüt / deneme dışı dersler değişmez; lise / YKS etüt + deneme → lise Zoom
    assert.equal(primary4567ZoomIfApplicable({ subject: 'TÜRKÇE', className: '8A', classLevel: 'LGS' }), null);
    assert.equal(primary4567ZoomIfApplicable({ subject: 'DENEME ANALİZİ', className: '8A', classLevel: '8' }), null);
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'DENEME SINAVI', className: 'TYT-1', classLevel: 'TYT' }),
      LISE_YKS_ZOOM_URL
    );
    assert.equal(primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '11A', classLevel: '11' }), LISE_YKS_ZOOM_URL);
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'MATEMATİK', className: '4A', classLevel: 4 }),
      null
    );
  });

  it('forces class47/56 to 4-7 Zoom and class78 study + exam to LGS8 Zoom', () => {
    const links = linksForInstitution(
      {
        default: {
          exams: {
            class47: LGS8_ETUT_ZOOM_URL,
            class56: LGS8_ETUT_ZOOM_URL,
            class78: 'https://evil.example/deneme78'
          },
          studyClasses: {
            class47: 'bbb:auto',
            class56: LGS8_ETUT_ZOOM_URL,
            class78: 'bbb:auto'
          }
        }
      },
      '73323d75-eea1-4552-8bba-d50555423589'
    );
    assert.equal(links.exams.class47, PRIMARY_4567_ZOOM_URL);
    assert.equal(links.exams.class56, PRIMARY_4567_ZOOM_URL);
    assert.equal(links.studyClasses.class47, PRIMARY_4567_ZOOM_URL);
    assert.equal(links.studyClasses.class56, PRIMARY_4567_ZOOM_URL);
    assert.equal(links.studyClasses.class78, LGS8_ETUT_ZOOM_URL);
    assert.equal(links.exams.class78, LGS8_ETUT_ZOOM_URL);
    assert.ok(!String(links.exams.class47).includes('6946337643'));
    assert.ok(String(links.exams.class47).includes('9448152197'));
    assert.ok(String(links.studyClasses.class78).includes('6946337643'));
  });

  it('academic study guest invite: class47/56 → 4-7 Zoom; class78 → LGS8 Zoom', async () => {
    const { createAcademicStudyGuestJoinShareLink } = await import('./bbb-guest-join-core.js');
    for (const room of ['class47', 'class56']) {
      const share = await createAcademicStudyGuestJoinShareLink({
        institutionId: '73323d75-eea1-4552-8bba-d50555423589',
        room
      });
      assert.equal(share.url, PRIMARY_4567_ZOOM_URL);
      assert.ok(String(share.shareText || '').includes('9448152197'));
      assert.ok(!String(share.shareText || '').includes('6946337643'));
    }
    const share78 = await createAcademicStudyGuestJoinShareLink({
      institutionId: '73323d75-eea1-4552-8bba-d50555423589',
      room: 'class78'
    });
    assert.equal(share78.url, LGS8_ETUT_ZOOM_URL);
    assert.ok(String(share78.shareText || '').includes('6946337643'));
  });
});

describe('9-10-11 / YKS etüt ve deneme Zoom', () => {
  it('lise ve YKS sınıflarında etüt + deneme sabit Zoom alır', () => {
    for (const [level, name] of [
      ['9', '2026-2027 DÖNEM 9-A SINIFI'],
      ['10', '2026-2027 10 A SINIFI'],
      ['11', '2026-2027 11 B SINIFI'],
      ['YKS SAYISAL', '2026-2027 YILDIZLAR YKS GRUBU']
    ]) {
      for (const subject of ['Etüt', 'ETUT', 'ETÜT', 'DENEME']) {
        assert.equal(primary4567ZoomIfApplicable({ subject, classLevel: level, className: name }), LISE_YKS_ZOOM_URL);
      }
      assert.equal(primary4567ZoomIfApplicable({ subject: 'DENEME ANALİZİ', classLevel: level, className: name }), null);
      assert.equal(primary4567ZoomIfApplicable({ subject: 'TYT MATEMATİK', classLevel: level, className: name }), null);
    }
  });

  it('LGS / ortaokul kuralları değişmez', () => {
    assert.equal(primary4567ZoomIfApplicable({ subject: 'Etüt', classLevel: 'LGS', className: '8B 2026-2027 DÖNEM' }), null);
    assert.equal(primary4567ZoomIfApplicable({ subject: 'DENEME', classLevel: 'LGS', className: '8B 2026-2027 DÖNEM' }), LGS8_ETUT_ZOOM_URL);
    assert.equal(primary4567ZoomIfApplicable({ subject: 'Etüt', classLevel: '7', className: '7A 2026-2027 DÖNEM' }), LGS8_ETUT_ZOOM_URL);
    assert.equal(primary4567ZoomIfApplicable({ subject: 'Etüt', classLevel: '5', className: '5A 2026-2027 DÖNEM' }), PRIMARY_4567_ZOOM_URL);
  });

  it('Akademik Merkez 9-10-11 ve YKS etüt odası sabit', () => {
    const links = linksForInstitution({ default: { studyClasses: { class911: 'bbb:auto', yks: 'bbb:auto' } } }, '');
    assert.equal(links.studyClasses.class911, LISE_YKS_ZOOM_URL);
    assert.equal(links.studyClasses.yks, LISE_YKS_ZOOM_URL);
  });
});
