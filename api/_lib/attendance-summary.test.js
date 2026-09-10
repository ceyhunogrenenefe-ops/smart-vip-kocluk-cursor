import { describe, expect, it } from 'vitest';
import {
  buildAttendanceSummary,
  computeAttendanceNotifyPlan,
  formatCoachAttendanceSummaryMessage,
  formatLateArrivalUpdateMessage
} from './attendance-summary.js';
import { parseCameraStatusInput, normalizeCameraStatus } from './attendance-notice-templates.js';

describe('attendance-summary', () => {
  it('TEST1 mixed attendance + camera', () => {
    const s = buildAttendanceSummary([
      { student_id: '1', name: 'A', status: 'present', camera_status: 'on' },
      { student_id: '2', name: 'B', status: 'present', camera_status: 'on' },
      { student_id: '3', name: 'C', status: 'present', camera_status: 'off' },
      { student_id: '4', name: 'D', status: 'late', camera_status: 'on' },
      { student_id: '5', name: 'E', status: 'absent', camera_status: null }
    ]);
    expect(s.total).toBe(5);
    expect(s.present).toBe(3);
    expect(s.late).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.cameraOpen).toBe(3);
    expect(s.cameraClosed).toBe(1);
  });

  it('TEST2 all present camera open', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => ({
      student_id: String(i),
      name: `S${i}`,
      status: 'present',
      camera_status: 'on'
    }));
    const s = buildAttendanceSummary(rows);
    expect(s.present).toBe(5);
    expect(s.late).toBe(0);
    expect(s.absent).toBe(0);
    expect(s.cameraOpen).toBe(5);
  });

  it('TEST3 all absent camera n_a', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => ({
      student_id: String(i),
      name: `S${i}`,
      status: 'absent',
      camera_status: null
    }));
    const s = buildAttendanceSummary(rows);
    expect(s.absent).toBe(5);
    expect(s.cameraOpen).toBe(0);
    expect(s.cameraClosed).toBe(0);
  });

  it('TEST5 delta: only Ece late from absent triggers late plan, not class-wide absent', () => {
    const prior = new Map([
      ['ayse', { status: 'present', camera_status: 'on' }],
      ['mehmet', { status: 'present', camera_status: 'on' }],
      ['zeynep', { status: 'present', camera_status: 'on' }],
      ['ahmet', { status: 'present', camera_status: 'on' }],
      ['ece', { status: 'absent', camera_status: 'n_a' }]
    ]);
    const prepared = [
      { student_id: 'ayse', status: 'present', camera_status: 'on' },
      { student_id: 'mehmet', status: 'present', camera_status: 'on' },
      { student_id: 'zeynep', status: 'present', camera_status: 'on' },
      { student_id: 'ahmet', status: 'present', camera_status: 'on' },
      { student_id: 'ece', status: 'late', camera_status: 'on', student_name: 'Ece' }
    ];
    const plan = computeAttendanceNotifyPlan(prior, prepared);
    expect(plan.newlyAbsent).toHaveLength(0);
    expect(plan.unchangedAbsent).toHaveLength(0);
    expect(plan.lateFromAbsent.map((r) => r.student_id)).toEqual(['ece']);
    expect(plan.sendCoachFullSummary).toBe(false);
    expect(plan.sendCoachLateDelta).toBe(true);
  });

  it('first mark sends coach full summary once plan', () => {
    const plan = computeAttendanceNotifyPlan(
      new Map(),
      [
        { student_id: '1', status: 'present', camera_status: 'on' },
        { student_id: '2', status: 'absent', camera_status: 'n_a' }
      ]
    );
    expect(plan.isFirstMark).toBe(true);
    expect(plan.sendCoachFullSummary).toBe(true);
    expect(plan.newlyAbsent).toHaveLength(1);
    expect(plan.sendCoachLateDelta).toBe(false);
  });

  it('TEST11 camera-only change does not create newlyAbsent or lateFromAbsent', () => {
    const prior = new Map([['1', { status: 'present', camera_status: 'off' }]]);
    const plan = computeAttendanceNotifyPlan(prior, [
      { student_id: '1', status: 'present', camera_status: 'on' }
    ]);
    expect(plan.newlyAbsent).toHaveLength(0);
    expect(plan.lateFromAbsent).toHaveLength(0);
    expect(plan.sendCoachFullSummary).toBe(false);
    expect(plan.sendCoachLateDelta).toBe(false);
  });

  it('formats coach and late messages', () => {
    const summary = buildAttendanceSummary([
      { student_id: '1', name: 'Ece', status: 'late', camera_status: 'on' }
    ]);
    const coach = formatCoachAttendanceSummaryMessage({
      className: '9A',
      lessonName: 'Matematik',
      teacherName: 'Ali',
      coachName: 'Turan',
      lessonDateTime: '2026-09-10 10:00',
      summary
    });
    expect(coach).toContain('DERS YOKLAMA RAPORU');
    expect(coach).toContain('Ece');
    const late = formatLateArrivalUpdateMessage({
      studentName: 'Ece',
      className: '9A',
      lessonName: 'Matematik',
      attendanceStatus: 'late',
      cameraStatus: 'on',
      forCoach: true,
      presentCount: 5,
      totalCount: 5
    });
    expect(late).toContain('YOKLAMA GÜNCELLEMESİ');
    expect(late).toContain('5/5');
  });
});

describe('camera parse', () => {
  it('TEST4 present without camera → null for validation', () => {
    expect(parseCameraStatusInput('present', null)).toBe(null);
    expect(parseCameraStatusInput('late', '')).toBe(null);
    expect(parseCameraStatusInput('absent', null)).toBe('n_a');
    expect(parseCameraStatusInput('present', 'open')).toBe('on');
    expect(parseCameraStatusInput('present', 'closed')).toBe('off');
  });

  it('normalizeCameraStatus defaults missing to on for BBB', () => {
    expect(normalizeCameraStatus('present', null)).toBe('on');
    expect(normalizeCameraStatus('absent', 'on')).toBe('n_a');
  });
});
