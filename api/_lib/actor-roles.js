import { normalizedUserRolesFromDb } from './user-roles-fetch.js';

export function normRole(r) {
  return String(r || '').trim().toLowerCase();
}

/** JWT role + roles[] + DB users.roles — her zaman Set doner */
export async function actorRoleSet(actor) {
  const set = new Set();
  try {
    const rs = await normalizedUserRolesFromDb(actor?.sub);
    const list = Array.isArray(rs) ? rs : [];
    for (const r of list) {
      const n = normRole(r);
      if (n) set.add(n);
    }
  } catch (e) {
    console.warn('[actorRoleSet] db roles failed', e?.message || e);
  }
  if (actor?.role) {
    const n = normRole(actor.role);
    if (n) set.add(n);
  }
  if (Array.isArray(actor?.roles)) {
    for (const r of actor.roles) {
      const n = normRole(r);
      if (n) set.add(n);
    }
  }
  return set;
}

export function roleSetHasSuperAdmin(set) {
  return Boolean(set && typeof set.has === 'function' && set.has('super_admin'));
}

export function roleSetHasAdmin(set) {
  return Boolean(set && typeof set.has === 'function' && set.has('admin'));
}

/** Super admin veya kurumu tanimli kurum yoneticisi */
export function actorIsInstitutionAdmin(actor, roleSet) {
  if (roleSetHasSuperAdmin(roleSet)) return true;
  return roleSetHasAdmin(roleSet) && Boolean(actor?.institution_id);
}

export function actorIsAdminLike(actor, roleSet) {
  return roleSetHasSuperAdmin(roleSet) || roleSetHasAdmin(roleSet);
}
