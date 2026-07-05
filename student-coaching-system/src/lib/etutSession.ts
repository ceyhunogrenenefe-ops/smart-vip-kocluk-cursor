import type { ClassLevel } from '../types';
import type { StudyEntryKey } from './academicCenterLinks';
import {
  fetchAcademicCenterLinksFromServer,
  isBbbAutoMeetingLink,
  loadAcademicCenterLinks,
  openAcademicCenterLink,
  studyEntryUrl,
} from './academicCenterLinks';

const STORAGE_KEY = 'coaching_pending_etut_session_v1';
const RETURN_FLAG_KEY = 'coaching_etut_expect_return_report';

export type EtutSessionSource = 'planner' | 'class-live' | 'academic-center';

export type PendingEtutSession = {
  studentId: string;
  source: EtutSessionSource;
  subject: string;
  topic: string;
  date: string;
  startedAt: string;
  plannerEntryId?: string;
  /** Etüt plan bloğunun günü (yyyy-mm-dd) */
  plannerDate?: string;
  /** Etüt plan bloğu başlangıç saati (HH:MM) */
  startTime?: string;
  /** Etüt plan bloğu bitiş saati (HH:MM) */
  endTime?: string;
  classSessionId?: string;
  label?: string;
};

export function isEtutSubject(subject: string | null | undefined): boolean {
  const s = String(subject || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return s === 'etüt' || s === 'etut' || s.includes('etüt') || s.includes('etut');
}

export function resolveStudyRoomForClassLevel(classLevel?: ClassLevel | string | null): StudyEntryKey {
  const cl = String(classLevel ?? '')
    .trim()
    .toUpperCase();
  if (!cl) return 'yks';
  if (cl === 'LGS' || cl === '8' || cl === '7' || cl.includes('8.') || cl.includes('7.')) return 'class78';
  if (cl === '5' || cl === '6' || cl.includes('5.') || cl.includes('6.')) return 'class56';
  if (cl === 'YKS' || cl.includes('TYT') || cl.includes('AYT') || cl.includes('12')) return 'yks';
  if (cl.includes('9') || cl.includes('10') || cl.includes('11')) return 'class911';
  return 'yks';
}

export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startEtutSession(session: Omit<PendingEtutSession, 'startedAt' | 'date'> & { date?: string }): void {
  if (!session.studentId) return;
  const payload: PendingEtutSession = {
    ...session,
    subject: session.subject || 'Etüt',
    topic: session.topic || session.label || 'Etüt çalışması',
    date: (session.date || session.plannerDate || todayYmd()).slice(0, 10),
    plannerDate: session.plannerDate || session.date,
    startedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    sessionStorage.setItem(RETURN_FLAG_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function hasEtutReturnReportFlag(): boolean {
  try {
    return sessionStorage.getItem(RETURN_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function getPendingEtutSession(): PendingEtutSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingEtutSession;
    if (!parsed?.studentId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingEtutSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(RETURN_FLAG_KEY);
  } catch {
    /* ignore */
  }
}

export function pendingEtutSessionForStudent(studentId: string): PendingEtutSession | null {
  const p = getPendingEtutSession();
  if (!p || p.studentId !== studentId) return null;
  return p;
}

export async function joinEtutStudyRoom(opts: {
  studentId: string;
  classLevel?: ClassLevel | string | null;
  institutionId?: string | null;
  plannerEntryId?: string;
  plannerDate?: string;
  startTime?: string;
  endTime?: string;
  topic?: string;
  date?: string;
  source?: EtutSessionSource;
  busy?: (v: boolean) => void;
}): Promise<void> {
  const room = resolveStudyRoomForClassLevel(opts.classLevel);
  const links =
    (await fetchAcademicCenterLinksFromServer(opts.institutionId).catch(() => null)) ||
    loadAcademicCenterLinks(opts.institutionId);
  const url = studyEntryUrl(links, room);
  if (!url) throw new Error('Etüt sınıfı bağlantısı tanımlı değil. Yönetici Akademik Merkez ayarlarını kontrol etsin.');

  startEtutSession({
    studentId: opts.studentId,
    source: opts.source || 'academic-center',
    subject: 'Etüt',
    topic: opts.topic || 'Etüt çalışması',
    date: opts.date || opts.plannerDate,
    plannerDate: opts.plannerDate || opts.date,
    startTime: opts.startTime,
    endTime: opts.endTime,
    plannerEntryId: opts.plannerEntryId,
    label: room,
  });

  if (isBbbAutoMeetingLink(url)) {
    await openAcademicCenterLink(url, {
      room,
      kind: 'study',
      institutionId: opts.institutionId,
      busy: opts.busy,
    });
    return;
  }
  await openAcademicCenterLink(url, {
    kind: 'study',
    institutionId: opts.institutionId,
    busy: opts.busy,
  });
}

export const ETUT_RATING_LABELS: Record<number, string> = {
  1: 'Zor geçti',
  2: 'Orta',
  3: 'İyi',
  4: 'Çok iyi',
  5: 'Harika',
};
