import { apiFetch } from '../session';

export type EdesisProbeResult = {
  ok: boolean;
  connected?: boolean;
  baseUrl?: string;
  path?: string;
  rowCount?: number;
  hasData?: boolean;
  warning?: string | null;
  hint?: string;
  error?: string;
  attempts?: unknown[];
};

export type EdesisSyncResult = {
  ok: boolean;
  error?: string;
  baseUrl?: string;
  path?: string;
  studentsInDb?: number;
  fetched?: number;
  rowsWithStudentFields?: number;
  sampleRowKeys?: string[];
  fetchMode?: string;
  httpStatus?: number | null;
  jsonShape?: { type?: string; keys?: string[]; hint?: Record<string, string>; unwrappedLength?: number } | null;
  apiHint?: string | null;
  matched?: number;
  imported?: number;
  skipped?: number;
  unmatchedCount?: number;
  unmatchedSample?: unknown[];
  matchedByMethod?: Record<string, number>;
  matchingGuide?: string[];
  enrichedCount?: number;
  enrichStudentQueries?: number;
  enrichAnalyticsQueries?: number;
  sampleSubjectCount?: number | null;
  sampleTopicCount?: number | null;
  diagnosis?: string | null;
  errors?: { id: string; error: string }[];
  hint?: string;
};

export type EdesisStatus = {
  configured: boolean;
  institutionCode: string;
  baseUrl: string;
  examsPath: string | null;
  authMode: string;
  studentsInDb?: number;
  studentsWithEdesisId?: number;
  studentsWithEmail?: number;
  matchingGuide?: string[];
  hint?: string;
};

export async function fetchEdesisStatus(): Promise<EdesisStatus> {
  const res = await apiFetch('/api/edesis-sync?op=status');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j as EdesisStatus;
}

export async function probeEdesis(): Promise<EdesisProbeResult> {
  const res = await apiFetch('/api/edesis-sync?op=probe');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j as EdesisProbeResult;
}

