import { topicPool } from '../data/mockData';

/** Konu havuzundaki ders adları — planlayıcı müfredat seçimi için */
export const PLANNER_POOL_SUBJECTS = Object.keys(topicPool).sort((a, b) =>
  a.localeCompare(b, 'tr')
);

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
  ]
};
