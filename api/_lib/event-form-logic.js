/**
 * Etkinlik Formları — saf mantık (DB'ye dokunmaz, test edilebilir).
 * Form ayarları, slug, gönderim doğrulama ve hatırlatma zamanlaması.
 */
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { wallTimeToUtcMs } from './teacher-lesson-start-ms.js';

export const DEFAULT_REMINDER_TEMPLATE = 'institution_event_invite';
/** Etkinlik sonrası anket mesajı (Meta onaylı şablon) */
export const SURVEY_TEMPLATE_TYPE = 'institution_event_survey';
/** Etkinlik sonrası hatırlatma: zaman geçtikten sonra en fazla bu kadar gecikmeyle gider */
export const AFTER_REMINDER_LATE_GRACE_MS = 6 * 60 * 60 * 1000;

/** Varsayılan hatırlatmalar: 1 gün önce, aynı gün 10:00, 10 dk önce */
export const DEFAULT_REMINDERS = Object.freeze([
  { kind: 'before', offset_minutes: 1440, at_time: null, template_type: DEFAULT_REMINDER_TEMPLATE, enabled: true },
  { kind: 'day_of', offset_minutes: null, at_time: '10:00', template_type: DEFAULT_REMINDER_TEMPLATE, enabled: true },
  { kind: 'before', offset_minutes: 10, at_time: null, template_type: DEFAULT_REMINDER_TEMPLATE, enabled: true },
  { kind: 'after', offset_minutes: 120, at_time: null, template_type: SURVEY_TEMPLATE_TYPE, enabled: true }
]);

/** Hatırlatma zamanı geçtikten sonra en fazla bu kadar gecikmeyle gönderilir (cron kaçırırsa). */
export const REMINDER_LATE_GRACE_MS = 45 * 60 * 1000;

const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u' };

export function slugifyTr(raw) {
  const s = String(raw || '')
    .replace(/[çğıiöşüÇĞİIÖŞÜ]/g, (c) => TR_MAP[c] || c)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s;
}

export function isValidSlug(slug) {
  return /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(String(slug || ''));
}

function str(v, max = 2000) {
  return String(v ?? '').trim().slice(0, max);
}

function bool(v, dflt) {
  if (v === true || v === false) return v;
  return dflt;
}

/** form_settings JSON'unu güvenli varsayılanlarla doldurur. */
export function normalizeFormSettings(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const f = r.fields && typeof r.fields === 'object' ? r.fields : {};
  return {
    heading: str(r.heading, 160),
    intro: str(r.intro, 2000),
    button_label: str(r.button_label, 60) || 'Kaydımı Oluştur',
    success_message:
      str(r.success_message, 600) ||
      'Kaydınız alındı! Etkinlik bilgileri ve katılım linki WhatsApp üzerinden gönderilecektir.',
    fields: {
      parent_name: { enabled: true, required: true },
      student_name: {
        enabled: bool(f.student_name?.enabled, true),
        required: bool(f.student_name?.required, true)
      },
      phone: { enabled: true, required: true },
      grade: {
        enabled: bool(f.grade?.enabled, false),
        required: bool(f.grade?.required, false)
      }
    },
    kvkk_text: str(r.kvkk_text, 20000),
    kvkk_url: str(r.kvkk_url, 500),
    contact_consent: bool(r.contact_consent, true),
    send_confirmation: bool(r.send_confirmation, true),
    add_to_crm: bool(r.add_to_crm, true),
    closed: bool(r.closed, false),
    closed_message: str(r.closed_message, 400) || 'Bu etkinliğin kayıtları kapanmıştır.'
  };
}

export const GRADE_OPTIONS = [
  '5. Sınıf',
  '6. Sınıf',
  '7. Sınıf',
  '8. Sınıf (LGS)',
  '9. Sınıf',
  '10. Sınıf',
  '11. Sınıf',
  '12. Sınıf (YKS)',
  'Mezun',
  'Diğer'
];

/**
 * Herkese açık form gönderimini doğrular.
 * @returns {{ ok: true, data: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateSubmission(body, settings) {
  const b = body && typeof body === 'object' ? body : {};
  const s = normalizeFormSettings(settings);
  const errors = {};

  const parent_name = str(b.parent_name, 120).replace(/\s+/g, ' ');
  const student_name = str(b.student_name, 120).replace(/\s+/g, ' ');
  const phoneRaw = str(b.phone, 40);
  const grade = str(b.grade, 40);

  if (parent_name.length < 3) errors.parent_name = 'Ad soyad girin.';
  if (s.fields.student_name.enabled && s.fields.student_name.required && student_name.length < 2) {
    errors.student_name = 'Öğrencinin adını girin.';
  }
  const phone = normalizeTrMobile(phoneRaw);
  if (!phone) errors.phone = 'Geçerli bir cep telefonu girin (05xx xxx xx xx).';
  if (s.fields.grade.enabled && s.fields.grade.required && !grade) errors.grade = 'Sınıf seçin.';
  if (b.kvkk !== true) errors.kvkk = 'Devam etmek için KVKK metnini onaylayın.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      parent_name,
      student_name: s.fields.student_name.enabled ? student_name : '',
      phone,
      grade: s.fields.grade.enabled ? grade : ''
    }
  };
}

/** Yalnızca cep telefonu kabul eder (TR 5xx veya +ülke kodu). E.164 döner. */
export function normalizeTrMobile(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  // TR cep biçimleri
  if (/^05\d{9}$/.test(digits) || /^5\d{9}$/.test(digits) || /^905\d{9}$/.test(digits)) {
    return normalizePhoneToE164(digits);
  }
  // Yurt dışı: + ile yazılmışsa kabul et
  if (String(raw).trim().startsWith('+') && digits.length >= 10 && digits.length <= 15 && !digits.startsWith('90')) {
    return `+${digits}`;
  }
  return null;
}

