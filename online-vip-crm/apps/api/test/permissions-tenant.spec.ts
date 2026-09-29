import { describe, expect, it } from 'vitest';
import {
  assertSameTenant,
  resolveInstitutionId,
  tenantWhere,
  userHasPermission,
} from '../src/common/helpers/tenant.helpers';
import { PLATFORM_SUPER_ADMIN } from '../src/common/types/auth-user';
import type { AuthUser } from '../src/common/types/auth-user';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';

function user(partial: Partial<AuthUser>): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.com',
    fullName: 'Test',
    firstName: 'Test',
    lastName: 'User',
    role: 'AGENT',
    roles: ['AGENT'],
    institutionId: 'inst-1',
    permissions: ['inbox.view'],
    isActive: true,
    isPlatformAdmin: false,
    ...partial,
  };
}

describe('tenant isolation helpers', () => {
  it('locks non-super-admin to JWT institutionId', () => {
    const u = user({});
    expect(resolveInstitutionId(u, 'other-inst')).toBe('inst-1');
  });

  it('allows PLATFORM_SUPER_ADMIN to switch institution', () => {
    const u = user({
      role: PLATFORM_SUPER_ADMIN,
      institutionId: null,
      isPlatformAdmin: true,
    });
    expect(resolveInstitutionId(u, 'switched')).toBe('switched');
  });

  it('allows isPlatformAdmin flag to switch institution', () => {
    const u = user({
      role: 'INSTITUTION_ADMIN',
      isPlatformAdmin: true,
      institutionId: 'inst-1',
    });
    expect(resolveInstitutionId(u, 'switched')).toBe('switched');
  });

  it('builds tenant where clause', () => {
    expect(tenantWhere('inst-1', { stage: 'NEW' })).toEqual({
      institutionId: 'inst-1',
      stage: 'NEW',
    });
  });

  it('throws when institutionId missing', () => {
    expect(() => tenantWhere(null)).toThrow('TENANT_REQUIRED');
  });

  it('assertSameTenant compares ids', () => {
    expect(assertSameTenant('inst-1', 'inst-1')).toBe(true);
    expect(assertSameTenant('inst-1', 'inst-2')).toBe(false);
  });
});

describe('userHasPermission', () => {
  it('grants PLATFORM_SUPER_ADMIN all permissions', () => {
    expect(
      userHasPermission(
        user({ role: PLATFORM_SUPER_ADMIN, permissions: [] }),
        ['settings.manage'],
      ),
    ).toBe(true);
  });

  it('checks any vs all modes', () => {
    const u = user({ permissions: ['inbox.view', 'contacts.view'] });
    expect(userHasPermission(u, ['inbox.view', 'leads.view'], 'any')).toBe(true);
    expect(userHasPermission(u, ['inbox.view', 'leads.view'], 'all')).toBe(false);
  });
});

describe('PermissionsGuard', () => {
  it('allows when user has required permission', () => {
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === 'isPublic') return false;
        if (key === 'permissions') {
          return { permissions: ['inbox.view'], mode: 'any' };
        }
        return undefined;
      },
    } as unknown as Reflector;

    const guard = new PermissionsGuard(reflector);
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: user({}) }),
      }),
    } as never;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('forbids when permission missing', () => {
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === 'isPublic') return false;
        if (key === 'permissions') {
          return { permissions: ['settings.manage'], mode: 'any' };
        }
        return undefined;
      },
    } as unknown as Reflector;

    const guard = new PermissionsGuard(reflector);
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: user({ permissions: ['inbox.view'] }) }),
      }),
    } as never;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
