import { normalizedUserRolesFromDb } from './user-roles-fetch.js';

/**
 * "Kullanıcı Yönetimi" yetkisi (users.roles içinde `user_manager`).
 *
 * Yönetici olmayan bir personel (ör. koç/öğretmen) bu etiketle yalnızca Kullanıcı Yönetimi
 * sayfasını açar. Sayfa, isteklerine `x-scs-scope: user-management` başlığı ekler; sunucu
 * yalnızca bu başlık + DB'deki etiket birlikteyse aktörü kendi kurumu kapsamında `admin`
 * gibi değerlendirir. Diğer ekranlarda (koç paneli vb.) davranış değişmez.
 */
export const USER_MANAGER_ROLE = 'user_manager';
export const USER_MANAGER_SCOPE_HEADER = 'x-scs-scope';
export const USER_MANAGER_SCOPE_VALUE = 'user-management';

export async function elevateUserManagerActor(req, actor) {
  if (!actor || actor.role === 'super_admin' || actor.role === 'admin') return actor;
  const scope = String(req?.headers?.[USER_MANAGER_SCOPE_HEADER] || '')
    .trim()
    .toLowerCase();
  if (scope !== USER_MANAGER_SCOPE_VALUE) return actor;
  if (!actor.sub || actor.sub === 'anonymous' || !actor.institution_id) return actor;
  const tags = await normalizedUserRolesFromDb(actor.sub);
  if (!tags.includes(USER_MANAGER_ROLE)) return actor;
  return { ...actor, role: 'admin', user_manager_elevated: true };
}

/** Yetki yükseltilmiş kullanıcı gerçek yöneticilerin hesabına dokunamaz. */
export function rowIsAdminAccount(row) {
  if (!row) return false;
  const tags = new Set(
    [row.role, ...(Array.isArray(row.roles) ? row.roles : [])].map((r) =>
      String(r || '').trim().toLowerCase()
    )
  );
  return tags.has('admin') || tags.has('super_admin');
}
