import { Injectable } from '@nestjs/common';
import { ContactType } from '@online-vip-crm/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { PublicLeadFormDto } from './dto/public-lead.dto';

@Injectable()
export class PublicFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createLead(institutionId: string, dto: PublicLeadFormDto) {
    const [firstName, ...rest] = dto.fullName.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    const contact = await this.prisma.contact.create({
      data: {
        institutionId,
        firstName,
        lastName,
        displayName: dto.fullName.trim(),
        primaryEmail: dto.email ?? null,
        primaryPhone: dto.phone ?? null,
        source: dto.source ?? 'public_form',
        notes: dto.message ?? null,
        contactType: ContactType.PROSPECT,
      },
    });

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { institutionId, isDefault: true, deletedAt: null },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!pipeline || !pipeline.stages.length) {
      await this.audit.write({
        action: 'public_form.contact_only',
        institutionId,
        entityType: 'contact',
        entityId: contact.id,
        metadata: { reason: 'no_default_pipeline' },
      });
      return {
        success: true,
        leadId: null,
        contactId: contact.id,
        warning: 'Contact created; no default pipeline configured',
      };
    }

    const stage =
      pipeline.stages.find((s) => s.key === 'new_request') ?? pipeline.stages[0];

    const lead = await this.prisma.lead.create({
      data: {
        institutionId,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        title: `Form: ${dto.fullName.trim()}`,
        source: dto.source ?? 'public_form',
        formName: 'public_leads',
        gradeLevel: dto.grade ?? null,
        program: dto.examTarget ?? null,
      },
    });

    await this.audit.write({
      action: 'public_form.lead_created',
      institutionId,
      entityType: 'lead',
      entityId: lead.id,
      metadata: {
        contactId: contact.id,
        source: dto.source ?? 'public_form',
      },
    });

    return {
      success: true,
      leadId: lead.id,
      contactId: contact.id,
    };
  }
}
