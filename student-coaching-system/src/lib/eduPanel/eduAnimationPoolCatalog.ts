import { subjectsForGrade } from '../questionHelp/subjects';
import type { EduAnimationPoolItem, EduAnimationPoolTarget } from '../../types/eduPanel.types';

export type AnimationPoolProgram = 'lgs' | 'tyt' | 'ayt';

export type AnimationPoolClassCard = {
  classLevel: string;
  label: string;
  program: AnimationPoolProgram;
  topicPoolClassKey: string | number;
  badge?: string;
};

export type AnimationPoolTargetGroup = {
  label: string;
  items: AnimationPoolClassCard[];
};

/** Temel sınıf kartları */
export const ANIMATION_POOL_CLASS_CARDS: AnimationPoolClassCard[] = [
  { classLevel: '3', label: '3. Sınıf', program: 'lgs', topicPoolClassKey: 3 },
  { classLevel: '4', label: '4. Sınıf', program: 'lgs', topicPoolClassKey: 4 },
  { classLevel: '5', label: '5. Sınıf', program: 'lgs', topicPoolClassKey: 5 },
  { classLevel: '6', label: '6. Sınıf', program: 'lgs', topicPoolClassKey: 6 },
  { classLevel: '7', label: '7. Sınıf', program: 'lgs', topicPoolClassKey: 7 },
  {
    classLevel: '8',
    label: '8. Sınıf',
    program: 'lgs',
    topicPoolClassKey: 'LGS',
    badge: 'LGS'
  },
  { classLevel: '9', label: '9. Sınıf', program: 'tyt', topicPoolClassKey: 9 },
  { classLevel: '10', label: '10. Sınıf', program: 'tyt', topicPoolClassKey: 10 },
  { classLevel: '11', label: '11. Sınıf', program: 'tyt', topicPoolClassKey: 11 },
  {
    classLevel: '12',
    label: '12. Sınıf',
    program: 'ayt',
    topicPoolClassKey: 12,
    badge: 'AYT'
  }
];

/** Ek program / kamp kategorileri */
export const ANIMATION_POOL_EXTRA_TARGETS: AnimationPoolClassCard[] = [
  {
    classLevel: 'TYT-Maarif',
    label: 'TYT Maarif Model',
    program: 'tyt',
    topicPoolClassKey: 'TYT-Maarif',
    badge: 'Maarif'
  },
  {
    classLevel: 'kamp-lgs',
    label: 'LGS Yaz Kampı',
    program: 'lgs',
    topicPoolClassKey: 'LGS',
    badge: 'Kamp'
  },
  {
    classLevel: 'kamp-yaz',
    label: 'Yaz Kampı',
    program: 'tyt',
    topicPoolClassKey: 9,
    badge: 'Kamp'
  },
  {
    classLevel: 'kamp-tyt',
    label: 'TYT Kampı',
    program: 'tyt',
    topicPoolClassKey: 'YKS-Sayısal',
    badge: 'Kamp'
  },
  {
    classLevel: 'kamp-ayt',
    label: 'AYT Kampı',
    program: 'ayt',
    topicPoolClassKey: 'YKS-Sayısal',
    badge: 'Kamp'
  }
];

export const ANIMATION_POOL_ALL_TARGETS: AnimationPoolClassCard[] = [
  ...ANIMATION_POOL_CLASS_CARDS,
  ...ANIMATION_POOL_EXTRA_TARGETS
];

export const ANIMATION_POOL_TARGET_GROUPS: AnimationPoolTargetGroup[] = [
  {
    label: 'İlkokul & Ortaokul',
    items: ANIMATION_POOL_CLASS_CARDS.filter((c) => c.program === 'lgs' && !c.badge)
  },
  {
    label: 'LGS & Lise',
    items: ANIMATION_POOL_CLASS_CARDS.filter((c) => c.badge === 'LGS' || c.program === 'tyt' || c.badge === 'AYT')
  },
  {
    label: 'Özel Programlar & Kamplar',
    items: ANIMATION_POOL_EXTRA_TARGETS
  }
];

/** Gezinme (filtre) için tüm kartlar */
export const ANIMATION_POOL_NAV_CARDS: AnimationPoolClassCard[] = ANIMATION_POOL_ALL_TARGETS;

export type AnimationPoolProgramGroup = {
  key: AnimationPoolProgram;
  label: string;
  levels: { value: string; label: string }[];
};

export const ANIMATION_POOL_PROGRAMS: AnimationPoolProgramGroup[] = [
  {
    key: 'lgs',
    label: 'İlkokul / Ortaokul / LGS',
    levels: ANIMATION_POOL_CLASS_CARDS.filter((c) => c.program === 'lgs').map((c) => ({
      value: c.classLevel,
      label: c.badge ? `${c.label} (${c.badge})` : c.label
    }))
  },
  {
    key: 'tyt',
    label: 'TYT',
    levels: ANIMATION_POOL_CLASS_CARDS.filter((c) => c.program === 'tyt').map((c) => ({
      value: c.classLevel,
      label: c.label
    }))
  },
  {
    key: 'ayt',
    label: 'AYT',
    levels: ANIMATION_POOL_CLASS_CARDS.filter((c) => c.program === 'ayt').map((c) => ({
      value: c.classLevel,
      label: c.badge ? `${c.label} (${c.badge})` : c.label
    }))
  }
];

