import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ExamResult } from '../../types';
import {
  fetchEdesisHataKarnesiPdf,
  type EdesisStudentResultsExam
} from '../../lib/edesis/edesisApi';
import {
  buildExamSubjectMatrix,
  buildHataKarnesi,
  summarizeSubjects
} from '../../lib/edesis/edesisSubjectAnalysis';

const EXAM_TYPES: ExamResult['examType'][] = [
  '3',
  '4',
  '5',
  '6',
  '7',
  'LGS',
  'YOS',
  'TYT',
  'YKS-EA',
  'YKS-SAY',
  'AYT'
];

export function edesisHubExamToResult(exam: EdesisStudentResultsExam, studentId: string): ExamResult {
  const raw = String(exam.examType || '').toUpperCase();
  const examType = EXAM_TYPES.find((t) => raw === t || raw.includes(t)) || 'LGS';
  return {
    id: exam.edesisExamId
      ? `edesis-${exam.edesisExamId}-${studentId}`
      : `edesis-${studentId}-${exam.examDate}-${exam.examTitle}`,
    studentId,
    examType,
    examDate: exam.examDate || new Date().toISOString().slice(0, 10),
    source: 'edesis',
    totalNet: exam.totalNet,
    subjects: exam.subjects || [],
    examTitle: exam.examTitle,
    edesisExamId: exam.edesisExamId || undefined,
    createdAt: exam.examDate || new Date().toISOString()
  };
}

type AnalysisSub = 'hata' | 'deneme';

type Props = {
  exams: EdesisStudentResultsExam[];
  studentId: string;
  edesisStudentId?: string;
};

