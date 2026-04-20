// Türkçe: Yetkilendirme Context'i - Supabase Entegrasyonlu
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout
    }}>
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