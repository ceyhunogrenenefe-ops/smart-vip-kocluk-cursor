import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionContext } from '../common/services/institution-context.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import type { CreateContactDto, UpdateContactDto } from './dto/contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: InstitutionContext,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    params: { q?: string; take?: number; skip?: number },
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const take = Math.min(params.take ?? 50, 100);
    const skip = params.skip ?? 0;
    const q = params.q?.trim();

    const where = {
      institutionId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { displayName: { contains: q, mode: 'insensitive' as const } },
              { primaryEmail: { contains: q, mode: 'insensitive' as const } },
              { primaryPhone: { contains: q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  async create(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    dto: CreateContactDto,
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const contact = await this.prisma.contact.create({
      data: {
        institutionId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName:
          dto.displayName ?? `${dto.firstName} ${dto.lastName}`.trim(),
        primaryEmail: dto.primaryEmail ?? null,
        primaryPhone: dto.primaryPhone ?? null,
        notes: dto.notes ?? null,
        source: dto.source ?? null,
        createdBy: user.id,
      },
    });

    await this.audit.write({
      action: 'contact.created',
      userId: user.id,
      institutionId,
      entityType: 'contact',
      entityId: contact.id,
      metadata: {
        displayName: contact.displayName ?? `${contact.firstName} ${contact.lastName}`,
      },
    });

    return contact;
  }

  async update(
    user: AuthUser,
    explicitInstitutionId: string | null | undefined,
    id: string,
    dto: UpdateContactDto,
  ) {
    const institutionId = this.tenant.require(user, explicitInstitutionId);
    const existing = await this.prisma.contact.findFirst({
      where: { id, institutionId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Contact not found');
    }

    const contact = await this.prisma.contact.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName }
          : {}),
        ...(dto.primaryEmail !== undefined
          ? { primaryEmail: dto.primaryEmail }
          : {}),
        ...(dto.primaryPhone !== undefined
          ? { primaryPhone: dto.primaryPhone }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        updatedBy: user.id,
      },
    });

    await this.audit.write({
      action: 'contact.updated',
      userId: user.id,
      institutionId,
      entityType: 'contact',
      entityId: contact.id,
    });

    return contact;
  }
}
