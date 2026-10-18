import { PLATFORM_SUPER_ADMIN, type AuthUser } from '../types/auth-user';

/**
 * Resolve the effective institution id for a query.
 * PLATFORM_SUPER_ADMIN / platform admins may pass `?institutionId=` or `x-institution-id`.
 */
export function resolveInstitutionId(
  user: AuthUser,
  explicitInstitutionId?: string | null,
): string | null {
  if (user.role === PLATFORM_SUPER_ADMIN || user.isPlatformAdmin) {
    return explicitInstitutionId ?? user.institutionId ?? null;
  }
  return user.institutionId;
}

export function tenantWhere(
  institutionId: string | null,
  extra: Record<string, unknown> = {},
): { institutionId: string } & Record<string, unknown> {
  if (!institutionId) {
    throw new Error('TENANT_REQUIRED');
  }
  return { institutionId, ...extra };
}

export function userHasPermission(
  user: Pick<AuthUser, 'role' | 'permissions' | 'isPlatformAdmin'>,
  required: string[],
  mode: 'any' | 'all' = 'any',
): boolean {
  if (user.role === PLATFORM_SUPER_ADMIN || user.isPlatformAdmin) {
    return true;
  }
  if (!required.length) {
    return true;
  }
  const set = new Set(user.permissions ?? []);
  if (mode === 'all') {
    return required.every((p) => set.has(p));
  }
  return required.some((p) => set.has(p));
}

export function assertSameTenant(
  resourceInstitutionId: string,
  effectiveInstitutionId: string | null,
): boolean {
  if (!effectiveInstitutionId) {
    return false;
  }
  return resourceInstitutionId === effectiveInstitutionId;
}
