import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
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
import StudentEdesisAnalysisPanel from './StudentEdesisAnalysisPanel';
import {
  fetchEdesisAvailableExams,
  fetchEdesisExamBookletPdf,
  fetchEdesisExamStructure,
  fetchEdesisIngestStatus,
  fetchEdesisHataKarnesiPdf,
  fetchEdesisKarnePdf,
  fetchEdesisStudentResultsHub,
  submitEdesisStudentExam,
  type EdesisAvailableExam,
  type EdesisExamBooklet,
  type EdesisBookletPdf,
  type EdesisStudentResultsExam
} from '../../lib/edesis/edesisApi';

type View = 'take' | 'results' | 'analysis';

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
 * Öğrenci — Edesis denemesine girer; net, karne PDF, hata karnesi ve deneme analizi görür.
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
  const [hataBusyKey, setHataBusyKey] = useState<string | null>(null);
  const [lastKarneUrl, setLastKarneUrl] = useState<string | null>(null);

  const [activeExam, setActiveExam] = useState<EdesisAvailableExam | null>(null);
  const [booklets, setBooklets] = useState<EdesisExamBooklet[]>([]);
  const [availableBookletCodes, setAvailableBookletCodes] = useState<string[]>([]);
  const [bookletPdfs, setBookletPdfs] = useState<EdesisBookletPdf[]>([]);
  const [kitapcik, setKitapcik] = useState('');
  const [kitapcikSayisal, setKitapcikSayisal] = useState('');
  const [examFamily, setExamFamily] = useState('generic');
  const [bookletMode, setBookletMode] = useState('single');
  const [choiceCount, setChoiceCount] = useState(4);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [structureBusy, setStructureBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    onActiveExamChange?.(Boolean(activeExam));
    return () => onActiveExamChange?.(false);
  }, [activeExam, onActiveExamChange]);

  useEffect(() => {
    return () => {
      if (pdfUrl && pdfUrl.startsWith('blob:')) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const load = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      setHint('Öğrenci kartınız bulunamadı. Çıkış yapıp tekrar giriş yapın.');
      return { exams: [] as EdesisStudentResultsExam[], available: [] as EdesisAvailableExam[] };
    }
    setLoading(true);
    setHint(null);
    let nextExams: EdesisStudentResultsExam[] = [];
    let nextAvailable: EdesisAvailableExam[] = [];
    try {
      const [results, catalog] = await Promise.allSettled([
        fetchEdesisStudentResultsHub({ studentId }),
        fetchEdesisAvailableExams({ studentId })
      ]);

      if (results.status === 'fulfilled') {
        nextExams = results.value.exams || [];
        setExams(nextExams);
        setEdesisStudentId(results.value.edesisStudentId || '');
      } else {
        setExams([]);
        const msg = results.reason instanceof Error ? results.reason.message : 'Edesis sonuçları alınamadı';
        setHint(msg);
      }

      if (catalog.status === 'fulfilled') {
        nextAvailable = catalog.value.items || [];
        setAvailable(nextAvailable);
        if (catalog.value.edesisStudentId) setEdesisStudentId(catalog.value.edesisStudentId);
        if (!(catalog.value.items || []).length && catalog.value.hint) {
          setHint((prev) => prev || catalog.value.hint || null);
        }
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
    return { exams: nextExams, available: nextAvailable };
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!booklets.length || !kitapcik) return;
    const codes = booklets.map((b) => String(b.kitapcikTuru || '').trim().toUpperCase()).filter(Boolean);
    if (!codes.length) return;
    const current = String(kitapcik || '').trim().toUpperCase();
    if (!codes.includes(current)) {
      setKitapcik(codes[0]);
      if (kitapcikSayisal && !codes.includes(String(kitapcikSayisal).trim().toUpperCase())) {
        setKitapcikSayisal(codes[0]);
      }
    }
  }, [booklets, kitapcik, kitapcikSayisal]);

  useEffect(() => {
    if (!activeExam || !kitapcik) return;
    let cancelled = false;
    setPdfBusy(true);
    setPdfError(null);
    setPdfUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
    void (async () => {
      const applyBlob = (blob: Blob) => {
        if (cancelled || blob.size <= 8) return false;
        const next = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(next);
          return false;
        }
        setPdfUrl(next);
        return true;
      };

      const candidateUrls = (files: EdesisBookletPdf[] | undefined) => {
        const list = files || [];
        const want = String(kitapcik || '').trim().toUpperCase();
        const ordered = [
          ...list.filter((f) => String(f.kitapcikTuru || '').trim().toUpperCase() === want),
          ...list
        ];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const f of ordered) {
          const u = String(f?.url || '').trim();
          if (!u || seen.has(u)) continue;
          seen.add(u);
          out.push(u);
        }
        return out;
      };

      try {
        const r = await fetchEdesisExamBookletPdf({
          examId: activeExam.examId,
          kitapcikTuru: kitapcik
        });
        if (cancelled) return;
        if (applyBlob(r.blob)) return;

        // Ham Edesis URL iframe’de auth’suz açılmaz; her adayı proxy ile tekrar dene
        const retries = candidateUrls([
          ...(r.files || []),
          ...bookletPdfs,
          ...(activeExam.bookletPdfs || [])
        ]);
        for (const fileUrl of retries) {
          if (cancelled) return;
          try {
            const again = await fetchEdesisExamBookletPdf({
              examId: activeExam.examId,
              kitapcikTuru: kitapcik,
              fileUrl
            });
            if (applyBlob(again.blob)) return;
          } catch {
            /* sonraki dosya */
          }
        }
        setPdfError('Bu sınav için kitapçık PDF’si bulunamadı');
      } catch (e) {
        if (cancelled) return;
        const retries = candidateUrls([...bookletPdfs, ...(activeExam.bookletPdfs || [])]);
        for (const fileUrl of retries) {
          if (cancelled) return;
          try {
            const again = await fetchEdesisExamBookletPdf({
              examId: activeExam.examId,
              kitapcikTuru: kitapcik,
              fileUrl
            });
            if (applyBlob(again.blob)) {
              setPdfError(null);
              return;
            }
          } catch {
            /* sonraki */
          }
        }
        setPdfError(e instanceof Error ? e.message : 'Kitapçık PDF alınamadı');
      } finally {
        if (!cancelled) setPdfBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeExam, kitapcik, bookletPdfs]);

  const openExam = async (exam: EdesisAvailableExam) => {
    if (exam.hasStudentResult || exam.canTake === false) {
      toast.message('Bu sınava daha önce girdiniz. Sonuçlarım veya Analizlerim sekmesine bakın.');
      return;
    }
    setStructureBusy(true);
    try {
      const r = await fetchEdesisExamStructure(exam.examId);
      const books = r.booklets || [];
      const sharedLessons = books[0]?.lessons || r.items || [];
      if (!sharedLessons.length) {
        toast.error('Bu sınavın cevap anahtarı yapısı Edesis’te henüz yok');
        return;
      }
      const uniqueCodes = (() => {
        const fromApi = (r.availableBookletCodes || [])
          .map((c) => String(c || '').trim().toUpperCase())
          .filter((c) => ['A', 'B', 'C', 'D'].includes(c));
        if (fromApi.length) return [...new Set(fromApi)].sort();
        return ['A', 'B', 'C', 'D'];
      })();
      const booksForUi = uniqueCodes.map((code) => ({
        kitapcikTuru: code,
        lessons: sharedLessons
      }));
      const nameType = `${exam.name || ''} ${exam.examType || ''} ${r.examTitle || ''} ${r.examType || ''}`;
      const family =
        r.examFamily && r.examFamily !== 'generic'
          ? r.examFamily
          : /\blgs\b/i.test(nameType)
            ? 'lgs'
            : /yös|\byos\b/i.test(nameType)
              ? 'yos'
              : /\b(tyt|ayt|yks)\b/i.test(nameType)
                ? 'yks'
                : r.examFamily || 'generic';
      const mode =
        family === 'lgs' || r.bookletMode === 'dual-sozel-sayisal' ? 'dual-sozel-sayisal' : r.bookletMode || 'single';
      const firstLetter = uniqueCodes[0] || 'A';
      setActiveExam(exam);
      setBooklets(booksForUi);
      setAvailableBookletCodes(uniqueCodes);
      setBookletPdfs(r.bookletPdfs || exam.bookletPdfs || []);
      setExamFamily(family);
      setBookletMode(mode);
      setChoiceCount(
        family === 'yks' || family === 'yos' || family === 'ayt' || family === 'tyt'
          ? 5
          : family === 'lgs'
            ? 4
            : r.choiceCount || 4
      );
      setRemainingSeconds(r.remainingSeconds || 0);
      setKitapcik(firstLetter);
      setKitapcikSayisal(firstLetter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sınav yapısı alınamadı');
    } finally {
      setStructureBusy(false);
    }
  };

  const submitAnswers = async (
    dersCevaplari: { lessonId: number | null; dersGrupId: number | null; cevaplar: string }[]
  ) => {
    if (!activeExam || !kitapcik) return;
    if (!activeLessons.length) {
      toast.error('Sınav ders yapısı yüklenemedi. Sayfayı yenileyip tekrar deneyin.');
      return;
    }
    setSubmitBusy(true);
    try {
      const r = await submitEdesisStudentExam({
        examId: activeExam.examId,
        kitapcikTuru: kitapcik,
        ...(bookletMode === 'dual-sozel-sayisal' || examFamily === 'lgs'
          ? { kitapcikTuruSay: kitapcikSayisal || kitapcik }
          : {}),
        dersCevaplari,
        studentId
      });
      if (r.conflict) {
        toast.warning(r.hint || r.message || 'Bu sınava daha önce girdiniz');
        setActiveExam(null);
        setView('results');
        await load();
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
      const submittedExamId = String(activeExam.examId);
      setActiveExam(null);
      setView('results');
      let refreshed = await load();
      const hasResult = (bundle: { exams: EdesisStudentResultsExam[]; available: EdesisAvailableExam[] }) =>
        (bundle.exams || []).some((ex) => String(ex.edesisExamId || '') === submittedExamId) ||
        (bundle.available || []).some((ex) => String(ex.examId) === submittedExamId && ex.hasStudentResult);
      if (!hasResult(refreshed)) {
        for (const delayMs of [2500, 5000, 8000]) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          refreshed = await load();
          if (hasResult(refreshed)) break;
        }
      }
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

  const openHataKarnesi = async (exam: EdesisStudentResultsExam) => {
    if (!exam.edesisExamId) {
      toast.error('Hata karnesi için Edesis sınav eşlemesi gerekli');
      return;
    }
    const key = `hata-${exam.edesisExamId}-${edesisStudentId}`;
    setHataBusyKey(key);
    try {
      const r = await fetchEdesisHataKarnesiPdf({
        examId: exam.edesisExamId,
        edesisStudentId: edesisStudentId || undefined,
        studentId: studentId || undefined
      });
      if (r.blob && r.blob.size > 8) {
        window.open(URL.createObjectURL(r.blob), '_blank', 'noopener,noreferrer');
        toast.success(r.message || 'Hata karnesi PDF hazır');
        return;
      }
      if (r.reportUrl) {
        window.open(r.reportUrl, '_blank', 'noopener,noreferrer');
        toast.success(r.message || 'Hata karnesi PDF hazır');
        return;
      }
      toast.warning(r.hint || r.message || 'Hata karnesi PDF bulunamadı');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata karnesi açılamadı');
    } finally {
      setHataBusyKey(null);
    }
  };

  const activeLessons =
    booklets.find(
      (b) => String(b.kitapcikTuru || '').trim().toUpperCase() === String(kitapcik || '').trim().toUpperCase()
    )?.lessons ||
    booklets[0]?.lessons ||
    [];
  const takeable = useMemo(
    () => available.filter((exam) => !exam.hasStudentResult && exam.canTake !== false),
    [available]
  );
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
            Yalnızca Edesis’te size tanımlanan denemeler görünür (TYT/LGS kataloğunun tamamı değil). Optik formu ders ders doldurun; net, hata
            karnesi PDF (boş ve yanlış sorular) ve deneme analizi aynı yerde açılır.
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

      <div className="flex flex-wrap gap-2">
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
        <button
          type="button"
          onClick={() => {
            setView('analysis');
            setActiveExam(null);
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            view === 'analysis' ? tabOn : tabOff
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Analizlerim
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
                {bookletMode === 'dual-sozel-sayisal' || examFamily === 'lgs'
                  ? 'LGS’de Sözel ve Sayısal kitapçık harflerini ayrı seçin. Ders sekmeleri değişmez; Kaydet taslak, Bitir Edesis’e gider.'
                  : 'Kitapçık türünü seçin. Soldan ders sekmesine tıklayıp optiği doldurun; Kaydet ile saklanır, Bitir ile Edesis’e gider.'}
              </p>
            </div>
            <EdesisOpticalSheet
              lessons={activeLessons}
              booklets={booklets}
              availableBookletCodes={availableBookletCodes}
              kitapcik={kitapcik}
              onKitapcikChange={setKitapcik}
              kitapcikSayisal={kitapcikSayisal}
              onKitapcikSayisalChange={setKitapcikSayisal}
              examTitle={activeExam.name}
              examType={activeExam.examType}
              examFamily={examFamily}
              bookletMode={bookletMode}
              choiceCount={choiceCount}
              remainingSeconds={remainingSeconds}
              storageKey={`edesis-optic:${studentId}:${activeExam.examId}`}
              busy={submitBusy}
              submitLabel="Bitir"
              pdfUrl={pdfUrl}
              pdfBusy={pdfBusy}
              pdfError={pdfError}
              onSubmit={(dersCevaplari) => void submitAnswers(dersCevaplari)}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {hint && !takeable.length && !available.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{hint}</div>
            ) : null}
            {takeable.map((exam) => (
              <div key={exam.examId} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">{exam.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {exam.examDate ? new Date(exam.examDate).toLocaleDateString('tr-TR') : '—'}
                      {exam.totalQuestions ? ` · ${exam.totalQuestions} soru` : ''}
                      {exam.resultStatus ? ` · ${exam.resultStatus}` : ''}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Henüz sonucunuz yok — optik formu doldurabilirsiniz</div>
                  </div>
                  <button
                    type="button"
                    disabled={structureBusy}
                    onClick={() => void openExam(exam)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {structureBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ClipboardList className="h-3.5 w-3.5" />
                    )}
                    Sınava gir
                  </button>
                </div>
              </div>
            ))}
            {!takeable.length && available.length ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Girilecek deneme kalmadı. Girdiğiniz sınavlar Sonuçlarım ve Analizlerim sekmelerinde.
              </p>
            ) : null}
            {!available.length && !hint ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Edesis’te size atanmış açık deneme yok. Koçunuz Edesis’te denemeyi size tanımladıktan sonra burada görünür.
              </p>
            ) : null}
          </div>
        )
      ) : view === 'analysis' ? (
        <StudentEdesisAnalysisPanel exams={exams} studentId={studentId} edesisStudentId={edesisStudentId} />
      ) : hint && exams.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{hint}</div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam, i) => {
            const key = `${exam.edesisExamId || i}-${edesisStudentId}`;
            const busy = karneBusyKey === key;
            const hataBusy = hataBusyKey === `hata-${exam.edesisExamId}-${edesisStudentId}`;
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
                    <button
                      type="button"
                      disabled={hataBusy || !exam.edesisExamId}
                      onClick={() => void openHataKarnesi(exam)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {hataBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      Hata karnesi
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
