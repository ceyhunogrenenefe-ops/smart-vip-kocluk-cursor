/**
 * Eğitim programları — saf yardımcılar (handler ve testler paylaşır).
 * Program → Sınıf seviyesi → Şube/Grup hiyerarşisinin sunucu tarafı kuralları.
 */

const ROLE_ALIASES = { superadmin: 'super_admin', 'super-admin': 'super_admin' };

function normRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[r] || r;
}

/** Program listesini okuyabilir: yönetici, süper admin, koç (kayıt / sınıf ekranları için). */
export function canReadPrograms(role, roleTags = []) {
  const r = normRole(role);
  const tags = Array.isArray(roleTags) ? roleTags.map(normRole) : [];
  return ['admin', 'super_admin', 'coach'].some((x) => r === x || tags.includes(x));
}

/** Program ekleme / ad değiştirme / aktif-pasif: yalnız yönetici ve süper admin. */
export function canWritePrograms(role, roleTags = []) {
  const r = normRole(role);
  const tags = Array.isArray(roleTags) ? roleTags.map(normRole) : [];
  return r === 'admin' || r === 'super_admin' || tags.includes('admin') || tags.includes('super_admin');
}

export function normalizeProgramName(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hata metni döner; geçerliyse null. */
export function validateProgramName(name) {
  if (!name) return 'Program adı boş olamaz.';
  if (name.length > 80) return 'Program adı en fazla 80 karakter olabilir.';
  return null;
}

/**
 * Öğrenciyi bir gruba (sınıfa) eklemeden önce kurallar.
 * Öğrencinin kendi kaydı / mevcut sınıfı değişmez; yalnız class_students satırı eklenir.
 * @returns {null | {status:number, error:string}}
 */
export function checkMembershipTarget({ cls, student, program }) {
  if (!cls) return { status: 404, error: 'Grup bulunamadı.' };
  if (!student || student.deleted_at) return { status: 404, error: 'Öğrenci bulunamadı.' };
  const ci = String(cls.institution_id || '').trim();
  const si = String(student.institution_id || '').trim();
  if (ci && si && ci !== si) return { status: 400, error: 'Öğrenci ile grup farklı kurumlarda.' };
  if (program && program.is_active === false) {
    return { status: 400, error: 'Bu program pasif; yeni öğrenci eklenemez.' };
  }
  return null;
}
