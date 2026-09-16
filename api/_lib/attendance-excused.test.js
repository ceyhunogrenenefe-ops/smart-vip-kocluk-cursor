/**
 * Yoklamada "İzinli" (excused) durumu.
 * İzinli öğrenci devamsızlık sayılmaz, kamera beklenmez ve veliye
 * "derse katılmadı" bildirimi gitmez.
 */
import assert from 'node:assert/strict';
import {
  normalizeAttendanceStatus,
  normalizeCameraStatus
} from './attendance-notice-templates.js';
import {
  buildAttendanceSummary,
  computeAttendanceNotifyPlan,
  attendanceStatusLabelTr,
  cameraStatusLabelTr
} from './attendance-summary.js';

// Durum tanınıyor, Türkçe girişler de kabul ediliyor
assert.equal(normalizeAttendanceStatus('excused'), 'excused');
assert.equal(normalizeAttendanceStatus('izinli'), 'excused');
assert.equal(normalizeAttendanceStatus('mazeretli'), 'excused');
assert.equal(normalizeAttendanceStatus('geç'), 'late');
assert.equal(normalizeAttendanceStatus('late'), 'late');
// Bilinmeyen değer eskisi gibi katılmadı sayılır
assert.equal(normalizeAttendanceStatus('bilinmeyen'), 'absent');

// İzinliden kamera beklenmez
assert.equal(normalizeCameraStatus('excused', 'on'), 'n_a');
assert.equal(cameraStatusLabelTr('excused', 'on'), '—');
assert.equal(attendanceStatusLabelTr('excused'), '🟡 İzinli');

// Özet: izinli ayrı sayılır, toplam içinde yer alır, kamera sayımına girmez
const summary = buildAttendanceSummary([
  { student_id: '1', student_name: 'Ayşe', status: 'present', camera_status: 'on' },
  { student_id: '2', student_name: 'Mehmet', status: 'absent' },
  { student_id: '3', student_name: 'Zeynep', status: 'excused', camera_status: 'on' },
  { student_id: '4', student_name: 'Ali', status: 'late', camera_status: 'off' }
]);
assert.equal(summary.total, 4);
assert.equal(summary.present, 1);
assert.equal(summary.absent, 1);
assert.equal(summary.late, 1);
assert.equal(summary.excused, 1);
assert.equal(summary.excusedStudents[0].name, 'Zeynep');
assert.equal(summary.cameraOpen, 1);
assert.equal(summary.cameraClosed, 1);

// İzinli, devamsızlık bildirimi listesine girmez
const plan = computeAttendanceNotifyPlan(
  new Map([['3', { status: 'absent', camera_status: 'n_a' }]]),
  [{ student_id: '3', student_name: 'Zeynep', status: 'excused', camera_status: null }]
);
assert.equal(plan.newlyAbsent.length, 0);
assert.equal(plan.unchangedAbsent.length, 0);
assert.equal(plan.newlyCameraOff.length, 0);

// Katılmadı işaretlenen öğrenci eskisi gibi bildirime girer
const plan2 = computeAttendanceNotifyPlan(new Map(), [
  { student_id: '9', student_name: 'Can', status: 'absent', camera_status: null }
]);
assert.equal(plan2.newlyAbsent.length, 1);

console.log('attendance-excused tests ok');
