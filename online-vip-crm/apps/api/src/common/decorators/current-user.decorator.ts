import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../types/auth-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user;
  },
);

export const CurrentInstitutionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.institutionId ?? request.user?.institutionId ?? null;
  },
);
