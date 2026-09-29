import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/** Require one or more permissions (OR semantics unless `mode: 'all'`). */
export const RequirePermissions = (
  ...permissions: string[]
): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSIONS_KEY, { permissions, mode: 'any' as const });

export const RequireAllPermissions = (
  ...permissions: string[]
): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSIONS_KEY, { permissions, mode: 'all' as const });

export type RequiredPermissionsMeta = {
  permissions: string[];
  mode: 'any' | 'all';
};
