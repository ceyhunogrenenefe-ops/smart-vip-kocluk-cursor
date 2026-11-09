import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFY_SETTINGS,
  examClock,
  examRoomForClass,
  examRoomForLevel,
  isWeekendExam,
  planNotifyActions,
  renderNotifyTemplate,
  uniqueStudents
} from './deneme-exam-notify-logic.js';

const settings = {
  ...DEFAULT_NOTIFY_SETTINGS,
  enabled: true,
  day_before_time: '18:00',
  default_exam_time: '10:00'
};

const exam = {
  id: 'e1',
  level: '9',
  publisher: 'LİMİT',
  exam_no: '4',
  exam_date: '2026-11-12',
  status: 'planlandi'
};

const students = [
  { id: 's1', name: 'Ali', phone: '+905551110011', class_level: '9' },
  { id: 's1', name: 'Ali kopya', phone: '+905551110011', class_level: '9' },
  { id: 's2', name: 'Ayşe', phone: '+905552220022', class_level: '9' }
];

function plan(nowIso, extra = {}) {
  return planNotifyActions({
    exams: [exam],
    students: uniqueStudents(students),
    settings,
    nowMs: new Date(nowIso).getTime(),
    attendanceByExam: { e1: extra.attended || [] },
    resultsByStudent: extra.results || {},
    linksByRoom: { lise: 'https://zoom.example/lise' },
    karneUrlFor: (examId, studentId) => `https://panel.example/karne/${examId}-${studentId}`,
    masterEnabled: extra.masterEnabled !== false,
    existing: extra.existing || []
  });
}

