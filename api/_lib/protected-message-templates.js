/**
 * Otomasyonların kullandığı şablonlar — Şablon Yöneticisi'nden silinemez.
 *
 * Neden var: 8 Ekim 2026 akşamı `class_absent_notice_1` satırı silindi ve
 * devamsızlık bildirimi ertesi gün tamamen durdu (88 veli mesajı
 * "template_not_found" ile düştü). Satır, Meta'daki şablon onaylı olmasına
 * rağmen gidiyordu; eksik olan yalnızca message_templates kaydıydı.
 *
 * Liste elle yazılmaz: bildirim tanımlarından ve yoklama tohum listesinden
 * türetilir, böylece yeni bir otomasyon eklendiğinde burası kendiliğinden
 * korur.
 *
 * Şablonu kullanımdan kaldırmak isteyen `is_active` ile kapatır; silmek
 * otomasyonu bozar.
 */
import { NOTIFICATION_DEFINITIONS } from './notification-config.js';
import { ATTENDANCE_META_SEED } from './ensure-attendance-meta-templates.js';

function norm(v) {
  return String(v || '').trim().toLowerCase();
}

/** Otomasyonların okuduğu message_templates.type değerleri */
export const PROTECTED_TEMPLATE_TYPES = new Set(
  [
    ...NOTIFICATION_DEFINITIONS.map((d) => d.templateType),
    ...ATTENDANCE_META_SEED.map((s) => s.type)
  ]
    .map(norm)
    .filter(Boolean)
);

/**
 * Korunan Meta şablon adları. Çoğu türde ad = tür, ama yoklama tohumunda
 * farklı ad verilebiliyor (ör. coach_lesson_attendance_summary →
 * coach_attendance_report). Meta'dan silmek de gönderimi durdurur.
 */
export const PROTECTED_META_TEMPLATE_NAMES = new Set(
  [
    ...PROTECTED_TEMPLATE_TYPES,
    ...ATTENDANCE_META_SEED.map((s) => s.metaTemplateName)
  ]
    .map(norm)
    .filter(Boolean)
);

export function isProtectedTemplateType(type) {
  return PROTECTED_TEMPLATE_TYPES.has(norm(type));
}

export function isProtectedMetaTemplateName(name) {
  return PROTECTED_META_TEMPLATE_NAMES.has(norm(name));
}

/** Kullanıcıya gösterilecek açıklama — ne yapacağını söyler. */
export function protectedTemplateMessage(label) {
  const ad = String(label || '').trim();
  return (
    `${ad ? `“${ad}” ` : ''}sistem şablonu olduğu için silinemez: ` +
    'ders hatırlatma, devamsızlık ve rapor bildirimleri bu şablonu kullanıyor, ' +
    'silinirse veliye mesaj gitmez. Kullanımdan kaldırmak için şablonu pasife alın.'
  );
}
