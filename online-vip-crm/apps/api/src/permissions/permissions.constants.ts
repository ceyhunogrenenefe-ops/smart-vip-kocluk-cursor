/**
 * Re-export shared permission keys; fall back to local catalog if package missing.
 */
import { PERMISSIONS as SharedPermissions } from '@online-vip-crm/shared';

export const PERMISSIONS = SharedPermissions;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
