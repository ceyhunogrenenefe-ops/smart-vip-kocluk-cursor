import React, { useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNotifications } from '../../context/NotificationContext';
import NotificationPanel from './NotificationPanel';

export default function NotificationBell() {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative touch-manipulation rounded-lg p-2.5 transition-colors hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center',
          open && 'bg-gray-100'
        )}
        aria-label="Bildirimler"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      <NotificationPanel
        open={open}
        onClose={() => setOpen(false)}
        notifications={notifications}
        loading={loading}
        error={error}
        onMarkRead={(id) => void markRead(id)}
        onMarkAllRead={() => void markAllRead()}
      />
    </div>
  );
}
