import React from 'react';
import { Bell, CheckCheck, ExternalLink, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PlatformNotification } from '../../types/notification.types';
import { ROLE_LABELS } from '../../services/notificationService';

type NotificationPanelProps = {
  open: boolean;
  onClose: () => void;
  notifications: PlatformNotification[];
  loading: boolean;
  error: string | null;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export default function NotificationPanel({
  open,
  onClose,
  notifications,
  loading,
  error,
  onMarkRead,
  onMarkAllRead
}: NotificationPanelProps) {
  if (!open) return null;

  const unread = notifications.filter((n) => !n.read_at);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[200] bg-black/20 lg:bg-transparent"
        aria-label="Bildirim panelini kapat"
        onClick={onClose}
      />
      <div
        className="absolute right-0 top-full z-[210] mt-2 w-[min(calc(100vw-1rem),22rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        role="dialog"
        aria-label="Bildirimler"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-800">Bildirimler</span>
            {unread.length > 0 ? (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unread.length}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {unread.length > 0 ? (
              <button
                type="button"
                onClick={() => onMarkAllRead()}
                className="rounded-lg p-1.5 text-xs text-blue-600 hover:bg-blue-50"
                title="Tümünü okundu işaretle"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-gray-100"
              aria-label="Kapat"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Yükleniyor…
            </div>
          ) : error ? (
            <p className="px-4 py-6 text-sm text-red-600">{error}</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">Henüz bildirim yok.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-slate-50',
                      !n.read_at && 'bg-blue-50/60'
                    )}
                    onClick={() => {
                      if (!n.read_at) onMarkRead(n.id);
                      if (n.link_url) window.open(n.link_url, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      {!n.read_at ? (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</p>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      {n.sender_name || ROLE_LABELS[n.sender_role]} · {formatWhen(n.created_at)}
                    </p>
                    {n.link_url ? (
                      <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-blue-600">
                        <ExternalLink className="h-3 w-3" />
                        Bağlantı
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
