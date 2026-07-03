import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Student } from '../../types';
import { apiFetch } from '../../lib/session';
import { ChevronDown, ChevronRight, Loader2, Save, Search } from 'lucide-react';
import type { ClassLiveClassRow } from './ClassLiveClassManager';

type DraftMap = Record<string, Record<string, string[]>>;
type OptionsMap = Record<string, string[]>;

function studentLabel(students: Student[], id: string): string {
  const s = students.find((x) => x.id === id);
  if (!s) return id;
  const bits = [s.name];
  if (s.school?.trim()) bits.push(`Şube ${s.school.trim()}`);
  return bits.join(' · ');
}

function pickedSubjects(saved: string[] | undefined, options: string[]): string[] {
  if (!options.length) return [];
  if (Array.isArray(saved) && saved.length) return saved.filter((s) => options.includes(s));
  return [...options];
}

function buildDraftFromClasses(classes: ClassLiveClassRow[], optionsMap: OptionsMap): DraftMap {
  const draft: DraftMap = {};
  for (const c of classes) {
    const opts = optionsMap[c.id] || [];
    if (!opts.length || !(c.student_ids || []).length) continue;
    draft[c.id] = {};
    for (const sid of c.student_ids || []) {
      draft[c.id][sid] = pickedSubjects(c.student_subjects?.[sid], opts);
    }
  }
  return draft;
}

type Props = {
  classes: ClassLiveClassRow[];
  students: Student[];
  onSaved?: () => void | Promise<void>;
};

