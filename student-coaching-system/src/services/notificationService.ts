import { apiFetch } from '../lib/session';
import type {
  CreateNotificationInput,
  PlatformNotification,
  PlatformRole,
  UpdateNotificationInput
} from '../types/notification.types';

const SCHEMA_HINT =
  'Bildirim tabloları eksik veya UUID uyumsuz. Supabase’de sql/2026-05-36-platform-notifications.sql ve sql/2026-05-36b-platform-notifications-text-ids.sql dosyalarını çalıştırın.';

async function parseJson<T>(res: Response): Promise<T> {
  const j = (await res.json()) as T & { error?: string; hint?: string; warning?: string };
  if (res.ok && j?.warning === 'notifications_schema_missing') {
    return j;
  }
  if (!res.ok) {
    if (j?.error === 'notifications_schema_missing') {
      throw new Error(j.hint || SCHEMA_HINT);
    }
    if (j?.error === 'Missing token') {
      throw new Error('Oturum bulunamadı. Çıkış yapıp tekrar giriş yapın.');
    }
    const code = typeof j?.error === 'string' ? j.error : '';
    const friendly: Record<string, string> = {
      forbidden: 'Bu bildirimi düzenleme veya silme yetkiniz yok.',
      not_found: 'Bildirim bulunamadı.',
      method_not_allowed: 'Sunucu bu işlemi desteklemiyor (id eksik olabilir).',
      nothing_to_update: 'Güncellenecek alan yok.',
      title_required: 'Başlık zorunlu.',
      body_required: 'Mesaj zorunlu.'
    };
    const msg = j?.hint || friendly[code] || code || res.statusText || 'İstek başarısız';
    throw new Error(typeof msg === 'string' ? msg : 'İstek başarısız');
  }
  return j;
}

export async function fetchInboxNotifications(): Promise<{
  data: PlatformNotification[];
  unread_count: number;
  schemaWarning?: string | null;
}> {
  const res = await apiFetch('/api/notifications?scope=inbox');
  const j = await parseJson<{ data: PlatformNotification[]; unread_count?: number; warning?: string; hint?: string }>(
    res
  );
  return {
    data: j.data || [],
    unread_count: typeof j.unread_count === 'number' ? j.unread_count : 0,
    schemaWarning:
      j.warning === 'notifications_schema_missing' ? j.hint || SCHEMA_HINT : null
  };
}

export async function fetchSentNotifications(): Promise<PlatformNotification[]> {
  const res = await apiFetch('/api/notifications?scope=sent');
  const j = await parseJson<{ data: PlatformNotification[] }>(res);
  return j.data || [];
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<PlatformNotification> {
  const res = await apiFetch('/api/notifications', {
    method: 'POST',
    body: JSON.stringify(input)
  });
  const j = await parseJson<{ data: PlatformNotification }>(res);
  if (!j.data) throw new Error('Bildirim oluşturulamadı');
  return j.data;
}

function notificationItemUrl(notificationId: string): string {
  return `/api/notifications?id=${encodeURIComponent(notificationId)}`;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const res = await apiFetch(notificationItemUrl(notificationId), {
    method: 'PATCH',
    body: JSON.stringify({ mark_read: true })
  });
  await parseJson<{ ok: boolean }>(res);
}

export async function updateNotification(
  notificationId: string,
  input: UpdateNotificationInput
): Promise<PlatformNotification> {
  const res = await apiFetch(notificationItemUrl(notificationId), {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
  const j = await parseJson<{ data: PlatformNotification }>(res);
  if (!j.data) throw new Error('Bildirim güncellenemedi');
  return j.data;
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const res = await apiFetch(notificationItemUrl(notificationId), {
    method: 'DELETE'
  });
  await parseJson<{ ok: boolean }>(res);
}

export function describeNotificationTarget(n: PlatformNotification): string {
  if (n.target_type === 'broadcast') return 'Kurum geneli';
  if (n.target_type === 'role' && n.target_role) return ROLE_LABELS[n.target_role];
  return 'Tek kullanıcı';
}

export type NotificationComposerRole = Extract<PlatformRole, 'super_admin' | 'admin' | 'coach'>;

export const TARGET_TYPE_LABELS: Record<CreateNotificationInput['target_type'], string> = {
  broadcast: 'Kurum geneli',
  role: 'Belirli rol',
  user: 'Tek kullanıcı'
};

export const ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: 'Süper admin',
  admin: 'Yönetici',
  coach: 'Koç',
  teacher: 'Öğretmen',
  student: 'Öğrenci'
};