/** Etkinlik başlangıcı (UTC ms) — tarih/saat yoksa null */
export function eventStartMs(event) {
  const d = String(event?.event_date || '').slice(0, 10);
  const t = String(event?.event_time || '').slice(0, 8);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !t) return null;
  return wallTimeToUtcMs(d, t);
}

export function normalizeReminderInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'day_of' ? 'day_of' : raw.kind === 'after' ? 'after' : 'before';
  const template_type =
    str(raw.template_type, 120) || (kind === 'after' ? SURVEY_TEMPLATE_TYPE : DEFAULT_REMINDER_TEMPLATE);
  const enabled = raw.enabled !== false;
  if (kind === 'before' || kind === 'after') {
    const n = Math.round(Number(raw.offset_minutes));
    if (!Number.isFinite(n) || n < 0 || n > 60 * 24 * 14) return null;
    return { kind, offset_minutes: n, at_time: null, template_type, enabled };
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(String(raw.at_time || ''));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return {
    kind,
    offset_minutes: null,
    at_time: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
    template_type,
    enabled
  };
}

/** Hatırlatmanın gönderileceği an (UTC ms) */
export function reminderFireMs(event, reminder) {
  const start = eventStartMs(event);
  if (start == null) return null;
  if (reminder.kind === 'day_of') {
    const d = String(event.event_date).slice(0, 10);
    const ms = wallTimeToUtcMs(d, String(reminder.at_time || '').slice(0, 5));
    if (ms == null || ms >= start) return null; // etkinlik saatinden sonra/aynı anda anlamsız
    return ms;
  }
  const off = Number(reminder.offset_minutes);
  if (!Number.isFinite(off)) return null;
  if (reminder.kind === 'after') return start + off * 60 * 1000;
  return start - off * 60 * 1000;
}

/** Şu an bu hatırlatmanın gönderim penceresinde miyiz? */
export function isReminderDue(event, reminder, nowMs) {
  if (!reminder?.enabled) return false;
  const fire = reminderFireMs(event, reminder);
  const start = eventStartMs(event);
  if (fire == null || start == null) return false;
  if (nowMs < fire) return false;
  if (reminder.kind === 'after') return nowMs <= fire + AFTER_REMINDER_LATE_GRACE_MS;
  if (nowMs > fire + REMINDER_LATE_GRACE_MS) return false;
  if (nowMs > start) return false; // etkinlik başladıysa artık hatırlatma yok
  return true;
}

/**
 * Hatırlatma anından SONRA kayıt olan kişi o hatırlatmayı almaz
 * (zaten kayıt anında onay mesajı alıyor). Kayıt anı yoksa gönder.
 */
export function participantEligibleForReminder(participant, fireMs) {
  if (!participant?.phone) return false;
  const created = participant.created_at ? new Date(participant.created_at).getTime() : NaN;
  if (!Number.isFinite(created)) return true;
  return created <= fireMs;
}

export function describeReminder(r) {
  if (!r) return '';
  if (r.kind === 'day_of') return `Etkinlik günü saat ${String(r.at_time || '').slice(0, 5)}`;
  const m = Number(r.offset_minutes);
  if (r.kind === 'after') {
    if (m === 0) return 'Etkinlik başlar başlamaz (sonrası)';
    if (m % 1440 === 0) return `Etkinlikten ${m / 1440} gün sonra`;
    if (m % 60 === 0) return `Etkinlikten ${m / 60} saat sonra`;
    return `Etkinlikten ${m} dakika sonra`;
  }
  if (m === 0) return 'Etkinlik başlarken';
  if (m % 1440 === 0) return `${m / 1440} gün önce`;
  if (m % 60 === 0) return `${m / 60} saat önce`;
  return `${m} dakika önce`;
}

/* ---------- Etkinlik sonrası anket ---------- */

export const EXPECTATION_OPTIONS = ['evet', 'kismen', 'hayir'];

/**
 * Anket gönderimini doğrular.
 * @returns {{ ok: true, data: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateSurvey(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  const rating = Math.round(Number(b.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) errors.rating = 'Lütfen 1–5 arası puan verin.';
  const expectation = EXPECTATION_OPTIONS.includes(b.expectation) ? b.expectation : null;
  const want_info = b.want_info === true ? true : b.want_info === false ? false : null;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      rating,
      expectation,
      want_info,
      topics: str(b.topics, 500) || null,
      comment: str(b.comment, 2000) || null
    }
  };
}

/** Anket yanıtlarından özet */
export function summarizeSurvey(responses) {
  const list = Array.isArray(responses) ? responses : [];
  const n = list.length;
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const expectation = { evet: 0, kismen: 0, hayir: 0 };
  let sum = 0;
  let wantInfo = 0;
  for (const r of list) {
    const v = Number(r.rating);
    if (v >= 1 && v <= 5) {
      dist[v] += 1;
      sum += v;
    }
    if (r.expectation && expectation[r.expectation] != null) expectation[r.expectation] += 1;
    if (r.want_info === true) wantInfo += 1;
  }
  return {
    count: n,
    average: n ? Math.round((sum / n) * 10) / 10 : null,
    distribution: dist,
    expectation,
    want_info: wantInfo
  };
}