export default function ClassStudentSubjectsHub({ classes, students, onSaved }: Props) {
  const [open, setOpen] = useState(true);
  const [classFilter, setClassFilter] = useState('');
  const [studentFilter, setStudentFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [optionsMap, setOptionsMap] = useState<OptionsMap>({});
  const [draft, setDraft] = useState<DraftMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sortedClasses = useMemo(() => {
    return classes
      .slice()
      .filter((c) => (c.student_ids || []).length > 0)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
  }, [classes]);

  const filteredClasses = useMemo(() => {
    const q = classFilter.trim().toLocaleLowerCase('tr');
    if (!q) return sortedClasses;
    return sortedClasses.filter((c) => String(c.name).toLocaleLowerCase('tr').includes(q));
  }, [sortedClasses, classFilter]);

  const loadOptions = useCallback(async () => {
    if (!sortedClasses.length) {
      setOptionsMap({});
      setDraft({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const entries = await Promise.all(
        sortedClasses.map(async (c) => {
          try {
            const res = await apiFetch(
              `/api/class-live-lessons?scope=class-subjects&class_id=${encodeURIComponent(c.id)}`
            );
            const j = await res.json().catch(() => ({}));
            const list = res.ok && Array.isArray(j.data)
              ? j.data.map((x: unknown) => String(x || '').trim()).filter(Boolean)
              : [];
            return [c.id, list] as const;
          } catch {
            return [c.id, []] as const;
          }
        })
      );
      const nextOptions: OptionsMap = {};
      for (const [id, list] of entries) nextOptions[id] = list;
      setOptionsMap(nextOptions);
      setDraft(buildDraftFromClasses(sortedClasses, nextOptions));
      const firstWithStudents = sortedClasses.find((c) => (nextOptions[c.id] || []).length);
      if (firstWithStudents) {
        setExpanded((prev) => (Object.keys(prev).length ? prev : { [firstWithStudents.id]: true }));
      }
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }, [sortedClasses]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const toggleSubject = (classId: string, studentId: string, subject: string, checked: boolean) => {
    setDraft((prev) => {
      const opts = optionsMap[classId] || [];
      const base = prev[classId]?.[studentId]?.length ? prev[classId][studentId] : [...opts];
      const next = checked ? [...new Set([...base, subject])] : base.filter((s) => s !== subject);
      return {
        ...prev,
        [classId]: { ...(prev[classId] || {}), [studentId]: next }
      };
    });
  };

  const setAllSubjectsForStudent = (classId: string, studentId: string, all: boolean) => {
    const opts = optionsMap[classId] || [];
    setDraft((prev) => ({
      ...prev,
      [classId]: { ...(prev[classId] || {}), [studentId]: all ? [...opts] : [] }
    }));
  };

  const handleSave = async () => {
    const patches = sortedClasses
      .map((c) => {
        const opts = optionsMap[c.id] || [];
        const classDraft = draft[c.id];
        if (!opts.length || !classDraft) return null;
        const student_subjects: Record<string, string[]> = {};
        for (const sid of c.student_ids || []) {
          if (!classDraft[sid]) continue;
          const picked = classDraft[sid];
          student_subjects[sid] = picked.length >= opts.length ? [] : picked.filter((s) => opts.includes(s));
        }
        if (!Object.keys(student_subjects).length) return null;
        return { class_id: c.id, student_subjects, subject_options: opts };
      })
      .filter(Boolean);

    if (!patches.length) {
      setError('Kaydedilecek sınıf bulunamadı. Önce sınıflara ders ekleyin.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch('/api/class-live-lessons?op=bulk-patch-student-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patches })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(j.message || j.error || 'Kayıt başarısız'));
        return;
      }
      setNotice(String(j.message || 'Kaydedildi.'));
      await onSaved?.();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!sortedClasses.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-amber-50/80 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-100/60"
      >
        <div>
          <p className="text-base font-bold text-amber-950">Tüm sınıflarda öğrenci ders kapsamı</p>
          <p className="mt-0.5 text-xs text-amber-900/90">
            6-A, 6-B, 7-A gibi her sınıf için öğrenciye hangi derslerin görüneceğini buradan ayarlayın.
          </p>
        </div>
        {open ? <ChevronDown className="h-5 w-5 shrink-0 text-amber-800" /> : <ChevronRight className="h-5 w-5 shrink-0 text-amber-800" />}
      </button>

      {open ? (
        <div className="border-t border-amber-200 bg-white px-4 py-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-slate-600">
              Sınıf ara
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  placeholder="6-A, 7-B…"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-slate-600">
              Öğrenci ara
              <input
                type="search"
                value={studentFilter}
                onChange={(e) => setStudentFilter(e.target.value)}
                placeholder="Ad ile filtrele…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Tümünü kaydet
            </button>
          </div>

          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {notice ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
          ) : null}

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sınıf dersleri yükleniyor…
            </p>
          ) : (
            <div className="max-h-[min(70vh,640px)] space-y-2 overflow-y-auto pr-1">
              {filteredClasses.map((c) => {
                const opts = optionsMap[c.id] || [];
                const isExpanded = Boolean(expanded[c.id]);
                const classDraft = draft[c.id] || {};
                const studentQ = studentFilter.trim().toLocaleLowerCase('tr');
                const visibleStudentIds = (c.student_ids || []).filter((sid) => {
                  if (!studentQ) return true;
                  return studentLabel(students, sid).toLocaleLowerCase('tr').includes(studentQ);
                });

                return (
                  <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50/50">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-100/80"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900">{c.name}</span>
                        <span className="ml-2 text-xs text-slate-500">
                          {visibleStudentIds.length} öğrenci · {opts.length} ders
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                      )}
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-slate-200 px-3 py-3">
                        {!opts.length ? (
                          <p className="text-xs text-slate-600">
                            Bu sınıfta henüz ders tanımı yok. Aşağıdan <strong>Ders ekle</strong> ile program oluşturun.
                          </p>
                        ) : visibleStudentIds.length === 0 ? (
                          <p className="text-xs text-slate-500">Filtreye uyan öğrenci yok.</p>
                        ) : (
                          <div className="space-y-3">
                            {visibleStudentIds.map((sid) => {
                              const picked = classDraft[sid]?.length ? classDraft[sid] : opts;
                              const restricted = picked.length > 0 && picked.length < opts.length;
                              return (
                                <div
                                  key={sid}
                                  className={`rounded-lg border bg-white p-2.5 ${restricted ? 'border-indigo-300' : 'border-slate-200'}`}
                                >
                                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-800">
                                      {studentLabel(students, sid)}
                                      <span className="ml-2 text-xs font-normal text-slate-500">
                                        {restricted ? `${picked.length}/${opts.length} ders` : 'tüm dersler'}
                                      </span>
                                    </p>
                                    <div className="flex gap-1 text-[11px]">
                                      <button
                                        type="button"
                                        onClick={() => setAllSubjectsForStudent(c.id, sid, true)}
                                        className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50"
                                      >
                                        Tümü
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setAllSubjectsForStudent(c.id, sid, false)}
                                        className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50"
                                      >
                                        Hiçbiri
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {opts.map((sub) => (
                                      <label
                                        key={`${c.id}-${sid}-${sub}`}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={picked.includes(sub)}
                                          onChange={(e) => toggleSubject(c.id, sid, sub, e.target.checked)}
                                          className="rounded border-slate-300 text-indigo-600"
                                        />
                                        {sub}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
