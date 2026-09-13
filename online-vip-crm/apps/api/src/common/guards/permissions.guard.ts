import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  PERMISSIONS_KEY,
  type RequiredPermissionsMeta,
} from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { userHasPermission } from '../helpers/tenant.helpers';
import type { AuthUser } from '../types/auth-user';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const meta = this.reflector.getAllAndOverride<RequiredPermissionsMeta | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!meta?.permissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser | undefined;
    if (!user) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const allowed = userHasPermission(user, meta.permissions, meta.mode);
    if (!allowed) {
      throw new ForbiddenException(
        `Missing permission: ${meta.permissions.join(' | ')}`,
      );
    }
    return true;
  }
}