describe('deneme exam notify', () => {
  it('aynı öğrenciyi bir kez tutar ve oda eşlemesi yapar', () => {
    assert.equal(uniqueStudents(students).length, 2);
    assert.equal(examRoomForLevel('9'), 'lise');
    assert.equal(examRoomForLevel('lgs'), 'class78');
    assert.equal(examRoomForClass('10', '10 A'), 'lise');
    assert.equal(examRoomForClass('5', '5A'), 'class56');
    assert.equal(isWeekendExam('2026-11-14'), true);
    assert.equal(examClock({ exam_date: '2026-11-14' }, settings), '10:00');
  });

  it('sınavdan bir gün önce seçili herkese hatırlatır', () => {
    const { sends } = plan('2026-11-11T18:05:00+03:00');
    const day = sends.filter((s) => s.step === 'day_before');
    assert.deepEqual(day.map((s) => s.student_id).sort(), ['s1', 's2']);
    assert.match(day[0].message, /12\.11\.2026/);
    assert.match(day[0].message, /10:00/);
    assert.equal(sends.some((s) => s.step === 'soon'), false);
  });

  it('30 dakika kala katılım yerini ve bağlantıyı yazar', () => {
    const { sends } = plan('2026-11-12T09:35:00+03:00');
    const soon = sends.filter((s) => s.step === 'soon');
    assert.equal(soon.length, 2);
    assert.match(soon[0].message, /Akademik Merkez/);
    assert.match(soon[0].message, /zoom\.example\/lise/);
    assert.equal(sends.some((s) => s.step === 'karne'), false);
  });

  it('karneyi yalnız katılan ve sonucu yayımlanan öğrenciye hazırlar', () => {
    const { sends } = plan('2026-11-12T13:05:00+03:00', {
      attended: ['s1'],
      results: {
        s1: [{ id: 'r1', date: '2026-11-12', exam_name: 'Limit 4', net_score: 70 }],
        s2: [{ id: 'r2', date: '2026-11-12', exam_name: 'Limit 4', net_score: 10 }]
      }
    });
    const karne = sends.filter((s) => s.step === 'karne');
    assert.deepEqual(karne.map((s) => s.student_id), ['s1']);
    assert.match(karne[0].message, /karne\/e1-s1/);
    assert.equal(karne[0].message.includes('s2'), false);
  });

  it('katılmayanın karne satırını atlar, önceden gideni tekrar yazmaz', () => {
    const { upserts, sends } = plan('2026-11-12T13:05:00+03:00', {
      attended: ['s1'],
      results: { s1: [{ id: 'r1', date: '2026-11-12', exam_name: 'Limit 4' }] },
      existing: [
        { exam_id: 'e1', student_id: 's1', step: 'karne', status: 'sent', scheduled_for: '2026-11-12T07:00:00.000Z' }
      ]
    });
    assert.equal(sends.some((s) => s.step === 'karne'), false);
    const skip = upserts.find((u) => u.student_id === 's2' && u.step === 'karne');
    assert.equal(skip.status, 'skipped');
    assert.equal(skip.error, 'katilmadi');
  });

  it('iptal edilen sınavın bekleyen gönderimini durdurur', () => {
    const { upserts, sends } = planNotifyActions({
      exams: [{ ...exam, status: 'yapilmadi' }],
      students: uniqueStudents(students),
      settings,
      nowMs: new Date('2026-11-11T18:05:00+03:00').getTime(),
      masterEnabled: true,
      existing: [
        {
          exam_id: 'e1',
          student_id: 's1',
          step: 'day_before',
          status: 'pending',
          scheduled_for: '2026-11-10T15:00:00.000Z'
        }
      ]
    });
    assert.equal(sends.length, 0);
    assert.ok(upserts.every((u) => u.status === 'cancelled' && u.error === 'sinav_iptal'));
  });

  it('takvim saati değişince bekleyen kaydın zamanını günceller', () => {
    const moved = planNotifyActions({
      exams: [{ ...exam, exam_date: '2026-11-13' }],
      students: [{ id: 's1', name: 'Ali', phone: '+90555' }],
      settings,
      nowMs: new Date('2026-11-10T08:00:00+03:00').getTime(),
      masterEnabled: false,
      existing: [
        {
          exam_id: 'e1',
          student_id: 's1',
          step: 'day_before',
          status: 'pending',
          scheduled_for: '2026-11-11T15:00:00.000Z'
        }
      ]
    });
    const row = moved.upserts.find((u) => u.step === 'day_before');
    assert.equal(row.scheduled_for, '2026-11-12T15:00:00.000Z');
    assert.equal(moved.sends.length, 0);
  });

  it('saati geçen bekleyen hatırlatmayı durdurur, geç katılımı karneye geri alır', () => {
    const late = plan('2026-11-12T12:00:00+03:00', {
      attended: [],
      existing: [
        { exam_id: 'e1', student_id: 's1', step: 'soon', status: 'pending', scheduled_for: '2026-11-12T06:30:00.000Z' }
      ]
    });
    const soon = late.upserts.find((u) => u.student_id === 's1' && u.step === 'soon');
    assert.equal(soon.status, 'cancelled');
    assert.equal(soon.error, 'pencere_kapandi');

    const again = plan('2026-11-12T13:05:00+03:00', {
      attended: ['s2'],
      results: { s2: [{ id: 'r2', date: '2026-11-12', exam_name: 'Limit 4' }] },
      existing: [
        { exam_id: 'e1', student_id: 's2', step: 'karne', status: 'skipped', scheduled_for: '2026-11-12T10:00:00.000Z' }
      ]
    });
    assert.equal(again.sends.filter((s) => s.step === 'karne').length, 1);
    assert.equal(again.sends[0].student_id, 's2');
  });

  it('hafta sonu denemesini 10:00 sayar ve sınıfın kendi linkini yazar', () => {
    const saturday = planNotifyActions({
      exams: [{ ...exam, exam_date: '2026-11-14', exam_time: '14:00' }],
      students: [
        {
          id: 's1',
          name: 'Ali',
          phone: '+90555',
          phones: ['+905551110011', '+905559990000'],
          join_link: 'https://zoom.example/10a',
          steps: { day_before: true, soon: true, karne: false }
        }
      ],
      settings: { ...settings, default_exam_time: '14:00' },
      nowMs: new Date('2026-11-14T09:40:00+03:00').getTime(),
      linksByRoom: { lise: 'https://zoom.example/lise' },
      masterEnabled: true
    });
    const soon = saturday.sends.filter((s) => s.step === 'soon');
    assert.equal(soon.length, 1);
    assert.match(soon[0].message, /10:00/);
    assert.match(soon[0].message, /zoom\.example\/10a/);
    assert.deepEqual(soon[0].phones, ['+905551110011', '+905559990000']);
    assert.equal(saturday.sends.some((s) => s.step === 'karne'), false);
  });

  it('otomasyon kapalıyken test alıcısı şablonu dolar ama toplu gönderim çıkmaz', () => {
    const msg = renderNotifyTemplate(DEFAULT_NOTIFY_SETTINGS.tpl_soon, {
      ogrenci: 'Test Öğrenci',
      sinav_adi: '9. Sınıf — 4. deneme · LİMİT',
      saat: '10:00',
      bolum: 'Lise Deneme Sınavı',
      link: 'https://zoom.example/lise'
    });
    assert.match(msg, /Test Öğrenci/);
    assert.match(msg, /30 dakika/);
    const { sends } = plan('2026-11-11T18:05:00+03:00', { masterEnabled: false });
    assert.equal(sends.length, 0);
  });
});
