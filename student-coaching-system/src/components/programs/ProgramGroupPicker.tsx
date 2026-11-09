import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import {
  createProgramClass,
  levelLabel,
  sortLevels,
  STANDARD_LEVELS,
  type EduProgram,
  type ProgramClass
} from '../../lib/eduPrograms';

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
  /** Verilirse: seçilen seviyede grup yoksa buradan yeni şube/grup açılabilir (yönetici) */
  createGroup?: { institutionId?: string | null; onCreated: () => void | Promise<void> };
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
  onPick,
  createGroup
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
  // Seviyeler: o programda açılmış gruplarınkiler + standart liste (grup olmasa da seçilebilsin)
  const levelsWithGroups = useMemo(
    () => new Set(programClasses.map((c) => String(c.class_level ?? '')).filter(Boolean)),
    [programClasses]
  );
  const levels = useMemo(
    () => (programId ? sortLevels([...new Set([...levelsWithGroups, ...STANDARD_LEVELS])]) : []),
    [programId, levelsWithGroups]
  );
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
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
    else if (levelsWithGroups.size === 1) setLevel([...levelsWithGroups][0]);
    else setLevel('');
    setClassId('');
    setCreateErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, preferredLevel]);

  useEffect(() => {
    setClassId(groups.length === 1 ? groups[0].id : '');
  }, [groups]);

  const sel = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400';

  const createAndPick = async () => {
    const name = newGroupName.trim();
    if (!createGroup || !programId || !level || !name) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const id = await createProgramClass({ name, class_level: level, program_id: programId }, createGroup.institutionId);
      await createGroup.onCreated();
      setNewGroupName('');
      await onPick(id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

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
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={sel} disabled={!programId}>
          <option value="">Seviye seçin</option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {levelLabel(l)}
              {levelsWithGroups.has(l) ? '' : ' (grup yok)'}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">3 · Şube / Grup</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={sel} disabled={!level || !groups.length}>
          <option value="">{level && !groups.length ? 'Bu seviyede grup yok' : 'Şube/grup seçin'}</option>
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
      {programId && level && !groups.length ? (
        <div className="sm:col-span-4 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 p-2.5">
          {createGroup ? (
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
              <span className="text-xs text-slate-700">
                Bu programda {levelLabel(level)} grubu yok. Yeni grup açın:
              </span>
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void createAndPick();
                  }
                }}
                placeholder="Örn: A Grubu veya 8A"
                className="min-w-[140px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => void createAndPick()}
                disabled={!newGroupName.trim() || creating || busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Grubu aç ve ekle
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Bu programda {levelLabel(level)} grubu henüz açılmamış. Yönetici «Canlı Dersler → Yeni sınıf» ile açabilir.
            </p>
          )}
          {createErr ? <p className="mt-1.5 text-xs text-red-600">{createErr}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