export async function syncEdesis(): Promise<EdesisSyncResult> {
  const res = await apiFetch('/api/edesis-sync?op=sync', { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  return j as EdesisSyncResult;
}

export async function importEdesisJson(rows: unknown[]): Promise<EdesisSyncResult> {
  const res = await apiFetch('/api/edesis-sync?op=import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows })
  });
  const j = await res.json().catch(() => ({}));
  return j as EdesisSyncResult;
}

export async function refreshEdesisExamDetail(params: {
  examId: string;
  studentId: string;
  edesisStudentId?: string;
}): Promise<{ ok: boolean; exam?: unknown; subjectCount?: number; topicCount?: number; error?: string }> {
  const qs = new URLSearchParams({
    op: 'exam-detail',
    examId: params.examId,
    studentId: params.studentId
  });
  if (params.edesisStudentId) qs.set('edesisStudentId', params.edesisStudentId);
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

export async function fetchEdesisKarnePdf(params: {
  examId: string;
  studentId?: string;
  edesisStudentId: string;
  termId?: number | string;
}): Promise<{ ok?: boolean; status?: string; reportUrl?: string | null; message?: string; hint?: string }> {
  const qs = new URLSearchParams({
    op: 'exam-karne-pdf',
    examId: params.examId,
    edesisStudentId: params.edesisStudentId
  });
  if (params.studentId) qs.set('studentId', params.studentId);
  if (params.termId != null) qs.set('termId', String(params.termId));
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`, { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export async function fetchEdesisHubGrades(): Promise<{ ok: boolean; count: number; items: Record<string, unknown>[] }> {
  const res = await apiFetch('/api/edesis-sync?op=list-grades');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export async function fetchEdesisHubDepartments(): Promise<{ ok: boolean; count: number; items: Record<string, unknown>[] }> {
  const res = await apiFetch('/api/edesis-sync?op=list-departments');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export async function fetchEdesisHubClassrooms(): Promise<{ ok: boolean; count: number; items: Record<string, unknown>[] }> {
  const res = await apiFetch('/api/edesis-sync?op=list-classrooms');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export async function createEdesisClassroomHub(body: Record<string, unknown>): Promise<{ ok: boolean; item: unknown }> {
  const res = await apiFetch('/api/edesis-sync?op=create-classroom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export async function createEdesisStudentHub(body: Record<string, unknown>): Promise<{ ok: boolean; item: unknown }> {
  const res = await apiFetch('/api/edesis-sync?op=create-student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export async function createEdesisParentHub(body: Record<string, unknown>): Promise<{ ok: boolean; item: unknown }> {
  const res = await apiFetch('/api/edesis-sync?op=create-parent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export type EdesisHubStudent = {
  edesisId: string | null;
  name: string | null;
  email: string | null;
  schoolNo: string | null;
  platformStudentId: string | null;
  platformStudentName: string | null;
  matchMethod: string | null;
  linked: boolean;
};

export type EdesisPlatformStudent = {
  id: string;
  name: string;
  email: string | null;
  edesis_ogrenci_id: string | null;
};

export type EdesisStudentResultsExam = {
  edesisExamId: string | null;
  examTitle: string;
  examDate: string;
  totalNet: number;
  correct: number;
  wrong: number;
  blank: number;
  subjectCount: number;
  topicCount: number;
  subjects: {
    name: string;
    net: number;
    correct: number;
    wrong: number;
    blank: number;
    topics?: { name: string; net: number; correct: number; wrong: number; blank: number }[];
  }[];
};

export async function fetchEdesisHubStudents(): Promise<{
  ok: boolean;
  count: number;
  items: EdesisHubStudent[];
  platformStudents: EdesisPlatformStudent[];
}> {
  const res = await apiFetch('/api/edesis-sync?op=list-students');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

export async function fetchEdesisHubTerms(): Promise<{ ok: boolean; count: number; items: Record<string, unknown>[] }> {
  const res = await apiFetch('/api/edesis-sync?op=list-terms');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

export async function fetchEdesisHubExams(): Promise<{ ok: boolean; count: number; items: Record<string, unknown>[] }> {
  const res = await apiFetch('/api/edesis-sync?op=list-exams');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

export async function fetchEdesisStudentResultsHub(params: {
  edesisStudentId?: string;
  studentId?: string;
}): Promise<{
  ok: boolean;
  edesisStudentId: string;
  platformStudentId: string | null;
  platformStudentName: string | null;
  count: number;
  exams: EdesisStudentResultsExam[];
  autoLinked?: boolean;
  matchMethod?: string | null;
}> {
  const qs = new URLSearchParams({ op: 'student-results' });
  if (params.edesisStudentId) qs.set('edesisStudentId', params.edesisStudentId);
  if (params.studentId) qs.set('studentId', params.studentId);
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || res.statusText);
  return j;
}

export type EdesisAiAnalyzeResult = {
  ok: boolean;
  content?: string;
  reportUrl?: string | null;
  reportUrls?: string[];
  examCount?: number;
  exams?: {
    id: string;
    examTitle?: string;
    examDate: string;
    totalNet: number;
    edesisExamId?: string;
    subjectCount: number;
    topicCount: number;
  }[];
  exam?: {
    id: string;
    examTitle?: string;
    examDate: string;
    totalNet: number;
    edesisExamId?: string;
    subjectCount: number;
    topicCount: number;
  };
  meta?: { model?: string; topicCount?: number; examCount?: number; hasWeekly?: boolean; reason?: string };
  pdfParsed?: boolean;
  weeklyIncluded?: boolean;
  error?: string;
  hint?: string;
  message?: string;
};

/** Edesis deneme + haftalık rapor + konu kırılımı + karne PDF metni ile AI Koç analizi */
export async function analyzeEdesisWithAiCoach(params: {
  studentId: string;
  examId?: string;
  examIds?: string[];
  edesisExamId?: string;
  edesisExamIds?: string[];
  edesisStudentId?: string;
  includeWeekly?: boolean;
}): Promise<EdesisAiAnalyzeResult> {
  const examIds = [
    ...(params.examIds || []),
    ...(params.examId ? [params.examId] : [])
  ].filter(Boolean);
  const edesisExamIds = [
    ...(params.edesisExamIds || []),
    ...(params.edesisExamId ? [params.edesisExamId] : [])
  ].filter(Boolean);

  const res = await apiFetch('/api/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      op: 'analyze_edesis',
      student_id: params.studentId,
      exam_ids: examIds.length ? examIds : undefined,
      edesis_exam_ids: edesisExamIds.length ? edesisExamIds : undefined,
      edesis_student_id: params.edesisStudentId || undefined,
      include_weekly: params.includeWeekly !== false
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: j.error || res.statusText,
      hint: j.hint,
      message: j.message
    };
  }
  return j as EdesisAiAnalyzeResult;
}

export async function linkEdesisStudent(params: {
  platformStudentId: string;
  edesisStudentId: string;
}): Promise<{ ok: boolean }> {
  const res = await apiFetch('/api/edesis-sync?op=link-student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || res.statusText);
  return j;
}
