import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  resolveInstitutionId,
  tenantWhere,
} from '../helpers/tenant.helpers';
import type { AuthUser } from '../types/auth-user';
import { PLATFORM_SUPER_ADMIN } from '../types/auth-user';

/**
 * Tenant helpers shared by controllers/services (not request-scoped).
 */
@Injectable()
export class InstitutionContext {
  resolve(user: AuthUser, explicitInstitutionId?: string | null): string | null {
    return resolveInstitutionId(user, explicitInstitutionId);
  }

  require(
    user: AuthUser,
    explicitInstitutionId?: string | null,
  ): string {
    const id = this.resolve(user, explicitInstitutionId);
    if (!id) {
      throw new ForbiddenException('Institution context is required');
    }
    return id;
  }

  where(
    user: AuthUser,
    explicitInstitutionId?: string | null,
    extra: Record<string, unknown> = {},
  ) {
    return tenantWhere(this.require(user, explicitInstitutionId), extra);
  }

  isSuperAdmin(user: AuthUser): boolean {
    return user.role === PLATFORM_SUPER_ADMIN || user.isPlatformAdmin;
  }
}
