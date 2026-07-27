import { apiFetch } from './session';

export type TopicCheckpointTrend = 'forward' | 'backward' | 'same' | 'changed' | 'unknown';

export type ClassLessonTopicCheckpoint = {
  id: string;
  class_session_id: string | null;
  class_id: string;
  institution_id?: string | null;
  teacher_id: string;
  subject: string;
  lesson_date: string;
  class_label?: string | null;
  topic: string;
  sub_topic?: string | null;
  book_name?: string | null;
  page_number?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
  progress_trend?: TopicCheckpointTrend;
  teacher_name?: string;
  class_display?: string;
};

export async function fetchCheckpointBySession(sessionId: string): Promise<ClassLessonTopicCheckpoint | null> {
  const res = await apiFetch(
    `/api/class-lesson-topic-checkpoints?scope=by-session&session_id=${encodeURIComponent(sessionId)}`
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return j.data || null;
}

export async function fetchCheckpointsForSessions(
  sessionIds: string[]
): Promise<Record<string, ClassLessonTopicCheckpoint>> {
  if (!sessionIds.length) return {};
  const res = await apiFetch(
    `/api/class-lesson-topic-checkpoints?scope=for-sessions&session_ids=${encodeURIComponent(sessionIds.join(','))}`
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return {};
  return j.data || {};
}

export async function fetchLatestTopicCheckpoint(
  classId: string,
  subject: string,
  beforeDate?: string
): Promise<ClassLessonTopicCheckpoint | null> {
  const qs = new URLSearchParams({
    scope: 'latest',
    class_id: classId,
    subject
  });
  if (beforeDate) qs.set('before_date', beforeDate.slice(0, 10));
  const res = await apiFetch(`/api/class-lesson-topic-checkpoints?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return j.data || null;
}

export async function fetchTopicCheckpointHistory(
  classId: string,
  subject: string,
  limit = 40
): Promise<ClassLessonTopicCheckpoint[]> {
  const qs = new URLSearchParams({
    scope: 'history',
    class_id: classId,
    subject,
    limit: String(limit)
  });
  const res = await apiFetch(`/api/class-lesson-topic-checkpoints?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return Array.isArray(j.data) ? j.data : [];
}

export async function fetchPromptCheck(sessionId: string): Promise<{
  should_prompt: boolean;
  has_checkpoint: boolean;
  data: ClassLessonTopicCheckpoint | null;
}> {
  const res = await apiFetch(
    `/api/class-lesson-topic-checkpoints?scope=prompt-check&session_id=${encodeURIComponent(sessionId)}`
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { should_prompt: false, has_checkpoint: false, data: null };
  }
  return {
    should_prompt: Boolean(j.should_prompt),
    has_checkpoint: Boolean(j.has_checkpoint),
    data: j.data || null
  };
}

export type UpsertTopicCheckpointInput = {
  id?: string;
  class_session_id?: string;
  class_id?: string;
  teacher_id?: string;
  subject?: string;
  lesson_date?: string;
  class_label?: string;
  topic: string;
  sub_topic?: string;
  book_name?: string;
  page_number?: string;
  note?: string;
};

export async function upsertTopicCheckpoint(
  input: UpsertTopicCheckpointInput
): Promise<{ ok: boolean; data?: ClassLessonTopicCheckpoint; error?: string }> {
  const res = await apiFetch('/api/class-lesson-topic-checkpoints?op=upsert', {
    method: 'POST',
    body: JSON.stringify(input)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: String(j.error || 'Kayıt başarısız') };
  }
  return { ok: true, data: j.data };
}

export async function fetchAdminTopicProgress(filters: {
  teacher_id?: string;
  class_id?: string;
  subject?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}): Promise<ClassLessonTopicCheckpoint[]> {
  const qs = new URLSearchParams({ scope: 'admin' });
  if (filters.teacher_id) qs.set('teacher_id', filters.teacher_id);
  if (filters.class_id) qs.set('class_id', filters.class_id);
  if (filters.subject) qs.set('subject', filters.subject);
  if (filters.date_from) qs.set('date_from', filters.date_from);
  if (filters.date_to) qs.set('date_to', filters.date_to);
  if (filters.limit) qs.set('limit', String(filters.limit));
  const res = await apiFetch(`/api/class-lesson-topic-checkpoints?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return Array.isArray(j.data) ? j.data : [];
}

export function formatCheckpointSummary(cp: ClassLessonTopicCheckpoint | null | undefined): string {
  if (!cp) return 'Henüz kayıt yok';
  const parts = [cp.topic];
  if (cp.sub_topic) parts.push(cp.sub_topic);
  if (cp.book_name) parts.push(cp.book_name);
  if (cp.page_number) parts.push(`s. ${cp.page_number}`);
  return parts.filter(Boolean).join(' · ');
}

export function trendLabel(trend?: TopicCheckpointTrend): string {
  switch (trend) {
    case 'forward':
      return 'İlerleme';
    case 'backward':
      return 'Gerileme';
    case 'same':
      return 'Aynı sayfa/konu';
    case 'changed':
      return 'Konu değişti';
    default:
      return '—';
  }
}
