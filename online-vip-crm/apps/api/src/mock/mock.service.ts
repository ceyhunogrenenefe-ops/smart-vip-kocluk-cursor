import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionContext } from '../common/services/institution-context.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';

export type MockInboundMessageDto = {
  contactPhone?: string;
  contactName?: string;
  contactId?: string;
  body: string;
  channel?: string;
  externalId?: string;
};

@Injectable()
export class MockService {
  private readonly logger = new Logger(MockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: InstitutionContext,
    private readonly audit: AuditService,
  ) {}

  assertDevOnly(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Mock endpoints are disabled in production');
    }
  }

  async createInboundMessage(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    dto: MockInboundMessageDto,
  ) {
    this.assertDevOnly();
    const institutionId = this.tenant.require(user, explicitInstitutionId);

    let normalized: {
      body: string;
      channel: string;
      contactPhone?: string;
      contactName?: string;
      externalId?: string;
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const integrations = require('@online-vip-crm/integrations') as {
        MockProvider?: new () => {
          normalizeInbound: (input: MockInboundMessageDto) => typeof normalized;
        };
      };
      if (integrations.MockProvider) {
        const provider = new integrations.MockProvider();
        normalized = provider.normalizeInbound(dto);
      } else {
        throw new Error('MockProvider missing');
      }
    } catch {
      normalized = {
        body: dto.body,
        channel: (dto.channel ?? 'MOCK').toUpperCase(),
        contactPhone: dto.contactPhone,
        contactName: dto.contactName,
        externalId: dto.externalId,
      };
    }

    let contactId = dto.contactId;
    if (!contactId) {
      const contact = await this.prisma.contact.create({
        data: {
          institutionId,
          fullName: normalized.contactName ?? 'Mock Contact',
          phone: normalized.contactPhone ?? null,
          source: 'mock',
        },
      });
      contactId = contact.id;
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        institutionId,
        contactId,
        channel: normalized.channel,
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          institutionId,
          contactId,
          channel: normalized.channel,
          unreadCount: 1,
          lastMessageAt: new Date(),
        },
      });
    } else {
      conversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          unreadCount: { increment: 1 },
          lastMessageAt: new Date(),
        },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        institutionId,
        conversationId: conversation.id,
        contactId,
        direction: 'INBOUND',
        channel: normalized.channel,
        body: normalized.body,
        externalId: normalized.externalId ?? null,
        status: 'RECEIVED',
      },
    });

    await this.audit.write({
      action: 'mock.message_inbound',
      userId: user.id,
      institutionId,
      entityType: 'message',
      entityId: message.id,
      metadata: {
        conversationId: conversation.id,
        channel: normalized.channel,
      },
    });

    this.logger.debug(`Mock inbound message ${message.id} created`);

    return { conversation, message };
  }
}
