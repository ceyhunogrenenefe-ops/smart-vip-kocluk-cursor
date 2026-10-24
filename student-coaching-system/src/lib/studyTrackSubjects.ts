/**
 * Paragraf çözme, problem çözme, kitap okuma, deneme sınavı ve deneme analizi — ders havuzundan bağımsız,
 * her kademede ayrı "ders" satırı olarak listelenir (konu havuzuna dokunulmaz).
 */

export const STUDY_TRACK_SUBJECTS = [
  'Paragraf Çözme',
  'Problem Çözme',
  'Kitap Okuma',
  'Deneme Sınavı',
  'Deneme Analizi'
] as const;

export const DENEME_ANALIZI_SUBJECT: StudyTrackSubjectName = 'Deneme Analizi';

export type StudyTrackSubjectName = (typeof STUDY_TRACK_SUBJECTS)[number];

const TRACK_TOPICS: Record<StudyTrackSubjectName, string[]> = {
  'Paragraf Çözme': ['Günlük paragraf', 'Haftalık paragraf hedefi', 'Tekrar / deneme'],
  'Problem Çözme': ['Günlük problem', 'Haftalık problem hedefi', 'Konu testi / tekrar'],
  'Kitap Okuma': ['Sayfa hedefi', 'Kitap bitirme', 'Günlük okuma'],
  // Öğrenci çözdüğü denemenin doğru / yanlış / boş sayısını girer (soru birimi)
  'Deneme Sınavı': ['Genel deneme', 'Branş denemesi', 'Deneme tekrarı / analiz'],
  // Deneme sonrası: yanlış/boş soruları yeniden çözme ve eksik konu tespiti (soru birimi)
  'Deneme Analizi': [
    'Yanlış / boş soru analizi',
    'Hata karnesi çıkarma',
    'Eksik konu tekrarı',
    'Benzer soru çözümü'
  ]
};

export function isDenemeAnaliziSubject(subject: string | null | undefined): boolean {
  return String(subject || '').trim() === DENEME_ANALIZI_SUBJECT;
}

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

  // Kitap okuma, deneme sınavı ve deneme analizi: tüm kademeler
  out['Kitap Okuma'] = [...TRACK_TOPICS['Kitap Okuma']];
  out['Deneme Sınavı'] = [...TRACK_TOPICS['Deneme Sınavı']];
  out['Deneme Analizi'] = [...TRACK_TOPICS['Deneme Analizi']];

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

/** Konu başlıklarında kısaltma olarak kalacak kelimeler (TYT, AYT, LGS…) */
const KEEP_UPPER_WORDS = new Set(['TYT', 'AYT', 'LGS', 'YKS', 'YÖS', 'YOS', 'MEB', 'AP', 'IB']);

function subjectDisplayName(subject: string): string {
  return subject
    .trim()
    .split(/\s+/)
    .map((w) => {
      if (KEEP_UPPER_WORDS.has(w.toLocaleUpperCase('tr-TR'))) return w.toLocaleUpperCase('tr-TR');
      const lower = w.toLocaleLowerCase('tr-TR');
      return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
    })
    .join(' ');
}

/** Ders adına göre branş denemesi konusu: "TYT FİZİK" → "TYT Fizik Branş Denemesi" */
export function bransDenemesiTopic(subject: string): string {
  return `${subjectDisplayName(subject)} Branş Denemesi`;
}

/** Planlayıcı başlığı branş denemesi mi? (Konu Takibi'ne işlenmez) */
export function isBransDenemesiTitle(title: string | null | undefined): boolean {
  return /branş\s*denemesi|brans\s*denemesi/i.test(String(title || ''));
}

/**
 * Ders konu listesinin sonuna o dersin branş denemesini ekler.
 * Çalışma alanları (Deneme Sınavı, Kitap Okuma…), etüt/rehberlik ve konusu olmayan dersler hariç.
 */
export function withBransDenemesiTopic(subject: string, topics: string[]): string[] {
  const sub = String(subject || '').trim();
  if (!sub || !topics.length || isStudyTrackSubject(sub)) return topics;
  if (/etüt|etut|rehberlik|kitap okuma/i.test(sub)) return topics;
  if (topics.some((t) => isBransDenemesiTitle(t))) return topics;
  return [...topics, bransDenemesiTopic(sub)];
}
