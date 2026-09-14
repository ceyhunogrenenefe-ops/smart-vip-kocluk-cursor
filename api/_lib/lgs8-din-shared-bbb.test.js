import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLgs8DinSharedJoinContext,
  extractLgs8Section,
  isDinKulturuSubject,
  lgs8DinPairId,
  lgs8DinSharedMeetingKeyPrefix
} from './lgs8-din-shared-bbb.js';

describe('lgs8 Din Kültürü shared BBB', () => {
  it('detects Din Kültürü and skips other subjects', () => {
    assert.equal(isDinKulturuSubject('DİN KÜLTÜRÜ'), true);
    assert.equal(isDinKulturuSubject('Din Kültürü ve Ahlak Bilgisi'), true);
    assert.equal(isDinKulturuSubject('MATEMATİK'), false);
    assert.equal(isDinKulturuSubject('ETÜT'), false);
  });

  it('pairs 8A+8C and 8B+8F, not 8E', () => {
    assert.equal(extractLgs8Section('8A', '8'), '8A');
    assert.equal(extractLgs8Section('8-C', ''), '8C');
    assert.equal(lgs8DinPairId('8A', '8'), '8a8c');
    assert.equal(lgs8DinPairId('8C', ''), '8a8c');
    assert.equal(lgs8DinPairId('8B', ''), '8b8f');
    assert.equal(lgs8DinPairId('8F', 'LGS'), '8b8f');
    assert.equal(lgs8DinPairId('8E', ''), null);
    assert.equal(lgs8DinPairId('7A', ''), null);
  });

  it('uses the same meeting key for paired classes at the same time', () => {
    const a = lgs8DinSharedMeetingKeyPrefix({
      subject: 'DİN KÜLTÜRÜ',
      className: '8A',
      lessonDate: '2026-09-17',
      startTime: '19:50:00'
    });
    const c = lgs8DinSharedMeetingKeyPrefix({
      subject: 'DİN KÜLTÜRÜ',
      className: '8C',
      classLevel: '8',
      lessonDate: '2026-09-17',
      startTime: '19:50'
    });
    const b = lgs8DinSharedMeetingKeyPrefix({
      subject: 'DİN KÜLTÜRÜ',
      className: '8B',
      dayOfWeek: 5,
      startTime: '20:40:00'
    });
    const f = lgs8DinSharedMeetingKeyPrefix({
      subject: 'DİN KÜLTÜRÜ',
      className: '8F',
      dayOfWeek: 5,
      startTime: '20:40:00'
    });
    assert.equal(a, c);
    assert.equal(a, 'lgs8din8a8c202609171950');
    assert.equal(b, f);
    assert.equal(b, 'lgs8din8b8fd5t2040');
    assert.notEqual(a, b);
  });

  it('does not share Fen or unpaired 8E Din', () => {
    assert.equal(
      lgs8DinSharedMeetingKeyPrefix({
        subject: 'FEN BİLGİSİ',
        className: '8A',
        lessonDate: '2026-09-17',
        startTime: '19:50:00'
      }),
      null
    );
    assert.equal(
      lgs8DinSharedMeetingKeyPrefix({
        subject: 'DİN KÜLTÜRÜ',
        className: '8E',
        startTime: '20:40:00',
        dayOfWeek: 5
      }),
      null
    );
  });

  it('forces join onto the shared meeting id when the row still has a class-specific id', () => {
    const base = { meetingKeyPrefix: 'cljoinabc' };
    applyLgs8DinSharedJoinContext(base, {
      subject: 'DİN KÜLTÜRÜ',
      className: '8B',
      dayOfWeek: 5,
      startTime: '20:40:00',
      row: { bbb_meeting_id: 'classslot8b-old' }
    });
    assert.equal(base.meetingKeyPrefix, 'lgs8din8b8fd5t2040');
    assert.equal(base.storedMeetingId, 'lgs8din8b8fd5t2040');
    assert.equal(base.attendeeLinkOverride, 'bbb:auto');
  });
});
