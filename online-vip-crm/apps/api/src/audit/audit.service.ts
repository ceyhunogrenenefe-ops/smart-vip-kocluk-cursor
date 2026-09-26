import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@online-vip-crm/database';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'secret',
  'apiKey',
  'x-api-key',
  'formApiKey',
]);

export type AuditWriteInput = {
  action: string;
  userId?: string | null;
  institutionId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  sanitizeMetadata(
    metadata?: Record<string, unknown> | null,
  ): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (SENSITIVE_KEYS.has(key) || /password|token|secret|apikey/i.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = this.sanitizeMetadata(value as Record<string, unknown>);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  async write(input: AuditWriteInput): Promise<void> {
    const data: Prisma.AuditLogCreateInput = {
      action: input.action,
      entityType: input.entityType ?? 'system',
      entityId: input.entityId ?? null,
      before: this.sanitizeMetadata(input.before) as Prisma.InputJsonValue | undefined,
      after: (this.sanitizeMetadata(input.after) ??
        this.sanitizeMetadata(input.metadata)) as Prisma.InputJsonValue | undefined,
      ipAddress: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      ...(input.userId
        ? { actor: { connect: { id: input.userId } } }
        : {}),
      ...(input.institutionId
        ? { institution: { connect: { id: input.institutionId } } }
        : {}),
    };

    try {
      await this.prisma.auditLog.create({ data });
    } catch (err) {
      this.logger.warn(
        `Failed to write audit log for ${input.action}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
