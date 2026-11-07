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

export async function fetchJuniorVipContext(studentId: string): Promise<Record<string, unknown>> {
  const sid = encodeURIComponent(studentId.trim());
  const res = await apiFetch(`/api/junior-vip?op=context&student_id=${sid}`);
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

export async function juniorVipTranscribeAudio(blob: Blob, studentId: string): Promise<string> {
  const audio_base64 = await blobToBase64(blob);
  const res = await apiFetch('/api/junior-vip?op=transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_base64,
      mime: blob.type || 'audio/webm',
      student_id: studentId.trim()
    })
  });
  const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string; hint?: string };
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        j.hint || 'Yetki yok — öğrenci olarak giriş yapın veya taklit ettiğiniz öğrenciyi doğrulayın.'
      );
    }
    if (j.error === 'transcribe_unavailable') {
      throw new Error('Sunucuda ses çözümü kapalı. Telefondan dene veya yaz.');
    }
    if (j.error === 'audio_too_short') {
      throw new Error('Kayıt çok kısa. Biraz daha konuşup tekrar dene.');
    }
    throw new Error(j.error || 'Ses metne çevrilemedi');
  }
  return String(j.text || '').trim();
}

export async function juniorVipChat(
  message: string,
  history: JuniorVipChatMessage[],
  studentId: string
): Promise<JuniorVipChatResponse> {
  const res = await apiFetch('/api/junior-vip?op=chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, student_id: studentId.trim() })
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
