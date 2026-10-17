import { Injectable } from '@nestjs/common';
import { InstitutionStatus } from '@online-vip-crm/database';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        timezone: true,
        locale: true,
        createdAt: true,
      },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.institution.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
      },
    });
  }

  async findActiveByFormApiKey(apiKey: string) {
    const settings = await this.prisma.institutionSettings.findMany({
      where: {
        institution: {
          deletedAt: null,
          status: { in: [InstitutionStatus.ACTIVE, InstitutionStatus.TRIAL] },
        },
      },
      include: {
        institution: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });

    for (const row of settings) {
      const bag = (row.settings ?? {}) as Record<string, unknown>;
      if (bag.formApiKey === apiKey || bag.publicFormApiKey === apiKey) {
        return row.institution;
      }
    }
    return null;
  }
}
