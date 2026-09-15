import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  MessageDirection,
  MessageStatus,
  MessageType,
  Provider,
} from '@online-vip-crm/database';
import { Provider as SharedProvider } from '@online-vip-crm/shared';
import { MockProvider } from '@online-vip-crm/integrations';
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

    const providerEnum =
      dto.channel &&
      Object.values(Provider).includes(dto.channel.toUpperCase() as Provider)
        ? (dto.channel.toUpperCase() as Provider)
        : Provider.MOCK;

    const mock = new MockProvider({
      institutionId,
      provider:
        providerEnum === Provider.MOCK
          ? SharedProvider.WHATSAPP
          : (providerEnum as unknown as SharedProvider),
    });
    await mock.connect({ mode: 'dev' });

    const [normalized] = await mock.normalizeIncomingEvent({
      institutionId,
      text: dto.body,
      provider:
        providerEnum === Provider.MOCK
          ? SharedProvider.WHATSAPP
          : (providerEnum as unknown as SharedProvider),
      externalMessageId: dto.externalId,
      externalSenderId: dto.contactPhone ?? 'mock-user',
    });

    const channelProvider = normalized.provider as unknown as Provider;

    let contactId = dto.contactId;
    if (!contactId) {
      const nameParts = (dto.contactName ?? 'Mock Contact').trim().split(/\s+/);
      const contact = await this.prisma.contact.create({
        data: {
          institutionId,
          firstName: nameParts[0] ?? 'Mock',
          lastName: nameParts.slice(1).join(' ') || 'Contact',
          displayName: dto.contactName ?? 'Mock Contact',
          primaryPhone: dto.contactPhone ?? null,
          source: 'mock',
        },
      });
      contactId = contact.id;
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        institutionId,
        contactId,
        provider: channelProvider,
        deletedAt: null,
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          institutionId,
          contactId,
          provider: channelProvider,
          externalConversationId: normalized.externalConversationId,
          unreadCount: 1,
          lastMessageAt: new Date(),
          lastMessagePreview: normalized.text?.slice(0, 180) ?? null,
        },
      });
    } else {
      conversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          unreadCount: { increment: 1 },
          lastMessageAt: new Date(),
          lastMessagePreview: normalized.text?.slice(0, 180) ?? null,
        },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        institutionId,
        conversationId: conversation.id,
        provider: channelProvider,
        externalMessageId: normalized.externalMessageId,
        direction: MessageDirection.INBOUND,
        messageType: MessageType.TEXT,
        textContent: normalized.text ?? dto.body,
        senderContactId: contactId,
        status: MessageStatus.RECEIVED,
        providerTimestamp: normalized.sentAt,
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
        provider: channelProvider,
      },
    });

    this.logger.debug(`Mock inbound message ${message.id} created`);

    return { conversation, message };
  }
}
