import { apiFetch } from '../session';
import type {
  AttemptResultResponse,
  AttemptStartResponse,
  AttemptSubmitResponse,
  ExamAssignmentForPaper,
  ExamAssignmentMine,
  ExamDifficulty,
  ExamPaper,
  ExamPaperDetail,
  ExamQuestion
} from '../../types/aiExams.types';

async function getJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `request_failed_${res.status}`);
  return data as T;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `request_failed_${res.status}`);
  return data as T;
}

/* SORU HAVUZU */
export const extractQuestionsFromAgent = (payload: { agent_id: string; document_id?: string }) =>
  postJson<{
    ok: boolean;
    parsed: number;
    inserted: number;
    low_confidence?: number;
    duplicates?: number;
    chunks_scanned?: number;
    chunks_with_qmark?: number;
    chunks_with_options?: number;
    batch_errors?: string[];
    cost_usd: number;
  }>('/api/ai-exams?op=extract', payload);

export const listQuestions = (filters: {
  agent_id: string;
  status?: string;
  topic?: string;
  difficulty?: string;
}) => {
  const q = new URLSearchParams({ op: 'questions', agent_id: filters.agent_id });
  if (filters.status) q.set('status', filters.status);
  if (filters.topic) q.set('topic', filters.topic);
  if (filters.difficulty) q.set('difficulty', filters.difficulty);
  return getJson<{ data: ExamQuestion[] }>(`/api/ai-exams?${q.toString()}`).then((r) => r.data);
};

export const updateQuestion = (payload: Partial<ExamQuestion> & { id: string }) =>
  postJson<{ data: ExamQuestion }>('/api/ai-exams?op=question-update', payload).then((r) => r.data);

export const deleteQuestion = (id: string) =>
  postJson<{ ok: boolean }>('/api/ai-exams?op=question-delete', { id });

/* DENEMELER */
export const listPapers = (agentId: string) =>
  getJson<{ data: ExamPaper[] }>(
    `/api/ai-exams?op=papers&agent_id=${encodeURIComponent(agentId)}`
  ).then((r) => r.data);

export const createPaper = (payload: {
  agent_id: string;
  title: string;
  description?: string;
  duration_minutes?: number;
  total_score?: number;
  question_ids?: string[];
  auto?: {
    count?: number;
    topics?: string[];
    difficulty_mix?: { kolay?: number; orta?: number; zor?: number };
  };
  status?: 'draft' | 'published';
}) => postJson<{ data: ExamPaper }>('/api/ai-exams?op=paper-create', payload).then((r) => r.data);

export const updatePaper = (payload: Partial<ExamPaper> & { id: string }) =>
  postJson<{ data: ExamPaper }>('/api/ai-exams?op=paper-update', payload).then((r) => r.data);

export const deletePaper = (id: string) =>
  postJson<{ ok: boolean }>('/api/ai-exams?op=paper-delete', { id });

export const getPaperDetail = (id: string) =>
  getJson<{ data: ExamPaperDetail }>(
    `/api/ai-exams?op=paper-detail&id=${encodeURIComponent(id)}`
  ).then((r) => r.data);

/* ATAMA */
export const assignPaper = (payload: {
  paper_id: string;
  student_user_ids: string[];
  starts_at?: string;
  ends_at?: string;
}) => postJson<{ ok: boolean; assigned: number }>('/api/ai-exams?op=assign', payload);

export const myAssignments = () =>
  getJson<{ data: ExamAssignmentMine[] }>('/api/ai-exams?op=assignments-mine').then((r) => r.data);

export const paperAssignments = (paperId: string) =>
  getJson<{ data: ExamAssignmentForPaper[] }>(
    `/api/ai-exams?op=assignments-paper&paper_id=${encodeURIComponent(paperId)}`
  ).then((r) => r.data);

/* ÇÖZME */
export const attemptStart = (assignmentId: string) =>
  postJson<AttemptStartResponse>('/api/ai-exams?op=attempt-start', { assignment_id: assignmentId });

export const attemptSubmit = (payload: {
  assignment_id: string;
  answers: Record<string, string>;
}) => postJson<AttemptSubmitResponse>('/api/ai-exams?op=attempt-submit', payload);

export const attemptResult = (assignmentId: string) =>
  getJson<AttemptResultResponse>(
    `/api/ai-exams?op=attempt-result&assignment_id=${encodeURIComponent(assignmentId)}`
  );

export const DIFFICULTY_OPTIONS: { value: ExamDifficulty; label: string }[] = [
  { value: 'kolay', label: 'Kolay' },
  { value: 'orta', label: 'Orta' },
  { value: 'zor', label: 'Zor' }
];
