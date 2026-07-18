import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { PlatformNotification, PlatformRole } from '../types/notification.types';
import { getAuthToken } from '../lib/session';
import {
  fetchInboxNotifications,
  markNotificationRead
} from '../services/notificationService';

type NotificationContextValue = {
  notifications: PlatformNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export type NotificationProviderProps = {
  children: ReactNode;
  userId: string;
  userRole: PlatformRole;
  userName: string;
  institutionId?: string | null;
  pollingInterval?: number;
};

export function NotificationProvider({
  children,
  userId,
  userRole,
  pollingInterval = 90000
}: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId || !getAuthToken()) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      const res = await fetchInboxNotifications();
      if (!mountedRef.current) return;
      setNotifications(res.data);
      setUnreadCount(res.unread_count);
      setError(res.schemaWarning || null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Bildirimler yüklenemedi');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh, userId, userRole]);

  useEffect(() => {
    if (!userId || pollingInterval <= 0) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refresh();
    };
    const id = window.setInterval(tick, pollingInterval);
    return () => window.clearInterval(id);
  }, [userId, pollingInterval, refresh]);

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read_at);
    await Promise.all(unread.map((n) => markNotificationRead(n.id)));
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || now })));
    setUnreadCount(0);
  }, [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      refresh,
      markRead,
      markAllRead
    }),
    [notifications, unreadCount, loading, error, refresh, markRead, markAllRead]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
}
