/**
 * Yoklama özeti — öğretmen UI, PDF/CSV, WhatsApp, koç raporu için tek kaynak.
 * DB: status present|absent|late ; camera_status on|off|n_a|null
 */

import { normalizeAttendanceStatus, normalizeCameraStatus } from './attendance-notice-templates.js';

export const ATTENDANCE_STATUS_TR = {
  present: '✅ Derse Katıldı',
  absent: '❌ Derse Katılmadı',
  late: '🕐 Derse Geç Katıldı'
};

export const CAMERA_STATUS_TR = {
  on: '🎥 Kamera Açık',
  open: '🎥 Kamera Açık',
  off: '🚫 Kamera Kapalı',
  closed: '🚫 Kamera Kapalı',
  n_a: '—',
  null: '—'
};

export function attendanceStatusLabelTr(status) {
  const st = normalizeAttendanceStatus(status);
  return ATTENDANCE_STATUS_TR[st] || st;
}

export function cameraStatusLabelTr(status, cameraStatus) {
  const st = normalizeAttendanceStatus(status);
  if (st === 'absent') return '—';
  const cam = String(cameraStatus || '').trim().toLowerCase();
  if (cam === 'on' || cam === 'open') return CAMERA_STATUS_TR.on;
  if (cam === 'off' || cam === 'closed') return CAMERA_STATUS_TR.off;
  return '—';
}

/**
 * @param {Array<{ student_id?: string, student_name?: string|null, name?: string|null, status?: string, camera_status?: string|null }>} rows
 */
export function buildAttendanceSummary(rows = []) {
  const presentStudents = [];
  const lateStudents = [];
  const absentStudents = [];
  const cameraOpenStudents = [];
  const cameraClosedStudents = [];

  for (const raw of rows || []) {
    const studentId = String(raw?.student_id || '').trim();
    const name = String(raw?.student_name || raw?.name || '').trim() || studentId || 'Öğrenci';
    const status = normalizeAttendanceStatus(raw?.status);
    const camera =
      status === 'absent'
        ? 'n_a'
        : normalizeCameraStatus(status, raw?.camera_status == null ? 'on' : raw.camera_status);
    const entry = { student_id: studentId, name, status, camera_status: camera };

    if (status === 'present') presentStudents.push(entry);
    else if (status === 'late') lateStudents.push(entry);
    else absentStudents.push(entry);

    if (status === 'present' || status === 'late') {
      if (camera === 'on') cameraOpenStudents.push(entry);
      else if (camera === 'off') cameraClosedStudents.push(entry);
    }
  }

  return {
    total: presentStudents.length + lateStudents.length + absentStudents.length,
    present: presentStudents.length,
    late: lateStudents.length,
    absent: absentStudents.length,
    cameraOpen: cameraOpenStudents.length,
    cameraClosed: cameraClosedStudents.length,
    presentStudents,
    lateStudents,
    absentStudents,
    cameraOpenStudents,
    cameraClosedStudents
  };
}

function numberedList(entries) {
  if (!entries?.length) return 'Yok';
  return entries.map((e, i) => `${i + 1}. ${e.name}`).join('\n');
}

export function formatCoachAttendanceSummaryMessage({
  className,
  lessonName,
  teacherName,
  coachName,
  lessonDateTime,
  summary
}) {
  const s = summary || buildAttendanceSummary([]);
  return [
    '📋 DERS YOKLAMA RAPORU',
    `🏫 Sınıf: ${className || '—'}`,
    `📚 Ders: ${lessonName || '—'}`,
    `👨‍🏫 Öğretmen: ${teacherName || '—'}`,
    `👤 Koç: ${coachName || '—'}`,
    `📅 ${lessonDateTime || '—'}`,
    '',
    `👥 Toplam Öğrenci: ${s.total}`,
    `✅ Katılan: ${s.present}`,
    `🕐 Geç Katılan: ${s.late}`,
    `❌ Katılmayan: ${s.absent}`,
    `🎥 Kamerası Açık: ${s.cameraOpen}`,
    `🚫 Kamerası Kapalı: ${s.cameraClosed}`,
    '',
    '✅ KATILAN ÖĞRENCİLER',
    numberedList(s.presentStudents),
    '',
    '🕐 GEÇ KATILAN ÖĞRENCİLER',
    numberedList(s.lateStudents),
    '',
    '❌ KATILMAYAN ÖĞRENCİLER',
    numberedList(s.absentStudents),
    '',
    '🎥 KAMERASI AÇIK ÖĞRENCİLER',
    numberedList(s.cameraOpenStudents),
    '',
    '🚫 KAMERASI KAPALI ÖĞRENCİLER',
    numberedList(s.cameraClosedStudents),
    '',
    'Online VIP Dershane'
  ].join('\n');
}

