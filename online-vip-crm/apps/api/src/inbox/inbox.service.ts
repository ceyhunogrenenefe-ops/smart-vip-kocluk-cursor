import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MessageDirection,
  MessageStatus,
  MessageType,
  Provider,
} from '@online-vip-crm/database';
import { MockProvider } from '@online-vip-crm/integrations';
import { Provider as SharedProvider } from '@online-vip-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionContext } from '../common/services/institution-context.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: InstitutionContext,
    private readonly audit: AuditService,
  ) {}

  async listConversations(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    params: {
      channel?: string;
      take?: number;
      skip?: number;
      assignedToMe?: boolean;
      unassigned?: boolean;
      unread?: boolean;
      status?: string;
    },
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
      ...(params.unread ? { unreadCount: { gt: 0 } } : {}),
      ...(params.status
        ? { status: params.status.toUpperCase() as never }
        : {}),
      ...(params.assignedToMe
        ? {
            assignments: {
              some: { userId: user.id, unassignedAt: null, isActive: true },
            },
          }
        : {}),
      ...(params.unassigned
        ? {
            assignments: {
              none: { unassignedAt: null, isActive: true },
            },
          }
        : {}),
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
          assignments: {
            where: { unassignedAt: null, isActive: true },
            take: 1,
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
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
      filters: {
        channel: params.channel ?? null,
        assignedToMe: params.assignedToMe ?? false,
        unassigned: params.unassigned ?? false,
        unread: params.unread ?? false,
      },
    };
  }

  async getConversation(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    conversationId: string,
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, institutionId, deletedAt: null },
      include: {
        contact: true,
        assignments: {
          where: { unassignedAt: null, isActive: true },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Konuşma bulunamadı');
    }
    return conversation;
  }

  async listMessages(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    conversationId: string,
    params: { take?: number; skip?: number },
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, institutionId, deletedAt: null },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException('Konuşma bulunamadı');
    }

    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId, institutionId },
        orderBy: { createdAt: 'asc' },
        take,
        skip,
      }),
      this.prisma.message.count({ where: { conversationId, institutionId } }),
    ]);

    // Mark as read when viewing
    await this.prisma.conversation.updateMany({
      where: { id: conversationId, institutionId, unreadCount: { gt: 0 } },
      data: { unreadCount: 0 },
    });

    return { items, total, take, skip };
  }

  async reply(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    conversationId: string,
    text: string,
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, institutionId, deletedAt: null },
    });
    if (!conversation) {
      throw new NotFoundException('Konuşma bulunamadı');
    }

    const trimmed = text?.trim();
    if (!trimmed) {
      throw new ForbiddenException('Mesaj boş olamaz');
    }

    // Dev/mock send path — real providers wired in Phase 5
    const mock = new MockProvider({
      institutionId,
      provider: conversation.provider as unknown as SharedProvider,
    });
    await mock.connect({ mode: 'dev' });
    const sendResult = await mock.sendText({
      to: conversation.externalConversationId ?? 'mock-recipient',
      text: trimmed,
    });

    const message = await this.prisma.message.create({
      data: {
        institutionId,
        conversationId,
        channelConnectionId: conversation.channelConnectionId,
        provider: conversation.provider,
        externalMessageId:
          (sendResult as { externalMessageId?: string })?.externalMessageId ??
          `out-${Date.now()}`,
        direction: MessageDirection.OUTBOUND,
        messageType: MessageType.TEXT,
        textContent: trimmed,
        senderUserId: user.id,
        status: MessageStatus.SENT,
        sentAt: new Date(),
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: trimmed.slice(0, 180),
        status: 'WAITING_CUSTOMER' as never,
      },
    });

    await this.audit.write({
      action: 'inbox.reply',
      institutionId,
      userId: user.id,
      entityType: 'message',
      entityId: message.id,
      metadata: { conversationId, provider: conversation.provider },
    });

    return message;
  }

  async assign(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    conversationId: string,
    assigneeUserId: string,
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, institutionId, deletedAt: null },
    });
    if (!conversation) {
      throw new NotFoundException('Konuşma bulunamadı');
    }

    const assignee = await this.prisma.userInstitution.findFirst({
      where: {
        institutionId,
        userId: assigneeUserId,
      },
    });
    if (!assignee) {
      throw new NotFoundException('Personel bu kurumda bulunamadı');
    }

    await this.prisma.conversationAssignment.updateMany({
      where: {
        conversationId,
        unassignedAt: null,
        isActive: true,
      },
      data: { unassignedAt: new Date(), isActive: false },
    });

    const assignment = await this.prisma.conversationAssignment.create({
      data: {
        conversationId,
        userId: assigneeUserId,
        isActive: true,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await this.audit.write({
      action: 'conversation.assign',
      institutionId,
      userId: user.id,
      entityType: 'conversation',
      entityId: conversationId,
      metadata: { assigneeUserId },
    });

    return assignment;
  }
}
