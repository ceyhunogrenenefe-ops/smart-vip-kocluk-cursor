import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { EnvConfig } from '../../config/configuration';

/**
 * Validates `x-api-key` for public form endpoints.
 * Matches institution.formApiKey or fallback PUBLIC_FORMS_API_KEY (dev).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.header('x-api-key');
    if (!apiKey) {
      throw new UnauthorizedException('x-api-key header required');
    }

    const institution = await this.prisma.institution.findFirst({
      where: { formApiKey: apiKey, isActive: true },
    });

    if (institution) {
      request.institutionId = institution.id;
      (request as Request & { formInstitution?: unknown }).formInstitution =
        institution;
      return true;
    }

    const fallback = this.config.get('PUBLIC_FORMS_API_KEY', { infer: true });
    const institutionId =
      typeof request.body?.institutionId === 'string'
        ? request.body.institutionId
        : undefined;

    if (fallback && apiKey === fallback && institutionId) {
      const byId = await this.prisma.institution.findFirst({
        where: { id: institutionId, isActive: true },
      });
      if (byId) {
        request.institutionId = byId.id;
        (request as Request & { formInstitution?: unknown }).formInstitution =
          byId;
        return true;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }
}
