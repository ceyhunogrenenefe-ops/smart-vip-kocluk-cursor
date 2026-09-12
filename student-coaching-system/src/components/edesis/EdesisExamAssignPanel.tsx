import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  assignEdesisExam,
  fetchEdesisAssignTargets,
  fetchEdesisExamAssignments,
  fetchSyncedEdesisExams,
  syncEdesisExamCatalog,
  unassignEdesisExam,
  type EdesisExamAssignmentRow,
  type EdesisSyncedExam,
} from '../../lib/edesis/edesisApi';

type AssignClass = { id: string; name: string; class_level?: string | null };
type AssignStudent = {
  id: string;
  name: string;
  email?: string | null;
  class_name?: string | null;
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toLocaleDateString('tr-TR');
  } catch {
    return String(value);
  }
}

function toggleId(list: string[], id: string, setList: (next: string[]) => void) {
  setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
}

export function EdesisExamAssignPanel() {
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [exams, setExams] = useState<EdesisSyncedExam[]>([]);
  const [query, setQuery] = useState('');

  const [assignExam, setAssignExam] = useState<EdesisSyncedExam | null>(null);
  const [targetMode, setTargetMode] = useState<'class' | 'student'>('class');
  const [classes, setClasses] = useState<AssignClass[]>([]);
  const [students, setStudents] = useState<AssignStudent[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [assignments, setAssignments] = useState<EdesisExamAssignmentRow[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);

  const loadExams = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchSyncedEdesisExams();
      setSchemaMissing(Boolean(res.schemaMissing));
      setSchemaHint(res.schemaMissing ? res.hint || null : null);
      setExams(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/şema|schema|SUPABASE_DB/i.test(msg)) {
        setSchemaMissing(true);
        setSchemaHint(msg);
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const filteredExams = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr');
    if (!needle) return exams;
    return exams.filter((ex) => {
      const hay = `${ex.title || ''} ${ex.exam_type || ''} ${ex.edesis_exam_id} ${ex.grade_name || ''}`.toLocaleLowerCase(
        'tr',
      );
      return hay.includes(needle);
    });
  }, [exams, query]);

  const onSync = async () => {
    setSyncing(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await syncEdesisExamCatalog();
      if (res.schemaMissing) {
        setSchemaMissing(true);
        setSchemaHint(res.hint || null);
        throw new Error(
          res.hint ||
            'Atama deposu kurulamadı; senkronu tekrar deneyin. Gerekirse Vercel’e SUPABASE_DB_URL ekleyin (Storage yedeği de çalışır).',
        );
      }
      setSchemaMissing(false);
      setSchemaHint(null);
      setOkMsg(`Katalog senkron: ${res.upserted ?? 0} kayıt · Edesis’ten ${res.fetched ?? 0} satır`);
      await loadExams();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/şema|schema|SUPABASE_DB/i.test(msg)) {
        setSchemaMissing(true);
        setSchemaHint(msg);
      }
      setError(msg);
    } finally {
      setSyncing(false);
    }
  };

  const openAssign = async (exam: EdesisSyncedExam) => {
    setAssignExam(exam);
    setTargetMode('class');
    setSelectedClassIds([]);
    setSelectedStudentIds([]);
    setStudentQuery('');
    setAssignments([]);
    setError(null);
    setOkMsg(null);
    setAssignBusy(true);
    try {
      const [targets, assigns] = await Promise.all([
        fetchEdesisAssignTargets(),
        fetchEdesisExamAssignments(exam.edesis_exam_id),
      ]);
      const classList: AssignClass[] = Array.isArray(targets.classes) ? targets.classes : [];
      const classById = new Map(classList.map((c) => [c.id, c]));
      const memByStudent = new Map<string, string>();
      for (const m of targets.memberships || []) {
        if (!memByStudent.has(m.student_id) && classById.has(m.class_id)) {
          memByStudent.set(m.student_id, classById.get(m.class_id)!.name);
        }
      }
      setClasses(classList);
      setStudents(
        (targets.students || []).map((s) => ({
          ...s,
          class_name: memByStudent.get(s.id) || null,
        })),
      );
      setSchemaMissing(Boolean(assigns.schemaMissing));
      setAssignments(Array.isArray(assigns.items) ? assigns.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignBusy(false);
    }
  };

  const closeAssign = () => {
    setAssignExam(null);
    setAssignments([]);
  };

  const filteredStudents = useMemo(() => {
    const needle = studentQuery.trim().toLocaleLowerCase('tr');
    if (!needle) return students;
    return students.filter((s) => {
      const hay = `${s.name || ''} ${s.class_name || ''} ${s.email || ''}`.toLocaleLowerCase('tr');
      return hay.includes(needle);
    });
  }, [students, studentQuery]);

  const submitAssign = async () => {
    if (!assignExam) return;
    const classIds = targetMode === 'class' ? selectedClassIds : [];
    const studentIds = targetMode === 'student' ? selectedStudentIds : [];
    if (!classIds.length && !studentIds.length) {
      setError('En az bir sınıf veya öğrenci seçin.');
      return;
    }
    setAssignBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await assignEdesisExam({
        edesisExamId: assignExam.edesis_exam_id,
        targetType: targetMode,
        classIds,
        studentIds,
      });
      setOkMsg(`${res.assigned ?? 0} atama kaydı oluşturuldu.`);
      const assigns = await fetchEdesisExamAssignments(assignExam.edesis_exam_id);
      setAssignments(Array.isArray(assigns.items) ? assigns.items : []);
      setSelectedClassIds([]);
      setSelectedStudentIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignBusy(false);
    }
  };

  const removeAssignment = async (id: string) => {
    if (!assignExam) return;
    if (!window.confirm('Bu atamayı kaldırmak istiyor musunuz?')) return;
    setAssignBusy(true);
    setError(null);
    try {
      await unassignEdesisExam(id);
      const assigns = await fetchEdesisExamAssignments(assignExam.edesis_exam_id);
      setAssignments(Array.isArray(assigns.items) ? assigns.items : []);
      setOkMsg('Atama kaldırıldı.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignBusy(false);
    }
  };

  const assignmentLabel = (a: EdesisExamAssignmentRow) => {
    if (a.target_type === 'class') {
      return `Sınıf: ${a.class_name || a.class_id || '—'}`;
    }
    const who = a.student_name || a.student_id || '—';
    return a.class_name ? `Öğrenci: ${who} · ${a.class_name}` : `Öğrenci: ${who}`;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950">
        <p className="font-semibold">Edesis deneme atama</p>
        <p className="mt-1 text-indigo-900/80">
          Edesis kataloğunu senkronlayın, ardından sınıf veya öğrenci bazlı atama yapın. Öğrenci paneli yalnızca
          kendisine veya sınıfına atanan denemeleri görür; filtre backend’de uygulanır.
        </p>
      </div>

      {schemaMissing ? (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Yerel atama deposu hazırlanıyor</p>
            <p className="mt-1">
              Deneme atama SQL tabloları veya Storage yedeği ilk senkron/atamada otomatik kurulur. Bu
              sırada öğrenciler Edesis’teki açık/atanmış denemeleri görmeye devam eder.
            </p>
            <p className="mt-1 text-amber-900/90">
              {schemaHint ||
                'Kalıcı SQL için Vercel’e SUPABASE_DB_URL ekleyebilirsiniz; yoksa Storage yedeği yeterli.'}
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {okMsg ? (
        <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{okMsg}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onSync()}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Edesis’ten senkronize et
        </button>
        <button
          type="button"
          onClick={() => void loadExams()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Listeyi yenile
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Deneme ara…"
          className="ml-auto min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Deneme</th>
              <th className="px-3 py-2">Tür</th>
              <th className="px-3 py-2">Tarih</th>
              <th className="px-3 py-2">Sınıf</th>
              <th className="px-3 py-2">Edesis ID</th>
              <th className="px-3 py-2 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filteredExams.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  {busy ? 'Yükleniyor…' : 'Senkronize edilmiş deneme yok. Önce senkronize edin.'}
                </td>
              </tr>
            ) : (
              filteredExams.map((ex) => (
                <tr key={ex.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{ex.title || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{ex.exam_type || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDate(ex.exam_date)}</td>
                  <td className="px-3 py-2 text-slate-600">{ex.grade_name || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{ex.edesis_exam_id}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void openAssign(ex)}
                      disabled={schemaMissing}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Atama Yap
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {assignExam ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Atama Yap</h3>
                <p className="mt-0.5 text-sm text-slate-600">{assignExam.title}</p>
                <p className="font-mono text-xs text-slate-400">ID {assignExam.edesis_exam_id}</p>
              </div>
              <button type="button" onClick={closeAssign} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTargetMode('class')}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                    targetMode === 'class' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <Users className="h-4 w-4" />
                  Tüm Sınıf
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('student')}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                    targetMode === 'student' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  Belirli Öğrenci(ler)
                </button>
              </div>

              {assignBusy && !classes.length && !students.length ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Hedefler yükleniyor…
                </div>
              ) : null}

              {targetMode === 'class' ? (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {classes.length === 0 ? (
                    <p className="p-2 text-sm text-slate-500">Sınıf bulunamadı.</p>
                  ) : (
                    classes.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedClassIds.includes(c.id)}
                          onChange={() => toggleId(selectedClassIds, c.id, setSelectedClassIds)}
                        />
                        <span className="text-sm font-medium text-slate-800">{c.name}</span>
                        <span className="text-xs text-slate-400">{c.class_level || ''}</span>
                      </label>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Öğrenci ara…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                    {filteredStudents.length === 0 ? (
                      <p className="p-2 text-sm text-slate-500">Öğrenci bulunamadı.</p>
                    ) : (
                      filteredStudents.map((s) => (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(s.id)}
                            onChange={() => toggleId(selectedStudentIds, s.id, setSelectedStudentIds)}
                          />
                          <span className="text-sm font-medium text-slate-800">{s.name}</span>
                          <span className="text-xs text-slate-400">{s.class_name || ''}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mevcut atamalar</p>
                {assignments.length === 0 ? (
                  <p className="text-sm text-slate-500">Henüz atama yok.</p>
                ) : (
                  <ul className="space-y-1">
                    {assignments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span>
                          <strong>{assignmentLabel(a)}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => void removeAssignment(a.id)}
                          className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                          title="Kaldır"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={closeAssign}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => void submitAssign()}
                disabled={assignBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {assignBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Atamayı kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default EdesisExamAssignPanel;
