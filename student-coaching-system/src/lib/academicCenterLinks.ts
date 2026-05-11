import { apiFetch } from './session';

const STORAGE_KEY = 'academic_center_links_v1';

export type AcademicCenterLinks = {
  studyClasses: {
    class56: string;
    class78: string;
    class911: string;
    yks: string;
  };
  exams: {
    exam: string;
    optic: string;
  };
  questionPools: {
    pool1: string;
    pool2: string;
  };
};

export const defaultAcademicCenterLinks: AcademicCenterLinks = {
  studyClasses: {
    class56: 'https://kurumsal.ornek.edu/tr/etut-56',
    class78: 'https://kurumsal.ornek.edu/tr/etut-78',
    class911: 'https://kurumsal.ornek.edu/tr/etut-911',
    yks: 'https://kurumsal.ornek.edu/tr/etut-yks'
  },
  exams: {
    exam: 'https://kurumsal.ornek.edu/tr/deneme',
    optic: 'https://kurumsal.ornek.edu/tr/sanal-optik'
  },
  questionPools: {
    pool1: 'https://kurumsal.ornek.edu/tr/havuz-1',
    pool2: 'https://kurumsal.ornek.edu/tr/havuz-2'
  }
};

export function coerceAcademicCenterLinks(next: Partial<AcademicCenterLinks> | null | undefined): AcademicCenterLinks {
  const d = defaultAcademicCenterLinks;
  if (!next || typeof next !== 'object') return { ...d };
  return {
    studyClasses: { ...d.studyClasses, ...(next.studyClasses || {}) },
    exams: { ...d.exams, ...(next.exams || {}) },
    questionPools: { ...d.questionPools, ...(next.questionPools || {}) }
  };
}

export function loadAcademicCenterLinks(): AcademicCenterLinks | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AcademicCenterLinks> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return coerceAcademicCenterLinks(parsed);
  } catch {
    return null;
  }
}

export function saveAcademicCenterLinksLocal(next: AcademicCenterLinks): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export async function fetchAcademicCenterLinksFromServer(): Promise<AcademicCenterLinks> {
  const res = await apiFetch('/api/academic-center-links');
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
  saveAcademicCenterLinksLocal(data);
  return data;
}

export async function saveAcademicCenterLinksToServer(next: AcademicCenterLinks): Promise<AcademicCenterLinks> {
  const res = await apiFetch('/api/academic-center-links', {
    method: 'PUT',
    body: JSON.stringify(coerceAcademicCenterLinks(next))
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
  saveAcademicCenterLinksLocal(saved);
  return saved;
}
