import type { TeacherLesson } from '../types';

/** İstanbul duvar saati +03:00 */
export function lessonInstantMs(lessonDateYmd: string, timeHms: string): number | null {
  const t = normalizeTimeHms(timeHms);
  const iso = `${lessonDateYmd}T${t}+03:00`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function normalizeTimeHms(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '00:00:00';
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  return '00:00:00';
}

/** Ders saatine 10 dk kala (henüz başlamamış). */
export function isApproaching(lesson: TeacherLesson, nowMs: number = Date.now()): boolean {
  if (lesson.status !== 'scheduled') return false;
  const start = lessonInstantMs(lesson.date, lesson.start_time);
  if (start == null) return false;
  const tenMin = 10 * 60_000;
  return nowMs >= start - tenMin && nowMs < start;
}

export function isOngoing(lesson: TeacherLesson, nowMs: number = Date.now()): boolean {
  if (lesson.status !== 'scheduled') return false;
  const start = lessonInstantMs(lesson.date, lesson.start_time);
  const end = lessonInstantMs(lesson.date, lesson.end_time);
  if (start == null || end == null) return false;
  return nowMs >= start && nowMs < end;
}

export const PLATFORM_LABEL: Record<string, string> = {
  zoom: 'Zoom',
  meet: 'Google Meet',
  bbb: 'BigBlueButton',
  other: 'Diğer'
};

/** API join_link veya meeting_link — Katıl / kopyala için. */
export function lessonJoinUrl(lesson: { join_link?: string | null; meeting_link?: string | null }): string {
  return String(lesson.join_link || lesson.meeting_link || '').trim();
}

export function isBbbJoinUrl(url: string): boolean {
  const s = String(url || '').trim();
  return /meetingID=/i.test(s) && /\/join/i.test(s);
}

/** Oda ilk «Katıl»da açılır — ham BBB URL'si saklanmaz. */
export const BBB_AUTO_MEETING_LINK = 'bbb:auto';

export function isBbbAutoMeetingLink(url: string): boolean {
  return String(url || '').trim() === BBB_AUTO_MEETING_LINK;
}

/** Katıl akışı BBB API üzerinden mi? (ham URL veya otomatik BBB) */
export function needsBbbJoinFlow(url: string): boolean {
  return isBbbJoinUrl(url) || isBbbAutoMeetingLink(url);
}

/** Tarayıcıdan açılabilir panel katılım linki (giriş gerekir). */
export function portalBbbJoinUrl(kind: 'class' | 'private', id: string, origin?: string): string {
  const base = String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/+$/,
    ''
  );
  return kind === 'class'
    ? `${base}/katil/grup/${encodeURIComponent(id)}`
    : `${base}/katil/ozel/${encodeURIComponent(id)}`;
}

/** UI / kopyala: BBB için panel linki, diğerleri için ham URL. */
export function displayMeetingLinkForRow(
  row: { id?: string; meeting_link?: string | null; join_link?: string | null },
  kind: 'class' | 'private',
  origin?: string
): string {
  const raw = lessonJoinUrl(row);
  if (!raw) return '';
  if ((isBbbAutoMeetingLink(raw) || isBbbJoinUrl(raw)) && row.id) {
    return portalBbbJoinUrl(kind, row.id, origin);
  }
  return raw;
}

export function classSessionHasJoinLink(session: {
  meeting_link?: string | null;
  join_link?: string | null;
}): boolean {
  const url = lessonJoinUrl(session);
  return Boolean(url);
}

/** Düzenleme kaydında panel URL'si ham BBB linkinin yerine yazılmasın. */
export function meetingLinkForSave(
  edited: string,
  original: { id?: string; meeting_link?: string | null; join_link?: string | null },
  kind: 'class' | 'private',
  origin?: string
): string {
  const trimmed = String(edited || '').trim();
  const originalRaw = lessonJoinUrl(original);
  if (!original.id) return trimmed;
  const displayed = displayMeetingLinkForRow(original, kind, origin);
  if (trimmed === displayed) return originalRaw;
  if (trimmed === portalBbbJoinUrl(kind, original.id, origin)) return originalRaw;
  return trimmed;
}

