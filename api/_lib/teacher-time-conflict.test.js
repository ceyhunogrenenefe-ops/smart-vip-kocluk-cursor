import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findBlockingTeacherRow,
  slotFreedByCancelledSession,
  teacherRowBlocksNewLesson,
  timeRangesOverlapHms
} from './teacher-time-conflict.js';

test('aynı sınıfta çakışan saat engellenir', () => {
  const row = { id: 's1', class_id: 'c1', subject: 'TYT GEOMETRİ', start_time: '18:40:00', end_time: '19:20:00' };
  assert.equal(
    teacherRowBlocksNewLesson(
      { start: '18:40:00', end: '19:20:00', subject: 'TYT GEOMETRİ', ownClassId: 'c1' },
      row
    ),
    true
  );
});

test('farklı sınıfta aynı ders birleşik grup sayılır, engellenmez', () => {
  const row = { id: 's1', class_id: 'c2', subject: 'FEN', start_time: '18:40:00', end_time: '19:20:00' };
  assert.equal(
    teacherRowBlocksNewLesson({ start: '18:40:00', end: '19:20:00', subject: 'Fen', ownClassId: 'c1' }, row),
    false
  );
});

test('saatler örtüşmüyorsa engellenmez', () => {
  const row = { id: 's1', class_id: 'c1', subject: 'X', start_time: '19:30:00', end_time: '20:10:00' };
  assert.equal(
    teacherRowBlocksNewLesson({ start: '18:40:00', end: '19:20:00', subject: 'X', ownClassId: 'c1' }, row),
    false
  );
});

test('hariç tutulan satır engellemez', () => {
  const rows = [{ id: 's1', class_id: 'c1', subject: 'X', start_time: '18:40:00', end_time: '19:20:00' }];
  assert.equal(
    findBlockingTeacherRow({
      start: '18:40:00',
      end: '19:20:00',
      subject: 'X',
      ownClassId: 'c1',
      rows,
      excludeIds: ['s1']
    }),
    null
  );
});

test('saat aralığı örtüşmesi sınırlarda kapalı', () => {
  assert.equal(timeRangesOverlapHms('18:40:00', '19:20:00', '19:20:00', '20:00:00'), false);
  assert.equal(timeRangesOverlapHms('18:40:00', '19:20:00', '19:00:00', '20:00:00'), true);
});

test('iptal edilmiş oturum aynı sınıf ve saatteyse şablon engeli düşer', () => {
  const slot = { class_id: 'c1', start_time: '18:40:00', end_time: '19:20:00' };
  const cancelled = [{ class_id: 'c1', start_time: '18:40:00', end_time: '19:20:00' }];
  assert.equal(slotFreedByCancelledSession({ slot, cancelledRows: cancelled }), true);
});

test('iptal başka sınıfın ise şablon engeli sürer', () => {
  const slot = { class_id: 'c1', start_time: '18:40:00', end_time: '19:20:00' };
  const cancelled = [{ class_id: 'c2', start_time: '18:40:00', end_time: '19:20:00' }];
  assert.equal(slotFreedByCancelledSession({ slot, cancelledRows: cancelled }), false);
});

test('iptal edilen saat örtüşmüyorsa şablon engeli sürer', () => {
  const slot = { class_id: 'c1', start_time: '18:40:00', end_time: '19:20:00' };
  const cancelled = [{ class_id: 'c1', start_time: '19:30:00', end_time: '20:10:00' }];
  assert.equal(slotFreedByCancelledSession({ slot, cancelledRows: cancelled }), false);
});

test('iptal kaydı yoksa şablon engeli sürer', () => {
  assert.equal(
    slotFreedByCancelledSession({ slot: { class_id: 'c1', start_time: '18:40:00', end_time: '19:20:00' }, cancelledRows: [] }),
    false
  );
});
