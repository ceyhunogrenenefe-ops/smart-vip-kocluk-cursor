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
