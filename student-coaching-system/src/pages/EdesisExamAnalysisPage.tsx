import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Copy,
  ExternalLink
} from 'lucide-react';
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
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { userRoleTags } from '../config/rolePermissions';
import { resolveStudentRecordId } from '../lib/coachResolve';
import {
  EVAL_SECTION_KEYS,
  fetchEdesisAnalysisDashboard,
  fetchEdesisEvaluations,
  fetchEdesisStudentAnalysis,
  generateEdesisAnalysisPdf,
  listEdesisGeneratedPdfs,
  logEdesisReportShare,
  pollEdesisAnalysisPdf,
  publishEdesisEvaluation,
  saveEdesisEvaluation,
  fetchEdesisReportVersions,
  archiveEdesisEvaluation
} from '../lib/edesis/edesisAnalysisApi';
import { shareEdesisReportLinkWithParent } from '../lib/edesis/shareEdesisKarneWhatsApp';

type Tab = 'analiz' | 'degerlendirme' | 'pdf' | 'panel';

const FAMILIES = [
  { id: 'all', label: 'Tümü' },
  { id: 'tyt', label: 'TYT' },
  { id: 'ayt', label: 'AYT' },
  { id: 'lgs', label: 'LGS' },
  { id: 'yks-ea', label: 'YKS EA' },
  { id: 'yks-say', label: 'YKS Sayısal' },
  { id: 'yos', label: 'YÖS' },
  { id: 'okul', label: 'Okul sınavı' }
];

