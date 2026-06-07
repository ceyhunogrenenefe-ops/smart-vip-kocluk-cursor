/**
 * Paragraf çözme, problem çözme ve kitap okuma — ders havuzundan bağımsız,
 * her kademede ayrı "ders" satırı olarak listelenir (konu havuzuna dokunulmaz).
 */

export const STUDY_TRACK_SUBJECTS = ['Paragraf Çözme', 'Problem Çözme', 'Kitap Okuma'] as const;

export type StudyTrackSubjectName = (typeof STUDY_TRACK_SUBJECTS)[number];

const TRACK_TOPICS: Record<StudyTrackSubjectName, string[]> = {
  'Paragraf Çözme': ['Günlük paragraf', 'Haftalık paragraf hedefi', 'Tekrar / deneme'],
  'Problem Çözme': ['Günlük problem', 'Haftalık problem hedefi', 'Konu testi / tekrar'],
  'Kitap Okuma': ['Sayfa hedefi', 'Kitap bitirme', 'Günlük okuma']
};

export function isStudyTrackSubject(subject: string): boolean {
  return (STUDY_TRACK_SUBJECTS as readonly string[]).includes(subject);
}

/** Kitap okuma dersi veya kitap odaklı hedef */
export function isKitapOkumaContext(subject: string, title?: string): boolean {
  if (subject === 'Kitap Okuma') return true;
  const t = String(title || '').toLowerCase();
  return /kitap|okuma/.test(t);
}

/** Koç hedefi birimi: kitap okuma → sayfa, diğer çalışma alanları → soru/adet */
export function defaultGoalUnitForSubject(subject: string): 'soru' | 'sayfa' | 'dakika' {
  if (subject === 'Kitap Okuma') return 'sayfa';
  return 'soru';
}

function classLevelKey(classLevel: number | string | undefined | null): string {
  if (classLevel === undefined || classLevel === null || classLevel === '') return '';
  return String(classLevel).trim();
}

function numericGrade(classLevel: number | string): number | null {
  if (typeof classLevel === 'number' && Number.isFinite(classLevel)) return classLevel;
  const n = parseInt(String(classLevel), 10);
  return Number.isFinite(n) ? n : null;
}

/** Sınıf kademesine göre ek ders + alt konu listesi */
export function studyTracksForClassLevel(
  classLevel: number | string | undefined | null
): Record<string, string[]> {
  const key = classLevelKey(classLevel);
  if (!key) return {};

  const out: Record<string, string[]> = {};
  const n = numericGrade(classLevel as number | string);

  // Kitap okuma: tüm kademeler
  out['Kitap Okuma'] = [...TRACK_TOPICS['Kitap Okuma']];

  const isLgs = key === 'LGS';
  const isYks = key.startsWith('YKS-');
  const isYos = key === 'YOS';
  const isMaarif = key === 'TYT-Maarif';
  const isUpper =
    isLgs ||
    isYks ||
    isYos ||
    isMaarif ||
    (n != null && n >= 5) ||
    key === '5' ||
    key === '6' ||
    key === '7' ||
    key === '8';

  if (isUpper) {
    out['Paragraf Çözme'] = [...TRACK_TOPICS['Paragraf Çözme']];
    out['Problem Çözme'] = [...TRACK_TOPICS['Problem Çözme']];
  }

  return out;
}

/** Ders listesinde çalışma alanlarını sonda, sabit sırada tut */
export function sortSubjectsWithStudyTracks(subjects: string[]): string[] {
  const base = subjects.filter((s) => !isStudyTrackSubject(s));
  const tracks = STUDY_TRACK_SUBJECTS.filter((s) => subjects.includes(s));
  base.sort((a, b) => a.localeCompare(b, 'tr'));
  return [...base, ...tracks];
}

/** getTopicsByClass `regular` kaydına ekle (mevcut derslere dokunmadan) */
export function mergeStudyTracksIntoSubjects(
  classLevel: number | string | undefined | null,
  subjects: Record<string, string[]>
): Record<string, string[]> {
  const tracks = studyTracksForClassLevel(classLevel);
  if (!Object.keys(tracks).length) return subjects;
  return { ...subjects, ...tracks };
}
