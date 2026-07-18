import { normalizedUserRolesFromDb } from './user-roles-fetch.js';

export function normRole(r) {
  return String(r || '').trim().toLowerCase();
}

/** JWT `role` + `roles[]` + DB `users.roles` birleşimi */
export async function actorRoleSet(actor) {
  const rs = await normalizedUserRolesFromDb(actor?.sub);
  const set = new Set(rs.map(normRole));
  if (actor?.role) set.add(normRole(actor.role));
  if (Array.isArray(actor?.roles)) {
    for (const r of actor.roles) set.add(normRole(r));
  }
  if (!set.size && actor?.role) set.add(normRole(actor.role));
  return set;
}

export function roleSetHasSuperAdmin(set) {
  return Boolean(set && typeof set.has === 'function' && set.has('super_admin'));
}

export function roleSetHasAdmin(set) {
  return Boolean(set && typeof set.has === 'function' && set.has('admin'));
}

/** Süper admin veya kurumu tanımlı kurum yöneticisi */
export function actorIsInstitutionAdmin(actor, roleSet) {
  if (roleSetHasSuperAdmin(roleSet)) return true;
  return roleSetHasAdmin(roleSet) && Boolean(actor?.institution_id);
}

export function actorIsAdminLike(actor, roleSet) {
  return roleSetHasSuperAdmin(roleSet) || roleSetHasAdmin(roleSet);
}
