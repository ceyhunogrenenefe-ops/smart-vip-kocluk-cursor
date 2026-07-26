import { Injectable } from '@nestjs/common';
import {
  RoleCode,
  collectPermissions,
  getPermissionsForRole,
} from '@online-vip-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/types/auth-user';
import { PLATFORM_SUPER_ADMIN } from '../common/types/auth-user';

type AuthUserRow = AuthUser & { passwordHash: string };

function displayName(row: {
  firstName: string;
  lastName: string;
  displayName?: string | null;
}): string {
  if (row.displayName?.trim()) {
    return row.displayName.trim();
  }
  return `${row.firstName} ${row.lastName}`.trim();
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private mapAuthUser(
    row: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      displayName: string | null;
      passwordHash: string;
      isActive: boolean;
      isPlatformAdmin: boolean;
      institutions: Array<{
        institutionId: string;
        isDefault: boolean;
      }>;
      roles: Array<{
        institutionId: string | null;
        role: { code: string };
      }>;
    },
    preferredInstitutionId?: string | null,
  ): AuthUserRow {
    const defaultMembership =
      row.institutions.find((i) => i.isDefault) ?? row.institutions[0];
    const institutionId =
      preferredInstitutionId &&
      row.institutions.some((i) => i.institutionId === preferredInstitutionId)
        ? preferredInstitutionId
        : (defaultMembership?.institutionId ?? null);

    const roleCodes = row.roles
      .filter(
        (r) =>
          r.institutionId == null ||
          r.institutionId === institutionId ||
          row.isPlatformAdmin,
      )
      .map((r) => r.role.code);

    const uniqueRoles = Array.from(new Set(roleCodes));
    if (row.isPlatformAdmin && !uniqueRoles.includes(PLATFORM_SUPER_ADMIN)) {
      uniqueRoles.unshift(PLATFORM_SUPER_ADMIN);
    }

    const primaryRole =
      uniqueRoles.find((c) => c === PLATFORM_SUPER_ADMIN) ??
      uniqueRoles[0] ??
      RoleCode.READ_ONLY;

    const permissions = collectPermissions(
      uniqueRoles.filter((c): c is RoleCode =>
        Object.values(RoleCode).includes(c as RoleCode),
      ),
    );

    // Ensure role defaults even if DB role links are incomplete
    if (!permissions.length) {
      permissions.push(
        ...getPermissionsForRole(
          (primaryRole as RoleCode) in RoleCode
            ? (primaryRole as RoleCode)
            : RoleCode.READ_ONLY,
        ),
      );
    }

    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      fullName: displayName(row),
      role: primaryRole,
      roles: uniqueRoles,
      institutionId,
      permissions: Array.from(new Set(permissions)),
      isActive: row.isActive,
      isPlatformAdmin: row.isPlatformAdmin,
      passwordHash: row.passwordHash,
    };
  }

  private authInclude() {
    return {
      institutions: true,
      roles: { include: { role: true } },
    } as const;
  }

  async findByEmailForAuth(email: string): Promise<AuthUserRow | null> {
    const row = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
      include: this.authInclude(),
    });
    if (!row) {
      return null;
    }
    return this.mapAuthUser(row);
  }

  async findByIdForAuth(
    id: string,
    preferredInstitutionId?: string | null,
  ): Promise<AuthUser | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: this.authInclude(),
    });
    if (!row) {
      return null;
    }
    const mapped = this.mapAuthUser(row, preferredInstitutionId);
    const { passwordHash: _omit, ...safe } = mapped;
    void _omit;
    return safe;
  }
}
