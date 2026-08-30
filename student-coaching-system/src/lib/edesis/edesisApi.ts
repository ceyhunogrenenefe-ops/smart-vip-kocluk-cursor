import { apiFetch } from '../session';
import { firstGoogleDrivePreviewUrl } from './googleDrivePdf';

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

let syncInFlight: Promise<EdesisSyncResult> | null = null;

export async function syncEdesis(): Promise<EdesisSyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    const res = await apiFetch('/api/edesis-sync?op=sync', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    return j as EdesisSyncResult;
  })().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export type EdesisEnrollBatchResult = {
  ok?: boolean;
  done?: boolean;
  remaining?: number;
  writes?: number;
  skipped?: number;
  already?: number;
  count?: number;
  error?: string;
  marker?: string;
  items?: Array<{
    id?: string;
    name?: string;
    ok?: boolean;
    created?: boolean;
    skipped?: boolean;
    error?: string;
    edesisStudentId?: string;
  }>;
};

export async function enrollPlatformStudentsToEdesis(
  limit = 6
): Promise<EdesisEnrollBatchResult> {
  const res = await apiFetch('/api/edesis-sync?op=enroll-platform-students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || res.statusText);
  return j as EdesisEnrollBatchResult;
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

function blobLooksLikePdf(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 5) return false;
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf).subarray(0, 8));
  return head.includes('%PDF-');
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

