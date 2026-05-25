import { apiFetch } from '../session';
import type { QuestionNotificationRow, QuestionRow } from './types';

async function parseJson<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = j as { error?: string; hint?: string };
    throw new Error(err.hint || err.error || `API ${res.status}`);
  }
  return j as T;
}

export async function fetchMyQuestions(status?: string): Promise<QuestionRow[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiFetch(`/api/questions${q}`);
  const j = await parseJson<{ data: QuestionRow[] }>(res);
  return j.data || [];
}

export async function createQuestion(payload: {
  subject: string;
  grade: string;
  topic?: string;
  description?: string;
  image_base64: string;
  image_mime?: string;
}): Promise<QuestionRow> {
  const res = await apiFetch('/api/questions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const j = await parseJson<{ data: QuestionRow }>(res);
  return j.data;
}

export async function cancelQuestion(id: string): Promise<QuestionRow> {
  const res = await apiFetch(`/api/questions?id=${encodeURIComponent(id)}&action=cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'cancel' })
  });
  const j = await parseJson<{ data: QuestionRow }>(res);
  return j.data;
}

export async function rateQuestion(id: string, rating: number): Promise<QuestionRow> {
  const res = await apiFetch(`/api/questions?id=${encodeURIComponent(id)}&action=rate`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'rate', rating })
  });
  const j = await parseJson<{ data: QuestionRow }>(res);
  return j.data;
}

export async function fetchTeacherPool(params: {
  scope: 'pool' | 'mine' | 'solved';
  subject?: string;
  grade?: string;
  status?: string;
}): Promise<QuestionRow[]> {
  const sp = new URLSearchParams({ scope: params.scope });
  if (params.subject) sp.set('subject', params.subject);
  if (params.grade) sp.set('grade', params.grade);
  if (params.status) sp.set('status', params.status);
  const res = await apiFetch(`/api/questions?${sp}`);
  const j = await parseJson<{ data: QuestionRow[] }>(res);
  return j.data || [];
}

export async function claimQuestion(questionId: string): Promise<QuestionRow> {
  const res = await apiFetch('/api/questions', {
    method: 'POST',
    body: JSON.stringify({ action: 'claim', question_id: questionId })
  });
  const j = await parseJson<{ data: QuestionRow }>(res);
  return j.data;
}

export async function markQuestionSolving(id: string): Promise<QuestionRow> {
  const res = await apiFetch(`/api/questions?id=${encodeURIComponent(id)}&action=solving`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'solving' })
  });
  const j = await parseJson<{ data: QuestionRow }>(res);
  return j.data;
}

export async function submitSolution(
  questionId: string,
  payload: {
    solved_text?: string;
    solved_image_base64?: string;
    solved_image_mime?: string;
    solved_pdf_base64?: string;
    solved_video_url?: string;
    solved_audio_base64?: string;
    solved_audio_mime?: string;
  }
): Promise<QuestionRow> {
  const res = await apiFetch('/api/questions', {
    method: 'POST',
    body: JSON.stringify({ action: 'solve', question_id: questionId, ...payload })
  });
  const j = await parseJson<{ data: QuestionRow }>(res);
  return j.data;
}

export type TeacherQuestionProfile = {
  branches: string[];
  grades: string[];
  institution_id?: string | null;
  updated_at?: string | null;
};

export async function fetchTeacherQuestionProfile(
  userId?: string
): Promise<TeacherQuestionProfile> {
  const sp = new URLSearchParams({ resource: 'teacher_profile' });
  if (userId) sp.set('user_id', userId);
  const res = await apiFetch(`/api/questions?${sp}`);
  const j = await parseJson<{ data: TeacherQuestionProfile }>(res);
  return {
    branches: j.data?.branches || [],
    grades: j.data?.grades || [],
    institution_id: j.data?.institution_id ?? null,
    updated_at: j.data?.updated_at ?? null
  };
}

export async function saveTeacherQuestionProfile(payload: {
  userId?: string;
  branches: string[];
  grades: string[];
  institutionId?: string | null;
}): Promise<void> {
  const res = await apiFetch('/api/questions', {
    method: 'POST',
    body: JSON.stringify({
      action: 'teacher_profile',
      user_id: payload.userId,
      branches: payload.branches,
      grades: payload.grades,
      institution_id: payload.institutionId ?? undefined
    })
  });
  await parseJson<{ data?: unknown }>(res);
}


export async function fetchQuestionNotifications(): Promise<QuestionNotificationRow[]> {
  const res = await apiFetch('/api/questions?resource=notifications');
  const j = await parseJson<{ data: QuestionNotificationRow[] }>(res);
  return j.data || [];
}

export async function fetchCoachQuestionAnalytics(): Promise<{ questions: QuestionRow[] }> {
  const res = await apiFetch('/api/questions?resource=stats');
  const j = await parseJson<{ data: { questions: QuestionRow[] } }>(res);
  return j.data || { questions: [] };
}

export async function fetchTeacherStats(): Promise<Record<string, unknown> | null> {
  const res = await apiFetch('/api/questions?resource=stats');
  const j = await parseJson<{ data: Record<string, unknown> | null }>(res);
  return j.data;
}
