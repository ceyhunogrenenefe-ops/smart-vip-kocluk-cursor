import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@online-vip-crm/database';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionContext } from '../common/services/institution-context.service';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: InstitutionContext,
  ) {}

  async list(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    params: {
      status?: string;
      assigneeId?: string;
      overdue?: boolean;
      take?: number;
      skip?: number;
    },
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const take = Math.min(params.take ?? 50, 100);
    const skip = params.skip ?? 0;
    const now = new Date();

    const where = {
      institutionId,
      deletedAt: null,
      ...(params.status ? { status: params.status as TaskStatus } : {}),
      ...(params.assigneeId ? { assignedUserId: params.assigneeId } : {}),
      ...(params.overdue
        ? {
            dueAt: { lt: now },
            status: {
              notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take,
        skip,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { items, total, take, skip };
  }
}
