// Türkçe: Yetkilendirme Context'i - Supabase Entegrasyonlu
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Student } from '../types';
import { clearAuthToken, fetchPublicPost, setAuthToken, getAuthToken, peekJwtClaims, authLoginUnavailableMessage } from '../lib/session';
import { db } from '../lib/database';
import { studentRowToStudent } from '../lib/mapStudentRow';
import type { UserRow } from '../lib/userRowToSystemUser';
import { pinActiveInstitutionForUser, prepareInstitutionStorageForLogin, clearTenantSessionStorage } from '../lib/activeInstitutionScope';

// Demo mod - girişin her zaman çalışması için aktif
const USE_DEMO_MODE = true;

// Kullanıcı arayüzü
export interface SystemUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'super_admin' | 'admin' | 'coach' | 'teacher' | 'student';
  /** Sunucuda `users.roles`; arayüzde çoklu yetki için (ör. öğretmen + koç) */
  roles?: ('super_admin' | 'admin' | 'coach' | 'teacher' | 'student')[];
  studentId?: string;
  coachId?: string;
  institutionId?: string;
  package?: 'trial' | 'starter' | 'professional' | 'enterprise';
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  createdAt?: string;
}

interface AuthContextType {
  user: SystemUser | null;
  /** Oturumdaki kullanıcı (şimdilik `user` ile aynı; ileride taklit/linked ayrımı için). */
  effectiveUser: SystemUser | null;
  /** Sunucu JWT + my-student ile doldurulabilir; yoksa null. */
  linkedStudent: Student | null;
  linkedStudentError: string | null;
  linkedStudentLoading: boolean;
  refreshLinkedStudent: () => Promise<void>;
  isImpersonating: boolean;
  /** Taklidi sonlandırır; varsa dönülecek rota yolunu döner (ör. /students). */
  stopImpersonation: () => string | null;
  /** `string` = yerel/demo id; `SystemUser` = Kullanıcı Yönetimi’nden doğrudan satır (Supabase). */
  impersonate: (
    targetOrId: SystemUser | string
  ) => Promise<{ success: boolean; message?: string }>;
  canImpersonate: (target: SystemUser) => boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  getAllUsers: () => SystemUser[];
  getUserById: (id: string) => SystemUser | undefined;
  createUser: (
    data: Record<string, unknown>
  ) => Promise<{ success: boolean; message: string; userId?: string; passwordUsed?: string }>;
  updateUser: (id: string, data: Record<string, unknown>) => Promise<{ success: boolean; message: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; message: string }>;
  loginAsEmail: (
    email: string,
    roleHint?: SystemUser['role']
  ) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Demo kullanıcılar
const DEMO_USERS = [
  { email: 'admin@smartkocluk.com', password: 'Admin123!', name: 'Süper Admin', role: 'super_admin' as const },
  { email: 'admin@smartvip.com', password: 'admin123', name: 'Admin', role: 'admin' as const },
  { email: 'ogretmen@smartvip.com', password: 'ogretmen123', name: 'Öğretmen Koç', role: 'coach' as const },
  { email: 'ogrenci@smartvip.com', password: 'ogrenci123', name: 'Öğrenci', role: 'student' as const },
];

const TRIAL_USERS_STORAGE_KEY = 'coaching_trial_users';
const MANAGED_USERS_STORAGE_KEY = 'coaching_managed_users';
/** Taklit: gerçek oturum `coaching_user`; hedef profil burada */
const IMPERSONATION_STORAGE_KEY = 'coaching_impersonation';
/** Taklit öncesi sayfa — “Kendi hesabıma dön” ile geri dönülür */
export const IMPERSONATION_RETURN_PATH_KEY = 'coaching_impersonation_return';

export function canImpersonateRoles(
  actorRole: SystemUser['role'],
  targetRole: SystemUser['role']
): boolean {
  if (actorRole === 'super_admin') return targetRole !== 'super_admin';
  if (actorRole === 'admin')
    return targetRole === 'coach' || targetRole === 'teacher' || targetRole === 'student';
  if (actorRole === 'coach') return targetRole === 'student';
  return false;
}

type ManagedUserRecord = SystemUser & { password?: string };

type TrialUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'coach' | 'student';
  phone?: string;
  createdAt: string;
};

