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

export type JuniorVipPanel = 'student' | 'coach' | 'teacher';

/** Sunucu paneli JWT + DB rolleriyle yeniden doğrular; buradaki değer yalnızca istektir. */
export type JuniorVipScope = { panel: JuniorVipPanel; studentId?: string };

function scopeQuery(scope: JuniorVipScope): string {
  const q = new URLSearchParams({ panel: scope.panel });
  if (scope.panel === 'student' && scope.studentId?.trim()) q.set('student_id', scope.studentId.trim());
  return q.toString();
}

function scopeBody(scope: JuniorVipScope): Record<string, string> {
  const b: Record<string, string> = { panel: scope.panel };
  if (scope.panel === 'student' && scope.studentId?.trim()) b.student_id = scope.studentId.trim();
  return b;
}

export type JuniorVipCapabilities = { server_transcribe: boolean; ai_chat: boolean };

export async function fetchJuniorVipCapabilities(scope: JuniorVipScope): Promise<JuniorVipCapabilities> {
  const res = await apiFetch(`/api/junior-vip?op=capabilities&${scopeQuery(scope)}`);
  const j = (await res.json().catch(() => ({}))) as Partial<JuniorVipCapabilities>;
  if (!res.ok) throw new Error('capabilities_failed');
  return { server_transcribe: Boolean(j.server_transcribe), ai_chat: Boolean(j.ai_chat) };
}

export async function fetchJuniorVipContext(scope: JuniorVipScope): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/junior-vip?op=context&${scopeQuery(scope)}`);
  const j = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: string };
  if (!res.ok) throw new Error(j.error || 'Junior VIP bağlamı yüklenemedi');
  return j.data || {};
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      const comma = data.indexOf(',');
      resolve(comma >= 0 ? data.slice(comma + 1) : data);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export class JuniorVipTranscribeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function juniorVipTranscribeAudio(blob: Blob, scope: JuniorVipScope): Promise<string> {
  const audio_base64 = await blobToBase64(blob);
  const res = await apiFetch('/api/junior-vip?op=transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_base64,
      mime: blob.type || 'audio/webm',
      ...scopeBody(scope)
    })
  });
  const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string; hint?: string };
  if (!res.ok) {
    if (res.status === 403) {
      throw new JuniorVipTranscribeError(
        'forbidden',
        j.hint || 'Yetki yok — kendi hesabınızla giriş yaptığınızdan emin olun.'
      );
    }
    if (j.error === 'transcribe_unavailable') {
      throw new JuniorVipTranscribeError(
        'transcribe_unavailable',
        'Sunucu ses çözümü kapalı (yönetici: Vercel’de OPENAI_API_KEY tanımlanmalı). Şimdilik yazarak devam edebilirsin.'
      );
    }
    if (j.error === 'audio_too_short') {
      throw new JuniorVipTranscribeError('audio_too_short', 'Kayıt çok kısa. Biraz daha konuşup tekrar dene.');
    }
    if (j.error === 'audio_too_large') {
      throw new JuniorVipTranscribeError('audio_too_large', 'Kayıt çok uzun. Daha kısa bir komutla tekrar dene.');
    }
    throw new JuniorVipTranscribeError('failed', j.error || 'Ses metne çevrilemedi');
  }
  return String(j.text || '').trim();
}

export async function juniorVipChat(
  message: string,
  history: JuniorVipChatMessage[],
  scope: JuniorVipScope
): Promise<JuniorVipChatResponse> {
  const res = await apiFetch('/api/junior-vip?op=chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, ...scopeBody(scope) })
  });
  const j = (await res.json().catch(() => ({}))) as JuniorVipChatResponse & { error?: string; hint?: string };
  if (!res.ok) throw new Error(j.hint || j.error || 'Junior VIP yanıt veremedi');
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
