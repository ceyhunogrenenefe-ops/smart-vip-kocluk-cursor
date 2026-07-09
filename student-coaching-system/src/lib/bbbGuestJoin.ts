import { apiFetch } from './session';

export type GuestJoinKind = 'class' | 'private';

export type GuestJoinShare = {
  url: string;
  shareText: string;
  longUrl?: string;
  expiresAt?: string;
  title?: string;
  lessonDate?: string;
  lessonTime?: string;
  code?: string | null;
};

export async function fetchGuestJoinShareUrl(kind: GuestJoinKind, id: string): Promise<GuestJoinShare> {
  const api =
    kind === 'class'
      ? `/api/class-live-lessons?op=guest-join-link&id=${encodeURIComponent(id)}`
      : `/api/teacher-lessons?op=guest-join-link&id=${encodeURIComponent(id)}`;
  const res = await apiFetch(api);
  const j = (await res.json().catch(() => ({}))) as {
    url?: string;
    shareText?: string;
    longUrl?: string;
    expiresAt?: string;
    title?: string;
    lessonDate?: string;
    lessonTime?: string;
    code?: string | null;
    error?: string;
  };
  if (!res.ok) throw new Error(String(j.error || 'Davet linki alınamadı'));
  const url = String(j.url || '').trim();
  if (!url) throw new Error('Davet linki boş');
  const shareText = String(j.shareText || '').trim() || url;
  return {
    url,
    shareText,
    longUrl: j.longUrl,
    expiresAt: j.expiresAt,
    title: j.title,
    lessonDate: j.lessonDate,
    lessonTime: j.lessonTime,
    code: j.code
  };
}

/** Path slug veya ?t= JWT'den token çıkarır. */
export function parseGuestJoinToken(pathSlug: string, search: string): string {
  const slug = String(pathSlug || '').trim();
  if (slug) {
    if (slug.startsWith('eyJ') && slug.includes('.')) return normalizeGuestToken(slug);
    try {
      const padded = slug.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
      return normalizeGuestToken(decoded);
    } catch {
      return normalizeGuestToken(slug);
    }
  }
  try {
    const sp = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const q = String(sp.get('t') || sp.get('token') || '').trim();
    return normalizeGuestToken(q);
  } catch {
    return '';
  }
}

export function normalizeGuestToken(raw: string): string {
  let t = String(raw || '').trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    /* keep */
  }
  const jwtMatch = t.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (jwtMatch) t = jwtMatch[0];
  return t.replace(/\s+/g, '');
}

/** Kısa kod (/d/abc) → JWT */
export async function resolveGuestJoinShortCode(code: string): Promise<string> {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return '';
  const res = await fetch(`/api/guest-join-resolve?code=${encodeURIComponent(c)}`);
  const j = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok) throw new Error(String(j.error || 'Davet bağlantısı bulunamadı.'));
  return normalizeGuestToken(String(j.token || ''));
}

/** Herkese açık katılım — tarayıcıyı doğrudan BBB'ye yönlendirir (ara sayfa / açılır pencere yok). */
export function guestJoinRedirectUrl(token: string, guestName: string): string {
  const safeToken = normalizeGuestToken(token);
  const q = new URLSearchParams({
    t: safeToken,
    name: guestName.trim().slice(0, 64) || 'Misafir',
    redirect: '1'
  });
  return `/api/bbb-guest-join?${q.toString()}`;
}

/** Herkese açık katılım sayfası — giriş yok (JSON; test / yedek). */
export async function joinAsGuest(token: string, guestName: string): Promise<string> {
  const safeToken = normalizeGuestToken(token);
  const q = new URLSearchParams({
    t: safeToken,
    name: guestName.trim().slice(0, 64) || 'Misafir'
  });
  const res = await fetch(`/api/bbb-guest-join?${q.toString()}`, { method: 'GET' });
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string; title?: string };
  if (!res.ok) throw new Error(String(j.error || 'Derse katılım başarısız'));
  const url = String(j.url || '').trim();
  if (!url) throw new Error('Toplantı bağlantısı alınamadı');
  return url;
}

/** WhatsApp için ders adı + tarih + kısa link metni. */
export async function copyGuestJoinShareText(kind: GuestJoinKind, id: string): Promise<GuestJoinShare> {
  const data = await fetchGuestJoinShareUrl(kind, id);
  await navigator.clipboard.writeText(data.shareText);
  return data;
}

export async function fetchAcademicStudyGuestJoinShareUrl(
  room: string,
  institutionId?: string | null
): Promise<GuestJoinShare> {
  const qs = new URLSearchParams({ op: 'guest-join-link', room, kind: 'study' });
  if (institutionId) qs.set('institution_id', institutionId);
  const res = await apiFetch(`/api/academic-center-bbb-join?${qs.toString()}`);
  const j = (await res.json().catch(() => ({}))) as {
    url?: string;
    shareText?: string;
    longUrl?: string;
    expiresAt?: string;
    title?: string;
    lessonDate?: string;
    lessonTime?: string;
    code?: string | null;
    error?: string;
  };
  if (!res.ok) throw new Error(String(j.error || 'Davet linki alınamadı'));
  const url = String(j.url || '').trim();
  if (!url) throw new Error('Davet linki boş');
  const shareText = String(j.shareText || '').trim() || url;
  return {
    url,
    shareText,
    longUrl: j.longUrl,
    expiresAt: j.expiresAt,
    title: j.title,
    lessonDate: j.lessonDate,
    lessonTime: j.lessonTime,
    code: j.code
  };
}

/** Etüt sınıfı için WhatsApp davet metni (canlı grup dersi davet linki gibi). */
export async function copyAcademicStudyGuestJoinShareText(
  room: string,
  institutionId?: string | null
): Promise<GuestJoinShare> {
  const data = await fetchAcademicStudyGuestJoinShareUrl(room, institutionId);
  await navigator.clipboard.writeText(data.shareText);
  return data;
}

/** Panoya yalnızca davet URL'si. */
export async function copyGuestJoinUrlOnly(kind: GuestJoinKind, id: string): Promise<string> {
  const { url } = await fetchGuestJoinShareUrl(kind, id);
  await navigator.clipboard.writeText(url);
  return url;
}
