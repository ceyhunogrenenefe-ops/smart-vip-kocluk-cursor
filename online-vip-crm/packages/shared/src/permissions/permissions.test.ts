import { describe, expect, it } from 'vitest';
import { RoleCode } from '../enums';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  collectPermissions,
  roleHasPermission,
  rolesHavePermission,
} from './index';

describe('permission catalog', () => {
  it('includes required master-prompt permissions', () => {
    const required = [
      'inbox.view',
      'inbox.reply',
      'conversation.assign',
      'contact.view',
      'contact.create',
      'contact.update',
      'contact.merge',
      'lead.view',
      'lead.create',
      'lead.update',
      'task.manage',
      'report.view',
      'integration.manage',
      'user.manage',
      'institution.manage',
      'audit.view',
    ];
    for (const key of required) {
      expect(ALL_PERMISSIONS).toContain(key);
    }
  });
});

describe('role permission maps', () => {
  it('gives platform super admin all permissions', () => {
    expect(ROLE_PERMISSIONS[RoleCode.PLATFORM_SUPER_ADMIN]).toEqual(ALL_PERMISSIONS);
  });

  it('allows registration staff to reply but not manage users', () => {
    expect(roleHasPermission(RoleCode.REGISTRATION_STAFF, PERMISSIONS.INBOX_REPLY)).toBe(true);
    expect(roleHasPermission(RoleCode.REGISTRATION_STAFF, PERMISSIONS.USER_MANAGE)).toBe(false);
  });

  it('read-only cannot reply', () => {
    expect(roleHasPermission(RoleCode.READ_ONLY, PERMISSIONS.INBOX_VIEW)).toBe(true);
    expect(roleHasPermission(RoleCode.READ_ONLY, PERMISSIONS.INBOX_REPLY)).toBe(false);
  });

  it('owner can manage institution and integrations', () => {
    expect(roleHasPermission(RoleCode.INSTITUTION_OWNER, PERMISSIONS.INSTITUTION_MANAGE)).toBe(true);
    expect(roleHasPermission(RoleCode.INSTITUTION_OWNER, PERMISSIONS.INTEGRATION_MANAGE)).toBe(true);
  });

  it('collects union of permissions across roles', () => {
    const perms = collectPermissions([RoleCode.READ_ONLY, RoleCode.REGISTRATION_STAFF]);
    expect(perms).toContain(PERMISSIONS.INBOX_REPLY);
    expect(rolesHavePermission([RoleCode.GUIDANCE_TEACHER], PERMISSIONS.TASK_MANAGE)).toBe(true);
  });
});
