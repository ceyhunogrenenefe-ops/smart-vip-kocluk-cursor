/**
 * Bildirim türleri — gönderim kanalı ve davranış (tek kaynak).
 * Env ile kanal override: NOTIFY_CHANNEL_<TEMPLATE_TYPE_UPPER>=coach_gateway|meta_api
 */

export const SEND_CHANNELS = {
  COACH_GATEWAY: 'coach_gateway',
  META_API: 'meta_api'
};

/** @typedef {'coach_gateway'|'meta_api'} SendChannelId */
/** @typedef {'automatic'|'manual'|'instant'} NotificationMode */

/**
 * @typedef {object} NotificationDefinition
 * @property {string} id
 * @property {string} templateType
 * @property {string} nameTr
 * @property {SendChannelId} sendChannel
 * @property {NotificationMode} mode
 * @property {string} [cronJobKey]
 * @property {boolean} coachScoped
 * @property {boolean} allowMetaFallback
 * @property {number} [reminderMinutesBefore]
 * @property {string} [descriptionTr]
 */

/** @type {NotificationDefinition[]} */
export const NOTIFICATION_DEFINITIONS = [
  {
    id: 'class_lesson_reminder',
    templateType: 'class_lesson_reminder',
    nameTr: 'Grup dersi hatırlatma',
    descriptionTr: 'Ders başlamadan ~10 dk önce; ilgili koçun gateway hesabından.',
    sendChannel: SEND_CHANNELS.COACH_GATEWAY,
    mode: 'automatic',
    cronJobKey: 'class_lesson_reminders',
    coachScoped: true,
    allowMetaFallback: false,
    reminderMinutesBefore: 10
  },
  {
    id: 'teacher_lesson_reminder',
    templateType: 'teacher_lesson_reminder',
    nameTr: 'Öğretmen ders hatırlatma',
    descriptionTr: 'Öğretmenlere kurum Meta WhatsApp hesabından.',
    sendChannel: SEND_CHANNELS.META_API,
    mode: 'automatic',
    cronJobKey: 'teacher_lesson_reminders',
    coachScoped: false,
    allowMetaFallback: false
  },
  {
    id: 'report_reminder',
    templateType: 'report_reminder',
    nameTr: 'Günlük rapor hatırlatma',
    descriptionTr: 'Koç gateway; koç panelinden aç/kapat.',
    sendChannel: SEND_CHANNELS.COACH_GATEWAY,
    mode: 'automatic',
    cronJobKey: 'daily_report_reminder',
    coachScoped: true,
    allowMetaFallback: false
  },
  {
    id: 'lesson_reminder',
    templateType: 'lesson_reminder',
    nameTr: 'Birebir ders hatırlatma',
    descriptionTr: 'Öğrenciye kurum Meta API üzerinden.',
    sendChannel: SEND_CHANNELS.META_API,
    mode: 'automatic',
    cronJobKey: 'lesson_reminders',
    coachScoped: false,
    allowMetaFallback: false,
    reminderMinutesBefore: 10
  },
  {
    id: 'lesson_reminder_parent',
    templateType: 'lesson_reminder_parent',
    nameTr: 'Veli ders hatırlatma',
    descriptionTr: 'Veliye ilgili koçun gateway hesabından.',
    sendChannel: SEND_CHANNELS.COACH_GATEWAY,
    mode: 'automatic',
    cronJobKey: 'lesson_reminder_parent',
    coachScoped: true,
    allowMetaFallback: false
  },
  {
    id: 'meeting_notification',
    templateType: 'meeting_notification',
    nameTr: 'Görüşme hatırlatma',
    descriptionTr: 'Koç görüşmesi ~10 dk önce; koç gateway.',
    sendChannel: SEND_CHANNELS.COACH_GATEWAY,
    mode: 'automatic',
    cronJobKey: 'meeting_reminders',
    coachScoped: true,
    allowMetaFallback: false,
    reminderMinutesBefore: 10
  },
  {
    id: 'class_homework_notice',
    templateType: 'class_homework_notice',
    nameTr: 'Grup ödev bildirimi',
    sendChannel: SEND_CHANNELS.META_API,
    mode: 'automatic',
    cronJobKey: 'class_homework_notify',
    coachScoped: false,
    allowMetaFallback: false
  },
  {
    id: 'class_absent_notice_1',
    templateType: 'class_absent_notice_1',
    nameTr: 'Yoklama / devamsızlık',
    descriptionTr: 'Resmi bildirim; Meta API; kampanya değil.',
    sendChannel: SEND_CHANNELS.META_API,
    mode: 'instant',
    cronJobKey: 'absent_student_notification',
    coachScoped: false,
    allowMetaFallback: false
  },
  {
    id: 'veli_sign_ready_notify',
    templateType: 'veli_sign_ready_notify',
    nameTr: 'Veli imza bildirimi',
    sendChannel: SEND_CHANNELS.META_API,
    mode: 'instant',
    cronJobKey: 'veli_sign_ready_notify',
    coachScoped: false,
    allowMetaFallback: false
  },
  {
    id: 'veli_kayit_admin_notify',
    templateType: 'veli_kayit_admin_notify',
    nameTr: 'Yeni kayıt — admin bildirimi',
    sendChannel: SEND_CHANNELS.META_API,
    mode: 'instant',
    cronJobKey: 'veli_kayit_admin_notify',
    coachScoped: false,
    allowMetaFallback: false
  },
  {
    id: 'kitap_siparis_bildirim',
    templateType: 'kitap_siparis_bildirim',
    nameTr: 'Kitap siparişi bildirimi',
    sendChannel: SEND_CHANNELS.META_API,
    mode: 'instant',
    cronJobKey: 'book_orders',
    coachScoped: false,
    allowMetaFallback: true
  }
];

