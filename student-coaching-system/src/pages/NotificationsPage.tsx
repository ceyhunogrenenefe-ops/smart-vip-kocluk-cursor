import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import NotificationComposer from '../components/notifications/NotificationComposer';
import SentNotificationsList from '../components/notifications/SentNotificationsList';
import { fetchSentNotifications } from '../services/notificationService';
import type { PlatformNotification } from '../types/notification.types';
import type { NotificationComposerRole } from '../services/notificationService';

export default function NotificationsPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const [sent, setSent] = useState<PlatformNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const senderRole: NotificationComposerRole | null = tags.includes('super_admin')
    ? 'super_admin'
    : tags.includes('admin')
      ? 'admin'
      : tags.includes('coach')
        ? 'coach'
        : null;

  const loadSent = useCallback(async () => {
    if (!senderRole) return;
    setLoading(true);
    try {
      const rows = await fetchSentNotifications();
      setSent(rows);
    } catch {
      setSent([]);
    } finally {
      setLoading(false);
    }
  }, [senderRole]);

  useEffect(() => {
    void loadSent();
  }, [loadSent]);

  if (!senderRole) {
    return (
      <p className="p-6 text-sm text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Bildirim yönetimi</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Kurum veya öğrenci hedefli duyurular oluşturun. Alıcılar üst bardaki zil simgesinden görür.
        </p>
      </div>

      <NotificationComposer senderRole={senderRole} onSent={() => void loadSent()} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Gönderdiğiniz bildirimler</h2>
        <p className="text-xs text-slate-500">Kalem ile düzenleyin, çöp kutusu ile silin. Hedef kitle sonradan değiştirilemez.</p>
        <SentNotificationsList items={sent} loading={loading} onChanged={() => void loadSent()} />
      </section>
    </div>
  );
}