export function formatLateArrivalUpdateMessage({
  studentName,
  className,
  lessonName,
  attendanceStatus,
  cameraStatus,
  forCoach = false,
  previousLabel = 'Katılmadı',
  presentCount,
  totalCount
}) {
  const statusTr = attendanceStatusLabelTr(attendanceStatus);
  const camTr = cameraStatusLabelTr(attendanceStatus, cameraStatus);
  if (forCoach) {
    const lines = [
      '🕐 YOKLAMA GÜNCELLEMESİ',
      `🏫 ${className || '—'}`,
      `📚 ${lessonName || '—'}`,
      '',
      `${studentName || 'Öğrenci'} daha önce “${previousLabel}” olarak işaretlenmişti.`,
      'Güncel durum:',
      statusTr,
      camTr
    ];
    if (presentCount != null && totalCount != null) {
      lines.push('', `Güncel katılım: ${presentCount}/${totalCount}`);
    }
    return lines.join('\n');
  }
  return [
    '🕐 YOKLAMA GÜNCELLEMESİ',
    `Öğrenci: ${studentName || '—'}`,
    `Sınıf: ${className || '—'}`,
    `Ders: ${lessonName || '—'}`,
    'Öğrencimiz derse geç katılmıştır.',
    '',
    'Durum:',
    statusTr,
    'Kamera:',
    camTr
  ].join('\n');
}

/**
 * Delta plan: hangi öğrencilere hangi bildirim (tüm sınıf değil).
 * @param {Map<string,{status:string,camera_status?:string|null}>|Array} prior
 * @param {Array<{student_id:string,status:string,camera_status?:string|null,student_name?:string}>} prepared
 */
export function computeAttendanceNotifyPlan(prior, prepared) {
  const priorMap =
    prior instanceof Map
      ? prior
      : new Map(
          (prior || []).map((r) => [
            String(r.student_id),
            { status: String(r.status || ''), camera_status: r.camera_status ?? null }
          ])
        );

  const newlyAbsent = [];
  const lateFromAbsent = [];
  const unchangedAbsent = [];
  const newlyCameraOff = [];

  for (const row of prepared || []) {
    const sid = String(row.student_id || '').trim();
    if (!sid) continue;
    const prev = priorMap.get(sid);
    const prevStatus = prev ? normalizeAttendanceStatus(prev.status) : null;
    const nextStatus = normalizeAttendanceStatus(row.status);
    const nextCam =
      nextStatus === 'absent'
        ? 'n_a'
        : normalizeCameraStatus(nextStatus, row.camera_status == null ? 'on' : row.camera_status);
    const prevCamRaw = prev?.camera_status;
    const prevCam =
      prevStatus == null
        ? null
        : prevStatus === 'absent'
          ? 'n_a'
          : normalizeCameraStatus(prevStatus, prevCamRaw == null ? null : prevCamRaw);

    if (nextStatus === 'absent') {
      if (prevStatus === 'absent') unchangedAbsent.push(row);
      else newlyAbsent.push(row);
    }
    if (prevStatus === 'absent' && nextStatus === 'late') {
      lateFromAbsent.push(row);
    }

    // Katıldı/geç + kamera kapalı (önceden kapalı değilse) → veli kamera bildirimi
    if ((nextStatus === 'present' || nextStatus === 'late') && nextCam === 'off') {
      const wasAlreadyOff =
        (prevStatus === 'present' || prevStatus === 'late') && prevCam === 'off';
      if (!wasAlreadyOff) newlyCameraOff.push(row);
    }
  }

  const isFirstMark = priorMap.size === 0;
  return {
    newlyAbsent,
    lateFromAbsent,
    unchangedAbsent,
    newlyCameraOff,
    isFirstMark,
    /**
     * Her Kaydet’te dene — sendCoachLessonAttendanceSummary message_logs ile idempotent.
     * BBB erken yoklama prior yazsa bile öğretmen Kaydet’te koç özeti gitsin.
     */
    sendCoachFullSummary: true,
    /** absent→late sonrası kısa koç güncellemesi (tam özetten bağımsız) */
    sendCoachLateDelta: lateFromAbsent.length > 0
  };
}
