// Türkçe: Korumalı Route Bileşeni
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('admin' | 'coach' | 'student')[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  // Giriş yapılmamışsa login sayfasına yönlendir
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Rol kontrolü
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Yetkisiz erişim - ana sayfaya yönlendir
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