export default function EdesisExamAnalysisPage() {
  const { effectiveUser, linkedStudent } = useAuth();
  const { students } = useApp();
  const tags = userRoleTags(effectiveUser);
  const isStudent = tags.includes('student') && !tags.some((t) => ['admin', 'super_admin', 'coach', 'teacher'].includes(t));
  const isStaff = tags.some((t) => ['admin', 'super_admin', 'coach', 'teacher'].includes(t));

  const ownStudentId = useMemo(
    () =>
      linkedStudent?.id ||
      effectiveUser?.studentId ||
      resolveStudentRecordId(effectiveUser?.role, effectiveUser?.studentId, effectiveUser?.email, students, {
        roles: tags
      }) ||
      '',
    [linkedStudent?.id, effectiveUser, students, tags]
  );

  const visibleStudents = useMemo(() => {
    if (isStudent) return students.filter((s) => s.id === ownStudentId);
    let list = students;
    if (tags.includes('coach') && !tags.includes('admin') && !tags.includes('super_admin')) {
      const cid = String(effectiveUser?.coachId || '').trim();
      if (cid) list = list.filter((s) => String(s.coachId || '') === cid);
    }
    return [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'));
  }, [students, isStudent, ownStudentId, tags, effectiveUser?.coachId]);

  const [tab, setTab] = useState<Tab>('analiz');
  const [studentId, setStudentId] = useState(ownStudentId || visibleStudents[0]?.id || '');
  const [family, setFamily] = useState('all');
  const [windowKey, setWindowKey] = useState('last10');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [sections, setSections] = useState<Record<string, string>>({});
  const [reportId, setReportId] = useState('');
  const [evals, setEvals] = useState<Record<string, unknown>[]>([]);
  const [pdfs, setPdfs] = useState<Record<string, unknown>[]>([]);
  const [pdfCodes, setPdfCodes] = useState<number[]>([102]);
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [forceNew, setForceNew] = useState(false);
  const [versions, setVersions] = useState<Record<string, unknown>[]>([]);
  const [confirmDup, setConfirmDup] = useState(false);

  const analysis = (payload?.analysis || {}) as Record<string, unknown>;
  const summary = (analysis.summary || {}) as Record<string, unknown>;
  const charts = (analysis.charts || {}) as Record<string, unknown>;
  const table = (Array.isArray(analysis.table) ? analysis.table : []) as Record<string, unknown>[];
  const subjects = (Array.isArray(analysis.subjects) ? analysis.subjects : []) as Record<string, unknown>[];
  const topics = (Array.isArray(analysis.topics) ? analysis.topics : []) as Record<string, unknown>[];
  const studentMeta = (payload?.student || {}) as Record<string, unknown>;

  const load = useCallback(async () => {
    if (!studentId) return;
    setBusy(true);
    try {
      const j = await fetchEdesisStudentAnalysis({
        studentId,
        family,
        window: windowKey,
        from: dateFrom || undefined,
        to: dateTo || undefined
      });
      setPayload(j);
      const draft = (j.analysis?.draft || {}) as Record<string, string>;
      setSections((prev) => (Object.keys(prev).some((k) => (prev[k] || '').trim()) ? prev : draft));
      const [ev, pf] = await Promise.all([
        fetchEdesisEvaluations(studentId).catch(() => ({ items: [] })),
        listEdesisGeneratedPdfs(studentId).catch(() => ({ items: [] }))
      ]);
      setEvals(ev.items || []);
      setPdfs(pf.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analiz yüklenemedi');
    } finally {
      setBusy(false);
    }
  }, [studentId, family, windowKey, dateFrom, dateTo]);

  useEffect(() => {
    if (!studentId && visibleStudents[0]?.id) {
      setStudentId(visibleStudents[0].id);
    }
  }, [visibleStudents, studentId]);

  useEffect(() => {
    if (!studentId || !reportId) {
      setVersions([]);
      return;
    }
    fetchEdesisReportVersions(studentId, reportId)
      .then((j) => setVersions(j.items || []))
      .catch(() => setVersions([]));
  }, [studentId, reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'panel' || !isStaff) return;
    fetchEdesisAnalysisDashboard()
      .then((j) => setDash(j.dashboard || null))
      .catch(() => setDash(null));
  }, [tab, isStaff]);

  const copyDraft = () => {
    const text = EVAL_SECTION_KEYS.map((s) => `## ${s.label}\n${sections[s.key] || ''}`).join('\n\n');
    void navigator.clipboard.writeText(text);
    toast.success('Değerlendirme panoya kopyalandı');
  };

  const saveEval = async (status: string) => {
    if (!studentId) return;
    try {
      const j = await saveEdesisEvaluation({
        studentId,
        reportId: reportId || undefined,
        sections,
        autoDraft: analysis.draft,
        chartPayload: charts,
        examIds: analysis.comparedIds,
        window: windowKey,
        family,
        status
      });
      setReportId(String(j.item?.id || reportId));
      toast.success('Değerlendirme kaydedildi');
      const ev = await fetchEdesisEvaluations(studentId);
      setEvals(ev.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    }
  };

  const publish = async () => {
    if (!reportId) {
      toast.error('Önce kaydedin');
      return;
    }
    try {
      await publishEdesisEvaluation(studentId, reportId);
      toast.success('Öğrenci analiz sayfasına aktarıldı');
      const ev = await fetchEdesisEvaluations(studentId);
      setEvals(ev.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aktarılamadı');
    }
  };

  const makePdf = async () => {
    const pickExamId = () => {
      for (const row of table) {
        const direct = String(row.edesisExamId || '').trim();
        if (/^\d+$/.test(direct)) return direct;
        const fromId = String(row.id || '').match(/^edesis-(\d+)/);
        if (fromId) return fromId[1];
      }
      return '';
    };
    const examId = pickExamId();
    if (!examId) {
      toast.error('Bu öğrencinin denemelerinde Edesis sınav numarası yok — senkron çalıştırın.');
      return;
    }
    try {
      const j = await generateEdesisAnalysisPdf({
        studentId,
        examId,
        reportCodes: pdfCodes,
        examTitle: String(table[0]?.examTitle || ''),
        forceNew
      });
      if (j.reportUrl) window.open(j.reportUrl, '_blank', 'noopener,noreferrer');
      else if (j.jobId) {
        toast.message('Rapor işleniyor…');
        const polled = await pollEdesisAnalysisPdf({ studentId, jobId: String(j.jobId) });
        if (polled.reportUrl) window.open(polled.reportUrl, '_blank', 'noopener,noreferrer');
      }
      toast.success(j.message || 'Rapor isteği gönderildi');
      const pf = await listEdesisGeneratedPdfs(studentId);
      setPdfs(pf.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF oluşturulamadı');
    }
  };

  const sharePdf = async (row: Record<string, unknown>) => {
    const url = String(row.report_url || '');
    if (!url) {
      toast.error('PDF bağlantısı yok');
      return;
    }
    const parentPhone = String(studentMeta.parentPhone || '');
    const studentName = String(studentMeta.name || 'Öğrenci');
    const examTitle = String(row.exam_title || table[0]?.examTitle || 'Deneme');
    const reportLabel = String(row.report_label || 'analiz raporu');
    try {
      const share = await shareEdesisReportLinkWithParent({
        studentName,
        parentPhone,
        coachUserId: String(effectiveUser?.id || ''),
        examTitle,
        reportLabel,
        reportUrl: url
      });
      const log = await logEdesisReportShare({
        studentId,
        reportUrl: url,
        reportType: reportLabel,
        parentPhone,
        generatedReportId: row.id,
        confirmDuplicate: confirmDup,
        message: `Sayın Velimiz, ${studentName} öğrencimizin ${examTitle} sınavına ait ${reportLabel} hazırlanmıştır.`,
        deliveryStatus: 'sent'
      });
      if (log.duplicate) {
        setConfirmDup(true);
        toast.warning(log.hint || 'Bu rapor az önce gönderildi. Tekrar için bir kez daha basın.');
        return;
      }
      setConfirmDup(false);
      toast.success(share.notice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Paylaşılamadı');
    }
  };

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
        tab === id ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edesis sınav analizi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Son 5 / son 10 deneme, ders-konu kırılımı, değerlendirme ve Edesis karne / BK-5 / BK-10 PDF. Yoklama bu
            ekranda yoktur.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Yenile
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-semibold text-slate-700">
          Öğrenci
          <select
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setReportId('');
              setSections({});
            }}
            disabled={isStudent}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
          >
            {visibleStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Sınav türü
          <select
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
          >
            {FAMILIES.filter((f) => f.id).map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Karşılaştırma
          <select
            value={windowKey}
            onChange={(e) => setWindowKey(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
          >
            <option value="last5">Son 5 deneme</option>
            <option value="last10">Son 10 deneme</option>
            <option value="all">Tüm denemeler</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Başlangıç
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Bitiş
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn('analiz', 'Analiz')}
        {isStaff ? tabBtn('degerlendirme', 'Değerlendirme') : null}
        {tabBtn('pdf', 'Karne ve raporlar')}
        {isStaff ? tabBtn('panel', 'Panel') : null}
      </div>

      {tab === 'analiz' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ['Deneme', summary.examCount],
              ['Son net', summary.lastNet],
              ['Değişim', summary.netChange],
              ['Son 5 ort.', summary.last5Avg],
              ['Son 10 ort.', summary.last10Avg],
              ['En yüksek', summary.bestNet],
              ['En düşük', summary.worstNet],
              ['Başarı %', summary.successRate],
              ['Güçlü ders', summary.strongestSubject],
              ['Gelişmeli', summary.weakestSubject],
              ['Son tarih', summary.lastExamDate ? String(summary.lastExamDate).slice(0, 10) : '—']
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
              <div className="h-56">
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
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(charts.subjects as object[]) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="avgNet" fill="#2563eb" name="Ort. net" />
                    <Bar dataKey="lastNet" fill="#f59e0b" name="Son net" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 font-semibold">Doğru / yanlış / boş</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(charts.netLine as object[]) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="examDate" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="correct" fill="#059669" name="Doğru" />
                    <Bar dataKey="wrong" fill="#e11d48" name="Yanlış" />
                    <Bar dataKey="blank" fill="#94a3b8" name="Boş" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 font-semibold">Son 5 vs önceki 5</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={((charts.lastVsPrev as { bars?: object[] } | undefined)?.bars as object[]) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="avgNet" fill="#7c3aed" name="Ort. net" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 font-semibold">Başarı oranı</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(charts.netLine as object[]) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="examDate" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="successRate" stroke="#2563eb" name="Başarı %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Sınav</th>
                  <th className="px-3 py-2">Tarih</th>
                  <th className="px-3 py-2">Tür</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-center">D/Y/B</th>
                  <th className="px-3 py-2">Katılım</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={String(row.id || row.edesisExamId)} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{String(row.examTitle)}</td>
                    <td className="px-3 py-2">{String(row.examDate || '').slice(0, 10)}</td>
                    <td className="px-3 py-2 uppercase">{String(row.family)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{row.attended ? String(row.totalNet) : '—'}</td>
                    <td className="px-3 py-2 text-center text-xs">
                      {row.attended ? `${row.correct}/${row.wrong}/${row.blank}` : '—'}
                    </td>
                    <td className="px-3 py-2">{String(row.attendanceLabel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <th className="px-3 py-2">Son 10</th>
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
                    <td className="px-3 py-2 text-right">{String(s.last10Avg ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <div className="border-b px-4 py-2 font-semibold">Konu önceliği</div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Konu</th>
                  <th className="px-3 py-2">Ders</th>
                  <th className="px-3 py-2">Başarı</th>
                  <th className="px-3 py-2">Öncelik</th>
                </tr>
              </thead>
              <tbody>
                {topics.slice(0, 40).map((t) => (
                  <tr key={`${t.subject}-${t.name}`} className="border-t">
                    <td className="px-3 py-2">{String(t.name)}</td>
                    <td className="px-3 py-2">{String(t.subject)}</td>
                    <td className="px-3 py-2">{t.successRate == null ? '—' : `${t.successRate}%`}</td>
                    <td className="px-3 py-2 font-semibold">{String(t.priorityLabel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!topics.length ? <p className="px-4 py-3 text-xs text-slate-500">Konu kırılımı henüz yok.</p> : null}
          </div>

          {isStudent && evals.length ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="font-semibold text-emerald-950">Koç / öğretmen değerlendirmesi</div>
              {evals.slice(0, 3).map((ev) => {
                const sec = (ev.sections as Record<string, string>) || {};
                return (
                  <div key={String(ev.id)} className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700">
                    {EVAL_SECTION_KEYS.filter((s) => (sec[s.key] || '').trim())
                      .map((s) => `## ${s.label}\n${sec[s.key]}`)
                      .join('\n\n') || '—'}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'degerlendirme' && isStaff ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSections((analysis.draft || {}) as Record<string, string>)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">
              Otomatik taslak
            </button>
            <button type="button" onClick={copyDraft} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold">
              <Copy className="h-3.5 w-3.5" /> Kopyala
            </button>
            <button type="button" onClick={() => void saveEval('draft')} className="rounded-lg bg-slate-600 px-3 py-2 text-xs font-bold text-white">
              Taslak kaydet
            </button>
            <button type="button" onClick={() => void saveEval(tags.includes('teacher') ? 'teacher_review' : 'coach_review')} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white">
              İncelemeye gönder
            </button>
            {tags.some((t) => ['admin', 'super_admin'].includes(t)) ? (
              <button type="button" onClick={() => void saveEval('approved')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">
                Onayla
              </button>
            ) : null}
            <button type="button" onClick={() => void publish()} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">
              Öğrenci analizine aktar
            </button>
          </div>
          <p className="text-xs text-slate-500">Taslak yalnızca Edesis verisinden üretilir; boş alanlara sayı uydurulmaz. Onaysız taslak veliye gitmez.</p>
          {payload?.teacherBranch ? (
            <p className="text-xs text-amber-800">Branş öğretmeni görünümü: yalnızca {String(payload.teacherBranch)} kırılımı.</p>
          ) : null}
          {evals.length ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="font-semibold">Kayıtlı değerlendirmeler</div>
              <ul className="mt-2 space-y-1">
                {evals.map((ev) => (
                  <li key={String(ev.id)} className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left font-medium text-emerald-800"
                      onClick={() => {
                        setReportId(String(ev.id));
                        setSections((ev.sections as Record<string, string>) || {});
                      }}
                    >
                      {String(ev.status)} — {String(ev.created_at || '').slice(0, 16)}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-rose-700"
                      onClick={() => {
                        void archiveEdesisEvaluation(studentId, String(ev.id)).then(async () => {
                          toast.success('Arşivlendi');
                          const next = await fetchEdesisEvaluations(studentId);
                          setEvals(next.items || []);
                        });
                      }}
                    >
                      Arşivle
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {versions.length ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-semibold text-slate-800">Sürüm geçmişi</div>
              {versions.map((v) => (
                <div key={String(v.id)}>
                  v{String(v.version_no)} · {String(v.editor_role || '')} · {String(v.created_at || '').slice(0, 16)} ·{' '}
                  {Array.isArray(v.changed_fields) ? (v.changed_fields as string[]).join(', ') : ''}
                </div>
              ))}
            </div>
          ) : null}
          {EVAL_SECTION_KEYS.map((s) => (
            <label key={s.key} className="block text-sm font-semibold text-slate-700">
              {s.label}
              <textarea
                value={sections[s.key] || ''}
                onChange={(e) => setSections((prev) => ({ ...prev, [s.key]: e.target.value }))}
                rows={s.key === 'dersBazli' || s.key === 'kritikKonular' ? 5 : 3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
              />
            </label>
          ))}
        </div>
      ) : null}

      {tab === 'pdf' ? (
        <div className="space-y-4">
          {isStaff ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="font-semibold">Edesis PDF oluştur</div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {[
                  [102, 'Karne (102)'],
                  [104, 'BK-5 (104)'],
                  [105, 'BK-10 (105)']
                ].map(([code, label]) => (
                  <label key={String(code)} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pdfCodes.includes(Number(code))}
                      onChange={(e) =>
                        setPdfCodes((prev) =>
                          e.target.checked ? [...new Set([...prev, Number(code)])] : prev.filter((c) => c !== Number(code))
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={forceNew} onChange={(e) => setForceNew(e.target.checked)} />
                  Yeniden oluştur (forceNew)
                </label>
                <button type="button" onClick={() => void makePdf()} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">
                  <FileText className="h-3.5 w-3.5" /> Oluştur
                </button>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Tür</th>
                  <th className="px-3 py-2">Sınav</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Tarih</th>
                  <th className="px-3 py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {pdfs.map((p) => (
                  <tr key={String(p.id)} className="border-t">
                    <td className="px-3 py-2">{String(p.report_label)}</td>
                    <td className="px-3 py-2">{String(p.exam_title || p.edesis_exam_id || '—')}</td>
                    <td className="px-3 py-2">{String(p.status)}</td>
                    <td className="px-3 py-2">{String(p.created_at || '').slice(0, 16)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.report_url ? (
                          <a href={String(p.report_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">
                            <ExternalLink className="h-3 w-3" /> Aç
                          </a>
                        ) : null}
                        {isStaff && !p.report_url && p.job_id ? (
                          <button
                            type="button"
                            onClick={() => {
                              void pollEdesisAnalysisPdf({
                                studentId,
                                jobId: String(p.job_id),
                                reportId: String(p.id)
                              }).then(async (r) => {
                                if (r.reportUrl) window.open(r.reportUrl, '_blank', 'noopener,noreferrer');
                                const pf = await listEdesisGeneratedPdfs(studentId);
                                setPdfs(pf.items || []);
                              });
                            }}
                            className="rounded bg-slate-600 px-2 py-1 text-xs font-bold text-white"
                          >
                            Durumu yokla
                          </button>
                        ) : null}
                        {isStaff && p.report_url ? (
                          <button type="button" onClick={() => void sharePdf(p)} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white">
                            <Send className="h-3 w-3" /> Veliye gönder
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pdfs.length ? <p className="px-4 py-3 text-sm text-slate-500">Arşivde rapor yok. SQL migration çalıştırıldıktan sonra PDF’ler burada birikir.</p> : null}
          </div>
        </div>
      ) : null}

      {tab === 'panel' && dash ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Öğrenci', dash.studentCount],
            ['Edesis eşli', dash.syncedStudents],
            ['Sınav kaydı', dash.examCount],
            ['PDF', dash.pdfCount],
            ['Paylaşım', dash.shareCount],
            ['Onay bekleyen', dash.reportsAwaitingApproval]
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-2xl border bg-white p-3">
              <div className="text-xs text-slate-500">{k}</div>
              <div className="text-xl font-bold">{String(v ?? '—')}</div>
            </div>
          ))}
          <div className="col-span-2 rounded-2xl border bg-white p-3 sm:col-span-4">
            <div className="font-semibold">Son 5’te düşenler</div>
            <ul className="mt-2 text-sm">
              {(Array.isArray(dash.falling) ? dash.falling : []).map((r: { id: string; name: string; change: number }) => (
                <li key={r.id}>
                  {r.name} ({r.change})
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
