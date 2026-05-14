import { db } from './database';
import type { OrganizationPlan } from '../types';
import { PLAN_LIMITS } from '../context/OrganizationContext';

/** Yeni kurum için ilk `admin` kullanıcısı + paket kotası (öğrenci/koç sayıları sıfırdan başlar). */
export async function createInstitutionAdminUser(opts: {
  institutionId: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  adminPhone?: string | null;
  plan: OrganizationPlan;
}): Promise<void> {
  const lim = PLAN_LIMITS[opts.plan] ?? PLAN_LIMITS.professional;
  await db.createUser(
    {
      email: opts.adminEmail.trim().toLowerCase(),
      name: opts.adminName.trim(),
      phone: opts.adminPhone?.trim() || null,
      role: 'admin',
      password_hash: opts.adminPassword,
      institution_id: opts.institutionId,
      is_active: true,
      package: opts.plan,
      start_date: new Date().toISOString(),
      end_date: null,
      created_by: null
    },
    {
      bootstrap: {
        bootstrap_max_students: lim.students,
        bootstrap_max_coaches: lim.coaches,
        bootstrap_package_label: opts.plan
      }
    }
  );
}
