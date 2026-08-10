import { apiFetch } from './session';
import { copyTextToClipboard } from './copyToClipboard';
import { isExternalMeetingPlatform, lessonJoinUrl } from './liveLessonUtils';

export type GuestJoinKind = 'class' | 'private' | 'meeting';

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

/** Zoom/Meet vb. harici link için WhatsApp davet metni. */
export function formatExternalMeetingShareText(opts: {
  title?: string;
  lessonDate?: string;
  lessonTime?: string;
  url: string;
  className?: string;
}): string {
  const subject = String(opts.title || '').trim();
  const dateRaw = String(opts.lessonDate || '').trim().slice(0, 10);
  let datePart = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    const [y, m, d] = dateRaw.split('-');
    datePart = `${d}.${m}.${y}`;
  }
  const timePart = String(opts.lessonTime || '').trim().slice(0, 5);
  const when = [datePart, timePart].filter(Boolean).join(' · ');
  const head = subject
    ? opts.className
      ? `${subject} (${opts.className})`
      : subject
    : 'Canlı ders';
  const link = String(opts.url || '').trim();
  if (when) return `${head}\n${when}\n${link}`;
  return `${head}\n${link}`;
}

export async function copyExternalMeetingShareText(opts: {
  title?: string;
  lessonDate?: string;
  lessonTime?: string;
  url: string;
  className?: string;
}): Promise<GuestJoinShare> {
  const url = String(opts.url || '').trim();
  if (!url || !isExternalMeetingPlatform(url)) {
    throw new Error('Harici toplantı bağlantısı yok');
  }
  const shareText = formatExternalMeetingShareText({ ...opts, url });
  await copyTextToClipboard(shareText);
  return { url, shareText, longUrl: url, code: null };
}

/** Satırda Zoom/Meet varsa onu kopyala; yoksa false. */
export async function tryCopyExternalMeetingFromRow(
  row: {
    meeting_link?: string | null;
    join_link?: string | null;
    meet_link?: string | null;
    link_zoom?: string | null;
    subject?: string | null;
    title?: string | null;
    lesson_date?: string | null;
    start_time?: string | null;
    class_name?: string | null;
  },
  opts?: { className?: string; title?: string }
): Promise<GuestJoinShare | null> {
  const url = String(
    row.meeting_link || row.join_link || row.meet_link || row.link_zoom || lessonJoinUrl(row) || ''
  ).trim();
  if (!isExternalMeetingPlatform(url)) return null;
  return copyExternalMeetingShareText({
    url,
    title: opts?.title || row.subject || row.title || 'Canlı ders',
    lessonDate: row.lesson_date || '',
    lessonTime: String(row.start_time || '').slice(0, 5),
    className: opts?.className || row.class_name || ''
  });
}

export async function fetchGuestJoinShareUrl(kind: GuestJoinKind, id: string): Promise<GuestJoinShare> {
  const api =
    kind === 'class'
      ? `/api/class-live-lessons?op=guest-join-link&id=${encodeURIComponent(id)}`
      : kind === 'meeting'
        ? `/api/meetings?op=guest-join-link&id=${encodeURIComponent(id)}`
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
  await copyTextToClipboard(data.shareText);
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

/** Etüt sınıfı için WhatsApp davet metni (Zoom ise ham Zoom; BBB ise kısa /d/ link). */
export async function copyAcademicStudyGuestJoinShareText(
  room: string,
  institutionId?: string | null,
  opts?: { directUrl?: string | null; title?: string }
): Promise<GuestJoinShare> {
  const direct = String(opts?.directUrl || '').trim();
  if (isExternalMeetingPlatform(direct)) {
    return copyExternalMeetingShareText({
      url: direct,
      title: opts?.title || 'Etüt',
      className: 'Akademik Merkez — Etüt'
    });
  }
  const data = await fetchAcademicStudyGuestJoinShareUrl(room, institutionId);
  await copyTextToClipboard(data.shareText);
  return data;
}

/** Panoya yalnızca davet URL'si. */
export async function copyGuestJoinUrlOnly(kind: GuestJoinKind, id: string): Promise<string> {
  const { url } = await fetchGuestJoinShareUrl(kind, id);
  await copyTextToClipboard(url);
  return url;
}
