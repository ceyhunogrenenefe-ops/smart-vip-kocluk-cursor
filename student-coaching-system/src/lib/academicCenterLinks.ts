import { apiFetch } from './session';
import { BBB_AUTO_MEETING_LINK, isBbbAutoMeetingLink } from './liveLessonUtils';

const STORAGE_KEY_PREFIX = 'academic_center_links_v2';

function storageKey(institutionId?: string | null) {
  const iid = String(institutionId || '').trim();
  return iid ? `${STORAGE_KEY_PREFIX}_${iid}` : `${STORAGE_KEY_PREFIX}_platform`;
}

export type ExamEntryKey = 'lise' | 'yos' | 'class34' | 'class56' | 'class78';

export type AcademicCenterLinks = {
  studyClasses: {
    class56: string;
    class78: string;
    class911: string;
    yks: string;
  };
  exams: {
    lise: string;
    yos: string;
    class34: string;
    class56: string;
    class78: string;
    optic: string;
    /** Online sınav sistemi — Sınav Blokları sayfası */
    examBlocks: string;
    /** @deprecated use lise */
    exam?: string;
  };
  questionPools: {
    pool1: string;
    pool2: string;
  };
};

export const EXAM_ENTRY_DEFS: {
  key: ExamEntryKey;
  label: string;
  accent: string;
}[] = [
  { key: 'lise', label: 'Lise deneme sınavı giriş', accent: 'from-blue-500 to-indigo-600' },
  { key: 'yos', label: 'YÖS deneme sınavı giriş', accent: 'from-rose-500 to-orange-600' },
  { key: 'class34', label: '3-4. sınıf deneme sınıfı giriş', accent: 'from-emerald-500 to-teal-600' },
  { key: 'class56', label: '5-6. sınıf deneme sınıfı giriş', accent: 'from-violet-500 to-purple-600' },
  { key: 'class78', label: '7-8. sınıf deneme sınıfı giriş', accent: 'from-fuchsia-500 to-pink-600' }
];

export { BBB_AUTO_MEETING_LINK, isBbbAutoMeetingLink };

export const defaultAcademicCenterLinks: AcademicCenterLinks = {
  studyClasses: {
    class56: 'https://kurumsal.ornek.edu/tr/etut-56',
    class78: 'https://kurumsal.ornek.edu/tr/etut-78',
    class911: 'https://kurumsal.ornek.edu/tr/etut-911',
    yks: 'https://kurumsal.ornek.edu/tr/etut-yks'
  },
  exams: {
    lise: 'https://kurumsal.ornek.edu/tr/deneme-lise',
    yos: 'https://kurumsal.ornek.edu/tr/deneme-yos',
    class34: 'https://kurumsal.ornek.edu/tr/deneme-34',
    class56: 'https://kurumsal.ornek.edu/tr/deneme-56',
    class78: 'https://kurumsal.ornek.edu/tr/deneme-78',
    optic: 'https://kurumsal.ornek.edu/tr/sanal-optik',
    examBlocks: 'https://kurumsal.ornek.edu/tr/sinav-bloklari',
    exam: 'https://kurumsal.ornek.edu/tr/deneme'
  },
  questionPools: {
    pool1: 'https://kurumsal.ornek.edu/tr/havuz-1',
    pool2: 'https://kurumsal.ornek.edu/tr/havuz-2'
  }
};

export function coerceAcademicCenterLinks(next: Partial<AcademicCenterLinks> | null | undefined): AcademicCenterLinks {
  const d = defaultAcademicCenterLinks;
  if (!next || typeof next !== 'object') return JSON.parse(JSON.stringify(d)) as AcademicCenterLinks;
  const exams = { ...d.exams, ...(next.exams || {}) };
  if (exams.exam && !exams.lise) exams.lise = exams.exam;
  if (!exams.lise && exams.exam) exams.lise = exams.exam;
  return {
    studyClasses: { ...d.studyClasses, ...(next.studyClasses || {}) },
    exams,
    questionPools: { ...d.questionPools, ...(next.questionPools || {}) }
  };
}

export function loadAcademicCenterLinks(institutionId?: string | null): AcademicCenterLinks | null {
  try {
    const raw = localStorage.getItem(storageKey(institutionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AcademicCenterLinks> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return coerceAcademicCenterLinks(parsed);
  } catch {
    return null;
  }
}

export function saveAcademicCenterLinksLocal(next: AcademicCenterLinks, institutionId?: string | null): void {
  try {
    localStorage.setItem(storageKey(institutionId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export async function fetchAcademicCenterLinksFromServer(
  institutionId?: string | null
): Promise<AcademicCenterLinks> {
  const qs = institutionId ? `?institution_id=${encodeURIComponent(institutionId)}` : '';
  const res = await apiFetch(`/api/academic-center-links${qs}`);
  const json = (await res.json().catch(() => ({}))) as {
    data?: AcademicCenterLinks;
    warning?: string;
    defaults?: boolean;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`);
  }

  const data = coerceAcademicCenterLinks(json.data);
  saveAcademicCenterLinksLocal(data, institutionId);
  return data;
}

export async function saveAcademicCenterLinksToServer(
  next: AcademicCenterLinks,
  institutionId?: string | null
): Promise<AcademicCenterLinks> {
  const body: Record<string, unknown> = { links: coerceAcademicCenterLinks(next) };
  if (institutionId) body.institution_id = institutionId;

  const res = await apiFetch('/api/academic-center-links', {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: AcademicCenterLinks;
    error?: string;
  };

  if (!res.ok) {
    const detail =
      typeof json.error === 'string' && json.error.trim() ? json.error.trim() : 'Kayıt başarısız.';
    throw new Error(detail);
  }

  const saved = coerceAcademicCenterLinks(json.data);
  saveAcademicCenterLinksLocal(saved, institutionId);
  return saved;
}

export async function openAcademicCenterLink(
  url: string,
  opts?: { room?: ExamEntryKey; institutionId?: string | null; busy?: (v: boolean) => void }
): Promise<void> {
  const href = String(url || '').trim();
  if (!href) return;

  if (isBbbAutoMeetingLink(href) && opts?.room) {
    opts.busy?.(true);
    try {
      const qs = new URLSearchParams({ room: opts.room });
      if (opts.institutionId) qs.set('institution_id', opts.institutionId);
      const res = await apiFetch(`/api/academic-center-bbb-join?${qs.toString()}`);
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || 'BBB oturumu açılamadı');
      }
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } finally {
      opts.busy?.(false);
    }
    return;
  }

  window.open(href, '_blank', 'noopener,noreferrer');
}

export function examEntryUrl(links: AcademicCenterLinks, key: ExamEntryKey): string {
  const v = links.exams[key];
  if (v && String(v).trim()) return String(v).trim();
  const legacy = links.exams.exam;
  if (key === 'lise' && legacy) return String(legacy).trim();
  return '';
}