export function isBbbPlaybackUrl(url: string): boolean {
  const s = String(url || '').trim();
  if (!s) return false;
  if (/\/playback\//i.test(s)) return true;
  return /presentation/i.test(s) && !isBbbJoinUrl(s);
}

/** Tamamlanan BBB dersinde kayıt erişimi mümkün mü? */
export function hasBbbRecordingAccess(lesson: {
  platform?: string;
  status?: string;
  meeting_link?: string | null;
  join_link?: string | null;
  recording_link?: string | null;
  bbb_meeting_id?: string | null;
}): boolean {
  if (lesson.status !== 'completed') return false;
  const join = lessonJoinUrl(lesson);
  const isBbb =
    lesson.platform === 'bbb' ||
    isBbbAutoMeetingLink(join) ||
    isBbbJoinUrl(join) ||
    Boolean(String(lesson.bbb_meeting_id || '').trim());
  if (!isBbb) return false;
  if (String(lesson.recording_link || '').trim()) return true;
  if (String(lesson.bbb_meeting_id || '').trim()) return true;
  return isBbbJoinUrl(join) || isBbbAutoMeetingLink(join);
}

/** Tamamlanan grup oturumunda kayıt erişimi mümkün mü? */
export function hasClassSessionRecordingAccess(session: {
  status?: string;
  meeting_link?: string | null;
  join_link?: string | null;
  recording_link?: string | null;
  bbb_meeting_id?: string | null;
}): boolean {
  if (session.status !== 'completed') return false;
  const recordingLink = String(session.recording_link || '').trim();
  if (recordingLink) return true;
  const joinUrl = String(session.join_link || session.meeting_link || '').trim();
  if (!joinUrl) return false;
  if (isBbbJoinUrl(joinUrl) || isBbbAutoMeetingLink(joinUrl)) return true;
  if (String(session.bbb_meeting_id || '').trim()) return true;
  return !isBbbJoinUrl(joinUrl);
}

/**
 * Öğrenciye paylaşılacak panel erişim mesajı (BBB için ham join URL yerine).
 */
export function copyLessonAccessMessage(
  lesson: {
    platform?: string;
    status?: string;
    title?: string;
    date?: string;
    start_time?: string;
    meeting_link?: string | null;
    join_link?: string | null;
    recording_link?: string | null;
  },
  origin: string
): string {
  const panelUrl = String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/+$/,
    ''
  );
  const title = String(lesson.title || 'Canlı ders').trim();
  const when = lesson.date
    ? `${new Date(lesson.date + 'T12:00:00').toLocaleDateString('tr-TR')} ${String(lesson.start_time || '').slice(0, 5)}`
    : '';

  if (lesson.platform === 'bbb' || isBbbAutoMeetingLink(lessonJoinUrl(lesson)) || isBbbJoinUrl(lessonJoinUrl(lesson))) {
    const portal =
      lesson.status === 'scheduled' && (lesson as { id?: string }).id
        ? portalBbbJoinUrl('private', String((lesson as { id?: string }).id), panelUrl)
        : panelUrl;
    if (lesson.status === 'completed') {
      return [
        `«${title}» dersi tamamlandı.`,
        when ? `Tarih: ${when}` : '',
        '',
        'Kaydı izlemek için panele giriş yapın:',
        panelUrl,
        '',
        'Canlı Dersler bölümünde «Kaydı izle» / «Ders kaydını izle» düğmesine tıklayın.',
        'Doğrudan BBB bağlantısı paylaşmayın; kayıt erişimi panele özeldir.'
      ]
        .filter(Boolean)
        .join('\n');
    }
    return [
      `«${title}» canlı dersine katılmak için:`,
      when ? `Tarih: ${when}` : '',
      '',
      `1. Panele giriş yapın: ${panelUrl}`,
      `2. Tarayıcıdan katılım: ${portal}`,
      '   (veya Canlı Dersler → «Derse katıl»)',
      '',
      'Ham BBB sunucu linki geçici olabilir; yukarıdaki panel bağlantısını kullanın.'
    ]
      .filter(Boolean)
      .join('\n');
  }

  const url = lessonJoinUrl(lesson);
  if (!url) return `${title} — katılım bağlantısı henüz paylaşılmadı.`;
  return [title, when ? `Tarih: ${when}` : '', '', `Katılım bağlantısı: ${url}`].filter(Boolean).join('\n');
}

/** Grup dersi oturumu için panel erişim mesajı. */
export function copyClassSessionAccessMessage(
  session: {
    id?: string;
    subject?: string;
    lesson_date?: string;
    start_time?: string;
    status?: string;
    meeting_link?: string | null;
    join_link?: string | null;
    recording_link?: string | null;
  },
  origin: string
): string {
  const panelUrl = String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/+$/,
    ''
  );
  const subject = String(session.subject || 'Grup dersi').trim();
  const when = session.lesson_date
    ? `${new Date(session.lesson_date + 'T12:00:00').toLocaleDateString('tr-TR')} ${String(session.start_time || '').slice(0, 5)}`
    : '';
  const joinUrl = lessonJoinUrl(session);

  if (needsBbbJoinFlow(joinUrl)) {
    const portal = session.id ? portalBbbJoinUrl('class', session.id, panelUrl) : panelUrl;
    if (session.status === 'completed') {
      return [
        `«${subject}» grup dersi tamamlandı.`,
        when ? `Tarih: ${when}` : '',
        '',
        'Kaydı izlemek için panele giriş yapın:',
        panelUrl,
        '',
        'Canlı Grup Dersleri bölümünde «Kaydı izle» düğmesine tıklayın.'
      ]
        .filter(Boolean)
        .join('\n');
    }
    return [
      `«${subject}» canlı grup dersine katılmak için:`,
      when ? `Tarih: ${when}` : '',
      '',
      `1. Panele giriş yapın: ${panelUrl}`,
      `2. Tarayıcıdan katılım: ${portal}`,
      '   (veya Canlı Grup Dersleri → «Katıl»)',
      '',
      'Ham BBB sunucu linki geçici olabilir; yukarıdaki panel bağlantısını kullanın.'
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (!joinUrl) return `${subject} — katılım bağlantısı henüz paylaşılmadı.`;
  return [subject, when ? `Tarih: ${when}` : '', '', `Katılım bağlantısı: ${joinUrl}`].filter(Boolean).join('\n');
}

/** Online görüşme: öğrenci meet_link, koç/yönetici link_bbb (BBB moderatör). */
export function coachingMeetingJoinUrl(
  m: {
    meet_link?: string | null;
    link_bbb?: string | null;
    join_link?: string | null;
  },
  role: string
): string {
  if (m.join_link) return String(m.join_link).trim();
  const r = String(role || '').toLowerCase();
  if (r === 'student') return String(m.meet_link || '').trim();
  return String(m.link_bbb || m.meet_link || '').trim();
}

function normLessonSubjectForReminder(subject: string): string {
  return String(subject || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Deneme ve rehberlik oturumlarına grup dersi WhatsApp hatırlatması gönderilmez. */
export function shouldSkipClassLessonReminder(subject: string | null | undefined): boolean {
  const s = normLessonSubjectForReminder(String(subject || ''));
  if (!s) return false;
  return s.includes('deneme') || s.includes('rehberlik');
}
