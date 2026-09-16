/**
 * Regresyon: ders düzenlenince (saat veya öğretmen değişince) haftalık şablon
 * aynı gün için ikinci bir ders üretiyordu. Artık oturum hangi şablondan
 * üretildiğini taşıyor ve o şablon o gün için kapalı sayılıyor.
 */
import assert from 'node:assert/strict';
import { slotCoveredBySessions } from './class-sessions-from-slots.js';

const slot = {
  id: 'slot-1',
  class_id: 'class-1',
  day_of_week: 3,
  start_time: '19:00:00',
  end_time: '19:40:00',
  subject: 'İNGİLİZCE',
  teacher_id: 'teacher-zeynep'
};

// Öğretmen değiştirilmiş oturum: şablon yine kapalı sayılmalı
assert.equal(
  slotCoveredBySessions(slot, [
    {
      id: 's1',
      class_id: 'class-1',
      origin_slot_id: 'slot-1',
      teacher_id: 'teacher-yagmur',
      start_time: '19:00:00',
      end_time: '19:40:00',
      subject: 'İNGİLİZCE',
      status: 'scheduled'
    }
  ]),
  true
);

// Saati kaydırılmış oturum (gecikme): şablon yine kapalı sayılmalı
assert.equal(
  slotCoveredBySessions(slot, [
    {
      id: 's2',
      class_id: 'class-1',
      origin_slot_id: 'slot-1',
      teacher_id: 'teacher-zeynep',
      start_time: '19:50:00',
      end_time: '20:30:00',
      subject: 'İNGİLİZCE',
      status: 'scheduled'
    }
  ]),
  true
);

// İptal edilen oturum: okuma yolunda (ignoreCancelled:false) şablon kapalı kalır
assert.equal(
  slotCoveredBySessions(
    slot,
    [
      {
        id: 's3',
        class_id: 'class-1',
        origin_slot_id: 'slot-1',
        teacher_id: 'teacher-zeynep',
        start_time: '19:00:00',
        end_time: '19:40:00',
        subject: 'İNGİLİZCE',
        status: 'cancelled'
      }
    ],
    { ignoreCancelled: false }
  ),
  true
);

// Yönetici "oturumları yeniden üret" derse (ignoreCancelled:true) iptal engellemez
assert.equal(
  slotCoveredBySessions(
    slot,
    [
      {
        id: 's4',
        class_id: 'class-1',
        origin_slot_id: 'slot-1',
        teacher_id: 'teacher-zeynep',
        start_time: '19:00:00',
        end_time: '19:40:00',
        subject: 'İNGİLİZCE',
        status: 'cancelled'
      }
    ],
    { ignoreCancelled: true }
  ),
  false
);

// Başka şablondan üretilmiş, saati çakışmayan oturum şablonu kapatmaz
assert.equal(
  slotCoveredBySessions(slot, [
    {
      id: 's5',
      class_id: 'class-1',
      origin_slot_id: 'slot-2',
      teacher_id: 'teacher-baska',
      start_time: '10:00:00',
      end_time: '10:40:00',
      subject: 'MATEMATİK',
      status: 'scheduled'
    }
  ]),
  false
);

// Şablon bağı olmayan eski kayıtlar: aynı öğretmen ve saat hâlâ kapatır
assert.equal(
  slotCoveredBySessions(slot, [
    {
      id: 's6',
      class_id: 'class-1',
      origin_slot_id: null,
      teacher_id: 'teacher-zeynep',
      start_time: '19:00:00',
      end_time: '19:40:00',
      subject: 'İNGİLİZCE',
      status: 'scheduled'
    }
  ]),
  true
);

console.log('class-session-slot-origin tests ok');
