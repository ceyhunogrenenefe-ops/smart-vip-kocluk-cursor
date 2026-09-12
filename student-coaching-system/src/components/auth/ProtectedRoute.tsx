// Türkçe: Korumalı Route Bileşeni
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole } from '../../config/rolePermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: (
    | 'super_admin'
    | 'admin'
    | 'coach'
    | 'teacher'
    | 'student'
    | 'crm_agent'
    | 'vendor_admin'
  )[];
}

function isCrmAgentOnly(user: { role?: string; roles?: string[] } | null | undefined): boolean {
  if (!user) return false;
  const tags = new Set<string>([
    String(user.role || '').toLowerCase(),
    ...((user.roles || []).map((r) => String(r || '').toLowerCase()))
  ]);
  if (!tags.has('crm_agent')) return false;
  const elevated = ['super_admin', 'admin', 'coach', 'teacher', 'student', 'vendor_admin'];
  return !elevated.some((r) => tags.has(r));
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

  // CRM agent: yalnızca /crm/* — diğer tüm panelleri kilitle
  if (isCrmAgentOnly(effectiveUser)) {
    const path = location.pathname || '';
    if (!path.startsWith('/crm')) {
      return <Navigate to="/crm/inbox" replace />;
    }
  }

  // Rol kontrolü
  if (allowedRoles && !userHasAnyRole(effectiveUser, allowedRoles)) {
    if (isCrmAgentOnly(effectiveUser)) {
      return <Navigate to="/crm/inbox" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
