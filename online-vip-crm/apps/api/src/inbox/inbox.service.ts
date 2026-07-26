import { Injectable } from '@nestjs/common';
import { Provider } from '@online-vip-crm/database';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionContext } from '../common/services/institution-context.service';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: InstitutionContext,
  ) {}

  /** Phase 3 stub: paginated conversations with optional channel/provider filter. */
  async listConversations(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    params: { channel?: string; take?: number; skip?: number },
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const take = Math.min(params.take ?? 30, 100);
    const skip = params.skip ?? 0;

    const channel = params.channel?.toUpperCase();
    const provider =
      channel && Object.values(Provider).includes(channel as Provider)
        ? (channel as Provider)
        : undefined;

    const where = {
      institutionId,
      deletedAt: null,
      ...(provider ? { provider } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        take,
        skip,
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              displayName: true,
              primaryPhone: true,
              primaryEmail: true,
            },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      items,
      total,
      take,
      skip,
      filters: { channel: params.channel ?? null },
    };
  }
}
