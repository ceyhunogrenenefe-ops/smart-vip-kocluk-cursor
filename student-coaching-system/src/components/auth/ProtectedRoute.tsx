// Türkçe: Korumalı Route Bileşeni
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole } from '../../config/rolePermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('super_admin' | 'admin' | 'coach' | 'teacher' | 'student')[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { effectiveUser, isAuthenticated } = useAuth();
  const location = useLocation();

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
