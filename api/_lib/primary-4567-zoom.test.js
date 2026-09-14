import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIMARY_4567_ZOOM_URL,
  isPrimary4567Grade,
  isPrimary4567JoinSubject,
  primary4567ZoomIfApplicable
} from './primary-4567-zoom.js';
import { linksForInstitution } from './academic-center-links-store.js';

const LGS8_ZOOM =
  'https://us06web.zoom.us/j/6946337643?pwd=SHkwQzNnaEkrOXVNajJMR1Z6UCtCUT09';

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

  it('keeps 4-7 when the program tag is LGS but the class is 5A/7A', () => {
    assert.equal(isPrimary4567Grade('LGS', '7A'), true);
    assert.equal(isPrimary4567Grade('LGS', '5A'), true);
    assert.equal(isPrimary4567Grade('LGS', '6. Sınıf'), true);
    assert.equal(isPrimary4567Grade('LGS', ''), false);
    assert.equal(isPrimary4567Grade('LGS', '8A'), false);
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '7A', classLevel: 'LGS' }),
      PRIMARY_4567_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ÖDEV TAKİBİ', className: '5A', classLevel: 'LGS' }),
      PRIMARY_4567_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '8A', classLevel: 'LGS' }),
      null
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

  it('returns the shared Zoom only for 4-7 + join subjects', () => {
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '5A', classLevel: '5' }),
      PRIMARY_4567_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'DENEME SINAVI', className: '7A', classLevel: 7 }),
      PRIMARY_4567_ZOOM_URL
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'ETÜT', className: '8A', classLevel: '8' }),
      null
    );
    assert.equal(
      primary4567ZoomIfApplicable({ subject: 'MATEMATİK', className: '4A', classLevel: 4 }),
      null
    );
  });

  it('forces class47 and class56 exam/study to the shared Zoom; leaves class78', () => {
    const links = linksForInstitution(
      {
        default: {
          exams: {
            class47: LGS8_ZOOM,
            class56: LGS8_ZOOM,
            class78: LGS8_ZOOM
          },
          studyClasses: {
            class47: 'bbb:auto',
            class56: LGS8_ZOOM,
            class78: LGS8_ZOOM
          }
        }
      },
      '73323d75-eea1-4552-8bba-d50555423589'
    );
    assert.equal(links.exams.class47, PRIMARY_4567_ZOOM_URL);
    assert.equal(links.exams.class56, PRIMARY_4567_ZOOM_URL);
    assert.equal(links.studyClasses.class47, PRIMARY_4567_ZOOM_URL);
    assert.equal(links.studyClasses.class56, PRIMARY_4567_ZOOM_URL);
    assert.equal(links.exams.class78, LGS8_ZOOM);
    assert.equal(links.studyClasses.class78, LGS8_ZOOM);
    assert.ok(!String(links.exams.class47).includes('6946337643'));
    assert.ok(String(links.exams.class47).includes('9448152197'));
  });
});
