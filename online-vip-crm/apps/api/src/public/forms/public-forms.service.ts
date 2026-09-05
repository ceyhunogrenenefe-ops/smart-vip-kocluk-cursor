import { BadRequestException, Injectable } from '@nestjs/common';
import { ContactType } from '@online-vip-crm/database';
import { normalizeEmail, normalizePhone } from '@online-vip-crm/shared';
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
    // Honeypot: bots fill hidden "website" field
    if (dto.website?.trim()) {
      return { success: true, ignored: true, reason: 'spam_honeypot' };
    }

    if (dto.consent !== true) {
      throw new BadRequestException(
        'Açık rıza (consent) işaretlenmeden form kabul edilmez',
      );
    }

    const displayName = dto.resolveDisplayName();
    const [firstName, ...rest] = displayName.split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    const email = dto.email ? normalizeEmail(dto.email) : null;

    let contact = null;
    if (phone) {
      contact = await this.prisma.contact.findFirst({
        where: {
          institutionId,
          primaryPhone: phone,
          deletedAt: null,
        },
      });
    }
    if (!contact && email) {
      contact = await this.prisma.contact.findFirst({
        where: {
          institutionId,
          primaryEmail: email,
          deletedAt: null,
        },
      });
    }

    if (!contact) {
      const noteParts = [
        dto.message?.trim(),
        dto.student_name ? `Öğrenci: ${dto.student_name}` : null,
        dto.campaign ? `Kampanya: ${dto.campaign}` : null,
        dto.form_name ? `Form: ${dto.form_name}` : null,
        dto.page_url ? `Sayfa: ${dto.page_url}` : null,
        dto.utm_source || dto.utm_campaign
          ? `UTM: ${[dto.utm_source, dto.utm_medium, dto.utm_campaign].filter(Boolean).join('/')}`
          : null,
        'Rıza: evet',
      ].filter(Boolean);

      contact = await this.prisma.contact.create({
        data: {
          institutionId,
          firstName,
          lastName,
          displayName,
          primaryEmail: email,
          primaryPhone: phone,
          city: dto.city ?? null,
          source: dto.source ?? 'website',
          notes: noteParts.join('\n') || null,
          contactType: ContactType.PROSPECT,
        },
      });
    }

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
        title: dto.student_name
          ? `Form: ${displayName} / ${dto.student_name}`
          : `Form: ${displayName}`,
        source: dto.source ?? 'website',
        campaign: dto.campaign ?? null,
        formName: dto.form_name ?? 'public_leads',
        gradeLevel: dto.grade_level ?? dto.grade ?? null,
        program: dto.program ?? dto.examTarget ?? null,
      },
    });

    await this.audit.write({
      action: 'public_form.lead_created',
      institutionId,
      entityType: 'lead',
      entityId: lead.id,
      metadata: {
        contactId: contact.id,
        source: dto.source ?? 'website',
        formName: dto.form_name ?? null,
      },
    });

    return {
      success: true,
      leadId: lead.id,
      contactId: contact.id,
    };
  }
}
