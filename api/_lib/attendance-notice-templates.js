import { renderMessageTemplate } from './template-engine.js';

export const ATTENDANCE_ABSENT_TEMPLATE =
  'Sayın velimiz, öğrencimiz {{student_name}}, {{subject}} dersine katılmamıştır. Bilginize.';

export const ATTENDANCE_CAMERA_OFF_TEMPLATE =
  'Sayın velimiz, öğrencimiz {{student_name}}, {{subject}} dersine katılmış ancak ders sırasında kamerasını açmamıştır. Bilginize.';

export function normalizeAttendanceStatus(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'present' || v === 'absent' || v === 'late') return v;
  return 'absent';
}

/** Katılmadı → n_a; katıldı/geç → on | off */
export function normalizeCameraStatus(attendanceStatus, raw) {
  const st = normalizeAttendanceStatus(attendanceStatus);
  if (st === 'absent') return 'n_a';
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'off' || v === 'closed' || v === 'kapali' || v === 'kapalı') return 'off';
  if (v === 'n_a' || v === 'na' || v === 'n/a' || v === 'uygulanamaz') return 'n_a';
  return 'on';
}

export function attendanceNoticeKind(status, cameraStatus) {
  const st = normalizeAttendanceStatus(status);
  const cam = normalizeCameraStatus(st, cameraStatus);
  if (st === 'absent') return 'absent';
  if ((st === 'present' || st === 'late') && cam === 'off') return 'camera_off';
  return null;
}

export function attendanceNoticeTemplate(kind) {
  if (kind === 'camera_off') return ATTENDANCE_CAMERA_OFF_TEMPLATE;
  return ATTENDANCE_ABSENT_TEMPLATE;
}

export function renderAttendanceNotice(kind, vars) {
  return renderMessageTemplate(attendanceNoticeTemplate(kind), {
    student_name: vars?.student_name || 'Öğrencimiz',
    subject: vars?.subject || 'ders'
  });
}

export function buildAttendanceNotifyText(preset, custom, vars) {
  const c = String(custom || '').trim();
  if (c) return renderMessageTemplate(c, vars || {});
  const student = vars?.student_name || 'Öğrenci';
  const subj = vars?.subject || 'Ders';
  const time = vars?.lesson_time || '';
  const teacher = vars?.teacher_name || 'Öğretmen';
  const date = vars?.lesson_date || '';
  if (preset === 'absent_veli' || preset === 'class_absent_parent_notice') {
    return renderAttendanceNotice('absent', { student_name: student, subject: subj });
  }
  if (preset === 'camera_off' || preset === 'class_camera_off_notice') {
    return renderAttendanceNotice('camera_off', { student_name: student, subject: subj });
  }
  if (preset === 'next_time') {
    return `${student} için ${date} tarihli ${subj} dersine (${time}) zamanında katılım rica olunur. Öğretmen: ${teacher}`;
  }
  if (preset === 'missing_record') {
    return `${student} — ${date} ${subj} (${time}) için eksik ders kaydı / devamsızlık oluşmuştur. Öğretmen: ${teacher}`;
  }
  return `${student} bugün (${date}) ${subj} dersine (${time}) katılım sağlamamıştır. Öğretmen: ${teacher}`;
}
