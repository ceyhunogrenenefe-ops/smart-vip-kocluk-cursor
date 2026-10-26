import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import { useNotifications } from '../context/NotificationContext';
import NotificationComposer from '../components/notifications/NotificationComposer';
import SentNotificationsList from '../components/notifications/SentNotificationsList';
import { fetchSentNotifications } from '../services/notificationService';
import type { PlatformNotification } from '../types/notification.types';
import type { NotificationComposerRole } from '../services/notificationService';

export default function NotificationsPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const inbox = useNotifications();
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

  const inboxSection = (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Gelen bildirimler
          {inbox.unreadCount > 0 ? (
            <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
              {inbox.unreadCount} okunmamış
            </span>
          ) : null}
        </h2>
        {inbox.unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void inbox.markAllRead()}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            Tümünü okundu say
          </button>
        ) : null}
      </div>
      {inbox.loading && inbox.notifications.length === 0 ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : inbox.notifications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Henüz bildiriminiz yok.
        </p>
      ) : (
        <ul className="space-y-2">
          {inbox.notifications.map((n) => (
            <li
              key={n.id}
              className={
                'rounded-xl border p-3 ' +
                (n.read_at ? 'border-slate-200 bg-white' : 'border-indigo-200 bg-indigo-50/60')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                <span className="shrink-0 text-[11px] text-slate-500">
                  {new Date(n.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{n.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                {n.sender_name ? <span>Gönderen: {n.sender_name}</span> : null}
                {!n.read_at ? (
                  <button
                    type="button"
                    onClick={() => void inbox.markRead(n.id)}
                    className="font-semibold text-indigo-600 hover:underline"
                  >
                    Okundu say
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (!senderRole) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Bildirimler</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Kurumunuzdan ve koçlardan gelen duyurular.
          </p>
        </div>
        {inboxSection}
      </div>
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

      {inboxSection}

      <NotificationComposer senderRole={senderRole} onSent={() => void loadSent()} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Gönderdiğiniz bildirimler</h2>
        <p className="text-xs text-slate-500">Kalem ile düzenleyin, çöp kutusu ile silin. Hedef kitle sonradan değiştirilemez.</p>
        <SentNotificationsList items={sent} loading={loading} onChanged={() => void loadSent()} />
      </section>
    </div>
  );
}
