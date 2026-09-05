import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@online-vip-crm/database';
import {
  assertSameTenant,
  resolveInstitutionId,
} from '../src/common/helpers/tenant.helpers';
import type { AuthUser } from '../src/common/types/auth-user';

const DATABASE_URL = process.env.DATABASE_URL;

describe.runIf(Boolean(DATABASE_URL))('tenant isolation (integration)', () => {
  const prisma = new PrismaClient();
  let institutionA: string;
  let institutionB: string;
  let contactA: string;

  beforeAll(async () => {
    const a = await prisma.institution.findFirst({
      where: { slug: 'online-vip-dershane', deletedAt: null },
    });
    if (!a) throw new Error('Seed institution missing — run db:seed');
    institutionA = a.id;

    const b = await prisma.institution.upsert({
      where: { slug: 'tenant-isolation-other' },
      create: {
        name: 'Other Demo School',
        slug: 'tenant-isolation-other',
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
    institutionB = b.id;

    const contact = await prisma.contact.findFirst({
      where: { institutionId: institutionA, deletedAt: null },
    });
    if (!contact) throw new Error('Seed contact missing');
    contactA = contact.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('staff user cannot resolve another institution id', () => {
    const staff: AuthUser = {
      id: '00000000-0000-4000-8000-000000000099',
      email: 'staff@example.invalid',
      fullName: 'Staff User',
      firstName: 'Staff',
      lastName: 'User',
      institutionId: institutionA,
      permissions: ['contact.view'],
      roles: ['REGISTRATION_STAFF'],
      role: 'REGISTRATION_STAFF',
      isActive: true,
      isPlatformAdmin: false,
    };

    expect(resolveInstitutionId(staff, institutionA)).toBe(institutionA);
    expect(resolveInstitutionId(staff, institutionB)).toBe(institutionA);
  });

  it('contact from institution A is not visible under institution B filter', async () => {
    const leaked = await prisma.contact.findFirst({
      where: {
        id: contactA,
        institutionId: institutionB,
        deletedAt: null,
      },
    });
    expect(leaked).toBeNull();

    const owned = await prisma.contact.findFirst({
      where: {
        id: contactA,
        institutionId: institutionA,
        deletedAt: null,
      },
    });
    expect(owned?.id).toBe(contactA);
  });

  it('assertSameTenant blocks cross-tenant entity access', () => {
    expect(assertSameTenant(institutionA, institutionB)).toBe(false);
    expect(assertSameTenant(institutionA, institutionA)).toBe(true);
  });
});
