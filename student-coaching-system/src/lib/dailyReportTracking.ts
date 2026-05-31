import type { Student, WeeklyEntry } from '../types';

const TZ = 'Europe/Istanbul';

/** YYYY-MM-DD (İstanbul takvim günü) */
export function getIstanbulDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function addDaysToYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function formatDayLabelTr(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export type DailyReportEntrySlice = Pick<
  WeeklyEntry,
  | 'studentId'
  | 'date'
  | 'correctAnswers'
  | 'wrongAnswers'
  | 'blankAnswers'
  | 'solvedQuestions'
  | 'readingMinutes'
  | 'pagesRead'
  | 'screenTimeMinutes'
>;

export type DailyReportStudentStatus = {
  studentId: string;
  filled: boolean;
  entryCount: number;
  breakdownTotal: number;
  solvedTotal: number;
};

export type DailyReportDaySummary = {
  date: string;
  filledCount: number;
  totalStudents: number;
  rate: number;
};

/** Öğrenci seçili günde anlamlı günlük rapor girmiş mi? */
export function studentHasDailyReportFilled(
  studentId: string,
  entriesForDate: DailyReportEntrySlice[]
): boolean {
  const rows = entriesForDate.filter((e) => e.studentId === studentId);
  if (!rows.length) return false;

  const breakdown = rows.reduce(
    (sum, e) => sum + (e.correctAnswers || 0) + (e.wrongAnswers || 0) + (e.blankAnswers || 0),
    0
  );
  if (breakdown > 0) return true;

  const solved = rows.reduce((sum, e) => sum + (e.solvedQuestions || 0), 0);
  if (solved > 0) return true;

  const extra = rows.reduce(
    (sum, e) => sum + (e.readingMinutes || 0) + (e.pagesRead || 0) + (e.screenTimeMinutes || 0),
    0
  );
  return extra > 0;
}

export function buildDailyReportStatuses(
  students: Pick<Student, 'id'>[],
  weeklyEntries: DailyReportEntrySlice[],
  dateYmd: string
): DailyReportStudentStatus[] {
  const entriesForDate = weeklyEntries.filter((e) => String(e.date || '').slice(0, 10) === dateYmd);

  return students.map((student) => {
    const rows = entriesForDate.filter((e) => e.studentId === student.id);
    const breakdownTotal = rows.reduce(
      (sum, e) => sum + (e.correctAnswers || 0) + (e.wrongAnswers || 0) + (e.blankAnswers || 0),
      0
    );
    const solvedTotal = rows.reduce((sum, e) => sum + (e.solvedQuestions || 0), 0);
    return {
      studentId: student.id,
      filled: studentHasDailyReportFilled(student.id, entriesForDate),
      entryCount: rows.length,
      breakdownTotal,
      solvedTotal
    };
  });
}

export function buildLastNDaySummaries(
  students: Pick<Student, 'id'>[],
  weeklyEntries: DailyReportEntrySlice[],
  endDateYmd: string,
  days = 7
): DailyReportDaySummary[] {
  const totalStudents = students.length;
  const out: DailyReportDaySummary[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDaysToYmd(endDateYmd, -i);
    const statuses = buildDailyReportStatuses(students, weeklyEntries, date);
    const filledCount = statuses.filter((s) => s.filled).length;
    out.push({
      date,
      filledCount,
      totalStudents,
      rate: totalStudents > 0 ? Math.round((filledCount / totalStudents) * 100) : 0
    });
  }
  return out;
}
