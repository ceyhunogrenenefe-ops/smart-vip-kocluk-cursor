import { apiFetch } from './session';

export type BbbJoinApi = 'teacher-lessons' | 'class-live-lessons' | 'meetings';

/**
 * Katıl: BBB odası yoksa sunucuda yeniden oluşturur, güncel join URL ile pencere açar.
 */
export async function openBbbJoin(api: BbbJoinApi, id: string, options?: { kind?: 'session' | 'slot' }): Promise<void> {
  let path: string;
  if (api === 'meetings') {
    path = `/api/meetings?op=bbb-join&meeting_id=${encodeURIComponent(id)}`;
  } else if (api === 'class-live-lessons') {
    const kind = options?.kind === 'slot' ? 'slot' : 'session';
    path = `/api/class-live-lessons?op=bbb-join&id=${encodeURIComponent(id)}&kind=${kind}`;
  } else {
    path = `/api/teacher-lessons?op=bbb-join&id=${encodeURIComponent(id)}`;
  }

  const res = await apiFetch(path);
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string; refreshed?: boolean };
  if (!res.ok) {
    throw new Error(String(j.error || 'Katılım bağlantısı alınamadı'));
  }
  const url = String(j.url || '').trim();
  if (!url) throw new Error('Toplantı bağlantısı boş');
  window.open(url, '_blank', 'noopener,noreferrer');
}
