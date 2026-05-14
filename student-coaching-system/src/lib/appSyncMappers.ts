import type { AICoachSuggestion, ExamResult, ReadingLog } from '../types';
import type { Database } from './supabase';

export type ExamResultRow = Database['public']['Tables']['exam_results']['Row'];
export type ReadingLogRow = Database['public']['Tables']['reading_logs']['Row'];

const VALID_EXAM_TYPES: ExamResult['examType'][] = [
  '3',
  '4',
  '5',
  '6',
  '7',
  'LGS',
  'YOS',
  'TYT',
  'YKS-EA',
  'YKS-SAY',
  'AYT'
];

export function coerceExamType(raw: string | null | undefined): ExamResult['examType'] {
  const s = String(raw || '').trim();
  return (VALID_EXAM_TYPES as string[]).includes(s) ? (s as ExamResult['examType']) : 'TYT';
}

export function examResultFromRow(row: ExamResultRow): ExamResult | null {
  const payload = row.app_payload as ExamResult | null | undefined;
  if (payload && typeof payload === 'object' && 'id' in payload && 'studentId' in payload && Array.isArray((payload as ExamResult).subjects)) {
    return payload as ExamResult;
  }
  const name = String(row.exam_name || 'Genel').trim() || 'Genel';
  const net = row.net_score != null ? Number(row.net_score) : 0;
  return {
    id: row.id,
    studentId: row.student_id,
    examType: coerceExamType(row.exam_name),
    examDate: (row.date || row.created_at || new Date().toISOString()).slice(0, 10),
    source: 'manual',
    totalNet: net,
    subjects: [
      {
        name,
        net,
        correct: row.correct ?? 0,
        wrong: row.wrong ?? 0,
        blank: row.blank ?? 0
      }
    ],
    notes: undefined,
    createdAt: row.created_at
  };
}

export function examResultToUpsertRow(exam: ExamResult, institutionId: string | null): Record<string, unknown> {
  const totals = (exam.subjects || []).reduce(
    (a, s) => ({
      correct: a.correct + (s.correct ?? 0),
      wrong: a.wrong + (s.wrong ?? 0),
      blank: a.blank + (s.blank ?? 0)
    }),
    { correct: 0, wrong: 0, blank: 0 }
  );
  const tq = totals.correct + totals.wrong + totals.blank;
  const now = new Date().toISOString();
  return {
    id: exam.id,
    student_id: exam.studentId,
    exam_name: String(exam.examType),
    date: exam.examDate.slice(0, 10),
    raw_score: null,
    net_score: exam.totalNet,
    correct: totals.correct,
    wrong: totals.wrong,
    blank: totals.blank,
    total_questions: tq > 0 ? tq : null,
    institution_id: institutionId,
    app_payload: exam as unknown as Record<string, unknown>,
    updated_at: now
  };
}

export function readingLogFromRow(row: ReadingLogRow): ReadingLog {
  const d = String(row.date || '').slice(0, 10);
  return {
    id: row.id,
    studentId: row.student_id,
    bookId: row.book_id || undefined,
    date: d,
    minutesRead: row.minutes_read,
    pagesRead: row.pages_read ?? undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at
  };
}

export function readingLogToUpsertRow(log: ReadingLog, institutionId: string | null): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: log.id,
    student_id: log.studentId,
    book_id: log.bookId ?? null,
    date: log.date.slice(0, 10),
    minutes_read: log.minutesRead,
    pages_read: log.pagesRead ?? null,
    notes: log.notes ?? null,
    institution_id: institutionId,
    created_at: log.createdAt || now
  };
}

export function aiSuggestionFromRow(row: {
  id: string;
  payload: Record<string, unknown> | null;
}): AICoachSuggestion | null {
  const p = row.payload as Partial<AICoachSuggestion> | null;
  if (!p || typeof p !== 'object' || !p.studentId || !p.title || !p.description) return null;
  return {
    ...(p as AICoachSuggestion),
    id: row.id
  };
}

export function aiSuggestionToPayload(s: AICoachSuggestion): Record<string, unknown> {
  return { ...s } as unknown as Record<string, unknown>;
}
