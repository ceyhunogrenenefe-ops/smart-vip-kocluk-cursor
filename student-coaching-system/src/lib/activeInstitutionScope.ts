import type { Institution } from '../types';

/** Kiracı kullanıcılar — institution_id ile sabitlenir. */
export const ACTIVE_INSTITUTION_STORAGE_KEY = 'coaching_active_institution';
/** Süper admin bilinçli kurum seçimi — kiracı oturumundan ayrı tutulur. */
export const SUPER_ADMIN_ACTIVE_INSTITUTION_STORAGE_KEY = 'coaching_super_admin_active_institution';
const INSTITUTIONS_LIST_STORAGE_KEY = 'coaching_institutions';

/** Production ana platform kurumu (Online Vip Dershane / 0850 303 40 14). */
export const PLATFORM_PRIMARY_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

/** Online VIP ana hat — platform kök kurumu (0850 303 40 14). */
export function institutionPhoneDigits(phone: string | undefined | null): string {
  return String(phone || '').replace(/\D/g, '');
}

export function isPrimaryOnlineVipInstitution(inst: Pick<Institution, 'phone'>): boolean {
  const d = institutionPhoneDigits(inst.phone);
  return d === '08503034014' || d === '8503034014';
}

/**
 * Süper admin için varsayılan kurum: yeni eklenen kiracılar değil, platform ana kurumu.
 * Kiracı listesi `created_at DESC` ile geldiği için institutions[0] yanlış kiracı olabilir.
 */
export function resolveSuperAdminDefaultInstitutionId(
  institutions: Institution[]
): string | null {
  if (!institutions.length) return PLATFORM_PRIMARY_INSTITUTION_ID;
  const primary = institutions.find(isPrimaryOnlineVipInstitution);
  if (primary) return primary.id;
  const byId = institutions.find((i) => i.id === PLATFORM_PRIMARY_INSTITUTION_ID);
  if (byId) return byId.id;
  const byName = institutions.find((i) => /online\s*vip\s*dershane/i.test(String(i.name || '')));
  if (byName) return byName.id;
  const oldest = [...institutions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return oldest[0]?.id ?? institutions[0]?.id ?? PLATFORM_PRIMARY_INSTITUTION_ID;
}

/** Yalnızca süper yönetici kurum değiştirebilir. */
export function userMaySwitchInstitution(role: string | undefined | null): boolean {
  return role === 'super_admin';
}

function readStorageKey(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id = String(parsed || '').trim();
    return id || null;
  } catch {
    return null;
  }
}

function writeStorageKey(key: string, id: string | null | undefined): void {
  try {
    if (!id) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(String(id).trim()));
  } catch {
    /* noop */
  }
}

export function readActiveInstitutionIdForRole(role: string | undefined | null): string | null {
  const key = userMaySwitchInstitution(role)
    ? SUPER_ADMIN_ACTIVE_INSTITUTION_STORAGE_KEY
    : ACTIVE_INSTITUTION_STORAGE_KEY;
  return readStorageKey(key);
}

export function writeActiveInstitutionIdForRole(
  id: string | null | undefined,
  role: string | undefined | null
): void {
  if (userMaySwitchInstitution(role)) {
    writeStorageKey(SUPER_ADMIN_ACTIVE_INSTITUTION_STORAGE_KEY, id);
    localStorage.removeItem(ACTIVE_INSTITUTION_STORAGE_KEY);
    return;
  }
  writeStorageKey(ACTIVE_INSTITUTION_STORAGE_KEY, id);
}

/** @deprecated Kiracı anahtarı — rol bilinmiyorsa kullanmayın. */
export function readActiveInstitutionIdFromStorage(): string | null {
  return readStorageKey(ACTIVE_INSTITUTION_STORAGE_KEY);
}

/** @deprecated Rol bilinmiyorsa kullanmayın; writeActiveInstitutionIdForRole tercih edin. */
export function writeActiveInstitutionIdToStorage(id: string | null | undefined): void {
  writeStorageKey(ACTIVE_INSTITUTION_STORAGE_KEY, id);
}

export function clearActiveInstitutionStorage(): void {
  writeStorageKey(ACTIVE_INSTITUTION_STORAGE_KEY, null);
}

