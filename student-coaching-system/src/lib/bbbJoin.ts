import { apiFetch } from './session';
import {
  assignBbbWaitingPopup,
  openBbbWaitingPopup,
  showBbbWaitingPopupError
} from './bbbWaitingPopup';
import { isMobileOrTabletViewport } from './viewportUtils';
import { startEtutSession, todayYmd, type EtutSessionSource } from './etutSession';

export type BbbJoinApi = 'teacher-lessons' | 'class-live-lessons' | 'meetings';

const LESSON_JOIN_WAITING = {
  title: 'Derse yönlendiriliyorsunuz'
};

function portalJoinPath(
  api: BbbJoinApi,
  id: string,
  options?: { kind?: 'session' | 'slot' }
): string | null {
  if (api === 'class-live-lessons') {
    const q = options?.kind === 'slot' ? '?kind=slot' : '';
    return `/katil/grup/${encodeURIComponent(id)}${q}`;
  }
  if (api === 'teacher-lessons') {
    return `/katil/ozel/${encodeURIComponent(id)}`;
  }
  return null;
}

/**
 * Katıl: BBB odası yoksa sunucuda yeniden oluşturur, güncel join URL ile yönlendirir.
 */
export async function openBbbJoin(
  api: BbbJoinApi,
  id: string,
  options?: {
    kind?: 'session' | 'slot';
    sameTab?: boolean;
    etut?: {
      studentId: string;
      subject?: string;
      topic?: string;
      date?: string;
      plannerEntryId?: string;
      classSessionId?: string;
      source?: EtutSessionSource;
      label?: string;
    };
  }
): Promise<void> {
  if (options?.etut?.studentId) {
    startEtutSession({
      studentId: options.etut.studentId,
      source: options.etut.source || 'class-live',
      subject: options.etut.subject || 'Etüt',
      topic: options.etut.topic || options.etut.label || 'Etüt çalışması',
      date: options.etut.date || todayYmd(),
      plannerEntryId: options.etut.plannerEntryId,
      classSessionId: options.etut.classSessionId || id,
      label: options.etut.label,
    });
  }
  const portalPath = portalJoinPath(api, id, options);

  if (portalPath && (options?.sameTab || isMobileOrTabletViewport())) {
    window.location.assign(portalPath);
    return;
  }

  const popup = openBbbWaitingPopup(LESSON_JOIN_WAITING);
  try {
    const url = await fetchBbbJoinUrl(api, id, options);
    if (options?.sameTab) {
      window.location.assign(url);
      return;
    }
    assignBbbWaitingPopup(popup, url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Katılım bağlantısı alınamadı';
    showBbbWaitingPopupError(popup, msg, { title: LESSON_JOIN_WAITING.title });
    throw e;
  }
}

/** Katılım URL'sini döndürür (yönlendirme yapmadan). */
export async function fetchBbbJoinUrl(
  api: BbbJoinApi,
  id: string,
  options?: { kind?: 'session' | 'slot' }
): Promise<string> {
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
  return url;
}

/**
 * Kayıt izle: BBB getRecordings ile oynatma URL'si alır ve açar.
 */
export async function openBbbRecording(
  api: 'teacher-lessons' | 'class-live-lessons',
  id: string,
  options?: { kind?: 'session' | 'slot' }
): Promise<void> {
  let path: string;
  if (api === 'class-live-lessons') {
    const kind = options?.kind === 'slot' ? 'slot' : 'session';
    path = `/api/class-live-lessons?op=bbb-recording&id=${encodeURIComponent(id)}&kind=${kind}`;
  } else {
    path = `/api/teacher-lessons?op=bbb-recording&id=${encodeURIComponent(id)}`;
  }

  const res = await apiFetch(path);
  const j = (await res.json().catch(() => ({}))) as {
    playbackUrl?: string;
    error?: string;
    code?: string;
  };
  if (!res.ok) {
    const msg = String(j.error || '');
    if (j.code === 'session_not_found') {
      throw new Error(msg || 'Oturum bulunamadı. Sayfayı yenileyip tekrar deneyin.');
    }
    if (j.code === 'recording_not_found' || j.code === 'recording_audio_only') {
      throw new Error(
        msg ||
          'Kayıt bulunamadı. Derste BBB kaydı başlatıldı mı? Ders bitince birkaç dakika bekleyin; olmazsa BBB yönetim panelinden kayıt linkini kopyalayıp oturuma yapıştırın.'
      );
    }
    if (j.code === 'bbb_meeting_id_missing') {
      throw new Error('Bu ders için BBB oturumu henüz açılmamış. Önce en az bir kez «Katıl» ile derse girilmiş olmalı.');
    }
    if (j.code === 'bbb_recording_timeout' || res.status === 504) {
      throw new Error(
        msg ||
          'BBB sunucusu kayıt listesine zamanında yanıt vermedi. Birkaç dakika sonra tekrar deneyin veya kayıt URL\'sini BBB yönetiminden oturuma yapıştırın.'
      );
    }
    throw new Error(msg || 'Ders kaydı alınamadı');
  }
  const url = String(j.playbackUrl || '').trim();
  if (!url) throw new Error('Kayıt bağlantısı boş');
  window.open(url, '_blank', 'noopener,noreferrer');
}
