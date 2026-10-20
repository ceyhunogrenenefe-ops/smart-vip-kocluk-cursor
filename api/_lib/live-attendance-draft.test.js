import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceRowLocked, buildLiveAttendanceDraft, cameraFromAttendee } from './live-attendance-draft.js';
import { parseZoomMeetingId } from './zoom-meeting-participants.js';
import { effectiveMeetingLink } from './live-attendance-source.js';

const roster = [
  { student_id: 's1', student_name: 'Ali Yilmaz' },
  { student_id: 's2', student_name: 'Ayse Demir' },
  { student_id: 's3', student_name: 'Can Kaya' }
];

test('izinli ve öğretmen kaydı kilitli', () => {
  assert.equal(attendanceRowLocked({ status: 'excused', marked_by: null }), true);
  assert.equal(attendanceRowLocked({ status: 'late', marked_by: null }), true);
  assert.equal(attendanceRowLocked({ status: 'present', marked_by: 'teacher-1' }), true);
  assert.equal(attendanceRowLocked({ status: 'absent', marked_by: null }), false);
  assert.equal(attendanceRowLocked(null), false);
});

test('açık odada eşleşen katıldı, kamera platformdan, eşleşmeyen katılmadı', () => {
  const { suggestions } = buildLiveAttendanceDraft(
    roster,
    [
      { fullName: 'Ali Yilmaz', hasVideo: true },
      { fullName: 'Ayse Demir', hasVideo: false }
    ],
    [],
    true
  );
  const byId = new Map(suggestions.map((s) => [s.student_id, s]));
  assert.deepEqual(
    { status: byId.get('s1').status, camera: byId.get('s1').camera_status, locked: byId.get('s1').locked },
    { status: 'present', camera: 'on', locked: false }
  );
  assert.equal(byId.get('s2').status, 'present');
  assert.equal(byId.get('s2').camera_status, 'off');
  assert.equal(byId.get('s3').status, 'absent');
  assert.equal(byId.get('s3').camera_status, null);
});

test('izinli kayıt canlı listede yoksa da izinli kalır', () => {
  const { suggestions } = buildLiveAttendanceDraft(
    roster,
    [{ fullName: 'Ali Yilmaz', hasVideo: true }],
    [{ student_id: 's2', status: 'excused', marked_by: 'teacher-1', camera_status: null }],
    true
  );
  const ayse = suggestions.find((s) => s.student_id === 's2');
  assert.equal(ayse.status, 'excused');
  assert.equal(ayse.locked, true);
});

test('oda kapalıyken kimse katılmadı yazılmaz', () => {
  const { suggestions } = buildLiveAttendanceDraft(roster, [], [], false);
  assert.ok(suggestions.every((s) => s.status === '' && s.locked === false));
});

test('zoom video_quality ve cihaz adı', () => {
  assert.equal(cameraFromAttendee({ video_quality: 'poor' }), 'on');
  assert.equal(cameraFromAttendee({ video_quality: 'none' }), 'off');
  assert.equal(cameraFromAttendee({ camera: 'FaceTime HD Camera' }), null);
  assert.equal(cameraFromAttendee({ camera: 'off' }), 'off');
});

test('zoom toplantı numarası', () => {
  assert.equal(parseZoomMeetingId('https://us02web.zoom.us/j/9448152197?pwd=abc'), '9448152197');
  assert.equal(parseZoomMeetingId('https://zoom.us/wc/join/3565095951'), '3565095951');
  assert.equal(parseZoomMeetingId('https://bbb.example/join'), '');
});

test('etüt sabit zoom, normal ders kayıtlı bağlantı', () => {
  assert.match(
    effectiveMeetingLink(
      { subject: 'Etüt', meeting_link: 'https://bbb.example/join' },
      { name: '5A', class_level: '5' }
    ),
    /zoom\.us\/j\//
  );
  assert.equal(
    effectiveMeetingLink(
      { subject: 'Matematik', meeting_link: 'https://bbb.example/join' },
      { name: '5A', class_level: '5' }
    ),
    'https://bbb.example/join'
  );
});