export function clearSuperAdminInstitutionStorage(): void {
  writeStorageKey(SUPER_ADMIN_ACTIVE_INSTITUTION_STORAGE_KEY, null);
}

/** Kurum listesi önbelleği — yanlış kurum adı flaşını önlemek için oturum değişiminde silinir. */
export function clearInstitutionsListStorage(): void {
  try {
    localStorage.removeItem(INSTITUTIONS_LIST_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function clearTenantSessionStorage(): void {
  clearActiveInstitutionStorage();
  clearInstitutionsListStorage();
}

/** Giriş öncesi: kiracı / süper admin depolarını ayır, eski kiracı seçimini süper admine taşıma. */
export function prepareInstitutionStorageForLogin(role: string | undefined | null): void {
  clearInstitutionsListStorage();
  if (userMaySwitchInstitution(role)) {
    localStorage.removeItem(ACTIVE_INSTITUTION_STORAGE_KEY);
    clearSuperAdminInstitutionStorage();
    return;
  }
  clearActiveInstitutionStorage();
  clearSuperAdminInstitutionStorage();
}

/** Süper admin dışındaki kullanıcılar için aktif kurumu JWT/users.institution_id ile sabitle. */
export function pinActiveInstitutionForUser(
  institutionId: string | null | undefined,
  role: string | undefined | null
): void {
  if (userMaySwitchInstitution(role ?? undefined)) return;
  writeActiveInstitutionIdForRole(institutionId, role);
}

/**
 * Veri kapsamı için tek doğruluk kaynağı — React state gecikmesinden etkilenmez.
 * Kiracı kullanıcı: yalnızca kendi institution_id.
 * Süper admin: süper admin depo anahtarı veya platform ana kurumu.
 */
export function resolveTenantScopeInstitutionId(opts: {
  role?: string | null;
  userInstitutionId?: string | null;
  selectedInstitutionId?: string | null;
  fallbackInstitutionId?: string | null;
}): string | null {
  const userInst = String(opts.userInstitutionId || '').trim() || null;
  if (!userMaySwitchInstitution(opts.role ?? undefined)) {
    return userInst;
  }
  const selected = String(opts.selectedInstitutionId || '').trim() || null;
  if (selected) return selected;
  const stored = readActiveInstitutionIdForRole(opts.role ?? undefined);
  if (stored) return stored;
  const fallback = String(opts.fallbackInstitutionId || '').trim() || null;
  return fallback || PLATFORM_PRIMARY_INSTITUTION_ID;
}

export function resolveInstitutionIdForActor(opts: {
  role?: string | null;
  userInstitutionId?: string | null;
  activeInstitutionId?: string | null;
  fallbackId?: string | null;
}): string | null {
  return resolveTenantScopeInstitutionId({
    role: opts.role,
    userInstitutionId: opts.userInstitutionId,
    selectedInstitutionId: opts.activeInstitutionId,
    fallbackInstitutionId: opts.fallbackId
  });
}

export function pickInstitutionForActor(
  institutions: Institution[],
  opts: {
    role?: string | null;
    userInstitutionId?: string | null;
    activeInstitutionId?: string | null;
  }
): Institution | undefined {
  const fallbackId = userMaySwitchInstitution(opts.role ?? undefined)
    ? resolveSuperAdminDefaultInstitutionId(institutions)
    : institutions[0]?.id ?? null;
  const targetId = resolveInstitutionIdForActor({
    role: opts.role,
    userInstitutionId: opts.userInstitutionId,
    activeInstitutionId: opts.activeInstitutionId,
    fallbackId
  });
  if (targetId) {
    const match = institutions.find((i) => i.id === targetId);
    if (match) return match;
  }
  if (!userMaySwitchInstitution(opts.role ?? undefined) && opts.userInstitutionId) {
    const id = String(opts.userInstitutionId).trim();
    if (id) {
      return {
        id,
        name: 'Kurum yükleniyor…',
        email: '',
        isActive: true,
        createdAt: new Date().toISOString()
      };
    }
  }
  if (userMaySwitchInstitution(opts.role ?? undefined)) {
    const primary = institutions.find(isPrimaryOnlineVipInstitution);
    if (primary) return primary;
    const byId = institutions.find((i) => i.id === PLATFORM_PRIMARY_INSTITUTION_ID);
    if (byId) return byId;
  }
  return institutions[0];
}
