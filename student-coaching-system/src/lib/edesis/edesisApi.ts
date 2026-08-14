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
  apiVersion?: string;
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
  edesisStudentId?: string;
  termId?: number | string;
}): Promise<{ ok?: boolean; status?: string; reportUrl?: string | null; message?: string; hint?: string }> {
  const qs = new URLSearchParams({
    op: 'exam-karne-pdf',
    examId: params.examId
  });
  if (params.edesisStudentId) qs.set('edesisStudentId', params.edesisStudentId);
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
  termId?: number | string | null;
  termName?: string | null;
  studentState?: string | null;
  classroomId?: number | string | null;
  modifiedDate?: string | null;
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
  parent_phone?: string | null;
};

export type EdesisStudentResultsExam = {
  edesisExamId: string | null;
  examTitle: string;
  examType?: string | null;
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
  parent_phone?: string | null;
  parent_phone_source?: 'coaching_system' | string | null;
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

export type EdesisExamStructureLesson = {
  kitapcikTuru: string;
  lessonId: number | null;
  lessonName: string;
  dersGrupId: number | null;
  questionCount: number;
};

export type EdesisExamBooklet = {
  kitapcikTuru: string;
  lessons: EdesisExamStructureLesson[];
};

export type EdesisBookletPdf = {
  url: string;
  kitapcikTuru?: string;
  name?: string;
};

export type EdesisAvailableExam = {
  examId: string;
  name: string;
  examDate: string | null;
  examType: string | null;
  totalQuestions: number | null;
  studentCount: number | null;
  resultStatus: string;
  hasStudentResult: boolean;
  studentNet: number | null;
  canTake: boolean;
  bookletPdfs?: EdesisBookletPdf[];
};

export type EdesisIngestJob = {
  jobId?: string | null;
  state?: string | null;
  message?: string | null;
};

export async function fetchEdesisExamStructure(examId: string): Promise<{
  ok: boolean;
  examId: string;
  count: number;
  items: EdesisExamStructureLesson[];
  booklets: EdesisExamBooklet[];
  bookletPdfs?: EdesisBookletPdf[];
  examFamily?: string;
  bookletMode?: string;
  choiceCount?: number;
  remainingSeconds?: number;
  examTitle?: string;
  examType?: string;
}> {
  const qs = new URLSearchParams({ op: 'exam-structure', examId });
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

function blobLooksLikePdf(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 5) return false;
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf).subarray(0, 8));
  return head.includes('%PDF-');
}

export async function fetchEdesisExamBookletPdf(params: {
  examId: string;
  kitapcikTuru?: string;
}): Promise<{ blob: Blob; url?: string | null; files?: EdesisBookletPdf[] }> {
  const qs = new URLSearchParams({
    op: 'exam-booklet-pdf',
    examId: params.examId,
    download: '1'
  });
  if (params.kitapcikTuru) qs.set('kitapcikTuru', params.kitapcikTuru);
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`, {
    headers: { Accept: 'application/pdf,application/json' }
  });
  const buf = await res.arrayBuffer();
  if (blobLooksLikePdf(buf)) {
    return { blob: new Blob([buf], { type: 'application/pdf' }) };
  }
  const text = new TextDecoder().decode(buf);
  let j: Record<string, unknown> = {};
  try {
    j = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    j = {};
  }
  const url = typeof j.url === 'string' ? j.url : '';
  const files = Array.isArray(j.files) ? (j.files as EdesisBookletPdf[]) : [];
  if (url || files[0]?.url) {
    return { blob: new Blob(), url: url || files[0]?.url || null, files };
  }
  if (!res.ok) throw new Error(String(j.hint || j.message || j.error || 'Kitapçık PDF alınamadı'));
  throw new Error(String(j.hint || 'Bu sınav için kitapçık PDF’si bulunamadı'));
}

export async function fetchEdesisAvailableExams(params: {
  studentId?: string;
  edesisStudentId?: string;
}): Promise<{
  ok: boolean;
  edesisStudentId: string;
  count: number;
  items: EdesisAvailableExam[];
  scope?: string;
  hint?: string | null;
}> {
  const qs = new URLSearchParams({ op: 'available-exams' });
  if (params.studentId) qs.set('studentId', params.studentId);
  if (params.edesisStudentId) qs.set('edesisStudentId', params.edesisStudentId);
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export async function submitEdesisStudentExam(params: {
  examId: string;
  kitapcikTuru: string;
  kitapcikTuruSay?: string;
  dersCevaplari: { lessonId: number | null; dersGrupId: number | null; cevaplar: string }[];
  replace?: boolean;
  studentId?: string;
}): Promise<{
  ok: boolean;
  conflict?: boolean;
  accepted?: number;
  rejected?: { index?: number; reason?: string }[];
  jobId?: string | null;
  statusUrl?: string | null;
  job?: EdesisIngestJob | null;
  message?: string;
  error?: string;
  hint?: string;
}> {
  const res = await apiFetch('/api/edesis-sync?op=submit-exam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 409) return { ...j, ok: false, conflict: true };
  if (!res.ok && res.status !== 202) {
    throw new Error(j.hint || j.message || j.error || res.statusText);
  }
  return j;
}

export async function ingestEdesisExamResults(params: {
  examId: string;
  replace?: boolean;
  results: Record<string, unknown>[];
  poll?: boolean;
}): Promise<{
  ok: boolean;
  conflict?: boolean;
  accepted?: number;
  rejected?: { index?: number; reason?: string }[];
  jobId?: string | null;
  statusUrl?: string | null;
  job?: EdesisIngestJob | null;
  message?: string;
  error?: string;
  hint?: string;
}> {
  const res = await apiFetch('/api/edesis-sync?op=ingest-results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 409) return { ...j, ok: false, conflict: true };
  if (!res.ok && res.status !== 202) {
    throw new Error(j.hint || j.message || j.error || res.statusText);
  }
  return j;
}

export async function fetchEdesisIngestStatus(params: {
  examId: string;
  jobId: string;
}): Promise<{ ok: boolean; examId: string; jobId: string; state: string | null; message: string | null }> {
  const qs = new URLSearchParams({
    op: 'ingest-status',
    examId: params.examId,
    jobId: params.jobId
  });
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}
