import { useCallback, useEffect, useState } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageCircle,
  Search
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  fetchEdesisHubTerms,
  fetchEdesisKarnePdf,
  fetchEdesisStudentResultsHub,
  type EdesisStudentResultsExam
} from '../../lib/edesis/edesisApi';
import { shareEdesisKarneWithParent } from '../../lib/edesis/shareEdesisKarneWhatsApp';

function pickField(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v);
  }
  return '—';
}

type Props = {
  platformStudentId: string;
  edesisStudentId?: string | null;
  studentName?: string | null;
  parentPhone?: string | null;
  coachUserId?: string | null;
  /** Staff: WhatsApp + AI Koç; student: karne PDF aç */
  isStaff?: boolean;
  autoLoad?: boolean;
};

/**
 * Edesis → Sonuçlar & Karne: sınav sonuç listesi + Karne PDF + veli WhatsApp.
 * Edesis sınav analizi «Karne ve raporlar» sekmesinde de kullanılır.
 */
export default function EdesisResultsKarnePanel({
  platformStudentId,
  edesisStudentId: edesisStudentIdProp,
  studentName: studentNameProp,
  parentPhone: parentPhoneProp,
  coachUserId,
  isStaff = true,
  autoLoad = true
}: Props) {
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultExams, setResultExams] = useState<EdesisStudentResultsExam[]>([]);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [karneBusyKey, setKarneBusyKey] = useState<string | null>(null);
  const [karneWaBusyKey, setKarneWaBusyKey] = useState<string | null>(null);
  const [lastKarneUrl, setLastKarneUrl] = useState<string | null>(null);
  const [selectedEdesisId, setSelectedEdesisId] = useState(String(edesisStudentIdProp || '').trim());
  const [resolvedName, setResolvedName] = useState(String(studentNameProp || '').trim());
  const [resolvedPhone, setResolvedPhone] = useState(String(parentPhoneProp || '').trim());
  const [terms, setTerms] = useState<Record<string, unknown>[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');

  useEffect(() => {
    setSelectedEdesisId(String(edesisStudentIdProp || '').trim());
  }, [edesisStudentIdProp]);

  useEffect(() => {
    setResolvedName(String(studentNameProp || '').trim());
  }, [studentNameProp]);

  useEffect(() => {
    setResolvedPhone(String(parentPhoneProp || '').trim());
  }, [parentPhoneProp]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const t = await fetchEdesisHubTerms();
        if (cancelled) return;
        const items = t.items || [];
        setTerms(items);
        const def = items.find((row) => row.isDefault === true) || items[0];
        const defId = def ? pickField(def, ['id', 'termId']) : '';
        if (defId && defId !== '—') setSelectedTermId(defId);
      } catch {
        /* dönem opsiyonel */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadResults = useCallback(async () => {
    if (!platformStudentId && !selectedEdesisId) {
      toast.error('Öğrenci seçin');
      return;
    }
    setResultsLoading(true);
    setResultExams([]);
    try {
      const r = await fetchEdesisStudentResultsHub({
        edesisStudentId: selectedEdesisId || undefined,
        studentId: platformStudentId || undefined
      });
      setResultExams(r.exams || []);
      if (r.edesisStudentId) setSelectedEdesisId(r.edesisStudentId);
      if (r.platformStudentName) setResolvedName(r.platformStudentName);
      if (r.parent_phone) setResolvedPhone(r.parent_phone);
      if (r.autoLinked) {
        toast.success(`Edesis ID otomatik bağlandı (${r.edesisStudentId})`);
      }
      if ((r.exams || []).length) {
        toast.success(`${r.count} sınav sonucu yüklendi`);
      } else {
        toast.info('Bu öğrenci için sonuç bulunamadı');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sonuçlar alınamadı');
    } finally {
      setResultsLoading(false);
    }
  }, [platformStudentId, selectedEdesisId]);

  useEffect(() => {
    if (!autoLoad) return;
    if (!platformStudentId && !edesisStudentIdProp) return;
    void loadResults();
    // Yalnızca öğrenci değişince otomatik yükle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, platformStudentId, edesisStudentIdProp]);

  const onKarne = async (exam: EdesisStudentResultsExam) => {
    if (!exam.edesisExamId || !selectedEdesisId) {
      toast.error('Karne için Edesis öğrenci ID ve sınav ID gerekli');
      return;
    }
    const key = `${exam.edesisExamId}-${selectedEdesisId}`;
    setKarneBusyKey(key);
    setLastKarneUrl(null);
    try {
      const r = await fetchEdesisKarnePdf({
        examId: exam.edesisExamId,
        edesisStudentId: selectedEdesisId,
        studentId: platformStudentId || undefined,
        termId: selectedTermId || undefined
      });
      if (r.reportUrl) {
        setLastKarneUrl(r.reportUrl);
        window.open(r.reportUrl, '_blank', 'noopener,noreferrer');
        toast.success(r.message || 'Karne PDF hazır');
      } else {
        toast.warning(r.message || r.hint || 'reportUrl dönmedi — admin/student_dashboard paketi gerekli');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Karne oluşturulamadı');
    } finally {
      setKarneBusyKey(null);
    }
  };

  const onKarneWhatsApp = async (exam: EdesisStudentResultsExam) => {
    if (!exam.edesisExamId || !selectedEdesisId) {
      toast.error('Karne için Edesis öğrenci ID ve sınav ID gerekli');
      return;
    }
    if (!resolvedPhone) {
      toast.error(
        'Veli telefonu koçluk sisteminde yok — öğrenci kartına veli numarası ekleyin (Edesis veli kaydı gerekmez).'
      );
      return;
    }
    if (!coachUserId) {
      toast.error('Oturum bulunamadı');
      return;
    }
    const rowKey = String(exam.edesisExamId || exam.examTitle + exam.examDate);
    setKarneWaBusyKey(rowKey);
    try {
      const r = await shareEdesisKarneWithParent({
        exam,
        edesisStudentId: selectedEdesisId,
        platformStudentId: platformStudentId || undefined,
        studentName: resolvedName || 'Öğrenci',
        parentPhone: resolvedPhone,
        coachUserId,
        termId: selectedTermId || undefined
      });
      setLastKarneUrl(r.reportUrl);
      toast.success(r.notice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Veliye gönderilemedi');
    } finally {
      setKarneWaBusyKey(null);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <div className="font-semibold text-slate-900">Sonuçlar &amp; Karne</div>
        <p className="mt-1 text-sm text-slate-600">
          Edesis sınav sonuçları ve deneme karnesi PDF. Veli WhatsApp numarası koçluk sistemindeki öğrenci kartından alınır.
        </p>
      </div>

      {resolvedPhone ? (
        <p className="text-sm text-green-800">
          Veli: <span className="font-mono">{resolvedPhone}</span>
          {resolvedName ? ` · ${resolvedName}` : ''}
          {selectedEdesisId ? (
            <span className="text-slate-500"> · Edesis ID: {selectedEdesisId}</span>
          ) : null}
        </p>
      ) : platformStudentId ? (
        <p className="text-sm text-amber-800">
          Veli telefonu bulunamadı — öğrenci kartına veli numarası ekleyin, sonra sonuçları yenileyin.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-slate-700">
          Dönem (termId)
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            className="mt-1 block min-w-[160px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
          >
            <option value="">Otomatik</option>
            {terms.map((t, i) => {
              const id = pickField(t, ['id', 'termId']);
              return (
                <option key={i} value={id === '—' ? '' : id}>
                  {pickField(t, ['name', 'termName', 'donemAdi'])} ({id})
                </option>
              );
            })}
          </select>
        </label>
        <button
          type="button"
          disabled={resultsLoading || (!platformStudentId && !selectedEdesisId)}
          onClick={() => void loadResults()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {resultsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Sonuçları getir
        </button>
      </div>

      {lastKarneUrl ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          Son karne:{' '}
          <a href={lastKarneUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
            PDF&apos;yi aç / indir
          </a>
        </p>
      ) : null}

      <div className="space-y-2">
        {resultExams.map((exam) => {
          const key = String(exam.edesisExamId || exam.examTitle + exam.examDate);
          const open = expandedExam === key;
          const karneKey = `${exam.edesisExamId}-${selectedEdesisId}`;
          return (
            <div key={key} className="rounded-lg border border-slate-200">
              <div className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3">
                <button
                  type="button"
                  onClick={() => setExpandedExam(open ? null : key)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-80"
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{exam.examTitle}</p>
                    <p className="text-xs text-slate-500">
                      {exam.examDate} · Net: {exam.totalNet?.toFixed?.(2) ?? exam.totalNet} · D/Y/B:{' '}
                      {exam.correct}/{exam.wrong}/{exam.blank}
                      {exam.subjectCount ? ` · ${exam.subjectCount} ders` : ''}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={!selectedEdesisId || karneBusyKey === karneKey}
                  onClick={() => void onKarne(exam)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                >
                  {karneBusyKey === karneKey ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3 w-3" />
                  )}
                  Karne PDF
                </button>
                {isStaff ? (
                  <button
                    type="button"
                    disabled={!selectedEdesisId || !resolvedPhone || karneWaBusyKey === key}
                    title={
                      !resolvedPhone
                        ? 'Koçluk öğrenci kartında veli telefonu gerekli'
                        : 'Karne PDF — veliye WhatsApp'
                    }
                    onClick={() => void onKarneWhatsApp(exam)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-900 hover:bg-green-100 disabled:opacity-50"
                  >
                    {karneWaBusyKey === key ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <MessageCircle className="h-3 w-3" />
                    )}
                    Veliye WhatsApp
                  </button>
                ) : null}
                {isStaff && platformStudentId && exam.edesisExamId ? (
                  <Link
                    to={`/ai-coach?student=${encodeURIComponent(platformStudentId)}&from=edesis&edesisExamId=${encodeURIComponent(exam.edesisExamId)}&edesisStudentId=${encodeURIComponent(selectedEdesisId)}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-800 hover:bg-purple-100"
                  >
                    <Brain className="h-3 w-3" />
                    AI Koç
                  </Link>
                ) : null}
              </div>
              {open ? (
                <div className="border-t px-3 py-3">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1">Ders</th>
                        <th className="py-1">D</th>
                        <th className="py-1">Y</th>
                        <th className="py-1">B</th>
                        <th className="py-1">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(exam.subjects || []).map((s, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1 font-medium">{s.name}</td>
                          <td className="py-1">{s.correct}</td>
                          <td className="py-1">{s.wrong}</td>
                          <td className="py-1">{s.blank}</td>
                          <td className="py-1">{s.net?.toFixed?.(2) ?? s.net}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
        {!resultsLoading && !resultExams.length ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {platformStudentId || selectedEdesisId
              ? 'Sonuç yok — «Sonuçları getir» ile yenileyin'
              : 'Üstten öğrenci seçin'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
