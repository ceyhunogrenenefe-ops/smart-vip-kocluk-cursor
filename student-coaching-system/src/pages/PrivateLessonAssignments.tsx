import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/session';
import { sortByFirstName } from '../lib/personNameSort';
import {
  UserCheck,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Search,
  Users,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

type AssignmentRow = {
  id: string;
  institution_id: string | null;
  teacher_id: string;
  student_id: string;
  student_name?: string;
  student_email?: string | null;
  teacher_name?: string;
  teacher_email?: string | null;
  created_at?: string;
};

type PersonOption = { id: string; name: string; email?: string | null };

export default function PrivateLessonAssignments() {
  const { students } = useApp();
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [teachers, setTeachers] = useState<PersonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [schemaHint, setSchemaHint] = useState<string | null>(null);

  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [bulkStudentIds, setBulkStudentIds] = useState<string[]>([]);
  const [bulkTeacherIds, setBulkTeacherIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<'one_teacher' | 'one_student'>('one_teacher');

  const studentOptions = useMemo(
    () =>
      sortByFirstName(
        students.map((s) => ({ id: s.id, name: s.name, email: s.email })),
        (s) => s.name
      ),
    [students]
  );

  const loadTeachers = useCallback(async () => {
    const res = await apiFetch('/api/users');
    const j = (await res.json().catch(() => ({}))) as { data?: PersonOption[]; error?: string };
    if (!res.ok) throw new Error(String(j.error || 'Öğretmen listesi alınamadı'));
    const data = Array.isArray(j.data) ? j.data : [];
    const onlyTeachers = data.filter((u) => {
      const role = String((u as { role?: string }).role || '').toLowerCase();
      const roles = Array.isArray((u as { roles?: string[] }).roles)
        ? (u as { roles?: string[] }).roles!.map((x) => String(x || '').toLowerCase())
        : [];
      return role === 'teacher' || roles.includes('teacher');
    });
    setTeachers(
      sortByFirstName(
        onlyTeachers.map((u) => ({
          id: u.id,
          name: u.name || u.email || u.id,
          email: u.email
        })),
        (t) => t.name
      )
    );
  }, []);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSchemaHint(null);
    try {
      const res = await apiFetch('/api/teacher-private-lesson-assignments');
      const j = (await res.json().catch(() => ({}))) as {
        data?: AssignmentRow[];
        error?: string;
        hint?: string;
      };
      if (!res.ok) throw new Error(String(j.error || 'Atamalar yüklenemedi'));
      if (j.hint === 'teacher_private_lesson_assignments_sql_missing') {
        setSchemaHint(
          'Veritabanında `teacher_private_lesson_assignments` tablosu yok. Supabase SQL Editor’da `student-coaching-system/sql/2026-07-10-teacher-private-lesson-assignments.sql` dosyasını çalıştırın.'
        );
        setAssignments([]);
        return;
      }
      setAssignments(Array.isArray(j.data) ? j.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Atamalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeachers().catch(() => {});
    void loadAssignments();
  }, [loadTeachers, loadAssignments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((a) => {
      const hay = [
        a.student_name,
        a.student_email,
        a.teacher_name,
        a.teacher_email,
        a.student_id,
        a.teacher_id
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [assignments, search]);

  const resetForm = () => {
    setSelectedStudentId('');
    setSelectedTeacherId('');
    setBulkStudentIds([]);
    setBulkTeacherIds([]);
  };

  const handleAssign = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let body: Record<string, unknown>;
      if (mode === 'single') {
        if (!selectedStudentId || !selectedTeacherId) {
          throw new Error('Öğrenci ve öğretmen seçin.');
        }
        body = { student_id: selectedStudentId, teacher_id: selectedTeacherId };
      } else if (bulkMode === 'one_teacher') {
        if (!selectedTeacherId || bulkStudentIds.length === 0) {
          throw new Error('Bir öğretmen ve en az bir öğrenci seçin.');
        }
        body = { bulk: true, teacher_id: selectedTeacherId, student_ids: bulkStudentIds };
      } else {
        if (!selectedStudentId || bulkTeacherIds.length === 0) {
          throw new Error('Bir öğrenci ve en az bir öğretmen seçin.');
        }
        body = { bulk: true, student_id: selectedStudentId, teacher_ids: bulkTeacherIds };
      }

      const res = await apiFetch('/api/teacher-private-lesson-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        created_count?: number;
        errors?: { error?: string }[];
      };
      if (!res.ok) throw new Error(String(j.error || 'Atama kaydedilemedi'));

      const errCount = j.errors?.length || 0;
      const created = j.created_count ?? 1;
      setSuccess(
        errCount > 0
          ? `${created} atama kaydedildi, ${errCount} kayıt atlandı.`
          : mode === 'bulk'
            ? `${created} atama kaydedildi.`
            : 'Atama kaydedildi.'
      );
      resetForm();
      await loadAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Atama başarısız');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bu özel ders atamasını kaldırmak istediğinize emin misiniz?')) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(`/api/teacher-private-lesson-assignments?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(String(j.error || 'Silinemedi'));
      setSuccess('Atama kaldırıldı.');
      await loadAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silme başarısız');
    }
  };

  const toggleBulkStudent = (id: string) => {
    setBulkStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleBulkTeacher = (id: string) => {
    setBulkTeacherIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3">
          <UserCheck className="w-8 h-8 opacity-90" />
          <div>
            <h1 className="text-2xl font-bold">Özel Ders Öğretmen Atama</h1>
            <p className="text-indigo-100 text-sm mt-1">
              Öğrencileri özel ders öğretmenlerine atayın. Koçluk ve grup sınıfı atamalarından bağımsızdır; öğretmen
              «Öğrencilerim» listesinde bu öğrencileri görür.
            </p>
          </div>
        </div>
      </div>

      {schemaHint && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{schemaHint}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-100 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" />
            Yeni atama
          </h2>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                mode === 'single' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Tekli
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                mode === 'bulk' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Toplu
            </button>
          </div>

          {mode === 'single' ? (
            <div className="space-y-3">
              <label className="block text-sm text-slate-600">
                Öğrenci
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Seçin…</option>
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.email ? ` (${s.email})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-600">
                Öğretmen
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Seçin…</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.email ? ` (${t.email})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBulkMode('one_teacher')}
                  className={`px-3 py-1.5 rounded-lg text-xs ${
                    bulkMode === 'one_teacher' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Bir öğretmen → çok öğrenci
                </button>
                <button
                  type="button"
                  onClick={() => setBulkMode('one_student')}
                  className={`px-3 py-1.5 rounded-lg text-xs ${
                    bulkMode === 'one_student' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Bir öğrenci → çok öğretmen
                </button>
              </div>

              {bulkMode === 'one_teacher' ? (
                <>
                  <label className="block text-sm text-slate-600">
                    Öğretmen
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Seçin…</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <p className="text-sm text-slate-600 mb-2">Öğrenciler ({bulkStudentIds.length} seçili)</p>
                    <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-lg divide-y">
                      {studentOptions.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={bulkStudentIds.includes(s.id)}
                            onChange={() => toggleBulkStudent(s.id)}
                          />
                          <span>{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label className="block text-sm text-slate-600">
                    Öğrenci
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Seçin…</option>
                      {studentOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <p className="text-sm text-slate-600 mb-2">Öğretmenler ({bulkTeacherIds.length} seçili)</p>
                    <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-lg divide-y">
                      {teachers.map((t) => (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={bulkTeacherIds.includes(t.id)}
                            onChange={() => toggleBulkTeacher(t.id)}
                          />
                          <span>{t.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleAssign()}
            disabled={saving || Boolean(schemaHint)}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Atamayı kaydet
          </button>
        </div>

        <div className="bg-white border border-slate-100 rounded-xl p-5">
          <div className="flex items-center gap-2 text-slate-700 mb-3">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold">Mevcut atamalar</span>
            <span className="text-sm text-slate-500">({filtered.length})</span>
            <button
              type="button"
              onClick={() => void loadAssignments()}
              className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              title="Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Öğrenci veya öğretmen ara…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>

          {loading ? (
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Yükleniyor…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz atama yok.</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto space-y-2">
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{a.student_name || a.student_id}</p>
                    <p className="text-xs text-slate-500 truncate">
                      → {a.teacher_name || a.teacher_id}
                      {a.student_email ? ` · ${a.student_email}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(a.id)}
                    className="shrink-0 p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Kaldır"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
