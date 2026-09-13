import { RoleCode } from '../enums';
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from './catalog';

const READ_ONLY_PERMISSIONS: Permission[] = [
  PERMISSIONS.INBOX_VIEW,
  PERMISSIONS.CONTACT_VIEW,
  PERMISSIONS.LEAD_VIEW,
  PERMISSIONS.TASK_VIEW,
  PERMISSIONS.REPORT_VIEW,
  PERMISSIONS.INTEGRATION_VIEW,
  PERMISSIONS.USER_VIEW,
  PERMISSIONS.INSTITUTION_VIEW,
  PERMISSIONS.NOTIFICATION_VIEW,
];

const GUIDANCE_TEACHER_PERMISSIONS: Permission[] = [
  ...READ_ONLY_PERMISSIONS,
  PERMISSIONS.INBOX_REPLY,
  PERMISSIONS.CONTACT_UPDATE,
  PERMISSIONS.TASK_MANAGE,
  PERMISSIONS.CONVERSATION_UPDATE,
  PERMISSIONS.CANNED_RESPONSE_MANAGE,
  PERMISSIONS.FILE_MANAGE,
];

const REGISTRATION_STAFF_PERMISSIONS: Permission[] = [
  ...GUIDANCE_TEACHER_PERMISSIONS,
  PERMISSIONS.CONTACT_CREATE,
  PERMISSIONS.CONTACT_MERGE,
  PERMISSIONS.LEAD_CREATE,
  PERMISSIONS.LEAD_UPDATE,
  PERMISSIONS.CONVERSATION_ASSIGN,
  PERMISSIONS.TEMPLATE_MANAGE,
];

const INSTITUTION_ADMIN_PERMISSIONS: Permission[] = [
  ...REGISTRATION_STAFF_PERMISSIONS,
  PERMISSIONS.CONTACT_DELETE,
  PERMISSIONS.LEAD_DELETE,
  PERMISSIONS.PIPELINE_MANAGE,
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.ROLE_MANAGE,
  PERMISSIONS.INTEGRATION_MANAGE,
  PERMISSIONS.INSTITUTION_SETTINGS,
  PERMISSIONS.AUDIT_VIEW,
  PERMISSIONS.CONSENT_MANAGE,
  PERMISSIONS.CONVERSATION_ARCHIVE,
];

const INSTITUTION_OWNER_PERMISSIONS: Permission[] = [
  ...INSTITUTION_ADMIN_PERMISSIONS,
  PERMISSIONS.INSTITUTION_MANAGE,
];

/** Role → permission map used by seed and authorization checks. */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  [RoleCode.PLATFORM_SUPER_ADMIN]: ALL_PERMISSIONS,
  [RoleCode.INSTITUTION_OWNER]: INSTITUTION_OWNER_PERMISSIONS,
  [RoleCode.INSTITUTION_ADMIN]: INSTITUTION_ADMIN_PERMISSIONS,
  [RoleCode.REGISTRATION_STAFF]: REGISTRATION_STAFF_PERMISSIONS,
  [RoleCode.GUIDANCE_TEACHER]: GUIDANCE_TEACHER_PERMISSIONS,
  [RoleCode.READ_ONLY]: READ_ONLY_PERMISSIONS,
};

export function getPermissionsForRole(role: RoleCode): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: RoleCode, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}

export function rolesHavePermission(
  roles: readonly RoleCode[],
  permission: Permission,
): boolean {
  return roles.some((role) => roleHasPermission(role, permission));
}

export function collectPermissions(roles: readonly RoleCode[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const permission of getPermissionsForRole(role)) {
      set.add(permission);
    }
  }
  return [...set];
}
