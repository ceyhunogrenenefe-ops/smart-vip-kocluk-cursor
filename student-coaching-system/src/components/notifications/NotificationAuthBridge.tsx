import React, { type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getAuthToken } from '../../lib/session';
import { NotificationProvider } from '../../context/NotificationContext';
import type { PlatformRole } from '../../types/notification.types';

export default function NotificationAuthBridge({ children }: { children: ReactNode }) {
  const { effectiveUser, isAuthenticated } = useAuth();
  const hasToken = Boolean(getAuthToken());

  if (!isAuthenticated || !effectiveUser || !hasToken) {
    return <>{children}</>;
  }

  return (
    <NotificationProvider
      userId={effectiveUser.id}
      userRole={effectiveUser.role as PlatformRole}
      userName={effectiveUser.name}
      institutionId={effectiveUser.institutionId ?? null}
      pollingInterval={60000}
    >
      {children}
    </NotificationProvider>
  );
}