export async function fetchEdesisHataKarnesiPdf(params: {
  examId: string;
  studentId?: string;
  edesisStudentId?: string;
}): Promise<{ blob?: Blob; reportUrl?: string | null; message?: string; hint?: string; source?: string }> {
  const qs = new URLSearchParams({
    op: 'exam-hata-karnesi-pdf',
    examId: params.examId,
    download: '1'
  });
  if (params.edesisStudentId) qs.set('edesisStudentId', params.edesisStudentId);
  if (params.studentId) qs.set('studentId', params.studentId);
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`, {
    method: 'POST',
    headers: { Accept: 'application/pdf,application/json' }
  });
  const buf = await res.arrayBuffer();
  if (blobLooksLikePdf(buf)) {
    return { blob: new Blob([buf], { type: 'application/pdf' }), message: 'Hata karnesi PDF hazır' };
  }
  const text = new TextDecoder().decode(buf);
  let j: Record<string, unknown> = {};
  try {
    j = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    j = {};
  }
  const reportUrl = typeof j.reportUrl === 'string' ? j.reportUrl : '';
  if (reportUrl) {
    return {
      blob: undefined,
      reportUrl,
      message: typeof j.message === 'string' ? j.message : 'Hata karnesi PDF hazır',
      source: typeof j.source === 'string' ? j.source : undefined
    };
  }
  throw new Error(String(j.hint || j.message || j.error || 'Hata karnesi PDF alınamadı'));
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
  class_level?: string | null;
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
  listStatus?: 'takeable' | 'expired' | 'completed' | 'blocked';
  remainingSeconds?: number;
  bookletPdfs?: EdesisBookletPdf[];
};

export type EdesisIngestJob = {
  jobId?: string | null;
  state?: string | null;
  message?: string | null;
};

export async function fetchEdesisExamStructure(
  examId: string,
  opts?: { studentId?: string }
): Promise<{
  ok: boolean;
  examId: string;
  count: number;
  items: EdesisExamStructureLesson[];
  booklets: EdesisExamBooklet[];
  availableBookletCodes?: string[];
  answerKeyBookletCodes?: string[];
  denemeOnlyBookletCodes?: string[];
  bookletPdfs?: EdesisBookletPdf[];
  examFamily?: string;
  bookletMode?: string;
  choiceCount?: number;
  remainingSeconds?: number;
  examTitle?: string;
  examType?: string;
}> {
  const qs = new URLSearchParams({ op: 'exam-structure', examId });
  if (opts?.studentId) qs.set('studentId', opts.studentId);
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export async function fetchEdesisExamBookletPdf(params: {
  examId: string;
  kitapcikTuru?: string;
  fileUrl?: string;
}): Promise<{
  blob: Blob;
  url?: string | null;
  files?: EdesisBookletPdf[];
  denemeId?: string | null;
  attempts?: unknown[];
}> {
  const qs = new URLSearchParams({
    op: 'exam-booklet-pdf',
    examId: params.examId,
    download: '1'
  });
  if (params.kitapcikTuru) qs.set('kitapcikTuru', params.kitapcikTuru);
  if (params.fileUrl) qs.set('fileUrl', params.fileUrl);
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
  const denemeId = typeof j.denemeId === 'string' || typeof j.denemeId === 'number' ? String(j.denemeId) : null;
  const attempts = Array.isArray(j.attempts) ? j.attempts : [];
  const viewer = typeof j.viewer === 'string' ? j.viewer : '';
  const preview = firstGoogleDrivePreviewUrl([
    viewer === 'google-drive-preview' ? url : '',
    params.fileUrl,
    url,
    ...files.map((f) => String(f?.url || ''))
  ]);
  if (preview) {
    return { blob: new Blob(), url: preview, files, denemeId, attempts };
  }
  if (url || files[0]?.url) {
    return { blob: new Blob(), url: url || files[0]?.url || null, files, denemeId, attempts };
  }
  const base = String(j.hint || j.message || j.error || 'Kitapçık PDF alınamadı');
  const extra = [
    denemeId ? `denemeId=${denemeId}` : '',
    attempts.length ? `deneme=${attempts.length} deneme` : ''
  ]
    .filter(Boolean)
    .join(', ');
  const err = new Error(extra ? `${base} (${extra})` : base) as Error & {
    denemeId?: string | null;
    attempts?: unknown[];
    files?: EdesisBookletPdf[];
  };
  err.denemeId = denemeId;
  err.attempts = attempts;
  err.files = files;
  throw err;
}

export async function fetchEdesisAvailableExams(params: {
  studentId?: string;
  edesisStudentId?: string;
}): Promise<{
  ok: boolean;
  edesisStudentId: string;
  count: number;
  items: EdesisAvailableExam[];
  expired?: EdesisAvailableExam[];
  expiredCount?: number;
  taken?: EdesisStudentResultsExam[];
  takenCount?: number;
  scope?: string;
  hint?: string | null;
  assignmentMeta?: Record<string, unknown>;
}> {
  const qs = new URLSearchParams({ op: 'available-exams' });
  if (params.studentId) qs.set('studentId', params.studentId);
  if (params.edesisStudentId) qs.set('edesisStudentId', params.edesisStudentId);
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || j.hint || res.statusText);
  return j;
}

export type EdesisStudentDossier = {
  ok: boolean;
  edesisStudentId: string;
  platformStudentId: string | null;
  profile: {
    name: string | null;
    email: string | null;
    classLevel: string | null;
    gradeName: string | null;
    className: string | null;
    classroomId: string | null;
    parentPhone: string | null;
    programKeys: string[];
  };
  takeable: EdesisAvailableExam[];
  taken: EdesisStudentResultsExam[];
  openOnline: EdesisAvailableExam[];
  counts: { takeable: number; taken: number; openOnline: number };
  assignmentMeta?: Record<string, unknown>;
};

export async function fetchEdesisStudentDossier(params: {
  studentId?: string;
  edesisStudentId?: string;
}): Promise<EdesisStudentDossier> {
  const qs = new URLSearchParams({ op: 'student-dossier' });
  if (params.studentId) qs.set('studentId', params.studentId);
  if (params.edesisStudentId) qs.set('edesisStudentId', params.edesisStudentId);
  const res = await apiFetch(`/api/edesis-sync?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || j.message || res.statusText);
  return j as EdesisStudentDossier;
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
