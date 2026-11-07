import { apiFetch } from '../lib/session';

export type JuniorVipNavigateAction = {
  type: 'navigate';
  path: string;
  label?: string;
};

export type JuniorVipStudyLogProposal = {
  date: string;
  subject: string;
  topic: string;
  solved_questions: number;
  target_questions: number;
  correct: number;
  wrong: number;
  blank: number;
};

export type JuniorVipChatResponse = {
  reply: string;
  actions: JuniorVipNavigateAction[];
  proposed_study_log: JuniorVipStudyLogProposal | null;
  meta?: { engine?: string; reason?: string; model?: string } | null;
};

export type JuniorVipChatMessage = { role: 'user' | 'assistant'; content: string };

export async function fetchJuniorVipContext(): Promise<Record<string, unknown>> {
  const res = await apiFetch('/api/junior-vip?op=context');
  const j = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: string };
  if (!res.ok) throw new Error(j.error || 'Junior VIP bağlamı yüklenemedi');
  return j.data || {};
}

export async function juniorVipChat(
  message: string,
  history: JuniorVipChatMessage[]
): Promise<JuniorVipChatResponse> {
  const res = await apiFetch('/api/junior-vip?op=chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history })
  });
  const j = (await res.json().catch(() => ({}))) as JuniorVipChatResponse & { error?: string };
  if (!res.ok) throw new Error(j.error || 'Junior VIP yanıt veremedi');
  return {
    reply: String(j.reply || ''),
    actions: Array.isArray(j.actions) ? j.actions : [],
    proposed_study_log: j.proposed_study_log || null,
    meta: j.meta || null
  };
}

/** Öğrenci onayı sonrası — mevcut weekly-entries API. */
export async function saveJuniorVipStudyLog(
  studentId: string,
  log: JuniorVipStudyLogProposal
): Promise<void> {
  const id = `entry-jv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const res = await apiFetch('/api/weekly-entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      student_id: studentId,
      date: log.date,
      subject: log.subject,
      topic: log.topic,
      target_questions: log.target_questions,
      solved_questions: log.solved_questions,
      correct: log.correct,
      wrong: log.wrong,
      blank: log.blank,
      created_at: now,
      updated_at: now
    })
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error || 'Çalışma kaydı yazılamadı');
}
