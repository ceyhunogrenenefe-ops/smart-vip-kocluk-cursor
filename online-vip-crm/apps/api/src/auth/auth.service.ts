import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import type { EnvConfig } from '../config/configuration';
import { validatePasswordPolicy } from '../common/helpers/password-policy';
import type { AuthUser, JwtPayload } from '../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { InstitutionsService } from '../institutions/institutions.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly institutionsService: InstitutionsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly audit: AuditService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<AuthUser | null> {
    const user = await this.usersService.findByEmailForAuth(email);
    if (!user) {
      return null;
    }
    const ok = await this.comparePassword(password, user.passwordHash);
    if (!ok) {
      return null;
    }
    const { passwordHash: _omit, ...safe } = user;
    void _omit;
    return safe;
  }

  async comparePassword(
    plain: string,
    passwordHash: string,
  ): Promise<boolean> {
    if (!plain || !passwordHash) {
      return false;
    }
    return bcrypt.compare(plain, passwordHash);
  }

  async hashPassword(plain: string): Promise<string> {
    const policy = validatePasswordPolicy(plain);
    if (!policy.valid) {
      throw new UnauthorizedException(policy.errors.join('; '));
    }
    return bcrypt.hash(plain, 12);
  }

  checkPasswordPolicy(password: string) {
    return validatePasswordPolicy(password);
  }

  private toPublicUser(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      roles: user.roles,
      institutionId: user.institutionId,
      permissions: user.permissions,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }

  async login(email: string, password: string, meta?: { ip?: string }) {
    const user = await this.validateUser(email, password);
    if (!user) {
      await this.audit.write({
        action: 'auth.login_failed',
        entityType: 'user',
        metadata: { email },
        ip: meta?.ip,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.signToken(user);
    const institution = user.institutionId
      ? await this.institutionsService.findById(user.institutionId)
      : null;

    await this.audit.write({
      action: 'auth.login',
      userId: user.id,
      institutionId: user.institutionId,
      entityType: 'user',
      entityId: user.id,
      ip: meta?.ip,
    });

    return {
      accessToken: token,
      user: this.toPublicUser(user),
      institution,
      permissions: user.permissions,
    };
  }

  async me(user: AuthUser) {
    const institution = user.institutionId
      ? await this.institutionsService.findById(user.institutionId)
      : null;
    return {
      user: this.toPublicUser(user),
      institution,
      permissions: user.permissions,
    };
  }

  async logout(user: AuthUser | undefined, meta?: { ip?: string }) {
    if (user) {
      await this.audit.write({
        action: 'auth.logout',
        userId: user.id,
        institutionId: user.institutionId,
        entityType: 'user',
        entityId: user.id,
        ip: meta?.ip,
      });
    }
    return { success: true };
  }

  setAuthCookie(res: Response, token: string): void {
    const name = this.config.get('JWT_COOKIE_NAME', { infer: true });
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    res.cookie(name, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  clearAuthCookie(res: Response): void {
    const name = this.config.get('JWT_COOKIE_NAME', { infer: true });
    res.clearCookie(name, { path: '/' });
  }

  private async signToken(user: AuthUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      institutionId: user.institutionId,
      permissions: user.permissions,
    };
    return this.jwtService.signAsync(payload);
  }
}
