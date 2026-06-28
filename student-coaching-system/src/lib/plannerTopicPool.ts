import { topicPool } from '../data/mockData';
import { STUDY_TRACK_SUBJECTS } from './studyTrackSubjects';

/** Konu havuzu dışında planlayıcı müfredatında kullanılan ders türleri */
export const PLANNER_EXTRA_SUBJECTS = [
  'Etüt',
  'Kitap Okuma Atölyesi',
  'Rehberlik',
  ...STUDY_TRACK_SUBJECTS
] as const;

/** Konu havuzundaki ders adları + etüt / kitap okuma vb. — planlayıcı müfredat seçimi için */
export const PLANNER_POOL_SUBJECTS = [
  ...new Set([...Object.keys(topicPool), ...PLANNER_EXTRA_SUBJECTS])
].sort((a, b) => a.localeCompare(b, 'tr'));

export type PlannerCurriculumLine = { subject: string; hours: number; teacher?: string };

/** Hazır haftalık ders saati şablonları */
export const PLANNER_CURRICULUM_PRESETS: Record<string, PlannerCurriculumLine[]> = {
  LGS: [
    { subject: 'MATEMATİK', hours: 3 },
    { subject: 'FEN BİLİMLERİ', hours: 2 },
    { subject: 'İNGİLİZCE', hours: 2 },
    { subject: 'TÜRKÇE', hours: 2 },
    { subject: 'İNKILAP TARİHİ', hours: 1 },
    { subject: 'DİN KÜLTÜRÜ', hours: 1 }
  ],
  '5-6-7 Yaz Kampı': [
    { subject: 'MATEMATİK', hours: 2 },
    { subject: 'FEN BİLİMLERİ', hours: 2 },
    { subject: 'Kitap Okuma Atölyesi', hours: 8 },
    { subject: 'REHBERLİK', hours: 1 }
  ]
};
