/** Soru Sor — sınıf / sınav grubuna göre dinamik ders listesi */

export type QuestionGradeGroup = 'ilkokul' | 'ortaokul' | 'lise' | 'lgs' | 'tyt' | 'ayt';

export const QUESTION_GRADE_OPTIONS: { value: string; label: string; group: QuestionGradeGroup }[] = [
  { value: '3', label: '3. Sınıf', group: 'ilkokul' },
  { value: '4', label: '4. Sınıf', group: 'ilkokul' },
  { value: '5', label: '5. Sınıf', group: 'ortaokul' },
  { value: '6', label: '6. Sınıf', group: 'ortaokul' },
  { value: '7', label: '7. Sınıf', group: 'ortaokul' },
  { value: '8', label: '8. Sınıf', group: 'ortaokul' },
  { value: '9', label: '9. Sınıf', group: 'lise' },
  { value: '10', label: '10. Sınıf', group: 'lise' },
  { value: '11', label: '11. Sınıf', group: 'lise' },
  { value: '12', label: '12. Sınıf', group: 'lise' },
  { value: 'LGS', label: 'LGS', group: 'lgs' },
  { value: 'TYT', label: 'TYT', group: 'tyt' },
  { value: 'AYT', label: 'AYT', group: 'ayt' }
];

const COMMON = ['Matematik', 'Türkçe'] as const;

const ORTAOKUL = [
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'İngilizce',
  'İnkılap Tarihi',
  'Din Kültürü',
  'Hayat Bilgisi'
] as const;

const LISE = [
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Geometri',
  'Tarih',
  'Coğrafya',
  'Edebiyat',
  'Felsefe',
  'İngilizce'
] as const;

const LGS = ['Fen Bilimleri', 'İnkılap Tarihi', 'Din Kültürü', 'İngilizce'] as const;

const TYT_AYT = [
  'Geometri',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Edebiyat',
  'Tarih',
  'Coğrafya',
  'Felsefe'
] as const;

function uniq(list: readonly string[]): string[] {
  return [...new Set(list)];
}

export function subjectsForGrade(grade: string): string[] {
  const g = String(grade || '').trim();
  const opt = QUESTION_GRADE_OPTIONS.find((o) => o.value === g);
  const group = opt?.group;

  if (group === 'ilkokul') {
    return uniq([...COMMON, 'Hayat Bilgisi', 'Fen Bilimleri', 'İngilizce']);
  }
  if (group === 'ortaokul') {
    return uniq([...COMMON, ...ORTAOKUL]);
  }
  if (group === 'lgs') {
    return uniq([...COMMON, ...LGS]);
  }
  if (group === 'tyt') {
    return uniq([...COMMON, ...TYT_AYT]);
  }
  if (group === 'ayt') {
    return uniq([...COMMON, ...TYT_AYT]);
  }
  if (group === 'lise') {
    return uniq([...COMMON, ...LISE]);
  }
  return uniq([...COMMON]);
}

export function gradeGroupLabel(grade: string): string {
  return QUESTION_GRADE_OPTIONS.find((o) => o.value === grade)?.label ?? grade;
}

/** İstemci tarafı savunma — API ile aynı kural */
export function teacherProfileMatchesQuestionLocal(
  profile: { branches: string[]; grades: string[] },
  subject: string,
  grade: string
): boolean {
  const sub = String(subject || '').trim();
  const gr = String(grade || '').trim();
  if (!profile.branches.length || !profile.branches.includes(sub)) return false;
  if (!profile.grades.length || !profile.grades.includes(gr)) return false;
  return true;
}

/** Kullanıcı yönetimi / öğretmen profili — tüm geçerli branşlar */
export const ALL_QUESTION_SUBJECTS: string[] = [
  'Matematik',
  'Türkçe',
  'Geometri',
  'Fen Bilimleri',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Sosyal Bilgiler',
  'Tarih',
  'Coğrafya',
  'Edebiyat',
  'Felsefe',
  'İngilizce',
  'İnkılap Tarihi',
  'Din Kültürü',
  'Hayat Bilgisi'
];
