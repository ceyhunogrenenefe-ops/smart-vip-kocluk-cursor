import React from 'react';
import { CircleHelp } from 'lucide-react';
import { ALL_QUESTION_SUBJECTS, QUESTION_GRADE_OPTIONS } from '../../lib/questionHelp/subjects';

export type TeacherQuestionProfileValue = {
  branches: string[];
  grades: string[];
};

type Props = {
  value: TeacherQuestionProfileValue;
  onChange: (next: TeacherQuestionProfileValue) => void;
  disabled?: boolean;
};

function toggle(list: string[], item: string, on: boolean): string[] {
  if (on) return list.includes(item) ? list : [...list, item];
  return list.filter((x) => x !== item);
}

export default function TeacherQuestionProfileFields({ value, onChange, disabled }: Props) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 space-y-4 dark:border-violet-900/50 dark:bg-violet-950/30">
      <div className="flex items-start gap-2">
        <CircleHelp className="w-5 h-5 text-violet-700 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-violet-950 dark:text-violet-100">Soru Sor — branş ve sınıf</p>
          <p className="text-xs text-violet-800/90 dark:text-violet-300/90 mt-0.5">
            Öğretmen yalnızca seçilen ders ve sınıf/sınav grubundaki soruları görür; bildirimler buna göre gider.
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-slate-300 mb-2">Branşlar (en az 1) *</p>
        <div className="flex flex-wrap gap-x-3 gap-y-2 max-h-36 overflow-y-auto pr-1">
          {ALL_QUESTION_SUBJECTS.map((b) => (
            <label
              key={b}
              className="inline-flex items-center gap-1.5 text-xs text-gray-800 dark:text-slate-200 cursor-pointer"
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={value.branches.includes(b)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    branches: toggle(value.branches, b, e.target.checked)
                  })
                }
                className="rounded border-gray-300"
              />
              {b}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-slate-300 mb-2">Sınıf / sınav grubu (en az 1) *</p>
        <div className="flex flex-wrap gap-2">
          {QUESTION_GRADE_OPTIONS.map((g) => (
            <label
              key={g.value}
              className="inline-flex items-center gap-1.5 text-xs text-gray-800 dark:text-slate-200 cursor-pointer"
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={value.grades.includes(g.value)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    grades: toggle(value.grades, g.value, e.target.checked)
                  })
                }
                className="rounded border-gray-300"
              />
              {g.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}