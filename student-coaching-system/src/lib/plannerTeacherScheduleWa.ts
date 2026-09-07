/**
 * Planlayıcı öğretmen programı → WhatsApp gateway belge gönderimi.
 */
import { apiFetch } from './session';
import { getGatewaySessionUserId } from './session';
import {
  blobToBase64,
  isGatewayWhatsAppConnected,
  normalizeWhatsAppPhoneForSend,
  sendWhatsAppGatewayDocument
} from './whatsappOutbound';

export type TeacherPhoneMatch = {
  name: string;
  teacher_id: string;
  teacher_db_name?: string;
  phone: string;
  phone_raw?: string;
};

export type TeacherPhoneUnmatched = {
  name: string;
  teacher_id?: string;
  teacher_db_name?: string | null;
  reason: string;
};

export type TeacherPngItem = {
  teacherName: string;
  filename: string;
  dataUrl: string;
  lessonCount?: number;
};

function dataUrlToBase64(dataUrl: string): string {
  const raw = String(dataUrl || '').trim();
  const i = raw.indexOf('base64,');
  if (i >= 0) return raw.slice(i + 7);
  return raw;
}

export function teacherScheduleWaCaption(teacherName: string, planLabel?: string): string {
  const name = String(teacherName || 'Öğretmen').trim() || 'Öğretmen';
  const plan = String(planLabel || '').trim();
  return (
    `Merhaba ${name},\n\n` +
    `Haftalık ders programınız ektedir` +
    (plan ? ` (${plan})` : '') +
    `.\n\nOnline VIP Dershane`
  );
}

export async function resolveTeacherPhones(opts: {
  institutionId: string;
  names: string[];
}): Promise<{ matched: TeacherPhoneMatch[]; unmatched: TeacherPhoneUnmatched[] }> {
  const res = await apiFetch('/api/class-schedule-plans?op=resolve-teacher-phones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institution_id: opts.institutionId,
      names: opts.names
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(j.error || j.message || 'resolve_teacher_phones_failed'));
  return {
    matched: Array.isArray(j.matched) ? j.matched : [],
    unmatched: Array.isArray(j.unmatched) ? j.unmatched : []
  };
}

export async function sendTeacherSchedulePngsViaGateway(opts: {
  coachUserId?: string;
  planLabel?: string;
  items: TeacherPngItem[];
  phonesByName: Map<string, string>;
  gapMs?: number;
  onProgress?: (info: { index: number; total: number; teacherName: string; ok: boolean; error?: string }) => void;
}): Promise<{ sent: number; failed: number; skipped: number; errors: { name: string; error: string }[] }> {
  const coachUserId = getGatewaySessionUserId(opts.coachUserId);
  if (!coachUserId) throw new Error('whatsapp_gateway_session_missing');
  const connected = await isGatewayWhatsAppConnected(coachUserId);
  if (!connected) {
    throw new Error('WhatsApp gateway bağlı değil — WhatsApp merkezinden QR ile bağlanın.');
  }

  const gap = Math.max(400, Number(opts.gapMs || 1200) || 1200);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: { name: string; error: string }[] = [];
  const items = opts.items || [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = String(item.teacherName || '').trim();
    const phoneRaw = opts.phonesByName.get(name) || opts.phonesByName.get(name.toLocaleUpperCase('tr-TR')) || '';
    const phone = normalizeWhatsAppPhoneForSend(phoneRaw);
    if (!phone) {
      skipped += 1;
      opts.onProgress?.({ index: i + 1, total: items.length, teacherName: name, ok: false, error: 'phone_missing' });
      continue;
    }
    try {
      const base64 = dataUrlToBase64(item.dataUrl);
      if (!base64) throw new Error('png_empty');
      await sendWhatsAppGatewayDocument({
        coachUserId,
        targetPhone: phone,
        filename: item.filename || `${name} - ogretmen programi.png`,
        base64,
        caption: teacherScheduleWaCaption(name, opts.planLabel),
        mimeType: 'image/png'
      });
      sent += 1;
      opts.onProgress?.({ index: i + 1, total: items.length, teacherName: name, ok: true });
    } catch (e) {
      failed += 1;
      const err = String((e as Error)?.message || e);
      errors.push({ name, error: err });
      opts.onProgress?.({ index: i + 1, total: items.length, teacherName: name, ok: false, error: err });
    }
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, gap));
  }

  return { sent, failed, skipped, errors };
}

/** Used by tests / callers that already have Blob */
export async function pngBlobToGatewayBase64(blob: Blob): Promise<string> {
  return blobToBase64(blob);
}
