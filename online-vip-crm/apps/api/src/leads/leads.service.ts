import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionContext } from '../common/services/institution-context.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import type { UpdateLeadStageDto } from './dto/lead.dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: InstitutionContext,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    params: { stageId?: string; stageKey?: string; take?: number; skip?: number },
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const take = Math.min(params.take ?? 50, 100);
    const skip = params.skip ?? 0;

    const where = {
      institutionId,
      deletedAt: null,
      ...(params.stageId ? { stageId: params.stageId } : {}),
      ...(params.stageKey && !params.stageId
        ? { stage: { key: params.stageKey } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
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
          stage: true,
          pipeline: { select: { id: true, name: true } },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  async updateStage(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    id: string,
    dto: UpdateLeadStageDto,
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const existing = await this.prisma.lead.findFirst({
      where: { id, institutionId, deletedAt: null },
      include: { stage: true },
    });
    if (!existing) {
      throw new NotFoundException('Lead not found');
    }

    let stageId = dto.stageId;
    if (!stageId && dto.stageKey) {
      const stage = await this.prisma.pipelineStage.findFirst({
        where: {
          pipelineId: existing.pipelineId,
          key: dto.stageKey,
          isActive: true,
        },
      });
      if (!stage) {
        throw new BadRequestException(`Unknown stage key: ${dto.stageKey}`);
      }
      stageId = stage.id;
    }
    if (!stageId) {
      throw new BadRequestException('stageId or stageKey is required');
    }

    const target = await this.prisma.pipelineStage.findFirst({
      where: { id: stageId, pipelineId: existing.pipelineId },
    });
    if (!target) {
      throw new BadRequestException('Stage does not belong to lead pipeline');
    }

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        stageId,
        ...(target.isWon ? { wonAt: new Date(), lostAt: null } : {}),
        ...(target.isLost ? { lostAt: new Date(), wonAt: null } : {}),
      },
      include: { stage: true },
    });

    await this.prisma.leadStageHistory.create({
      data: {
        leadId: lead.id,
        fromStageId: existing.stageId,
        toStageId: stageId,
        changedBy: user.id,
        note: dto.note ?? null,
      },
    });

    await this.audit.write({
      action: 'lead.stage_updated',
      userId: user.id,
      institutionId,
      entityType: 'lead',
      entityId: lead.id,
      metadata: {
        fromStageId: existing.stageId,
        toStageId: stageId,
        fromKey: existing.stage.key,
        toKey: target.key,
      },
    });

    return lead;
  }
}
