import { supabaseAdmin } from './supabase-admin.js';
import {
  getCoachLimitRow,
  PLATFORM_PRIMARY_INSTITUTION_ID
} from './quota-enforce.js';

export class LicenseError extends Error {
  constructor(code = 'license_expired', userMessage = 'Lisans süreniz sona ermiştir.') {
    super(code);
    this.code = code;
    this.userMessage = userMessage;
  }
}

function clipDate(v) {
  if (!v) return null;
  const s = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function isLicenseExpired(endDate) {
  const end = clipDate(endDate);
  if (!end) return false;
  return todayIso() > end;
}

export function daysRemaining(endDate) {
  const end = clipDate(endDate);
  if (!end) return null;
  const a = new Date(`${todayIso()}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

export function licenseStatusFromUser(user) {
  if (!user) return 'missing';
  if (user.is_active === false) return 'inactive';
  if (isLicenseExpired(user.end_date)) return 'expired';
  return 'active';
}

const PACKAGE_LABELS = {
  trial: 'Deneme',
  starter: 'Smart Coach Basic',
  professional: 'Smart Coach Pro',
  enterprise: 'Smart Coach Enterprise'
};

export function packageDisplayName(pkg) {
  const key = String(pkg || '').trim().toLowerCase();
  return PACKAGE_LABELS[key] || pkg || '—';
}

async function countStudentsForCoach(coachId) {
  const { count, error } = await supabaseAdmin
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId);
  if (error) throw error;
  return count ?? 0;
}

async function loadUserForCoachEmail(email) {
  const em = String(email || '').toLowerCase().trim();
  if (!em) return null;
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, package, start_date, end_date, is_active, last_login_at, institution_id')
    .eq('email', em)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function buildCoachLicenseRow(coach) {
  const user = await loadUserForCoachEmail(coach.email);
  const limits = await getCoachLimitRow(coach.id);
  const used = await countStudentsForCoach(coach.id);
  const max = limits?.max_students ?? null;
  const status = licenseStatusFromUser(user);
  const remaining = max != null ? Math.max(0, max - used) : null;

  return {
    coach_id: coach.id,
    coach_name: coach.name,
    coach_email: coach.email,
    user_id: user?.id ?? null,
    package: user?.package ?? null,
    package_label: packageDisplayName(user?.package),
    start_date: user?.start_date ?? null,
    end_date: user?.end_date ?? null,
    is_active: user?.is_active !== false,
    last_login_at: user?.last_login_at ?? null,
    max_students: max,
    used_students: used,
    remaining_students: remaining,
    days_remaining: daysRemaining(user?.end_date),
    license_status: status,
    lessons_meetings_locked: coach.lessons_meetings_locked === true
  };
}

async function loadCoachesForLicenseScope(institutionId) {
  let columns = 'id, name, email, institution_id, created_at, lessons_meetings_locked';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let q = supabaseAdmin.from('coaches').select(columns).order('name', { ascending: true });
    if (institutionId) {
      if (institutionId === PLATFORM_PRIMARY_INSTITUTION_ID) {
        q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
      } else {
        q = q.eq('institution_id', institutionId);
      }
    }
    const { data, error } = await q;
    if (!error) return data || [];
    const msg = `${error.message || ''} ${error.details || ''}`;
    if (attempt === 0 && msg.includes("'lessons_meetings_locked'") && msg.includes('schema cache')) {
      columns = 'id, name, email, institution_id, created_at';
      continue;
    }
    throw error;
  }
  return [];
}

export async function getCoachLicensesForInstitution(institutionId) {
  const coaches = await loadCoachesForLicenseScope(institutionId || null);
  const rows = [];
  for (const c of coaches) {
    rows.push(await buildCoachLicenseRow(c));
  }
  return rows;
}

export async function getCoachLicenseByCoachId(coachId) {
  const { data: coach, error } = await supabaseAdmin
    .from('coaches')
    .select('id, name, email, institution_id, created_at, lessons_meetings_locked')
    .eq('id', coachId)
    .maybeSingle();
  if (error) throw error;
  if (!coach) return null;
  return buildCoachLicenseRow(coach);
}

/** Öğrenci eklemeden önce — süresi dolmuş lisans engellenir (giriş serbest). */
export async function enforceCoachLicenseForStudentInsert(coachId, options = {}) {
  if (!coachId) return;
  if (String(options.actorRole || '').toLowerCase() === 'super_admin') return;
  const license = await getCoachLicenseByCoachId(coachId);
  if (!license) return;
  if (!license.is_active) {
    throw new LicenseError('account_inactive', 'Hesabınız pasif durumda. Yöneticinizle iletişime geçin.');
  }
  if (license.license_status === 'expired') {
    throw new LicenseError('license_expired', 'Lisans süreniz sona ermiştir.');
  }
}

export async function updateCoachLicense({
  coachId,
  packageName,
  startDate,
  endDate,
  maxStudents,
  isActive
}) {
  const { data: coach, error: cErr } = await supabaseAdmin
    .from('coaches')
    .select('id, email, institution_id')
    .eq('id', coachId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!coach) return { error: 'coach_not_found' };

  const user = await loadUserForCoachEmail(coach.email);
  if (user?.id) {
    const patch = { updated_at: new Date().toISOString() };
    if (packageName !== undefined) patch.package = packageName;
    if (startDate !== undefined) patch.start_date = startDate;
    if (endDate !== undefined) patch.end_date = endDate;
    if (isActive !== undefined) patch.is_active = Boolean(isActive);
    const { error: uErr } = await supabaseAdmin.from('users').update(patch).eq('id', user.id);
    if (uErr) throw uErr;
  }

  if (maxStudents !== undefined) {
    const max = Number(maxStudents);
    const { error: lErr } = await supabaseAdmin.from('coach_limits').upsert(
      {
        coach_id: coachId,
        max_students: Number.isFinite(max) && max >= 0 ? Math.floor(max) : 5,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'coach_id' }
    );
    if (lErr) throw lErr;
  }

  return { data: await buildCoachLicenseRow(coach) };
}
