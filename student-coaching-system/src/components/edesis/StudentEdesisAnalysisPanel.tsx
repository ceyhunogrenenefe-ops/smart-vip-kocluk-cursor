import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, ExternalLink, FileText, Loader2, RefreshCw } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Legend
} from 'recharts';
import { toast } from 'sonner';
import type { ExamResult } from '../../types';
import {
  fetchEdesisHataKarnesiPdf,
  type EdesisStudentResultsExam
} from '../../lib/edesis/edesisApi';
import { fetchEdesisStudentAnalysis, fetchEdesisEvaluations } from '../../lib/edesis/edesisAnalysisApi';
import { buildHataKarnesi } from '../../lib/edesis/edesisSubjectAnalysis';

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
  const [family, setFamily] = useState('all');
  const [windowKey, setWindowKey] = useState('last10');
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [evals, setEvals] = useState<Record<string, unknown>[]>([]);

  const selected = mapped.find((e) => e.id === selectedId) || mapped[0] || null;
  const hata = selected ? buildHataKarnesi(selected) : [];
  const summary = (analysis?.summary || {}) as Record<string, unknown>;
  const charts = (analysis?.charts || {}) as Record<string, unknown>;
  const subjects = (Array.isArray(analysis?.subjects) ? analysis.subjects : []) as Record<string, unknown>[];
  const table = (Array.isArray(analysis?.table) ? analysis.table : []) as Record<string, unknown>[];

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

  const loadAnalysis = useCallback(async () => {
    if (!studentId) return;
    setAnalysisBusy(true);
    try {
      const j = await fetchEdesisStudentAnalysis({
        studentId,
        family: family === 'all' ? 'all' : family,
        window: windowKey
      });
      setAnalysis((j.analysis || null) as Record<string, unknown> | null);
      const ev = await fetchEdesisEvaluations(studentId).catch(() => ({ items: [] }));
      setEvals(ev.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Deneme analizi yüklenemedi');
      setAnalysis(null);
    } finally {
      setAnalysisBusy(false);
    }
  }, [studentId, family, windowKey]);

  useEffect(() => {
    if (sub !== 'deneme') return;
    void loadAnalysis();
  }, [sub, loadAnalysis]);

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
      <Link
        to="/edesis-analiz"
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900"
      >
        <BarChart3 className="h-4 w-4" />
        Tam ekran: son 5 / 10 ve koç değerlendirmesi
      </Link>
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
                  </div>
                )}
              </div>
              <div className="overflow-x-auto border-t border-slate-100">
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
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Sınav türü
              <select
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
              >
                <option value="all">Tümü</option>
                <option value="lgs">LGS</option>
                <option value="tyt">TYT</option>
                <option value="ayt">AYT</option>
                <option value="okul">Okul</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Karşılaştırma
              <select
                value={windowKey}
                onChange={(e) => setWindowKey(e.target.value)}
                className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
              >
                <option value="last5">Son 5</option>
                <option value="last10">Son 10</option>
                <option value="all">Tümü</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void loadAnalysis()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
            >
              {analysisBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Yenile
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Deneme', summary.examCount],
              ['Son net', summary.lastNet],
              ['Değişim', summary.netChange],
              ['Son 5 ort.', summary.last5Avg],
              ['Son 10 ort.', summary.last10Avg],
              ['Başarı %', summary.successRate]
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] uppercase text-slate-500">{k}</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{v == null || v === '' ? '—' : String(v)}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 font-semibold">Toplam net gelişimi</div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(charts.netLine as object[]) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="examDate" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="net" stroke="#059669" name="Net" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 font-semibold">Ders ortalama net</div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(charts.subjects as object[]) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="avgNet" fill="#2563eb" name="Ort. net" />
                    <Bar dataKey="lastNet" fill="#f59e0b" name="Son net" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <div className="border-b px-4 py-2 font-semibold">Ders kırılımı</div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Ders</th>
                  <th className="px-3 py-2">D</th>
                  <th className="px-3 py-2">Y</th>
                  <th className="px-3 py-2">B</th>
                  <th className="px-3 py-2">Son</th>
                  <th className="px-3 py-2">Son 5</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={String(s.name)} className="border-t">
                    <td className="px-3 py-2 font-medium">{String(s.name)}</td>
                    <td className="px-3 py-2 text-center">{String(s.correct)}</td>
                    <td className="px-3 py-2 text-center text-rose-700">{String(s.wrong)}</td>
                    <td className="px-3 py-2 text-center">{String(s.blank)}</td>
                    <td className="px-3 py-2 text-right">{String(s.lastNet ?? '—')}</td>
                    <td className="px-3 py-2 text-right">{String(s.last5Avg ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <div className="border-b px-4 py-2 font-semibold">Denemeler</div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Sınav</th>
                  <th className="px-3 py-2">Tarih</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2">Katılım</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={String(row.id || row.edesisExamId)} className="border-t">
                    <td className="px-3 py-2 font-medium">{String(row.examTitle)}</td>
                    <td className="px-3 py-2">{String(row.examDate || '').slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{row.attended ? String(row.totalNet) : '—'}</td>
                    <td className="px-3 py-2">{String(row.attendanceLabel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {evals.length ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="font-semibold text-emerald-950">Koç / öğretmen değerlendirmesi</div>
              {evals.slice(0, 2).map((ev) => {
                const sec = (ev.sections as Record<string, string>) || {};
                return (
                  <div key={String(ev.id)} className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700">
                    {sec.genel || sec.koc || sec.ogretmen || '—'}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
