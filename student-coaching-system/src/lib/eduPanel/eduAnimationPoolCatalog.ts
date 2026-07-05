import { subjectsForGrade } from '../questionHelp/subjects';

export type AnimationPoolProgram = 'lgs' | 'tyt' | 'ayt';

export type AnimationPoolProgramGroup = {
  key: AnimationPoolProgram;
  label: string;
  levels: { value: string; label: string }[];
};

export const ANIMATION_POOL_PROGRAMS: AnimationPoolProgramGroup[] = [
  {
    key: 'lgs',
    label: 'LGS',
    levels: [
      { value: '5', label: '5. Sınıf' },
      { value: '6', label: '6. Sınıf' },
      { value: '7', label: '7. Sınıf' },
      { value: '8', label: '8. Sınıf' }
    ]
  },
  {
    key: 'tyt',
    label: 'TYT',
    levels: [
      { value: '9', label: '9. Sınıf' },
      { value: '10', label: '10. Sınıf' },
      { value: '11', label: '11. Sınıf' }
    ]
  },
  {
    key: 'ayt',
    label: 'AYT',
    levels: [{ value: '12', label: '12. Sınıf' }]
  }
];

export function poolClassLevelLabel(program: AnimationPoolProgram, classLevel: string): string {
  const group = ANIMATION_POOL_PROGRAMS.find((g) => g.key === program);
  const hit = group?.levels.find((l) => l.value === classLevel);
  return hit?.label || `${classLevel}. Sınıf`;
}

export function subjectsForPoolClass(classLevel: string): string[] {
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
