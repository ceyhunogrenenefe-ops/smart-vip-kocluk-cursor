import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ClipboardList,
  CloudDownload,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { userRoleTags } from '../../config/rolePermissions';
import { resolveStudentRecordId } from '../../lib/coachResolve';
import EdesisOpticalSheet from './EdesisOpticalSheet';
import {
  fetchEdesisAvailableExams,
  fetchEdesisExamStructure,
  fetchEdesisIngestStatus,
  fetchEdesisKarnePdf,
  fetchEdesisStudentResultsHub,
  submitEdesisStudentExam,
  type EdesisAvailableExam,
  type EdesisExamBooklet,
  type EdesisStudentResultsExam
} from '../../lib/edesis/edesisApi';

type View = 'take' | 'results';

async function waitForIngestJob(examId: string, jobId: string) {
  for (let i = 0; i < 12; i += 1) {
    const s = await fetchEdesisIngestStatus({ examId, jobId });
    const state = String(s.state || '');
    if (['Completed', 'Failed', 'NotFound'].includes(state)) return s;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return fetchEdesisIngestStatus({ examId, jobId });
}

type Props = {
  /** Optik formu açıkken Akademik Merkez diğer kartları gizleyebilir */
  onActiveExamChange?: (active: boolean) => void;
};

/**
 * Öğrenci — Edesis denemesine girer; net ve karne PDF görür.
 * Akademik Merkez → Deneme / Optik içinde kullanılır.
 */
export default function StudentEdesisExamPanel({ onActiveExamChange }: Props) {
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

  const [view, setView] = useState<View>('take');
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<EdesisStudentResultsExam[]>([]);
  const [available, setAvailable] = useState<EdesisAvailableExam[]>([]);
  const [edesisStudentId, setEdesisStudentId] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [karneBusyKey, setKarneBusyKey] = useState<string | null>(null);
  const [lastKarneUrl, setLastKarneUrl] = useState<string | null>(null);

  const [activeExam, setActiveExam] = useState<EdesisAvailableExam | null>(null);
  const [booklets, setBooklets] = useState<EdesisExamBooklet[]>([]);
  const [kitapcik, setKitapcik] = useState('');
  const [structureBusy, setStructureBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState(false);

  useEffect(() => {
    onActiveExamChange?.(Boolean(activeExam));
    return () => onActiveExamChange?.(false);
  }, [activeExam, onActiveExamChange]);

  const load = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      setHint('Öğrenci kartınız bulunamadı. Çıkış yapıp tekrar giriş yapın.');
      return;
    }
    setLoading(true);
    setHint(null);
    try {
      const [results, catalog] = await Promise.allSettled([
        fetchEdesisStudentResultsHub({ studentId }),
        fetchEdesisAvailableExams({ studentId })
      ]);

      if (results.status === 'fulfilled') {
        setExams(results.value.exams || []);
        setEdesisStudentId(results.value.edesisStudentId || '');
      } else {
        setExams([]);
        const msg = results.reason instanceof Error ? results.reason.message : 'Edesis sonuçları alınamadı';
        setHint(msg);
      }

      if (catalog.status === 'fulfilled') {
        setAvailable(catalog.value.items || []);
        if (catalog.value.edesisStudentId) setEdesisStudentId(catalog.value.edesisStudentId);
      } else {
        const msg = catalog.reason instanceof Error ? catalog.reason.message : 'Sınav listesi alınamadı';
        if (results.status !== 'fulfilled') {
          setHint(msg);
          toast.error(msg);
        } else {
          toast.warning(msg);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openExam = async (exam: EdesisAvailableExam) => {
    setStructureBusy(true);
    setReplaceConfirm(false);
    try {
      const r = await fetchEdesisExamStructure(exam.examId);
      const books = r.booklets || [];
      if (!books.length) {
        toast.error('Bu sınavın cevap anahtarı yapısı Edesis’te henüz yok');
        return;
      }
      setActiveExam(exam);
      setBooklets(books);
      setKitapcik(books[0].kitapcikTuru);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sınav yapısı alınamadı');
    } finally {
      setStructureBusy(false);
    }
  };

  const submitAnswers = async (
    dersCevaplari: { lessonId: number | null; dersGrupId: number | null; cevaplar: string }[],
    replace = false
  ) => {
    if (!activeExam || !kitapcik) return;
    setSubmitBusy(true);
    try {
      const r = await submitEdesisStudentExam({
        examId: activeExam.examId,
        kitapcikTuru: kitapcik,
        dersCevaplari,
        replace,
        studentId
      });
      if (r.conflict) {
        setReplaceConfirm(true);
        toast.warning('Bu sınavda sonucunuz var. Üzerine yazmak için tekrar gönderin.');
        return;
      }
      let state = String(r.job?.state || '');
      if (r.jobId && !['Completed', 'Failed', 'NotFound'].includes(state)) {
        toast.message('Cevaplar Edesis’e gitti, değerlendirme sürüyor…');
        const job = await waitForIngestJob(activeExam.examId, r.jobId);
        state = String(job.state || '');
        if (state === 'Failed') {
          toast.error(job.message || 'Değerlendirme başarısız');
          return;
        }
        if (state === 'NotFound') {
          toast.warning('Değerlendirme işi henüz görünmüyor. Biraz sonra Sonuçlarım sekmesini yenileyin.');
          return;
        }
      }
      if (state === 'Failed') {
        toast.error(r.job?.message || r.message || 'Değerlendirme başarısız');
        return;
      }
      toast.success(state === 'Completed' ? 'Sınav değerlendirildi' : r.message || 'Cevaplar gönderildi');
      setActiveExam(null);
      setView('results');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cevaplar gönderilemedi');
    } finally {
      setSubmitBusy(false);
    }
  };

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

  const activeLessons = booklets.find((b) => b.kitapcikTuru === kitapcik)?.lessons || [];
  const tabOn = 'bg-emerald-600 text-white';
  const tabOff = 'border border-slate-200 bg-white text-slate-700';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <CloudDownload className="h-5 w-5 text-emerald-600" />
            Edesis denemesi ve sonuçlarım
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Optik formu buradan doldurun. Değerlendirme bitince net ve karne PDF aynı yerde görünür.
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

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setView('take');
            setActiveExam(null);
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            view === 'take' ? tabOn : tabOff
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Sınava gir
        </button>
        <button
          type="button"
          onClick={() => {
            setView('results');
            setActiveExam(null);
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            view === 'results' ? tabOn : tabOff
          }`}
        >
          <FileText className="h-4 w-4" />
          Sonuçlarım
        </button>
      </div>

      {lastKarneUrl ? (
        <a
          href={lastKarneUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline"
        >
          <ExternalLink className="h-4 w-4" /> Son açılan karne PDF
        </a>
      ) : null}

      {loading ? (
        <div className="flex min-h-[20vh] items-center justify-center text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : view === 'take' ? (
        activeExam ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveExam(null)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" /> Sınav listesine dön
            </button>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="font-bold text-slate-900">{activeExam.name}</div>
              <p className="mt-1 text-xs text-slate-600">
                Kitapçığınızı seçin, her ders için optik işaretleyin. Boş bıraktığınız sorular boş gider.
              </p>
              {activeExam.hasStudentResult ? (
                <p className="mt-2 text-xs text-amber-800">
                  Bu sınavda sonucunuz var. Gönderirseniz Edesis mevcut neti silip yeniden değerlendirir.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {booklets.map((b) => (
                <button
                  key={b.kitapcikTuru}
                  type="button"
                  onClick={() => setKitapcik(b.kitapcikTuru)}
                  className={`rounded-lg px-3 py-2 text-sm font-bold ${
                    kitapcik === b.kitapcikTuru ? tabOn : tabOff
                  }`}
                >
                  Kitapçık {b.kitapcikTuru}
                </button>
              ))}
            </div>
            {replaceConfirm ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Mevcut sonuç var. Aşağıdan tekrar gönderirseniz üzerine yazılır.
              </p>
            ) : null}
            <EdesisOpticalSheet
              lessons={activeLessons}
              busy={submitBusy}
              submitLabel={
                replaceConfirm || activeExam.hasStudentResult ? 'Üzerine yazarak gönder' : 'Cevapları gönder'
              }
              onSubmit={(dersCevaplari) =>
                void submitAnswers(dersCevaplari, replaceConfirm || activeExam.hasStudentResult)
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {hint && !available.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{hint}</div>
            ) : null}
            {available.map((exam) => (
              <div key={exam.examId} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">{exam.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {exam.examDate ? new Date(exam.examDate).toLocaleDateString('tr-TR') : '—'}
                      {exam.totalQuestions ? ` · ${exam.totalQuestions} soru` : ''}
                      {exam.resultStatus ? ` · ${exam.resultStatus}` : ''}
                    </div>
                    {exam.hasStudentResult ? (
                      <div className="mt-1 text-xs font-semibold text-emerald-700">Netiniz: {exam.studentNet}</div>
                    ) : (
                      <div className="mt-1 text-xs text-slate-500">Henüz sonucunuz yok — optik formu doldurabilirsiniz</div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={structureBusy}
                    onClick={() => void openExam(exam)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {structureBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
                    {exam.hasStudentResult ? 'Tekrar gir' : 'Sınava gir'}
                  </button>
                </div>
              </div>
            ))}
            {!available.length && !hint ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Açık Edesis denemesi görünmüyor. Koçunuzun Edesis eşlemesini kontrol etmesini isteyin.
              </p>
            ) : null}
          </div>
        )
      ) : hint && exams.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{hint}</div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam, i) => {
            const key = `${exam.edesisExamId || i}-${edesisStudentId}`;
            const busy = karneBusyKey === key;
            return (
              <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">{exam.examTitle || 'Deneme'}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {exam.examDate ? new Date(exam.examDate).toLocaleDateString('tr-TR') : '—'} · {exam.subjectCount}{' '}
                      ders
                      {exam.topicCount ? ` · ${exam.topicCount} konu` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-emerald-700">{exam.totalNet}</div>
                      <div className="text-[11px] text-slate-500">net</div>
                    </div>
                    <button
                      type="button"
                      disabled={busy || !exam.edesisExamId}
                      onClick={() => void openKarne(exam)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                      Karne PDF
                    </button>
                  </div>
                </div>
                {exam.subjects?.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {exam.subjects.map((s, si) => (
                      <div key={`${s.name}-${si}`} className="rounded-lg bg-white px-3 py-2 text-xs">
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
          {!exams.length ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Henüz değerlendirilmiş sonuç yok. Sınava gir sekmesinden denemeyi gönderin.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