const getTrialUsersFromStorage = (): TrialUser[] => {
  try {
    const raw = localStorage.getItem(TRIAL_USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Deneme (trial) hesapları yalnızca koç paneline erişir — rolü koça sabitler */
export function applyTrialAccountCoachOnly(u: SystemUser): SystemUser {
  const isTrial = u.id?.startsWith('trial-');
  if (!isTrial) return u;
  if (u.role === 'admin' || u.role === 'super_admin' || u.role === 'teacher') return u;
  if (u.role === 'student') return { ...u, package: u.package || 'trial' };
  return { ...u, role: 'coach', package: u.package || 'trial' };
}

const migrateTrialUsersFileToCoach = () => {
  try {
    const list = getTrialUsersFromStorage();
    if (list.length === 0) return;
    const next = list.map(t => ({ ...t, role: 'coach' as const }));
    localStorage.setItem(TRIAL_USERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
};

const readManagedUsers = (): ManagedUserRecord[] => {
  try {
    const raw = localStorage.getItem(MANAGED_USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeManagedUsers = (list: ManagedUserRecord[]) => {
  localStorage.setItem(MANAGED_USERS_STORAGE_KEY, JSON.stringify(list));
};

const demoUsersAsSystemUsers = (): SystemUser[] =>
  DEMO_USERS.map((d, i) => ({
    id: `demo-seed-${i}-${d.role}`,
    name: d.name,
    email: d.email,
    role: d.role,
    isActive: true,
    package: 'enterprise',
    createdAt: new Date().toISOString()
  }));

const AUTH_TIMEOUT_MS = 8000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs = AUTH_TIMEOUT_MS): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AUTH_TIMEOUT')), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

/** students.id — önce users.id FK, sonra e-posta+kurum (çift kartta user_id eşleşmesi). */
async function resolveStudentTableIdForUserLogin(dbUser: {
  id: string;
  email: string;
  institution_id?: string | null;
}): Promise<string | undefined> {
  const normalizedEmail = String(dbUser.email || '').toLowerCase().trim();
  if (!normalizedEmail) return undefined;

  const { data: byUserFk } = await withTimeout(
    supabase.from('students').select('id').eq('user_id', dbUser.id).maybeSingle()
  );
  if (byUserFk?.id) return byUserFk.id;

  const { data: byPlatform } = await withTimeout(
    supabase.from('students').select('id').eq('platform_user_id', dbUser.id).maybeSingle()
  );
  if (byPlatform?.id) return byPlatform.id;

  let q = supabase
    .from('students')
    .select('id, user_id, updated_at')
    .eq('email', normalizedEmail)
    .order('updated_at', { ascending: false });
  if (dbUser.institution_id) {
    q = q.eq('institution_id', dbUser.institution_id);
  }
  let { data: rows } = await withTimeout(q);
  if ((!rows || rows.length === 0) && dbUser.institution_id) {
    ({ data: rows } = await withTimeout(
      supabase
        .from('students')
        .select('id, user_id, updated_at')
        .eq('email', normalizedEmail)
        .order('updated_at', { ascending: false })
    ));
  }
  if (rows?.length === 1 && rows[0]?.id) return rows[0].id;
  if (rows && rows.length > 1) {
    const linked = rows.find((r) => r.user_id && String(r.user_id) === String(dbUser.id));
    if (linked?.id) return linked.id;
    const anyLinked = rows.find((r) => r.user_id);
    if (anyLinked?.id) return anyLinked.id;
    if (rows[0]?.id) return rows[0].id;
  } else if (rows?.[0]?.id) {
    return rows[0].id;
  }

  return undefined;
}

type AuthLoginUserPayload = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: SystemUser['role'];
  studentId?: string;
  coachId?: string;
  institutionId?: string;
  package?: SystemUser['package'];
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  createdAt?: string;
};

function serverAuthTokenFailureMessage(authLoginStatus?: number, retryHint = false): string {
  const api404 = authLoginStatus != null ? authLoginUnavailableMessage(authLoginStatus) : null;
  if (api404) return api404;
  if (retryHint) {
    return 'Sunucu oturumu oluşturulamadı (auth-login). Lütfen tekrar deneyin; sorun sürerse yöneticiye bildirin.';
  }
  return 'Sunucu oturumu oluşturulamadı (auth-login). Ağ veya API yapılandırmasını kontrol edin.';
}

/**
 * Vercel `/api/*` ile aynı JWT + auth-login `user` gövdesini birleştirir (coachId / studentId UI ve backend ile uyumlu kalsın).
 */
async function syncServerAuthToken(
  email: string,
  password: string,
  baseUser: SystemUser
): Promise<{ user: SystemUser; tokenStored: boolean; authLoginStatus?: number }> {
  try {
    const res = await fetchPublicPost('/api/auth-login', { email, password });
    if (!res.ok) return { user: baseUser, tokenStored: false, authLoginStatus: res.status };
    const body = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: AuthLoginUserPayload;
    };
    let tokenStored = false;
    if (body?.token && typeof body.token === 'string') {
      setAuthToken(body.token);
      tokenStored = true;
    }
    const u = body?.user;
    if (!u) return { user: baseUser, tokenStored };

    const merged = applyTrialAccountCoachOnly({
      ...baseUser,
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone ?? baseUser.phone,
      role: u.role,
      studentId: u.studentId ?? baseUser.studentId,
      coachId: u.coachId ?? baseUser.coachId,
      institutionId: u.institutionId ?? baseUser.institutionId,
      package: u.package ?? baseUser.package,
      startDate: u.startDate ?? baseUser.startDate,
      endDate: u.endDate ?? baseUser.endDate,
      isActive: u.isActive ?? baseUser.isActive,
      createdAt: u.createdAt ?? baseUser.createdAt
    });
    return { user: merged, tokenStored };
  } catch {
    return { user: baseUser, tokenStored: false };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SystemUser | null>(null);
  const [impersonationTarget, setImpersonationTarget] = useState<SystemUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [linkedStudent, setLinkedStudent] = useState<Student | null>(null);
  const [linkedStudentError, setLinkedStudentError] = useState<string | null>(null);
  const [linkedStudentLoading, setLinkedStudentLoading] = useState(false);

  const effectiveUser = impersonationTarget
    ? applyTrialAccountCoachOnly(impersonationTarget)
    : user;
  const isImpersonating = impersonationTarget !== null;

  const refreshLinkedStudent = useCallback(async () => {
    const u = impersonationTarget ?? user;
    if (!u || !getAuthToken()) {
      setLinkedStudent(null);
      setLinkedStudentError(null);
      setLinkedStudentLoading(false);
      return;
    }
    const tags = u.roles?.length ? u.roles : [u.role];
    if (!tags.includes('student')) {
      setLinkedStudent(null);
      setLinkedStudentError(null);
      setLinkedStudentLoading(false);
      return;
    }
    setLinkedStudentLoading(true);
    setLinkedStudentError(null);
    try {
      let row = await db.getMyStudent();
      if (row) {
        const st = studentRowToStudent(row);
        setLinkedStudent(st);
        const next = { ...u, studentId: st.id };
        if (impersonationTarget) setImpersonationTarget(next);
        else {
          setUser(next);
          localStorage.setItem('coaching_user', JSON.stringify(next));
        }
      } else {
        setLinkedStudent(null);
        setLinkedStudentError(
          'Öğrenci profili oluşturulamadı. Çıkış yapıp tekrar giriş yapın veya yöneticinize başvurun.'
        );
      }
    } catch (e) {
      setLinkedStudent(null);
      setLinkedStudentError(e instanceof Error ? e.message : 'Öğrenci profili yüklenemedi');
    } finally {
      setLinkedStudentLoading(false);
    }
  }, [user, impersonationTarget]);

  useEffect(() => {
    void refreshLinkedStudent();
  }, [refreshLinkedStudent]);

  /** Profil henüz yoksa birkaç kez otomatik dene (sunucu kart oluştururken gecikme) */
  useEffect(() => {
    const u = impersonationTarget ?? user;
    if (!u || !getAuthToken()) return;
    const tags = u.roles?.length ? u.roles : [u.role];
    if (!tags.includes('student')) return;
    if (linkedStudent || linkedStudentLoading) return;

    let cancelled = false;
    let attempt = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = () => {
      if (cancelled || attempt >= 4) return;
      attempt += 1;
      const t = setTimeout(() => {
        if (!cancelled) void refreshLinkedStudent();
      }, attempt * 1500);
      timers.push(t);
    };

    schedule();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [user, impersonationTarget, linkedStudent, linkedStudentLoading, refreshLinkedStudent]);

  // Sayfa yüklendiğinde oturum kontrolü
  useEffect(() => {
    migrateTrialUsersFileToCoach();

    const checkSession = () => {
      try {
        const savedUser = localStorage.getItem('coaching_user');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.id && parsed.email) {
            let normalized = applyTrialAccountCoachOnly(parsed as SystemUser);
            const jwtSub = peekJwtClaims(getAuthToken())?.sub;
            if (jwtSub && jwtSub !== 'anonymous' && normalized.id !== jwtSub) {
              normalized = { ...normalized, id: jwtSub };
            }
            /** Öğrenci API’leri JWT ister; token yoksa eski oturumu yükleme (my-student 403 / boş analiz) */
            if (String(normalized.role || '').toLowerCase() === 'student' && !getAuthToken()) {
              localStorage.removeItem('coaching_user');
            } else {
            setUser(normalized);
            pinActiveInstitutionForUser(normalized.institutionId, normalized.role);
            if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
              localStorage.setItem('coaching_user', JSON.stringify(normalized));
            }

            const rawImp = localStorage.getItem(IMPERSONATION_STORAGE_KEY);
            if (rawImp) {
              try {
                const imp = JSON.parse(rawImp) as SystemUser;
                if (
                  imp?.email &&
                  imp?.role &&
                  canImpersonateRoles(normalized.role, imp.role)
                ) {
                  setImpersonationTarget(applyTrialAccountCoachOnly(imp));
                } else {
                  localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATION_RETURN_PATH_KEY);
                }
              } catch {
                localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATION_RETURN_PATH_KEY);
              }
            }
            }
          }
        }
      } catch (e) {
        console.error('Oturum kontrolü hatası:', e);
      }
      setIsLoading(false);
    };

    checkSession();
    return () => {};
  }, []);

  // Giriş yap
  const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    const getServerLoginErrorMessage = async (res: Response): Promise<string | null> => {
      try {
        const payload = await res.json();
        const err = String(payload?.error || '').trim();
        if (err === 'pending_approval') return 'Kaydınız alındı. Yönetici onayı sonrası giriş yapabilirsiniz.';
        if (err === 'inactive_user') return 'Hesabınız pasif durumda. Lütfen yöneticinizle iletişime geçin.';
      } catch {
        /* ignore */
      }
      return null;
    };

    setImpersonationTarget(null);
    localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATION_RETURN_PATH_KEY);
    localStorage.removeItem('coaching_active_organization');
    prepareInstitutionStorageForLogin(null);

    const normalizedEmail = email.toLowerCase().trim();

    // 1) Demo kullanıcılar - her zaman hızlı fallback
    const demoUser = DEMO_USERS.find(
      u => u.email.toLowerCase() === normalizedEmail && u.password === password
    );
    if (demoUser) {
      const userData: SystemUser = {
        id: `demo-${demoUser.role}`,
        name: demoUser.name,
        email: demoUser.email,
        role: demoUser.role,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      const { user: merged, tokenStored, authLoginStatus } = await syncServerAuthToken(demoUser.email, demoUser.password, userData);
      if (!tokenStored) {
        return {
          success: false,
          message: serverAuthTokenFailureMessage(authLoginStatus)
        };
      }
      localStorage.setItem('coaching_user', JSON.stringify(merged));
      pinActiveInstitutionForUser(merged.institutionId, merged.role);
      setUser(merged);
      return { success: true, message: 'Giriş başarılı!' };
    }

    // 2) Ücretsiz deneme ile oluşturulan local hesaplar
    const trialUser = getTrialUsersFromStorage().find(
      u => u.email.toLowerCase() === normalizedEmail && u.password === password
    );
    if (trialUser) {
      const userData = applyTrialAccountCoachOnly({
        id: trialUser.id,
        name: trialUser.name,
        email: trialUser.email,
        role: 'coach',
        phone: trialUser.phone,
        isActive: true,
        package: 'trial',
        createdAt: trialUser.createdAt
      });
      localStorage.setItem('coaching_user', JSON.stringify(userData));
      setUser(userData);
      return { success: true, message: 'Giriş başarılı!' };
    }

    // 3) Supabase önce: öğrenci/koç paneli için studentId & coachId burada bağlanır
    let supabaseFailed = false;
    try {
      const { data: dbUser, error } = await withTimeout(
        supabase
          .from('users')
          .select('*')
          .eq('email', normalizedEmail)
          .single()
      );

      if (!error && dbUser && dbUser.password_hash === password) {
        if (dbUser.is_active === false) {
          return { success: false, message: 'Hesabınız askıya alınmış.' };
        }

        let studentId: string | undefined;
        let coachId: string | undefined;

        if (dbUser.role === 'student') {
          studentId = await resolveStudentTableIdForUserLogin({
            id: dbUser.id,
            email: dbUser.email,
            institution_id: dbUser.institution_id
          });
        } else if (dbUser.role === 'coach' || dbUser.role === 'teacher') {
          let { data: coachRow } = await withTimeout(
            supabase.from('coaches').select('id').eq('email', normalizedEmail).maybeSingle()
          );
          if (!coachRow?.id) {
            ({ data: coachRow } = await withTimeout(
              supabase.from('coaches').select('id').ilike('email', normalizedEmail).maybeSingle()
            ));
          }
          coachId = coachRow?.id;
        }

        const userData = applyTrialAccountCoachOnly({
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
          phone: dbUser.phone,
          studentId,
          coachId,
          institutionId: dbUser.institution_id || undefined,
          package: dbUser.package || undefined,
          startDate: dbUser.start_date || undefined,
          endDate: dbUser.end_date || undefined,
          isActive: dbUser.is_active,
          createdAt: dbUser.created_at
        });

        const { user: merged, tokenStored, authLoginStatus } = await syncServerAuthToken(
          String(dbUser.email || normalizedEmail).toLowerCase().trim(),
          password,
          userData
        );
        if (!tokenStored) {
          return {
            success: false,
            message: serverAuthTokenFailureMessage(authLoginStatus, true)
          };
        }
        localStorage.setItem('coaching_user', JSON.stringify(merged));
        pinActiveInstitutionForUser(merged.institutionId, merged.role);
        setUser(merged);
        return { success: true, message: 'Giriş başarılı!' };
      }
      if (error) {
        try {
          const res = await fetchPublicPost('/api/auth-login', { email: normalizedEmail, password });
          if (!res.ok) {
            const api404 = authLoginUnavailableMessage(res.status);
            if (api404) return { success: false, message: api404 };
            const serverMessage = await getServerLoginErrorMessage(res);
            if (serverMessage) return { success: false, message: serverMessage };
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      supabaseFailed = true;
      if (e instanceof Error && e.message === 'AUTH_TIMEOUT') {
        if (!USE_DEMO_MODE) {
          return { success: false, message: 'Giriş isteği zaman aşımına uğradı. Lütfen tekrar deneyin.' };
        }
      } else if (!USE_DEMO_MODE) {
        return { success: false, message: 'Giriş sırasında bir hata oluştu. Lütfen tekrar deneyin.' };
      }
    }

    // 4) Kullanıcı yönetimi yerel listesi (sunucu cevap vermezse veya satır yoksa yedek)
    const managed = readManagedUsers().find(
      u => u.email.toLowerCase() === normalizedEmail && u.password === password
    );
    if (managed) {
      const { password: _pw, ...pub } = managed;
      let studentId = pub.studentId;
      let coachId = pub.coachId;
      try {
        if (managed.role === 'student' && !studentId) {
          const { data: userRow } = await withTimeout(
            supabase
              .from('users')
              .select('id, email, institution_id')
              .eq('email', normalizedEmail)
              .maybeSingle()
          );
          if (userRow) {
            studentId = await resolveStudentTableIdForUserLogin({
              id: userRow.id,
              email: String(userRow.email || normalizedEmail),
              institution_id: userRow.institution_id ?? pub.institutionId ?? null
            });
          } else {
            let q = supabase.from('students').select('id').eq('email', normalizedEmail);
            if (pub.institutionId) q = q.eq('institution_id', pub.institutionId);
            const { data: sr } = await withTimeout(q.maybeSingle());
            studentId = sr?.id;
          }
        } else if ((managed.role === 'coach' || managed.role === 'teacher') && !coachId) {
          let { data: coachRow } = await withTimeout(
            supabase.from('coaches').select('id').eq('email', normalizedEmail).maybeSingle()
          );
          if (!coachRow?.id) {
            ({ data: coachRow } = await withTimeout(
              supabase.from('coaches').select('id').ilike('email', normalizedEmail).maybeSingle()
            ));
          }
          coachId = coachRow?.id;
        }
      } catch {
        /* yoksay */
      }
      const userData = applyTrialAccountCoachOnly({ ...pub, studentId, coachId });
      const { user: merged, tokenStored, authLoginStatus } = await syncServerAuthToken(normalizedEmail, password, userData);
      if (!tokenStored) {
        return {
          success: false,
          message: serverAuthTokenFailureMessage(authLoginStatus, true)
        };
      }
      localStorage.setItem('coaching_user', JSON.stringify(merged));
      pinActiveInstitutionForUser(merged.institutionId, merged.role);
      setUser(merged);
      return { success: true, message: 'Giriş başarılı!' };
    }

    if (supabaseFailed && USE_DEMO_MODE) {
      try {
        const res = await fetchPublicPost('/api/auth-login', { email: normalizedEmail, password });
        if (!res.ok) {
          const api404 = authLoginUnavailableMessage(res.status);
          if (api404) return { success: false, message: api404 };
          const serverMessage = await getServerLoginErrorMessage(res);
          if (serverMessage) return { success: false, message: serverMessage };
        }
      } catch {
        /* ignore */
      }
      return { success: false, message: 'Sunucuya ulaşılamadı. Demo/deneme hesabı ile giriş yapabilirsiniz.' };
    }
    return { success: false, message: 'E-posta veya şifre hatalı!' };
  };

  // Çıkış yap
  const logout = () => {
    localStorage.removeItem('coaching_user');
    localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATION_RETURN_PATH_KEY);
    localStorage.removeItem('coaching_active_organization');
    prepareInstitutionStorageForLogin(null);
    clearAuthToken();
    setUser(null);
    setImpersonationTarget(null);
  };

  const userRowToLoginTarget = (row: UserRow): SystemUser => {
    const rawRoles = Array.isArray((row as { roles?: string[] }).roles)
      ? ((row as { roles?: string[] }).roles || [])
          .map((x) => String(x || '').trim())
          .filter(Boolean)
      : [];
    const rolesList = (
      rawRoles.length > 0 ? [...new Set(rawRoles)] : [String(row.role || 'student')]
    ) as SystemUser['role'][];
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: (row.role || rolesList[0] || 'student') as SystemUser['role'],
      roles: rolesList,
      phone: row.phone || undefined,
      institutionId: row.institution_id || undefined,
      package: row.package ?? undefined,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      isActive: row.is_active,
      createdAt: row.created_at
    };
  };

  const finalizeImpersonation = useCallback(
    async (
      target: SystemUser,
      roleHint?: SystemUser['role']
    ): Promise<{ success: boolean; message: string }> => {
      if (!user) return { success: false, message: 'Önce giriş yapın.' };
      if (roleHint) {
        const tags = target.roles?.length ? target.roles : [target.role];
        if (!tags.includes(roleHint) && target.role !== roleHint) {
          return { success: false, message: 'Hedef rol doğrulanamadı.' };
        }
      }
      if (!canImpersonateRoles(user.role, target.role)) {
        return { success: false, message: 'Bu hesaba geçiş yetkiniz yok.' };
      }

      const normalized = target.email.toLowerCase().trim();
      if (user.role === 'coach' && target.role === 'student') {
        const actorCoachId =
          user.coachId ||
          (
            await withTimeout(
              supabase.from('coaches').select('id').eq('email', user.email.toLowerCase().trim()).maybeSingle()
            )
          ).data?.id;
        const targetStudent = await withTimeout(
          supabase.from('students').select('id,coach_id').eq('email', normalized).maybeSingle()
        );
        if (!targetStudent.data?.id || targetStudent.data.coach_id !== actorCoachId) {
          return { success: false, message: 'Sadece kendi öğrencinize geçiş yapabilirsiniz.' };
        }
      }

      let hydratedTarget = target;
      try {
        hydratedTarget = await enrichRoleLinks(target);
      } catch {
        hydratedTarget = target;
      }
      const hydrated = applyTrialAccountCoachOnly(hydratedTarget);
      if (typeof window !== 'undefined') {
        const path = `${window.location.pathname}${window.location.search}`;
        if (path && !path.startsWith('/login')) {
          localStorage.setItem(IMPERSONATION_RETURN_PATH_KEY, path);
        }
      }
      setImpersonationTarget(hydrated);
      localStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(hydrated));
      pinActiveInstitutionForUser(hydrated.institutionId, hydrated.role);
      return { success: true, message: `${hydrated.name} hesabına geçiş yapıldı.` };
    },
    [user]
  );

  const enrichRoleLinks = async (u: SystemUser): Promise<SystemUser> => {
    const email = u.email.toLowerCase().trim();
    if (u.role === 'student') {
      const { data: userRow } = await withTimeout(
        supabase.from('users').select('id, email, institution_id').eq('id', u.id).maybeSingle()
      );
      if (userRow?.email) {
        const sid = await resolveStudentTableIdForUserLogin({
          id: userRow.id,
          email: String(userRow.email),
          institution_id: userRow.institution_id
        });
        if (sid) return { ...u, studentId: sid };
      }
      const sidLoose = await resolveStudentTableIdForUserLogin({
        id: u.id,
        email,
        institution_id: u.institutionId ?? null
      });
      if (sidLoose) return { ...u, studentId: sidLoose };
    }
    if (u.role === 'coach') {
      let { data: coachRow } = await withTimeout(
        supabase.from('coaches').select('id').eq('email', email).maybeSingle()
      );
      if (!coachRow?.id) {
        ({ data: coachRow } = await withTimeout(
          supabase.from('coaches').select('id').ilike('email', email).maybeSingle()
        ));
      }
      return { ...u, coachId: coachRow?.id || u.coachId };
    }
    return u;
  };

  const loginAsEmail = useCallback(
    async (
      email: string,
      roleHint?: SystemUser['role']
    ): Promise<{ success: boolean; message: string }> => {
      try {
        if (!user) return { success: false, message: 'Önce giriş yapın.' };
        const normalized = email.toLowerCase().trim();
        if (!normalized) return { success: false, message: 'Geçersiz e-posta.' };

        let target: SystemUser | null = null;

        const demo = DEMO_USERS.find((d) => d.email.toLowerCase() === normalized);
        if (demo) {
          target = {
            id: `demo-${demo.role}`,
            name: demo.name,
            email: demo.email,
            role: demo.role,
            isActive: true,
            createdAt: new Date().toISOString()
          };
        }

        /** Kullanıcı listesi API ile gelir; istemci Supabase RLS ile `users` okuyamayabilir */
        if (!target && getAuthToken()) {
          try {
            const row = await db.getUserByEmail(normalized);
            if (row) target = userRowToLoginTarget(row);
          } catch {
            /* yoksay */
          }
        }

        if (!target) {
          try {
            const { data: dbUser, error } = await withTimeout(
              supabase.from('users').select('*').eq('email', normalized).maybeSingle()
            );
            if (!error && dbUser) {
              target = userRowToLoginTarget(dbUser as UserRow);
            }
          } catch {
            /* yoksay */
          }
        }

        if (!target) {
          const local = readManagedUsers().find((x) => x.email.toLowerCase() === normalized);
          if (local) {
            const { password: _pw, ...pub } = local;
            target = pub;
          }
        }

        if (!target && roleHint === 'student') {
          try {
            const { data: st } = await withTimeout(
              supabase
                .from('students')
                .select('id,name,email,phone,institution_id,created_at')
                .eq('email', normalized)
                .maybeSingle()
            );
            if (st) {
              target = {
                id: `student-fallback-${st.id}`,
                name: st.name,
                email: st.email,
                phone: st.phone || undefined,
                role: 'student',
                studentId: st.id,
                institutionId: st.institution_id || undefined,
                isActive: true,
                createdAt: st.created_at
              };
            }
          } catch {
            /* yoksay */
          }
        }
        if (!target && roleHint === 'coach') {
          try {
            const { data: ch } = await withTimeout(
              supabase
                .from('coaches')
                .select('id,name,email,phone,institution_id,created_at')
                .eq('email', normalized)
                .maybeSingle()
            );
            if (ch) {
              target = {
                id: `coach-fallback-${ch.id}`,
                name: ch.name,
                email: ch.email,
                phone: ch.phone || undefined,
                role: 'coach',
                coachId: ch.id,
                institutionId: ch.institution_id || undefined,
                isActive: true,
                createdAt: ch.created_at
              };
            }
          } catch {
            /* yoksay */
          }
        }

        if (!target) return { success: false, message: 'Hedef kullanıcı bulunamadı.' };
        return finalizeImpersonation(target, roleHint);
      } catch (e) {
        return {
          success: false,
          message: e instanceof Error ? e.message : 'Hesap geçişi sırasında hata oluştu.'
        };
      }
    },
    [user, finalizeImpersonation]
  );

  const getAllUsers = useCallback((): SystemUser[] => {
    const demos = demoUsersAsSystemUsers();
    const demoEmails = new Set(demos.map(u => u.email.toLowerCase()));
    const managed = readManagedUsers().map(({ password: _p, ...rest }) => rest as SystemUser);
    return [...demos, ...managed.filter(u => !demoEmails.has(u.email.toLowerCase()))];
  }, []);

  const getUserById = useCallback(
    (id: string): SystemUser | undefined => getAllUsers().find(u => u.id === id),
    [getAllUsers]
  );

  const canImpersonate = useCallback(
    (target: SystemUser) => {
      if (!user) return false;
      return canImpersonateRoles(user.role, target.role);
    },
    [user]
  );

  const impersonate = useCallback(
    async (
      targetOrId: SystemUser | string
    ): Promise<{ success: boolean; message?: string }> => {
      if (typeof targetOrId === 'object' && targetOrId !== null && 'email' in targetOrId) {
        const row = targetOrId;
        if (!row.email?.trim()) {
          return { success: false, message: 'Kullanıcı bulunamadı.' };
        }
        if (!row.id.startsWith('demo-')) {
          const r = await finalizeImpersonation(row, row.role);
          return { success: r.success, message: r.message };
        }
      }
      const target =
        typeof targetOrId === 'object' && targetOrId !== null && 'email' in targetOrId
          ? targetOrId
          : getUserById(String(targetOrId));
      if (!target?.email?.trim()) {
        return { success: false, message: 'Kullanıcı bulunamadı.' };
      }
      const r = await loginAsEmail(target.email.trim(), target.role);
      return { success: r.success, message: r.message };
    },
    [getUserById, loginAsEmail, finalizeImpersonation]
  );

  const stopImpersonation = useCallback((): string | null => {
    const back =
      typeof window !== 'undefined'
        ? localStorage.getItem(IMPERSONATION_RETURN_PATH_KEY)
        : null;
    setImpersonationTarget(null);
    localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATION_RETURN_PATH_KEY);
    localStorage.removeItem(IMPERSONATION_RETURN_PATH_KEY);
    return back;
  }, []);

  const createUser = useCallback(
    async (
      data: Record<string, unknown>
    ): Promise<{ success: boolean; message: string; userId?: string; passwordUsed?: string }> => {
      const email = String(data.email || '')
        .trim()
        .toLowerCase();
      if (!email) return { success: false, message: 'E-posta gerekli.' };

      if (getAllUsers().some(u => u.email.toLowerCase() === email)) {
        return { success: false, message: 'Bu e-posta zaten kayıtlı.' };
      }

      const id = `mu-${Date.now()}`;
      const pwd = typeof data.password === 'string' && data.password.length >= 6 ? data.password : `Sk${Date.now().toString().slice(-6)}!`;

      let role = (data.role as SystemUser['role']) || 'student';
      if (role === 'super_admin') role = 'admin';

      const rec: ManagedUserRecord = {
        id,
        name: String(data.name || '').trim() || 'Kullanıcı',
        email,
        phone: typeof data.phone === 'string' ? data.phone : undefined,
        role,
        package: (data.package as SystemUser['package']) || 'trial',
        startDate: typeof data.startDate === 'string' ? data.startDate : undefined,
        endDate: typeof data.endDate === 'string' ? data.endDate : undefined,
        isActive: data.isActive !== false,
        createdAt: new Date().toISOString(),
        password: pwd
      };

      writeManagedUsers([...readManagedUsers(), rec]);
      return { success: true, message: 'Kullanıcı oluşturuldu.', userId: id, passwordUsed: pwd };
    },
    [getAllUsers]
  );

  const updateUser = useCallback(
    async (id: string, data: Record<string, unknown>): Promise<{ success: boolean; message: string }> => {
      if (id.startsWith('demo-seed-')) {
        return { success: false, message: 'Demo hesapları düzenlenemez.' };
      }
      const list = readManagedUsers();
      const ix = list.findIndex(u => u.id === id);
      if (ix === -1) return { success: false, message: 'Kullanıcı bulunamadı.' };

      const cur = list[ix];
      const next: ManagedUserRecord = {
        ...cur,
        name: typeof data.name === 'string' ? data.name : cur.name,
        email: typeof data.email === 'string' ? data.email.trim().toLowerCase() : cur.email,
        phone: typeof data.phone === 'string' ? data.phone : cur.phone,
        role: (data.role as SystemUser['role']) || cur.role,
        package: (data.package as SystemUser['package']) || cur.package,
        startDate: typeof data.startDate === 'string' ? data.startDate : cur.startDate,
        endDate: typeof data.endDate === 'string' ? data.endDate : cur.endDate,
        isActive: typeof data.isActive === 'boolean' ? data.isActive : cur.isActive,
        studentId: typeof data.studentId === 'string' ? data.studentId : cur.studentId,
        coachId: typeof data.coachId === 'string' ? data.coachId : cur.coachId
      };
      if (typeof data.password === 'string' && data.password.length >= 6) {
        next.password = data.password;
      }

      const nextList = [...list];
      nextList[ix] = next;
      writeManagedUsers(nextList);

      if (typeof data.password === 'string' && data.password.length >= 6) {
        try {
          const { data: row } = await supabase.from('users').select('id').eq('email', next.email).maybeSingle();
          if (row?.id) {
            await supabase.from('users').update({ password_hash: data.password }).eq('id', row.id);
          }
        } catch {
          /* yoksay */
        }
      }

      return { success: true, message: 'Güncellendi.' };
    },
    []
  );

  const deleteUser = useCallback(async (id: string): Promise<{ success: boolean; message: string }> => {
    if (id.startsWith('demo-seed-')) {
      return { success: false, message: 'Demo hesapları silinemez.' };
    }
    const list = readManagedUsers().filter(u => u.id !== id);
    if (list.length === readManagedUsers().length) {
      return { success: false, message: 'Kullanıcı bulunamadı.' };
    }
    writeManagedUsers(list);
    return { success: true, message: 'Silindi.' };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        effectiveUser,
        linkedStudent,
        linkedStudentError,
        linkedStudentLoading,
        refreshLinkedStudent,
        isImpersonating,
        stopImpersonation,
        impersonate,
        canImpersonate,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        getAllUsers,
        getUserById,
        createUser,
        updateUser,
        deleteUser,
        loginAsEmail
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}