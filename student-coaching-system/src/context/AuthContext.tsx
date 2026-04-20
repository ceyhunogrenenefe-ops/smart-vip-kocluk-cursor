// Türkçe: Yetkilendirme Context'i - Supabase Entegrasyonlu
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

// Demo mod - girişin her zaman çalışması için aktif
const USE_DEMO_MODE = true;

// Kullanıcı arayüzü
export interface SystemUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'super_admin' | 'admin' | 'coach' | 'student';
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
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  getAllUsers: () => SystemUser[];
  getUserById: (id: string) => SystemUser | undefined;
  createUser: (data: Record<string, unknown>) => Promise<{ success: boolean; message: string; userId?: string }>;
  updateUser: (id: string, data: Record<string, unknown>) => Promise<{ success: boolean; message: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; message: string }>;
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

const AUTH_TIMEOUT_MS = 12000;

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SystemUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sayfa yüklendiğinde oturum kontrolü
  useEffect(() => {
    const checkSession = () => {
      try {
        // localStorage'dan oturum kontrolü
        const savedUser = localStorage.getItem('coaching_user');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.id && parsed.email) {
            setUser(parsed);
          }
        }
      } catch (e) {
        console.error('Oturum kontrolü hatası:', e);
      }
      setIsLoading(false);
    };

    // Kısa bir gecikme ile kontrol et (UI render için)
    const timer = setTimeout(checkSession, 100);
    return () => clearTimeout(timer);
  }, []);

  // Giriş yap
  const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
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
      localStorage.setItem('coaching_user', JSON.stringify(userData));
      setUser(userData);
      return { success: true, message: 'Giriş başarılı!' };
    }

    // 2) Ücretsiz deneme ile oluşturulan local hesaplar
    const trialUser = getTrialUsersFromStorage().find(
      u => u.email.toLowerCase() === normalizedEmail && u.password === password
    );
    if (trialUser) {
      const userData: SystemUser = {
        id: trialUser.id,
        name: trialUser.name,
        email: trialUser.email,
        role: trialUser.role,
        phone: trialUser.phone,
        isActive: true,
        package: 'trial',
        createdAt: trialUser.createdAt
      };
      localStorage.setItem('coaching_user', JSON.stringify(userData));
      setUser(userData);
      return { success: true, message: 'Giriş başarılı!' };
    }

    // 3) Kullanıcı yönetiminden oluşturulan yerel hesaplar
    const managed = readManagedUsers().find(
      u => u.email.toLowerCase() === normalizedEmail && u.password === password
    );
    if (managed) {
      const { password: _pw, ...pub } = managed;
      const userData: SystemUser = { ...pub };
      localStorage.setItem('coaching_user', JSON.stringify(userData));
      setUser(userData);
      return { success: true, message: 'Giriş başarılı!' };
    }

    // Supabase ile giriş
    try {
      const { data: dbUser, error } = await withTimeout(
        supabase
          .from('users')
          .select('*')
          .eq('email', normalizedEmail)
          .single()
      );

      if (error || !dbUser) {
        return { success: false, message: 'E-posta veya şifre hatalı!' };
      }

      if (dbUser.password_hash !== password) {
        return { success: false, message: 'E-posta veya şifre hatalı!' };
      }

      if (dbUser.is_active === false) {
        return { success: false, message: 'Hesabınız askıya alınmış.' };
      }

      let studentId: string | undefined;
      let coachId: string | undefined;

      if (dbUser.role === 'student') {
        const { data: studentRow } = await withTimeout(
          supabase
            .from('students')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle()
        );
        studentId = studentRow?.id;
      } else if (dbUser.role === 'coach') {
        const { data: coachRow } = await withTimeout(
          supabase
            .from('coaches')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle()
        );
        coachId = coachRow?.id;
      }

      const userData: SystemUser = {
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
      };

      localStorage.setItem('coaching_user', JSON.stringify(userData));
      setUser(userData);
      return { success: true, message: 'Giriş başarılı!' };
    } catch (e) {
      if (e instanceof Error && e.message === 'AUTH_TIMEOUT') {
        if (USE_DEMO_MODE) {
          return { success: false, message: 'Sunucuya ulaşılamadı. Demo/deneme hesabı ile giriş yapabilirsiniz.' };
        }
        return { success: false, message: 'Giriş isteği zaman aşımına uğradı. Lütfen tekrar deneyin.' };
      }
      // Hata olursa demo moda düş
      if (!USE_DEMO_MODE) {
        return { success: false, message: 'Giriş sırasında bir hata oluştu. Lütfen tekrar deneyin.' };
      }
      return { success: false, message: 'Sunucu hatası. Demo/deneme hesabı ile tekrar deneyin.' };
    }
  };

  // Çıkış yap
  const logout = () => {
    localStorage.removeItem('coaching_user');
    setUser(null);
  };

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

  const createUser = useCallback(
    async (data: Record<string, unknown>): Promise<{ success: boolean; message: string; userId?: string }> => {
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
      return { success: true, message: 'Kullanıcı oluşturuldu.', userId: id };
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
        isActive: typeof data.isActive === 'boolean' ? data.isActive : cur.isActive
      };
      if (typeof data.password === 'string' && data.password.length >= 6) {
        next.password = data.password;
      }

      const nextList = [...list];
      nextList[ix] = next;
      writeManagedUsers(nextList);
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
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        getAllUsers,
        getUserById,
        createUser,
        updateUser,
        deleteUser
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