export function poolTargetKey(program: AnimationPoolProgram, classLevel: string): string {
  return `${program}:${classLevel}`;
}

export function parsePoolTargetKey(key: string): EduAnimationPoolTarget | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const program = key.slice(0, idx) as AnimationPoolProgram;
  const class_level = key.slice(idx + 1);
  if (!['lgs', 'tyt', 'ayt'].includes(program) || !class_level) return null;
  return { program, class_level };
}

export function targetsFromKeys(keys: string[]): EduAnimationPoolTarget[] {
  const out: EduAnimationPoolTarget[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const parsed = parsePoolTargetKey(key);
    if (!parsed) continue;
    const id = poolTargetKey(parsed.program, parsed.class_level);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(parsed);
  }
  return out;
}

export function normalizePoolTargets(item: EduAnimationPoolItem): EduAnimationPoolTarget[] {
  if (item.targets?.length) return item.targets;
  return [{ program: item.program, class_level: item.class_level }];
}

export function poolItemMatchesFilter(
  item: EduAnimationPoolItem,
  program?: string | null,
  classLevel?: string | null
): boolean {
  if (!program && !classLevel) return true;
  return normalizePoolTargets(item).some(
    (t) =>
      (!program || t.program === program) &&
      (!classLevel || t.class_level === classLevel)
  );
}

export function classCardForLevel(classLevel: string | null | undefined): AnimationPoolClassCard | null {
  if (!classLevel) return null;
  return ANIMATION_POOL_ALL_TARGETS.find((c) => c.classLevel === classLevel) || null;
}

export function classCardForTarget(
  program: AnimationPoolProgram,
  classLevel: string
): AnimationPoolClassCard | null {
  return (
    ANIMATION_POOL_ALL_TARGETS.find(
      (c) => c.program === program && c.classLevel === classLevel
    ) || null
  );
}

export function classCardForPoolItem(
  item: EduAnimationPoolItem,
  prefer?: { program?: string; classLevel?: string }
): AnimationPoolClassCard | null {
  const targets = normalizePoolTargets(item);
  if (prefer?.program && prefer?.classLevel) {
    const hit = targets.find(
      (t) => t.program === prefer.program && t.class_level === prefer.classLevel
    );
    if (hit) return classCardForTarget(hit.program, hit.class_level);
  }
  const primary = targets[0];
  if (!primary) return null;
  return classCardForTarget(primary.program, primary.class_level);
}

export function formatPoolTargetLabel(target: EduAnimationPoolTarget): string {
  const card = classCardForTarget(target.program, target.class_level);
  if (!card) return `${target.class_level} · ${target.program.toUpperCase()}`;
  return card.badge ? `${card.label} (${card.badge})` : card.label;
}

export function poolClassLevelLabel(program: AnimationPoolProgram, classLevel: string): string {
  return formatPoolTargetLabel({ program, class_level: classLevel });
}

export function subjectsForPoolClass(classLevel: string): string[] {
  const card = classCardForLevel(classLevel);
  if (card?.topicPoolClassKey === 'LGS') {
    return subjectsForGrade('LGS');
  }
  if (card?.topicPoolClassKey === 'TYT-Maarif') {
    return subjectsForGrade('TYT');
  }
  if (card?.topicPoolClassKey === 'YKS-Sayısal') {
    return subjectsForGrade('TYT');
  }
  if (card?.program === 'ayt') {
    return subjectsForGrade('AYT');
  }
  if (card?.program === 'tyt') {
    return subjectsForGrade('TYT');
  }
  return subjectsForGrade(classLevel);
}

export function subjectCoverGradient(subjectName: string): string {
  const s = subjectName.toLowerCase();
  if (s.includes('matematik') || s.includes('geometri')) return 'from-blue-500 to-indigo-600';
  if (s.includes('fizik')) return 'from-violet-500 to-purple-700';
  if (s.includes('kimya')) return 'from-emerald-500 to-teal-700';
  if (s.includes('biyoloji') || s.includes('fen')) return 'from-green-500 to-emerald-700';
  if (s.includes('türk') || s.includes('edebiyat')) return 'from-rose-500 to-red-600';
  if (s.includes('tarih') || s.includes('inkılap')) return 'from-amber-500 to-orange-600';
  if (s.includes('coğrafya') || s.includes('sosyal')) return 'from-cyan-500 to-sky-700';
  if (s.includes('ingilizce')) return 'from-fuchsia-500 to-pink-600';
  return 'from-slate-500 to-slate-700';
}
