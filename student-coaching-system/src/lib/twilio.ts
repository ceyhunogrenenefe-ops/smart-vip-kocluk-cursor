import { apiFetch } from './session';

/** 05… / 90… → +905… (istemci tarafı önizleme; sunucu da doğrular) */
export function normalizePhone(phone: string): string {
  const digits = String(phone || '')
    .replace(/^whatsapp:/i, '')
    .replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('90') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export async function sendWhatsAppMessage(params: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const res = await apiFetch('/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify({ phone: params.to, message: params.body })
  });
  const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; sid?: string; error?: string };
  if (!res.ok) {
    return { ok: false, error: payload.error || `HTTP ${res.status}` };
  }
  return { ok: Boolean(payload.ok), sid: payload.sid };
}

/** Otomasyon logları sunucuda `message_logs` tablosundadır; burada yalnızca isim tutarlılığı. */
export function logMessage(_row: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.warn('[whatsapp] logMessage istemcide çağrıldı; gerçek kayıt API/cron üzerinden yapılır.');
  }
}

/** Tekrar gönderim kontrolü sunucu cron’larında yapılır. */
export function alreadySent(): boolean {
  return false;
}