export default function StudentEdesisAnalysisPanel({ exams, studentId, edesisStudentId }: Props) {
  const mapped = useMemo(
    () => exams.map((exam) => edesisHubExamToResult(exam, studentId || 'student')),
    [exams, studentId]
  );
  const [sub, setSub] = useState<AnalysisSub>('hata');
  const [selectedId, setSelectedId] = useState(mapped[0]?.id || '');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const selected = mapped.find((e) => e.id === selectedId) || mapped[0] || null;
  const hata = selected ? buildHataKarnesi(selected) : [];
  const subjectRows = useMemo(() => summarizeSubjects(mapped), [mapped]);
  const matrix = useMemo(() => buildExamSubjectMatrix(mapped), [mapped]);

  useEffect(() => {
    return () => {
      if (pdfUrl && pdfUrl.startsWith('blob:')) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (sub !== 'hata' || !selected?.edesisExamId) {
      return;
    }
    let cancelled = false;
    const examId = selected.edesisExamId;
    setPdfBusy(true);
    setPdfError(null);
    setPdfUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
    void (async () => {
      try {
        const r = await fetchEdesisHataKarnesiPdf({
          examId,
          studentId: studentId || undefined,
          edesisStudentId: edesisStudentId || undefined
        });
        if (cancelled) return;
        if (r.blob && r.blob.size > 8) {
          setPdfUrl(URL.createObjectURL(r.blob));
          return;
        }
        if (r.reportUrl) {
          setPdfUrl(r.reportUrl);
          return;
        }
        setPdfError(r.hint || r.message || 'Hata karnesi PDF bulunamadı');
      } catch (e) {
        if (!cancelled) {
          setPdfError(e instanceof Error ? e.message : 'Hata karnesi PDF alınamadı');
        }
      } finally {
        if (!cancelled) setPdfBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sub, selected?.edesisExamId, studentId, edesisStudentId]);

  const openPdfTab = () => {
    if (!pdfUrl) {
      toast.warning(pdfError || 'Hata karnesi henüz hazır değil');
      return;
    }
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  const tabOn = 'bg-emerald-600 text-white';
  const tabOff = 'border border-slate-200 bg-white text-slate-700';

  if (!mapped.length) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Analiz için değerlendirilmiş deneme yok. Sınava girip Bitir dedikten sonra hata karnesi ve deneme analizi burada
        görünür.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSub('hata')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            sub === 'hata' ? tabOn : tabOff
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Hata karnesi
        </button>
        <button
          type="button"
          onClick={() => setSub('deneme')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            sub === 'deneme' ? tabOn : tabOff
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Deneme analizi
        </button>
      </div>

      {sub === 'hata' ? (
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-700">
            Deneme
            <select
              value={selected?.id || ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
            >
              {mapped.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.examTitle || exam.examType} · {exam.examDate} · {exam.totalNet} net
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3">
                <div>
                  <div className="font-bold text-slate-900">{selected.examTitle || selected.examType}</div>
                  <p className="text-xs text-slate-600">
                    Edesis hata karnesi — boş ve yanlış yaptığınız soruların PDF’i
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pdfBusy || !pdfUrl}
                  onClick={openPdfTab}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  Yeni sekmede aç
                </button>
              </div>
              <div className="min-h-[420px] bg-slate-100">
                {pdfBusy ? (
                  <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-sm text-slate-600">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                    Hata karnesi PDF yükleniyor…
                  </div>
                ) : pdfUrl ? (
                  <iframe title="Hata karnesi PDF" src={pdfUrl} className="h-[640px] w-full border-0 bg-white" />
                ) : (
                  <div className="flex h-[420px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-600">
                    <FileText className="h-8 w-8 text-slate-400" />
                    <p>{pdfError || 'Bu deneme için Edesis hata karnesi PDF’si henüz yok.'}</p>
                    <p className="text-xs text-slate-500">
                      Karne PDF (puan özeti) ayrıdır. Burada yalnızca boş ve yanlış soruların karnesi gösterilir.
                    </p>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto border-t border-slate-100">
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ders özeti
                </div>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Ders</th>
                      <th className="px-3 py-2 text-center">D</th>
                      <th className="px-3 py-2 text-center">Y</th>
                      <th className="px-3 py-2 text-center">B</th>
                      <th className="px-3 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hata.map((row) => (
                      <tr key={row.subject} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-800">{row.subject}</td>
                        <td className="px-3 py-2 text-center text-emerald-700">{row.correct}</td>
                        <td className="px-3 py-2 text-center text-rose-700">{row.wrong}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{row.blank}</td>
                        <td className="px-3 py-2 text-right font-semibold">{row.net}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hata.some((row) => row.topics.length > 0) ? (
                <div className="space-y-3 border-t border-amber-100 bg-amber-50/50 p-4">
                  <h4 className="text-sm font-semibold text-amber-950">Konu bazlı hatalar</h4>
                  {hata
                    .filter((row) => row.topics.length > 0)
                    .map((row) => (
                      <div key={row.subject}>
                        <p className="text-sm font-medium text-slate-800">
                          {row.subject}
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            D {row.correct} · Y {row.wrong} · B {row.blank}
                          </span>
                        </p>
                        <ul className="mt-1 space-y-1 pl-3">
                          {row.topics.map((topic) => (
                            <li key={`${row.subject}-${topic.name}`} className="text-xs text-slate-700">
                              <span className="font-medium">{topic.name}</span>
                              {' — '}
                              <span className="text-rose-700">Y {topic.wrong}</span>
                              {topic.blank > 0 ? <span className="text-slate-500"> · B {topic.blank}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                  Bu denemede konu kırılımı yok. Ders bazlı yanlış / boş özeti yukarıda.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="font-bold text-slate-900">Ders özeti</div>
              <p className="text-xs text-slate-500">Tüm denemelerde ortalama, son net ve trend</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Ders</th>
                    <th className="px-3 py-2 text-center">Deneme</th>
                    <th className="px-3 py-2 text-right">Ort. net</th>
                    <th className="px-3 py-2 text-right">Son</th>
                    <th className="px-3 py-2 text-right">En iyi</th>
                    <th className="px-3 py-2 text-right">Yanlış</th>
                    <th className="px-3 py-2 text-right">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectRows.map((row) => (
                    <tr key={row.name} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                      <td className="px-3 py-2 text-center">{row.examCount}</td>
                      <td className="px-3 py-2 text-right">{row.avgNet}</td>
                      <td className="px-3 py-2 text-right">{row.lastNet}</td>
                      <td className="px-3 py-2 text-right">{row.bestNet}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{row.totalWrong}</td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          row.trend > 0 ? 'text-emerald-700' : row.trend < 0 ? 'text-rose-700' : 'text-slate-500'
                        }`}
                      >
                        {row.trend > 0 ? '+' : ''}
                        {row.trend}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="font-bold text-slate-900">Deneme × ders</div>
              <p className="text-xs text-slate-500">Her denemede ders netleri</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Deneme</th>
                    <th className="px-3 py-2 text-right">Toplam</th>
                    {matrix.subjects.map((s) => (
                      <th key={s} className="px-3 py-2 text-right">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr key={row.examId} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{row.examLabel}</div>
                        <div className="text-[11px] text-slate-400">{row.examDate}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{row.totalNet}</td>
                      {matrix.subjects.map((s) => (
                        <td key={s} className="px-3 py-2 text-right">
                          {row.cells[s] ? row.cells[s]?.net : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
