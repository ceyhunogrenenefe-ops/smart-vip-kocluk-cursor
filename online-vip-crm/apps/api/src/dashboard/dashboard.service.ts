import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@online-vip-crm/database';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionContext } from '../common/services/institution-context.service';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: InstitutionContext,
  ) {}

  async summary(user: AuthUser, explicitInstitutionId?: string | null) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    const [messagesToday, unreadConversations, openLeads, overdueTasks] =
      await Promise.all([
        this.prisma.message.count({
          where: {
            institutionId,
            createdAt: { gte: startOfDay },
          },
        }),
        this.prisma.conversation.count({
          where: {
            institutionId,
            deletedAt: null,
            unreadCount: { gt: 0 },
          },
        }),
        this.prisma.lead.count({
          where: {
            institutionId,
            deletedAt: null,
            stage: { isWon: false, isLost: false },
          },
        }),
        this.prisma.task.count({
          where: {
            institutionId,
            deletedAt: null,
            status: {
              notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
            },
            dueAt: { lt: now },
          },
        }),
      ]);

    return {
      messagesToday,
      unreadConversations,
      openLeads,
      overdueTasks,
      asOf: now.toISOString(),
    };
  }
}