const BY_TEMPLATE = new Map(NOTIFICATION_DEFINITIONS.map((d) => [d.templateType, d]));
const BY_ID = new Map(NOTIFICATION_DEFINITIONS.map((d) => [d.id, d]));

export function getNotificationDefinition(templateTypeOrId) {
  const k = String(templateTypeOrId || '').trim();
  return BY_TEMPLATE.get(k) || BY_ID.get(k) || null;
}

export function listNotificationDefinitions() {
  return [...NOTIFICATION_DEFINITIONS];
}

function envChannelOverride(templateType) {
  const key = `NOTIFY_CHANNEL_${String(templateType || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')}`;
  const raw = String(process.env[key] || '').trim().toLowerCase();
  if (raw === 'coach_gateway' || raw === 'gateway' || raw === 'coach') return SEND_CHANNELS.COACH_GATEWAY;
  if (raw === 'meta_api' || raw === 'meta') return SEND_CHANNELS.META_API;
  return null;
}

/** Etkin gönderim kanalı (env override + tanım). */
export function resolveEffectiveSendChannel(templateTypeOrId) {
  const def = getNotificationDefinition(templateTypeOrId);
  if (!def) return null;
  return envChannelOverride(def.templateType) || def.sendChannel;
}

export function channelLabelTr(channelId) {
  if (channelId === SEND_CHANNELS.COACH_GATEWAY) return 'Koç WhatsApp Gateway';
  if (channelId === SEND_CHANNELS.META_API) return 'Meta WhatsApp API';
  return '—';
}

export function modeLabelTr(mode) {
  if (mode === 'automatic') return 'Otomatik';
  if (mode === 'instant') return 'Anlık';
  if (mode === 'manual') return 'Manuel';
  return mode;
}

/** whatsapp-center.js ile uyum */
export const TEMPLATE_TYPE_TO_CRON_FROM_CONFIG = Object.fromEntries(
  NOTIFICATION_DEFINITIONS.filter((d) => d.cronJobKey).map((d) => [d.templateType, d.cronJobKey])
);
