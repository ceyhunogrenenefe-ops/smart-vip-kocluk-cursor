import { apiFetch } from '../../lib/session';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from '../../lib/activeInstitutionScope';

/** Ders & Koçluk kurumu — ödev modülü burada da kapalıdır. */
export const COACHING_INSTITUTION_ID = 'f5dc4906-5fa5-4a7b-ac39-88e14d48d1a2';

/** Modülün hiç açılamayacağı kurumlar (sunucuda da aynı kural sabittir). */
export function homeworkModuleBlocked(institutionId?: string | null): boolean {
  const id = String(institutionId || '').trim();
  return !id || id === PLATFORM_PRIMARY_INSTITUTION_ID || id === COACHING_INSTITUTION_ID;
}

export type HomeworkModuleState = {
  institution_id: string | null;
  enabled: boolean;
  blocked: boolean;
  reason: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || 'İşlem başarısız');
  return json as T;
}

export function getHomeworkModule(institutionId?: string | null) {
  const qs = institutionId ? `?institution_id=${encodeURIComponent(institutionId)}` : '';
  return request<{ data: HomeworkModuleState }>(`/api/institution-features${qs}`);
}

export function setHomeworkModule(institutionId: string, enabled: boolean) {
  return request<{ ok: boolean; data: HomeworkModuleState }>('/api/institution-features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution_id: institutionId, homework_module: enabled })
  });
}

/** Ödev modalını besleyen bağlam: ders satırının sınıfı, dersi, öğrencileri. */
export type HomeworkFormContext = {
  lesson_row_id: string;
  institution_id: string | null;
  subject_name: string | null;
  lesson_date: string | null;
  lesson_title: string | null;
  class: { id: string; name: string; class_level: string | null } | null;
  class_level: string | null;
  students: Array<{
    id: string;
    name: string;
    user_id: string | null;
    class_id: string | null;
    class_level: string | null;
  }>;
};

export function getHomeworkFormContext(lessonRowId: string) {
  return request<{ data: HomeworkFormContext }>(
    `/api/edu-panel?resource=homework-form-context&lesson_row_id=${encodeURIComponent(lessonRowId)}`
  );
}

export type HomeworkShare = {
  homework_id: string;
  share_token: string;
  share_expires_at: string | null;
  path: string;
};

/** Paylaşım bağlantısı üretir veya yeniler. */
export function createHomeworkShare(homeworkId: string, rotate = false) {
  return request<{ data: HomeworkShare }>('/api/edu-panel?resource=homework-share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ homework_id: homeworkId, rotate })
  });
}

/** Bağlantıdan gelen için ödevin herkese açık özeti (kişisel veri içermez). */
export type PublicHomework = {
  homework_id: string;
  title: string;
  description: string | null;
  subject_name: string | null;
  topic_label: string | null;
  target_question_count: number | null;
  target_minutes: number | null;
  resource_url: string | null;
  due_date: string | null;
  institution_name: string | null;
};

export function getPublicHomework(token: string) {
  return request<{ data: PublicHomework }>(`/api/homework-share?token=${encodeURIComponent(token)}`);
}

/** Paylaşım bağlantısının tam adresi. */
export function homeworkShareUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/odev/${token}`;
}
