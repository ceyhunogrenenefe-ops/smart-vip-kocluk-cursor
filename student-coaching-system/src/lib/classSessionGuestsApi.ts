import { apiFetch } from './session';

export type GuestStatus = 'suspected' | 'confirmed' | 'dismissed';
export type GuestSource = 'auto' | 'link' | 'admin' | 'teacher' | 'trial';

export const GUEST_STATUS_LABELS: Record<GuestStatus, string> = {
  suspected: 'Muhtemel Misafir',
  confirmed: 'Misafir Öğrenci',
  dismissed: 'Misafir Değil'
};

export const GUEST_SOURCE_LABELS: Record<GuestSource, string> = {
  auto: 'Link ile giriş (tespit)',
  link: 'Link ile giriş',
  admin: 'Yönetici ekledi',
  teacher: 'Öğretmen işaretledi',
  trial: 'Deneme dersi'
};

export type SessionGuest = {
  id: string;
  session_id: string;
  class_id?: string | null;
  display_name: string;
  normalized_name: string;
  status: GuestStatus | string;
  source: GuestSource | string;
  minutes_present?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  student_id?: string | null;
  student_name?: string | null;
  converted_at?: string | null;
  note?: string | null;
  /** Aynı kişinin kaç misafir derse katıldığı */
  total_guest_visits?: number;
  is_first_visit?: boolean;
  /** Yalnız yönetici raporunda dolu gelir */
  lesson_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  subject?: string | null;
  class_name?: string | null;
  class_level?: string | null;
  teacher_name?: string | null;
};

async function parseJson(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function failure(j: Record<string, unknown>, fallback: string) {
  if (j.error === 'schema_missing' && j.hint) {
    return new Error(`Şema eksik — Supabase’te \`${String(j.hint)}\` çalıştırın`);
  }
  return new Error(String(j.error || fallback));
}

export function guestStatusLabel(status: string): string {
  return GUEST_STATUS_LABELS[status as GuestStatus] || status;
}

export function guestSourceLabel(source: string): string {
  return GUEST_SOURCE_LABELS[source as GuestSource] || source;
}

/** Bir dersin misafirleri — öğretmen ekranı */
export async function fetchSessionGuests(sessionId: string) {
  const res = await apiFetch(
    `/api/class-session-guests?op=list&session_id=${encodeURIComponent(sessionId)}`
  );
  const j = await parseJson(res);
  if (!res.ok) throw failure(j, 'Misafir listesi alınamadı');
  return (Array.isArray(j.data) ? j.data : []) as SessionGuest[];
}

/** Yönetici tablosu */
export async function fetchGuestReport(params: {
  from?: string;
  to?: string;
  status?: GuestStatus | 'all';
  institutionId?: string;
}) {
  const qs = new URLSearchParams({ op: 'report' });
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.status) qs.set('status', params.status);
  if (params.institutionId) qs.set('institution_id', params.institutionId);
  const res = await apiFetch(`/api/class-session-guests?${qs}`);
  const j = await parseJson(res);
  if (!res.ok) throw failure(j, 'Misafir raporu alınamadı');
  return {
    rows: (Array.isArray(j.data) ? j.data : []) as SessionGuest[],
    hint: (j.hint as string | null | undefined) || null
  };
}

async function post(body: Record<string, unknown>, fallback: string) {
  const res = await apiFetch('/api/class-session-guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await parseJson(res);
  if (!res.ok) throw failure(j, fallback);
  return j;
}

/** Misafir olarak işaretle / onayla. Kayıt varsa id, yoksa ad gönderilir. */
export function markGuest(input: {
  guest_id?: string;
  session_id?: string;
  display_name?: string;
  source?: GuestSource;
  note?: string | null;
}) {
  return post({ op: 'mark', ...input }, 'İşaretlenemedi');
}

/** Misafir işaretini kaldır — kayıt silinmez, "misafir değil" olur */
export function unmarkGuest(guestId: string) {
  return post({ op: 'unmark', guest_id: guestId }, 'İşaret kaldırılamadı');
}

export function setGuestStatus(guestId: string, status: GuestStatus, source?: GuestSource) {
  return post({ op: 'set_status', guest_id: guestId, status, source }, 'Durum değiştirilemedi');
}

/** Yönetici elle misafir ekler */
export function addGuest(input: {
  session_id: string;
  display_name: string;
  source?: GuestSource;
  note?: string | null;
}) {
  return post({ op: 'add', ...input }, 'Misafir eklenemedi');
}

/** Öğrenciye dönüştür — aynı ada sahip geçmiş katılımlar da bağlanır */
export async function convertGuestToStudent(guestId: string, studentId: string) {
  const j = await post(
    { op: 'convert', guest_id: guestId, student_id: studentId },
    'Dönüştürülemedi'
  );
  return {
    linkedRows: Number(j.linked_rows) || 0,
    student: (j.student || null) as { id: string; name: string } | null
  };
}
