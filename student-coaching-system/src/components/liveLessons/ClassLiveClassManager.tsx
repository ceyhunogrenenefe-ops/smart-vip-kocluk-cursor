import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Student } from '../../types';
import {
  CLASS_LIVE_PRESENCE_ENABLED,
  type ClassLivePresenceModalKind,
  type ClassLivePresenceSnapshot
} from '../../lib/classLivePresence';
import ClassLivePresencePanel from './ClassLivePresencePanel';
import {
  branchSelectOptions,
  collectInstitutionBranchOptions,
  studentMatchesClassLevelAndBranch
} from '../../lib/classLiveBranchUtils';
import { apiFetch } from '../../lib/session';
import {
  ChevronDown,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  Users,
  X
} from 'lucide-react';

const ClassCardPresence = React.memo(function ClassCardPresence({
  classId,
  presence,
  loading,
  onPresenceStatClick
}: {
  classId: string;
  presence: ClassLivePresenceSnapshot | undefined;
  loading?: boolean;
  onPresenceStatClick?: (classId: string, kind: ClassLivePresenceModalKind) => void;
}) {
  const onStatClick = React.useCallback(
    (kind: ClassLivePresenceModalKind) => onPresenceStatClick?.(classId, kind),
    [classId, onPresenceStatClick]
  );
  return (
    <ClassLivePresencePanel
      presence={presence}
      loading={loading}
      onStatClick={onPresenceStatClick ? onStatClick : undefined}
    />
  );
});

export type ClassLiveClassRow = {
  id: string;
  name: string;
  class_level?: string | null;
  branch?: string | null;
  teacher_ids: string[];
  student_ids: string[];
  student_subjects?: Record<string, string[]>;
};

type TeacherOption = { id: string; name: string };

const CLASS_LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
  { value: '7', label: '7' },
  { value: 'LGS', label: 'LGS' },
  { value: '9', label: '9' },
  { value: '10', label: '10' },
  { value: '11', label: '11' },
  { value: 'TYT', label: 'TYT' },
  { value: 'YKS EŞİTAĞIRLIK', label: 'YKS Eşit Ağırlık' },
  { value: 'YKS SAYISAL', label: 'YKS Sayısal' },
  { value: 'AP', label: 'AP' },
  { value: 'IB', label: 'IB' },
  { value: 'YÖS', label: 'YÖS' }
];

function formatStudentLabel(s: Student): string {
  const bits = [s.name];
  if (s.school?.trim()) bits.push(`Şube ${s.school.trim()}`);
  if (s.classLevel != null && String(s.classLevel).trim()) bits.push(String(s.classLevel));
  return bits.join(' · ');
}

