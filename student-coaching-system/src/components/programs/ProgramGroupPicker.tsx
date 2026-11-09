import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { levelLabel, sortLevels, type EduProgram, type ProgramClass } from '../../lib/eduPrograms';

type Props = {
  programs: EduProgram[];
  classes: ProgramClass[];
  /** Zaten üye olunan gruplar listede gösterilmez */
  excludeClassIds?: string[];
  /** Öğrencinin kendi seviyesi: seviye seçimi bununla başlar (değiştirilebilir) */
  preferredLevel?: string | null;
  busy?: boolean;
  buttonLabel?: string;
  onPick: (classId: string) => void | Promise<void>;
};

/**
 * Kayıt seçimi: Program → Sınıf seviyesi → Şube/Grup.
 * Yalnız aktif programlar ve o programda açılmış gruplar listelenir.
 */
export default function ProgramGroupPicker({
  programs,
  classes,
  excludeClassIds = [],
  preferredLevel,
  busy,
  buttonLabel = 'Programa ekle',
  onPick
}: Props) {
  const activePrograms = useMemo(() => programs.filter((p) => p.is_active), [programs]);
  const [programId, setProgramId] = useState('');
  const [level, setLevel] = useState('');
  const [classId, setClassId] = useState('');

  const excluded = useMemo(() => new Set(excludeClassIds), [excludeClassIds]);
  const programClasses = useMemo(
    () => classes.filter((c) => c.program_id === programId && !excluded.has(c.id)),
    [classes, programId, excluded]
  );
  const levels = useMemo(
    () => sortLevels([...new Set(programClasses.map((c) => String(c.class_level ?? '')))]),
    [programClasses]
  );
  const groups = useMemo(
    () =>
      programClasses
        .filter((c) => String(c.class_level ?? '') === level)
        .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true })),
    [programClasses, level]
  );

  useEffect(() => {
    // Program değişince: öğrencinin seviyesi o programda varsa onu öner
    const pref = String(preferredLevel ?? '').trim();
    if (pref && levels.includes(pref)) setLevel(pref);
    else if (levels.length === 1) setLevel(levels[0]);
    else setLevel('');
    setClassId('');
  }, [programId, levels, preferredLevel]);

  useEffect(() => {
    setClassId(groups.length === 1 ? groups[0].id : '');
  }, [groups]);

  const sel = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400';

  const submit = async () => {
    if (!classId) return;
    await onPick(classId);
    setClassId('');
  };

  if (!activePrograms.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Aktif program yok. Önce «Canlı Dersler → Programlar» bölümünden program ekleyin.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">1 · Program</label>
        <select value={programId} onChange={(e) => setProgramId(e.target.value)} className={sel}>
          <option value="">Program seçin</option>
          {activePrograms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">2 · Sınıf seviyesi</label>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={sel} disabled={!programId || !levels.length}>
          <option value="">{programId && !levels.length ? 'Bu programda grup yok' : 'Seviye seçin'}</option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {levelLabel(l)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">3 · Şube / Grup</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={sel} disabled={!level || !groups.length}>
          <option value="">Şube/grup seçin</option>
          {groups.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!classId || busy}
        className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {buttonLabel}
      </button>
    </div>
  );
}
