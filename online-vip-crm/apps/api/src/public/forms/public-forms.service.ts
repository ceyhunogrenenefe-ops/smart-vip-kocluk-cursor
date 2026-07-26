import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import type { PublicLeadFormDto } from './dto/public-lead.dto';

@Injectable()
export class PublicFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createLead(institutionId: string, dto: PublicLeadFormDto) {
    const contact = await this.prisma.contact.create({
      data: {
        institutionId,
        fullName: dto.fullName,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        source: dto.source ?? 'public_form',
        notes: dto.message ?? null,
      },
    });

    const lead = await this.prisma.lead.create({
      data: {
        institutionId,
        contactId: contact.id,
        stage: 'NEW',
        title: `Form: ${dto.fullName}`,
        source: dto.source ?? 'public_form',
        notes: [
          dto.message,
          dto.grade ? `Grade: ${dto.grade}` : null,
          dto.examTarget ? `Exam: ${dto.examTarget}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
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
