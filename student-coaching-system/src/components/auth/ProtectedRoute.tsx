// Türkçe: Korumalı Route Bileşeni
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole } from '../../config/rolePermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('super_admin' | 'admin' | 'coach' | 'teacher' | 'student')[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { effectiveUser, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  /** Oturum localStorage'dan okunmadan yanlışlıkla login’e düşmesin / yeni sekmede prefetch URL doğru yüklensin */
  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-9 w-9 animate-spin text-slate-400" aria-hidden />
        <span className="sr-only">Yükleniyor</span>
      </div>
    );
  }

  // Giriş yapılmamışsa login sayfasına yönlendir
  if (!isAuthenticated || !effectiveUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Rol kontrolü
  if (allowedRoles && !userHasAnyRole(effectiveUser, allowedRoles)) {
    // Yetkisiz erişim - ana sayfaya yönlendir
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
