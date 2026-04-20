// Türkçe: Yetkilendirme Context'i - Supabase Entegrasyonlu
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

// Demo mod - sadece veritabanı erişimi başarısız olursa fallback
const USE_DEMO_MODE = false;

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

    // Supabase ile giriş
    try {
      const { data: dbUser, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .single();

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
        const { data: studentRow } = await supabase
          .from('students')
          .select('id')
          .eq('email', normalizedEmail)
          .maybeSingle();
        studentId = studentRow?.id;
      } else if (dbUser.role === 'coach') {
        const { data: coachRow } = await supabase
          .from('coaches')
          .select('id')
          .eq('email', normalizedEmail)
          .maybeSingle();
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
      // Hata olursa demo moda düş
      if (!USE_DEMO_MODE) {
        return { success: false, message: 'Giriş sırasında bir hata oluştu. Lütfen tekrar deneyin.' };
      }
      const foundUser = DEMO_USERS.find(
        u => u.email.toLowerCase() === normalizedEmail && u.password === password
      );

      if (foundUser) {
        const userData: SystemUser = {
          id: `demo-${foundUser.role}`,
          name: foundUser.name,
          email: foundUser.email,
          role: foundUser.role,
          isActive: true,
          createdAt: new Date().toISOString()
        };
        localStorage.setItem('coaching_user', JSON.stringify(userData));
        setUser(userData);
        return { success: true, message: 'Giriş başarılı!' };
      }
      return { success: false, message: 'E-posta veya şifre hatalı!' };
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