import React, { useMemo, useState } from 'react';
import { Layers, Loader2, X } from 'lucide-react';
import {
  addStudentToClass,
  levelLabel,
  programNameOf,
  removeStudentFromClass,
  type ProgramClass
} from '../../lib/eduPrograms';
import type { ProgramGroupsState } from '../../hooks/useProgramGroups';
import ProgramGroupPicker from './ProgramGroupPicker';

type Props = {
  studentId: string;
  studentName?: string;
  studentLevel?: string | number | null;
  groups: ProgramGroupsState;
  canEdit: boolean;
};

/**
 * Öğrenci profili: katıldığı tüm programlar (Program · Seviye · Şube/Grup).
 * Ekleme/çıkarma yalnız o grubun üyeliğini değiştirir; öğrencinin kaydı ve diğer grupları aynen kalır.
 */
export default function StudentProgramMemberships({ studentId, studentName, studentLevel, groups, canEdit }: Props) {
  const { programsById, programs, classes, membershipIndex, reload, loading, error, setupRequired } = groups;
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const mine: ProgramClass[] = useMemo(() => membershipIndex.get(studentId) || [], [membershipIndex, studentId]);

  const byProgram = useMemo(() => {
    const m = new Map<string, ProgramClass[]>();
    for (const c of mine) {
      const key = programNameOf(c, programsById);
      m.set(key, [...(m.get(key) || []), c]);
    }
    return [...m.entries()];
  }, [mine, programsById]);

  const add = async (classId: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await addStudentToClass(classId, studentId);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: ProgramClass) => {
    const label = `${programNameOf(c, programsById)} · ${levelLabel(c.class_level)} · ${c.name}`;
    if (!window.confirm(`${studentName || 'Öğrenci'} «${label}» grubundan çıkarılsın mı?\n\nDiğer program kayıtları değişmez.`)) {
      return;
    }
    setRemovingId(c.id);
    setMsg(null);
    try {
      await removeStudentFromClass(c.id, studentId);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Layers className="h-4 w-4 text-indigo-600" aria-hidden />
          Programlar
        </p>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500" /> : null}
      </div>

      {setupRequired ? (
        <p className="text-xs text-amber-800">
          Program altyapısı henüz kurulmamış (yönetici: sql/2026-11-09-edu-programs.sql).
        </p>
      ) : null}
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}

      {mine.length === 0 ? (
        <p className="mb-2 text-xs text-slate-500">Henüz bir program grubunda değil.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {byProgram.map(([programName, list]) => (
            <li key={programName} className="rounded-lg border border-slate-200 bg-white p-2">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-indigo-700">{programName}</p>
              <div className="flex flex-wrap gap-1.5">
                {list.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800"
                  >
                    {levelLabel(c.class_level)} · <strong className="font-semibold">{c.name}</strong>
                    {canEdit ? (
                      <button
                        type="button"
                        title="Bu gruptan çıkar"
                        onClick={() => void remove(c)}
                        disabled={removingId === c.id}
                        className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        {removingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && !setupRequired ? (
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <p className="mb-2 text-xs text-slate-600">
            Başka bir programa ekle — öğrencinin mevcut sınıfı ve kaydı değişmez.
          </p>
          <ProgramGroupPicker
            programs={programs}
            classes={classes}
            excludeClassIds={mine.map((c) => c.id)}
            preferredLevel={studentLevel != null ? String(studentLevel) : null}
            busy={busy}
            onPick={add}
        createGroup={groups.canManage ? { institutionId: groups.institutionId || null, onCreated: groups.reload } : undefined}
          />
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-xs text-red-600">{msg}</p> : null}
    </div>
  );
}
