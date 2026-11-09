import React from 'react';
import { Layers, X } from 'lucide-react';
import { groupLabel } from '../../lib/eduPrograms';
import type { ProgramGroupsState } from '../../hooks/useProgramGroups';
import ProgramGroupPicker from './ProgramGroupPicker';

type Props = {
  groups: ProgramGroupsState;
  value: string[];
  onChange: (classIds: string[]) => void;
  preferredLevel?: string | null;
};

/**
 * Yeni öğrenci kaydında program seçimi (Program → Sınıf seviyesi → Şube/Grup).
 * Seçilen gruplar kayıt tamamlanınca eklenir; birden fazla program seçilebilir.
 */
export default function ProgramEnrollmentDraft({ groups, value, onChange, preferredLevel }: Props) {
  const { programs, programsById, classes, setupRequired } = groups;
  if (setupRequired) return null;
  const byId = new Map(classes.map((c) => [c.id, c]));
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <Layers className="h-4 w-4 text-indigo-600" aria-hidden />
        Program kaydı <span className="font-normal text-slate-500">(isteğe bağlı, birden fazla seçilebilir)</span>
      </p>
      {value.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((id) => {
            const c = byId.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs text-slate-800"
              >
                {c ? groupLabel(c, programsById) : id}
                <button
                  type="button"
                  aria-label="Kaldır"
                  onClick={() => onChange(value.filter((x) => x !== id))}
                  className="rounded-full p-0.5 text-slate-400 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
      <ProgramGroupPicker
        programs={programs}
        classes={classes}
        excludeClassIds={value}
        preferredLevel={preferredLevel}
        buttonLabel="Ekle"
        onPick={(id) => onChange([...new Set([...value, id])])}
        createGroup={groups.canManage ? { institutionId: groups.institutionId || null, onCreated: groups.reload } : undefined}
      />
    </div>
  );
}