type MemberPickerProps = {
  title: string;
  hint?: string;
  emptyText: string;
  searchPlaceholder: string;
  items: { id: string; label: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

function MemberPicker({ title, hint, emptyText, searchPlaceholder, items, selectedIds, onChange }: MemberPickerProps) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const fold = q.trim().toLocaleLowerCase('tr');
    if (!fold) return items;
    return items.filter((it) => it.label.toLocaleLowerCase('tr').includes(fold));
  }, [items, q]);

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((x) => x !== id));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
          {selectedIds.length} seçili
        </span>
      </div>
      {hint ? <p className="mb-2 text-xs text-slate-500">{hint}</p> : null}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={searchPlaceholder}
        className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      />
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-white p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-slate-500">{emptyText}</p>
        ) : (
          filtered.map((it) => (
            <label
              key={it.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-indigo-50/80"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(it.id)}
                onChange={(e) => toggle(it.id, e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span className="truncate text-slate-800">{it.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

type Props = {
  classes: ClassLiveClassRow[];
  selectedClassId: string;
  onSelectClass: (id: string) => void;
  students: Student[];
  teacherOptions: TeacherOption[];
  canManageClasses: boolean;
  isStudentView: boolean;
  onCreateClass: (payload: {
    name: string;
    class_level: string;
    branch?: string;
    teacher_ids: string[];
    student_ids: string[];
  }) => Promise<boolean>;
  onUpdateClass: (
    classId: string,
    payload: {
      name: string;
      class_level: string;
      branch: string | null;
      teacher_ids: string[];
      student_ids: string[];
      student_subjects?: Record<string, string[]>;
    }
  ) => Promise<boolean>;
  onDeleteClass: (classId: string, className: string) => Promise<boolean>;
  livePresenceByClassId?: Record<string, ClassLivePresenceSnapshot | undefined>;
  livePresenceLoading?: boolean;
  onPresenceStatClick?: (classId: string, kind: ClassLivePresenceModalKind) => void;
};

export default function ClassLiveClassManager({
  classes,
  selectedClassId,
  onSelectClass,
  students,
  teacherOptions,
  canManageClasses,
  isStudentView,
  onCreateClass,
  onUpdateClass,
  onDeleteClass,
  livePresenceByClassId,
  livePresenceLoading,
  onPresenceStatClick
}: Props) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState('9');
  const [newBranch, setNewBranch] = useState('');
  const [newTeacherIds, setNewTeacherIds] = useState<string[]>([]);
  const [newStudentIds, setNewStudentIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  const [editClass, setEditClass] = useState<ClassLiveClassRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState('9');
  const [editBranch, setEditBranch] = useState('');
  const [editTeacherIds, setEditTeacherIds] = useState<string[]>([]);
  const [editStudentIds, setEditStudentIds] = useState<string[]>([]);
  const [editStudentSubjects, setEditStudentSubjects] = useState<Record<string, string[]>>({});
  const [editSubjectOptions, setEditSubjectOptions] = useState<string[]>([]);
  const [editSubjectsLoading, setEditSubjectsLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const branchOptions = useMemo(
    () => collectInstitutionBranchOptions(students, classes.map((c) => c.branch)),
    [students, classes]
  );

  const studentsForNew = useMemo(
    () => students.filter((s) => studentMatchesClassLevelAndBranch(s, newLevel, newBranch || null)),
    [students, newLevel, newBranch]
  );

  const studentsForEdit = useMemo(
    () => students.filter((s) => studentMatchesClassLevelAndBranch(s, editLevel, editBranch || null)),
    [students, editLevel, editBranch]
  );

  useEffect(() => {
    setNewStudentIds((prev) => {
      const allowed = new Set(studentsForNew.map((s) => s.id));
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [studentsForNew]);

  useEffect(() => {
    if (!editClass) return;
    setEditStudentIds((prev) => {
      const allowed = new Set(studentsForEdit.map((s) => s.id));
      const keepAssigned = (editClass.student_ids || []).filter((id) => allowed.has(id));
      const merged = [...new Set([...keepAssigned, ...prev.filter((id) => allowed.has(id))])];
      return merged;
    });
  }, [studentsForEdit, editClass]);

  useEffect(() => {
    if (!editClass || !editSubjectOptions.length) return;
    setEditStudentSubjects((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const sid of editStudentIds) {
        if (!next[sid]?.length) {
          next[sid] = [...editSubjectOptions];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [editStudentIds, editSubjectOptions, editClass]);

  const teacherNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teacherOptions) m.set(t.id, t.name);
    return m;
  }, [teacherOptions]);

  const openEdit = (c: ClassLiveClassRow) => {
    onSelectClass(c.id);
    setEditClass(c);
    setEditName(c.name);
    setEditLevel(String(c.class_level || '9'));
    setEditBranch(String(c.branch || ''));
    setEditTeacherIds([...(c.teacher_ids || [])]);
    setEditStudentIds([...(c.student_ids || [])]);
    setEditSubjectsLoading(true);
    setEditSubjectOptions([]);
    void (async () => {
      let opts: string[] = [];
      try {
        const res = await apiFetch(
          `/api/class-live-lessons?scope=class-subjects&class_id=${encodeURIComponent(c.id)}`
        );
        const j = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(j.data)) {
          opts = j.data.map((x: unknown) => String(x || '').trim()).filter(Boolean);
        }
      } catch {
        opts = [];
      } finally {
        setEditSubjectsLoading(false);
      }
      setEditSubjectOptions(opts);
      const subjectMap: Record<string, string[]> = {};
      for (const sid of c.student_ids || []) {
        const saved = c.student_subjects?.[sid];
        if (Array.isArray(saved) && saved.length) subjectMap[sid] = [...saved];
        else if (opts.length) subjectMap[sid] = [...opts];
        else subjectMap[sid] = [];
      }
      setEditStudentSubjects(subjectMap);
    })();
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditClass(null);
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingRef.current) return;
    if (!newName.trim()) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const ok = await onCreateClass({
        name: newName.trim(),
        class_level: newLevel,
        branch: newBranch.trim() || undefined,
        teacher_ids: newTeacherIds,
        student_ids: newStudentIds
      });
      if (ok) {
        setNewName('');
        setNewBranch('');
        setNewTeacherIds([]);
        setNewStudentIds([]);
        setShowNewForm(false);
      }
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const submitEdit = async () => {
    if (!editClass || !editName.trim()) return;
    setEditSaving(true);
    try {
      const student_subjects: Record<string, string[]> = {};
      if (editSubjectOptions.length) {
        for (const sid of editStudentIds) {
          const picked = editStudentSubjects[sid] || [];
          student_subjects[sid] =
            picked.length >= editSubjectOptions.length
              ? []
              : picked.filter((s) => editSubjectOptions.includes(s));
        }
      }
      const ok = await onUpdateClass(editClass.id, {
        name: editName.trim(),
        class_level: editLevel,
        branch: editBranch.trim() ? editBranch.trim() : null,
        teacher_ids: editTeacherIds,
        student_ids: editStudentIds,
        student_subjects
      });
      if (ok) setEditClass(null);
    } finally {
      setEditSaving(false);
    }
  };

  const toggleStudentSubject = (studentId: string, subject: string, checked: boolean) => {
    setEditStudentSubjects((prev) => {
      const base =
        prev[studentId]?.length ? prev[studentId] : editSubjectOptions.length ? [...editSubjectOptions] : [];
      const next = checked ? [...new Set([...base, subject])] : base.filter((s) => s !== subject);
      return { ...prev, [studentId]: next };
    });
  };

  const handleDelete = async (c: ClassLiveClassRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(c.id);
    try {
      await onDeleteClass(c.id, c.name);
    } finally {
      setDeletingId(null);
    }
  };

  const teacherItems = teacherOptions.map((t) => ({ id: t.id, label: t.name }));
  const newStudentItems = studentsForNew.map((s) => ({ id: s.id, label: formatStudentLabel(s) }));
  const editStudentItems = studentsForEdit.map((s) => ({ id: s.id, label: formatStudentLabel(s) }));

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/40 px-4 py-3 sm:px-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <GraduationCap className="h-5 w-5 text-indigo-600" aria-hidden />
            {isStudentView ? 'Sınıflarım' : 'Sınıflar'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {isStudentView
              ? 'Atandığınız grup derslerini seçerek takvimi görüntüleyin.'
              : 'Sınıf seçin; ders planı ve takvim aşağıda açılır.'}
          </p>
        </div>
        {canManageClasses ? (
          <button
            type="button"
            onClick={() => setShowNewForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {showNewForm ? <ChevronDown className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showNewForm ? 'Formu gizle' : 'Yeni sınıf'}
          </button>
        ) : null}
      </div>

      {canManageClasses && showNewForm ? (
        <form onSubmit={(e) => void submitNew(e)} className="border-b border-slate-100 bg-slate-50/50 p-4 sm:p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-800">Yeni sınıf oluştur</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Sınıf adı</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Örn: 10-A Matematik"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Program / seviye</label>
              <select
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {CLASS_LEVEL_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Şube (isteğe bağlı)</label>
              <select
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Tüm uyumlu öğrenciler</option>
                {branchSelectOptions(branchOptions, newBranch).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <MemberPicker
              title="Öğretmenler"
              hint="Kurumdaki öğretmenlerden seçin."
              emptyText="Kayıtlı öğretmen bulunamadı."
              searchPlaceholder="Öğretmen ara…"
              items={teacherItems}
              selectedIds={newTeacherIds}
              onChange={setNewTeacherIds}
            />
            <MemberPicker
              title="Öğrenciler"
              hint={`${studentsForNew.length} öğrenci uyumlu${newBranch.trim() ? ` · şube ${newBranch}` : ''}. Şube seçmezseniz seviyeye göre tümü listelenir.`}
              emptyText="Bu seviye / şubede öğrenci yok."
              searchPlaceholder="Öğrenci ara…"
              items={newStudentItems}
              selectedIds={newStudentIds}
              onChange={setNewStudentIds}
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Sınıfı oluştur
          </button>
        </form>
      ) : null}

      <div className="p-4 sm:p-5">
        {classes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
            <p className="mt-2 text-sm font-medium text-slate-600">
              {isStudentView ? 'Henüz canlı grup sınıfına atanmadınız' : 'Henüz sınıf yok'}
            </p>
            {isStudentView ? (
              <p className="mt-1 text-xs text-slate-500">
                Yöneticiniz sizi bir sınıfa eklediğinde dersler burada görünür. Bire bir özel dersler için üstteki
                «Canlı özel derslerim» sekmesine bakın.
              </p>
            ) : canManageClasses ? (
              <p className="mt-1 text-xs text-slate-500">«Yeni sınıf» ile ilk grubunuzu oluşturun.</p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((c) => {
              const selected = selectedClassId === c.id;
              const teacherCount = (c.teacher_ids || []).length;
              const studentCount = (c.student_ids || []).length;
              const teacherPreview = (c.teacher_ids || [])
                .slice(0, 2)
                .map((id) => teacherNameById.get(id) || 'Öğretmen')
                .join(', ');
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectClass(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectClass(c.id);
                    }
                  }}
                  className={`group relative rounded-xl border p-4 text-left transition-all ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50/80 shadow-md ring-2 ring-indigo-200'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-slate-900">{c.name}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.class_level ? (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {c.class_level}
                          </span>
                        ) : null}
                        {c.branch ? (
                          <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                            Şube {c.branch}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {canManageClasses ? (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          title="Düzenle"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(c);
                          }}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Sil"
                          disabled={deletingId === c.id}
                          onClick={(e) => void handleDelete(c, e)}
                          className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100 disabled:opacity-50"
                        >
                          {deletingId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-3.5 w-3.5 text-indigo-500" />
                      {teacherCount} öğretmen
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-emerald-600" />
                      {studentCount} öğrenci
                    </span>
                  </div>
                  {teacherPreview ? (
                    <p className="mt-2 truncate text-[11px] text-slate-500">{teacherPreview}</p>
                  ) : null}
                  {!isStudentView && CLASS_LIVE_PRESENCE_ENABLED ? (
                    <ClassCardPresence
                      classId={c.id}
                      presence={livePresenceByClassId?.[c.id]}
                      loading={livePresenceLoading}
                      onPresenceStatClick={onPresenceStatClick}
                    />
                  ) : null}
                  {selected ? (
                    <span className="absolute bottom-3 right-3 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Seçili
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editClass ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="class-edit-title"
        >
          <div className="flex max-h-[min(92dvh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
              <div>
                <h3 id="class-edit-title" className="text-lg font-bold text-slate-900">
                  Sınıfı düzenle
                </h3>
                <p className="text-xs text-slate-500">Ad, şube, öğretmen, öğrenci ve ders kapsamı</p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 [-webkit-overflow-scrolling:touch]">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Sınıf adı</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Seviye</label>
                  <select
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {CLASS_LEVEL_OPTIONS.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Şube</label>
                  <select
                    value={editBranch}
                    onChange={(e) => setEditBranch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Tüm uyumlu öğrenciler</option>
                    {branchSelectOptions(branchOptions, editBranch).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <MemberPicker
                title="Öğretmen atama"
                emptyText="Kayıtlı öğretmen bulunamadı."
                searchPlaceholder="Öğretmen ara…"
                items={teacherItems}
                selectedIds={editTeacherIds}
                onChange={setEditTeacherIds}
              />
              <MemberPicker
                title="Öğrenci atama"
                hint={`${editStudentItems.length} öğrenci listede${editBranch.trim() ? ` · şube ${editBranch}` : ''}.`}
                emptyText="Bu seviye / şubede öğrenci yok."
                searchPlaceholder="Öğrenci ara…"
                items={editStudentItems}
                selectedIds={editStudentIds}
                onChange={setEditStudentIds}
              />
              {editStudentIds.length > 0 ? (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-950">Öğrenci ders kapsamı</p>
                  <p className="mt-1 text-xs text-amber-900/90">
                    Bazı öğrenciler tüm dersleri almıyorsa (ör. yalnızca Kitap Okuma): işareti kaldırın. WhatsApp
                    hatırlatması ve öğrenci takvimi buna göre filtrelenir.
                  </p>
                  {editSubjectsLoading ? (
                    <p className="mt-3 flex items-center gap-2 text-xs text-amber-900">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ders listesi yükleniyor…
                    </p>
                  ) : editSubjectOptions.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-slate-700">
                      Bu sınıfta henüz ders tanımı yok. Önce bu sayfada sınıfı seçip alttaki{' '}
                      <strong>«Ders ekle»</strong> bölümünden Matematik, Fen, Kitap Okuma vb. ekleyin; ardından sınıf
                      kartındaki kalemle tekrar açın.
                    </p>
                  ) : (
                    <div className="mt-3 max-h-56 space-y-3 overflow-y-auto">
                      {editStudentIds.map((sid) => {
                        const label = editStudentItems.find((x) => x.id === sid)?.label || sid;
                        const picked = editStudentSubjects[sid]?.length
                          ? editStudentSubjects[sid]
                          : editSubjectOptions;
                        const restricted =
                          picked.length > 0 && picked.length < editSubjectOptions.length;
                        return (
                          <div
                            key={sid}
                            className={`rounded-lg border bg-white p-2 ${restricted ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-amber-100'}`}
                          >
                            <p className="mb-1.5 text-xs font-semibold text-slate-800">
                              {label}
                              {restricted ? (
                                <span className="ml-2 font-normal text-indigo-700">
                                  ({picked.length}/{editSubjectOptions.length} ders)
                                </span>
                              ) : (
                                <span className="ml-2 font-normal text-slate-500">(tüm dersler)</span>
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {editSubjectOptions.map((sub) => (
                                <label
                                  key={`${sid}-${sub}`}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                                >
                                  <input
                                    type="checkbox"
                                    checked={picked.includes(sub)}
                                    onChange={(e) => toggleStudentSubject(sid, sub, e.target.checked)}
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
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 pb-safe sm:px-5">
              <button
                type="button"
                onClick={closeEdit}
                disabled={editSaving}
                className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={editSaving || !editName.trim()}
                onClick={() => void submitEdit()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
