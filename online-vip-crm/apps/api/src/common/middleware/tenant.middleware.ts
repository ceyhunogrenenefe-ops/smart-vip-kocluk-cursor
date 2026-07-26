import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PLATFORM_SUPER_ADMIN } from '../types/auth-user';

/**
 * After JWT auth, normalize institution context on the request.
 * Super-admins may switch via x-institution-id or ?institutionId=.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const user = req.user;
    if (!user) {
      next();
      return;
    }

    if (user.role === PLATFORM_SUPER_ADMIN) {
      const headerSwitch = req.header('x-institution-id');
      const querySwitch =
        typeof req.query.institutionId === 'string'
          ? req.query.institutionId
          : undefined;
      req.institutionId =
        headerSwitch || querySwitch || user.institutionId || null;
    } else {
      req.institutionId = user.institutionId ?? null;
    }

    next();
  }
}
