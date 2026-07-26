import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudDownload, ExternalLink, FileText, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { userRoleTags } from '../config/rolePermissions';
import { resolveStudentRecordId } from '../lib/coachResolve';
import {
  fetchEdesisKarnePdf,
  fetchEdesisStudentResultsHub,
  type EdesisStudentResultsExam
} from '../lib/edesis/edesisApi';

/**
 * Öğrenci — kendi Edesis sınav sonuçları ve karne PDF (koçtaki Sonuçlar / Karne ile aynı API).
 */
export default function StudentEdesisReportsPage() {
  const { effectiveUser, linkedStudent } = useAuth();
  const { students } = useApp();
  const tags = userRoleTags(effectiveUser);

  const studentId = useMemo(
    () =>
      linkedStudent?.id ||
      effectiveUser?.studentId ||
      resolveStudentRecordId(
        effectiveUser?.role,
        effectiveUser?.studentId,
        effectiveUser?.email,
        students,
        { roles: tags }
      ) ||
      '',
    [linkedStudent?.id, effectiveUser?.role, effectiveUser?.studentId, effectiveUser?.email, students, tags]
  );

  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<EdesisStudentResultsExam[]>([]);
  const [edesisStudentId, setEdesisStudentId] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [karneBusyKey, setKarneBusyKey] = useState<string | null>(null);
  const [lastKarneUrl, setLastKarneUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      setHint('Öğrenci kartınız bulunamadı. Çıkış yapıp tekrar giriş yapın.');
      return;
    }
    setLoading(true);
    setHint(null);
    try {
      const r = await fetchEdesisStudentResultsHub({ studentId });
      setExams(r.exams || []);
      setEdesisStudentId(r.edesisStudentId || '');
      if (!(r.exams || []).length) {
        setHint('Edesis’te henüz sınav sonucu görünmüyor. Koçunuzun Edesis eşlemesini kontrol etmesini isteyin.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Edesis sonuçları alınamadı';
      setExams([]);
      setHint(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openKarne = async (exam: EdesisStudentResultsExam) => {
    if (!exam.edesisExamId || !edesisStudentId) {
      toast.error('Karne için Edesis sınav / öğrenci eşlemesi gerekli');
      return;
    }
    const key = `${exam.edesisExamId}-${edesisStudentId}`;
    setKarneBusyKey(key);
    try {
      const r = await fetchEdesisKarnePdf({
        examId: exam.edesisExamId,
        edesisStudentId,
        studentId: studentId || undefined
      });
      if (r.reportUrl) {
        setLastKarneUrl(r.reportUrl);
        window.open(r.reportUrl, '_blank', 'noopener,noreferrer');
        toast.success(r.message || 'Karne PDF hazır');
      } else {
        toast.warning(r.message || r.hint || 'Karne linki dönmedi');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Karne açılamadı');
    } finally {
      setKarneBusyKey(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <CloudDownload className="h-6 w-6 text-indigo-600" />
            Edesis sınav raporlarım
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Edesis’teki deneme sonuçlarınızı görün; karne PDF’ini doğrudan açın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Yenile
        </button>
      </div>

      {lastKarneUrl ? (
        <a
          href={lastKarneUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:underline"
        >
          <ExternalLink className="h-4 w-4" /> Son açılan karne PDF
        </a>
      ) : null}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : hint && exams.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {hint}
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam, i) => {
            const key = `${exam.edesisExamId || i}-${edesisStudentId}`;
            const busy = karneBusyKey === key;
            return (
              <div
                key={key}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">{exam.examTitle || 'Deneme'}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {exam.examDate
                        ? new Date(exam.examDate).toLocaleDateString('tr-TR')
                        : '—'}{' '}
                      · {exam.subjectCount} ders
                      {exam.topicCount ? ` · ${exam.topicCount} konu` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-indigo-700">{exam.totalNet}</div>
                      <div className="text-[11px] text-slate-500">net</div>
                    </div>
                    <button
                      type="button"
                      disabled={busy || !exam.edesisExamId}
                      onClick={() => void openKarne(exam)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      Karne PDF
                    </button>
                  </div>
                </div>
                {exam.subjects?.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {exam.subjects.map((s, si) => (
                      <div key={`${s.name}-${si}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="truncate text-slate-600">{s.name}</span>
                          <span className="font-semibold text-slate-900">{s.net}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          ✓{s.correct} ✗{s.wrong} —{s.blank}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
