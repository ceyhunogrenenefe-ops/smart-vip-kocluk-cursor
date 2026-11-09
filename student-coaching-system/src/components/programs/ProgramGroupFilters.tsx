import React, { useMemo } from 'react';
import {
  NO_PROGRAM,
  groupLabel,
  levelLabel,
  sortLevels,
  type EduProgram,
  type ProgramClass,
  type ProgramGroupFilter
} from '../../lib/eduPrograms';

type Props = {
  value: ProgramGroupFilter;
  onChange: (next: ProgramGroupFilter) => void;
  programs: EduProgram[];
  programsById: Map<string, EduProgram>;
  classes: ProgramClass[];
  className?: string;
  selectClassName?: string;
};

/** Program → Sınıf seviyesi → Şube/Grup filtresi (listeler için) */
export default function ProgramGroupFilters({
  value,
  onChange,
  programs,
  programsById,
  classes,
  className,
  selectClassName
}: Props) {
  const hasUnassigned = useMemo(() => classes.some((c) => !c.program_id), [classes]);

  const inProgram = useMemo(
    () =>
      classes.filter((c) =>
        !value.programId ? true : value.programId === NO_PROGRAM ? !c.program_id : c.program_id === value.programId
      ),
    [classes, value.programId]
  );

  const levels = useMemo(
    () => sortLevels([...new Set(inProgram.map((c) => String(c.class_level ?? '')).filter(Boolean))]),
    [inProgram]
  );

  const groups = useMemo(
    () => inProgram.filter((c) => !value.level || String(c.class_level ?? '') === value.level),
    [inProgram, value.level]
  );

  const sel =
    selectClassName ||
    'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none';

  return (
    <div className={className || 'flex flex-wrap gap-2'}>
      <select
        aria-label="Eğitim programı"
        value={value.programId}
        onChange={(e) => onChange({ programId: e.target.value, level: '', classId: '' })}
        className={sel}
      >
        <option value="">Tüm programlar</option>
        {programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.is_active ? '' : ' (pasif)'}
          </option>
        ))}
        {hasUnassigned ? <option value={NO_PROGRAM}>Programsız gruplar</option> : null}
      </select>
      <select
        aria-label="Sınıf seviyesi"
        value={value.level}
        onChange={(e) => onChange({ ...value, level: e.target.value, classId: '' })}
        className={sel}
        disabled={!levels.length}
      >
        <option value="">Tüm seviyeler</option>
        {levels.map((l) => (
          <option key={l} value={l}>
            {levelLabel(l)}
          </option>
        ))}
      </select>
      <select
        aria-label="Şube / grup"
        value={value.classId}
        onChange={(e) => onChange({ ...value, classId: e.target.value })}
        className={sel}
        disabled={!groups.length}
      >
        <option value="">Tüm şube/gruplar</option>
        {groups.map((c) => (
          <option key={c.id} value={c.id}>
            {value.programId && value.level ? c.name : groupLabel(c, programsById)}
          </option>
        ))}
      </select>
    </div>
  );
}
