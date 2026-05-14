// Türkçe: Analiz Paneli Sayfası
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatClassLevelLabel } from '../types';
import { userRoleTags } from '../config/rolePermissions';
import { resolveStudentRecordId } from '../lib/coachResolve';
import { eachDayOfInterval, parseISO, differenceInCalendarDays } from 'date-fns';
import { fetchCoachWeeklyGoalsInRange, type CoachWeeklyGoalRow } from '../lib/weeklyPlannerApi';
import { getAuthToken } from '../lib/session';
import { coachSubjectProratedTargetsInRange, totalCoachQuestionTargetsInRange } from '../lib/coachGoalAnalytics';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  BarChart3,
  TrendingUp,
  Target,
  Award,
  Clock,
  ClipboardList,
  BookOpen,
  Users,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  BookMarked,
  Flame,
  Timer,
  FileText,
  MessageCircle,
  Download
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { StudyInsightWidgets } from '../components/analytics/StudyInsightWidgets';

function ymd(d: Date): string {
  return d.toISOString().split('T')[0];
}

function defaultRangeEnd(): string {
  return ymd(new Date());
}

/** Son `daysInclusive` gün (bugün dahil), örn. 7 → bugün + önceki 6 gün */
function defaultRangeStart(daysInclusive: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (daysInclusive - 1));
  return ymd(d);
}

export default function Analytics() {
  const { effectiveUser } = useAuth();
  const {
    students, weeklyEntries, topicProgress, getReadingStats,
    writtenExamScores, getWrittenExamSubjectsForStudent, writtenExamSubjectsByStudent, getWrittenExamStats,
    getStudentExamResults
  } = useApp();
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [rangeStart, setRangeStart] = useState(() => defaultRangeStart(7));
  const [rangeEnd, setRangeEnd] = useState(() => defaultRangeEnd());
  /** Tüm kayıtlar; grafikte tarih ekseni için son 90 gün kullanılır */
  const [useAllTime, setUseAllTime] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  /** Tek öğrenci + tarih aralığı: analiz KPI ve grafiklerde koç hedefi (oransal) */
  const [coachGoalsForAnalytics, setCoachGoalsForAnalytics] = useState<CoachWeeklyGoalRow[]>([]);
  const reportRef = useRef<HTMLDivElement | null>(null);

  const tags = useMemo(() => (effectiveUser ? userRoleTags(effectiveUser) : []), [effectiveUser]);
  const isStudentUi = tags.includes('student');

  /** Öğrenci hesabı: JWT studentId / e-posta ile seçim; students.length===1 şartı çok kurumda bozuluyordu */
  useEffect(() => {
    if (!isStudentUi || !effectiveUser) return;
    const sid =
      resolveStudentRecordId(
        effectiveUser.role,
        effectiveUser.studentId,
        effectiveUser.email,
        students
      )?.trim() || '';
    if (sid) setSelectedStudentId((prev) => prev || sid);
  }, [isStudentUi, effectiveUser, students]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedStudentId || useAllTime || !getAuthToken()) {
      setCoachGoalsForAnalytics([]);
      return () => {
        cancelled = true;
      };
    }
    const rf = rangeStart.slice(0, 10);
    const rt = rangeEnd.slice(0, 10);
    if (!rf || !rt || rf > rt) {
      setCoachGoalsForAnalytics([]);
      return () => {
        cancelled = true;
      };
    }
    fetchCoachWeeklyGoalsInRange(selectedStudentId, rf, rt)
      .then((data) => {
        if (!cancelled) setCoachGoalsForAnalytics(data);
      })
      .catch(() => {
        if (!cancelled) setCoachGoalsForAnalytics([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId, useAllTime, rangeStart, rangeEnd]);

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  const applyRangeFilter = useCallback(
    (entries: typeof weeklyEntries) => {
      if (useAllTime) return entries;
      const rs = rangeStart.slice(0, 10);
      const re = rangeEnd.slice(0, 10);
      return entries.filter((entry) => {
        const d = entry.date.slice(0, 10);
        return d >= rs && d <= re;
      });
    },
    [useAllTime, rangeStart, rangeEnd]
  );

  const scopedEntries = useMemo(() => {
    const base = selectedStudentId
      ? weeklyEntries.filter((entry) => entry.studentId === selectedStudentId)
      : weeklyEntries;
    return applyRangeFilter(base);
  }, [selectedStudentId, weeklyEntries, applyRangeFilter]);

  const filterByDateRange = useCallback(
    <T,>(items: T[], getDate: (item: T) => string): T[] => {
      if (useAllTime) return items;
      const rs = rangeStart.slice(0, 10);
      const re = rangeEnd.slice(0, 10);
      return items.filter((it) => {
        const raw = getDate(it);
        const d = String(raw).slice(0, 10);
        if (!d || d.length < 10) return false;
        return d >= rs && d <= re;
      });
    },
    [useAllTime, rangeStart, rangeEnd]
  );

  const scopedExamResults = useMemo(() => {
    if (!selectedStudentId) return [];
    const base = getStudentExamResults(selectedStudentId);
    return filterByDateRange(base, (e) => e.examDate);
  }, [selectedStudentId, getStudentExamResults, filterByDateRange]);

  const scopedWrittenScores = useMemo(() => {
    if (!selectedStudentId) return [];
    const base = writtenExamScores.filter((s) => s.studentId === selectedStudentId);
    return filterByDateRange(base, (s) => s.date);
  }, [selectedStudentId, writtenExamScores, filterByDateRange]);

  const scopedCompletedTopics = useMemo(() => {
    if (!selectedStudentId) return [];
    const base = topicProgress.filter((t) => t.studentId === selectedStudentId);
    return filterByDateRange(base, (t) => t.completedAt).sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
  }, [selectedStudentId, topicProgress, filterByDateRange]);

  const latestExam = scopedExamResults[0] || null;
  const latestExamWeakSubjects = useMemo(() => {
    if (!latestExam) return [];
    return latestExam.subjects
      .slice()
      .sort((a, b) => a.net - b.net)
      .slice(0, 3);
  }, [latestExam]);

  const examTrend = useMemo(() => {
    if (scopedExamResults.length < 2) return 0;
    return scopedExamResults[0].totalNet - scopedExamResults[1].totalNet;
  }, [scopedExamResults]);

  const recentExamResults = useMemo(() => {
    return scopedExamResults.slice(0, 6);
  }, [scopedExamResults]);

  const recentWrittenScores = useMemo(() => {
    const sorted = scopedWrittenScores
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted.slice(0, 12);
  }, [scopedWrittenScores]);

  const computeStatsFromEntries = (
    entries: typeof weeklyEntries,
    coachGoals?: CoachWeeklyGoalRow[],
    rangeFrom?: string,
    rangeTo?: string
  ) => {
    const entryTarget = entries.reduce((sum, e) => sum + e.targetQuestions, 0);
    const totalSolved = entries.reduce((sum, e) => sum + e.solvedQuestions, 0);
    const totalCorrect = entries.reduce((sum, e) => sum + e.correctAnswers, 0);
    const totalWrong = entries.reduce((sum, e) => sum + e.wrongAnswers, 0);
    const totalBlank = entries.reduce((sum, e) => sum + e.blankAnswers, 0);
    let totalTarget = entryTarget;
    if (coachGoals?.length && rangeFrom && rangeTo) {
      const ct = totalCoachQuestionTargetsInRange(coachGoals, rangeFrom, rangeTo);
      if (ct > 0) totalTarget = ct;
    }
    const realizationRate = totalTarget > 0 ? Math.round((totalSolved / totalTarget) * 100) : 0;
    const successRate = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;
    return { totalTarget, totalSolved, totalCorrect, totalWrong, totalBlank, realizationRate, successRate };
  };

  const coachRangeYmd = useMemo(() => {
    if (useAllTime) return null;
    const rf = rangeStart.slice(0, 10);
    const rt = rangeEnd.slice(0, 10);
    if (!rf || !rt || rf > rt) return null;
    return { rangeFrom: rf, rangeTo: rt };
  }, [useAllTime, rangeStart, rangeEnd]);

  // Öğrenci istatistikleri
  const studentStats = useMemo(() => {
    if (!selectedStudentId) return null;
    const rf = coachRangeYmd?.rangeFrom;
    const rt = coachRangeYmd?.rangeTo;
    return computeStatsFromEntries(
      scopedEntries,
      coachGoalsForAnalytics,
      rf ?? undefined,
      rt ?? undefined
    );
  }, [selectedStudentId, scopedEntries, coachGoalsForAnalytics, coachRangeYmd]);

  // Okuma istatistikleri
  const readingStats = useMemo(() => {
    if (!selectedStudentId) return null;
    return getReadingStats(selectedStudentId);
  }, [selectedStudentId, weeklyEntries]);

  // Yazılı takip istatistikleri
  const writtenExamStats = useMemo(() => {
    if (!selectedStudentId) return null;
    return getWrittenExamStats(selectedStudentId);
  }, [selectedStudentId, writtenExamScores]);

  // Yazılı notları (ders bazlı)
  const writtenScoresBySubject = useMemo(() => {
    if (!selectedStudentId) return [];
    const scores = writtenExamScores.filter(s => s.studentId === selectedStudentId);
    const subs = getWrittenExamSubjectsForStudent(selectedStudentId);
    return subs.map(subject => {
      const subjectScores = scores.filter(s => s.subject === subject);
      const sem1Scores = subjectScores.filter(s => new Date(s.date).getMonth() <= 5);
      const sem2Scores = subjectScores.filter(s => new Date(s.date).getMonth() > 5);
      const sem1Avg = sem1Scores.length > 0
        ? Math.round(sem1Scores.reduce((sum, s) => sum + s.score, 0) / sem1Scores.length)
        : 0;
      const sem2Avg = sem2Scores.length > 0
        ? Math.round(sem2Scores.reduce((sum, s) => sum + s.score, 0) / sem2Scores.length)
        : 0;
      const yearAvg = sem1Avg > 0 && sem2Avg > 0
        ? Math.round((sem1Avg + sem2Avg) / 2)
        : sem1Avg > 0 ? sem1Avg : sem2Avg;
      return { subject, sem1Avg, sem2Avg, yearAvg };
    }).filter(s => s.sem1Avg > 0 || s.sem2Avg > 0);
  }, [selectedStudentId, writtenExamScores, getWrittenExamSubjectsForStudent, writtenExamSubjectsByStudent]);

  // Ders bazlı başarı analizi
  const subjectAnalysis = useMemo(() => {
    const coachBySub =
      selectedStudentId &&
      !useAllTime &&
      coachGoalsForAnalytics.length > 0 &&
      coachRangeYmd
        ? coachSubjectProratedTargetsInRange(
            coachGoalsForAnalytics,
            coachRangeYmd.rangeFrom,
            coachRangeYmd.rangeTo
          )
        : {};

    const subjectStats = scopedEntries.reduce((acc, entry) => {
      if (!acc[entry.subject]) {
        acc[entry.subject] = {
          correct: 0,
          wrong: 0,
          blank: 0,
          solved: 0,
          target: 0,
          entries: 0
        };
      }
      acc[entry.subject].correct += entry.correctAnswers;
      acc[entry.subject].wrong += entry.wrongAnswers;
      acc[entry.subject].blank += entry.blankAnswers;
      acc[entry.subject].solved += entry.solvedQuestions;
      acc[entry.subject].target += entry.targetQuestions;
      acc[entry.subject].entries += 1;
      return acc;
    }, {} as { [key: string]: any });

    return Object.entries(subjectStats).map(([subject, stats]: [string, any]) => {
      const ct = coachBySub[subject];
      const hedef = ct > 0 ? ct : stats.target;
      return {
        subject,
        başarı: stats.solved > 0 ? Math.round((stats.correct / stats.solved) * 100) : 0,
        hedef,
        çözülen: stats.solved,
        doğru: stats.correct,
        yanlış: stats.wrong,
        boş: stats.blank,
        entry: stats.entries
      };
    }).sort((a, b) => b.başarı - a.başarı);
  }, [scopedEntries, selectedStudentId, useAllTime, coachGoalsForAnalytics, coachRangeYmd]);

  // En zayıf dersler
  const weakSubjects = subjectAnalysis.slice(-3);

  const yosAnalytics = useMemo(() => {
    if (!selectedStudent || selectedStudent.classLevel !== 'YOS') return null;
    const byKey = {
      matematik: { solved: 0, correct: 0 },
      geometri: { solved: 0, correct: 0 },
      iq: { solved: 0, correct: 0 }
    };
    scopedEntries.forEach((e) => {
      const s = `${e.subject} ${e.topic}`.toLowerCase();
      if (s.includes('matematik')) {
        byKey.matematik.solved += e.solvedQuestions;
        byKey.matematik.correct += e.correctAnswers;
      } else if (s.includes('geometri')) {
        byKey.geometri.solved += e.solvedQuestions;
        byKey.geometri.correct += e.correctAnswers;
      } else if (s.includes('iq') || s.includes('zeka') || s.includes('mantik') || s.includes('mantık')) {
        byKey.iq.solved += e.solvedQuestions;
        byKey.iq.correct += e.correctAnswers;
      }
    });
    const toRate = (x: { solved: number; correct: number }) => (x.solved > 0 ? Math.round((x.correct / x.solved) * 100) : 0);
    return {
      matematik: toRate(byKey.matematik),
      geometri: toRate(byKey.geometri),
      iq: toRate(byKey.iq)
    };
  }, [selectedStudent, scopedEntries]);

  // Radar chart verisi
  const radarData = subjectAnalysis.map(s => ({
    subject: s.subject.substring(0, 8),
    başarı: s.başarı,
    fullMark: 100
  }));

  // Öğrenci sıralaması
  const studentRanking = useMemo(() => {
    return students
      .map(student => ({
        ...student,
        stats: computeStatsFromEntries(
          applyRangeFilter(weeklyEntries.filter((entry) => entry.studentId === student.id))
        )
      }))
      .filter(s => s.stats.totalSolved > 0)
      .sort((a, b) => b.stats.successRate - a.stats.successRate);
  }, [students, weeklyEntries, applyRangeFilter]);

  const rangeDayCount = useMemo(() => {
    if (useAllTime) return 365;
    try {
      const s = parseISO(`${rangeStart}T12:00:00`);
      const e = parseISO(`${rangeEnd}T12:00:00`);
      return Math.max(1, differenceInCalendarDays(e, s) + 1);
    } catch {
      return 7;
    }
  }, [useAllTime, rangeStart, rangeEnd]);

  /** Günlük grafikler: seçili aralıktaki her gün; "tüm zamanlar"da son 90 gün */
  const trendDayDates = useMemo(() => {
    if (useAllTime) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 89);
      return eachDayOfInterval({ start, end }).map((d) => ymd(d));
    }
    try {
      const start = parseISO(`${rangeStart}T12:00:00`);
      const end = parseISO(`${rangeEnd}T12:00:00`);
      if (start > end) return [];
      return eachDayOfInterval({ start, end }).map((d) => ymd(d));
    } catch {
      return [];
    }
  }, [useAllTime, rangeStart, rangeEnd]);

  const dailyTrend = trendDayDates.map(date => {
    const dayEntries = scopedEntries.filter(e => e.date === date);

    return {
      tarih: new Date(date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }),
      doğru: dayEntries.reduce((sum, e) => sum + e.correctAnswers, 0),
      yanlış: dayEntries.reduce((sum, e) => sum + e.wrongAnswers, 0),
      boş: dayEntries.reduce((sum, e) => sum + e.blankAnswers, 0),
      başarı: dayEntries.reduce((sum, e) => sum + e.solvedQuestions, 0) > 0
        ? Math.round(
            (dayEntries.reduce((sum, e) => sum + e.correctAnswers, 0) /
              dayEntries.reduce((sum, e) => sum + e.solvedQuestions, 0)) * 100
          )
        : 0
    };
  });

  // Okuma günlük trend
  const dailyReadingTrend = trendDayDates.map(date => {
    const dayEntries = scopedEntries.filter(e => e.date === date && e.readingMinutes && e.readingMinutes > 0);

    return {
      tarih: new Date(date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }),
      okuma: dayEntries.reduce((sum, e) => sum + (e.readingMinutes || 0), 0)
    };
  });

  // Toplam okuma (sayfa; coach görünümünde scoped öğrenciler)
  const totalReadingPages = scopedEntries.reduce((sum, e) => sum + (e.readingMinutes || 0), 0);

  const rangeLabel = useMemo(() => {
    if (useAllTime) return 'Tüm zamanlar';
    try {
      const a = parseISO(`${rangeStart}T12:00:00`);
      const b = parseISO(`${rangeEnd}T12:00:00`);
      const fa = a.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      const fb = b.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${fa} – ${fb}`;
    } catch {
      return `${rangeStart} – ${rangeEnd}`;
    }
  }, [useAllTime, rangeStart, rangeEnd]);

  const shareWithParent = () => {
    if (!selectedStudent) return;
    const parentPhone = (selectedStudent.parentPhone || '').replace(/\D/g, '');
    if (!parentPhone) {
      alert('Bu öğrenci için veli telefonu tanımlı değil.');
      return;
    }

    const studentEntries = applyRangeFilter(
      weeklyEntries.filter((entry) => entry.studentId === selectedStudent.id)
    );
    const rf = coachRangeYmd?.rangeFrom;
    const rt = coachRangeYmd?.rangeTo;
    const s = computeStatsFromEntries(
      studentEntries,
      coachGoalsForAnalytics,
      useAllTime ? undefined : rf,
      useAllTime ? undefined : rt
    );
    const periodLabel = useAllTime ? 'Tüm veri' : `Tarih aralığı: ${rangeLabel}`;
    const text =
      `Merhaba, ${selectedStudent.name} icin ${periodLabel} analiz ozetini paylasiyorum.%0A` +
      `Toplam hedef: ${s.totalTarget}%0A` +
      `Toplam cozulen: ${s.totalSolved}%0A` +
      `Dogru: ${s.totalCorrect} | Yanlis: ${s.totalWrong} | Bos: ${s.totalBlank}%0A` +
      `Gerceklesme: %${s.realizationRate} | Basari: %${s.successRate}`;

    window.open(`https://wa.me/${parentPhone}?text=${text}`, '_blank');
  };

  const generateAnalyticsPdf = async () => {
    if (!reportRef.current) return;
    if (!selectedStudentId) {
      alert('Lutfen once ogrenci secin, sonra PDF olusturun.');
      return;
    }

    setIsGeneratingPdf(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 8;
      const topY = 20;
      const bottomY = 10;
      const contentWidth = pageWidth - marginX * 2;
      const printableHeight = pageHeight - topY - bottomY;
      const pxPerMm = canvas.width / contentWidth;
      const pageHeightPx = Math.floor(printableHeight * pxPerMm);

      const studentName = (selectedStudent?.name || 'Tum_Ogrenciler').replace(/\s+/g, '_');
      const datePart = new Date().toISOString().split('T')[0];

      let renderedHeight = 0;
      let pageIndex = 0;
      while (renderedHeight < canvas.height) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const ctx = pageCanvas.getContext('2d');
        if (!ctx) break;
        ctx.drawImage(
          canvas,
          0,
          renderedHeight,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        );

        if (pageIndex > 0) pdf.addPage();
        const sliceHeightMm = sliceHeight / pxPerMm;
        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', marginX, pageIndex === 0 ? topY : 8, contentWidth, sliceHeightMm);

        renderedHeight += sliceHeight;
        pageIndex += 1;
      }

      for (let i = 1; i <= pdf.getNumberOfPages(); i += 1) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.text(`${i}/${pdf.getNumberOfPages()}`, pageWidth - 15, pageHeight - 4);
      }

      pdf.save(`Koc_Analiz_${studentName}_${datePart}.pdf`);
    } catch (error) {
      console.error('Analiz PDF olusturma hatasi:', error);
      alert('PDF olusturulurken bir hata olustu.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Hedef vs Gerçekleşen
  const targetVsActual = subjectAnalysis.map(s => ({
    subject: s.subject,
    hedef: s.hedef,
    çözülen: s.çözülen
  }));

  // Başarı renkleri
  const getSuccessColor = (rate: number) => {
    if (rate >= 90) return { bg: 'bg-green-500', text: 'text-green-600', label: 'Mükemmel' };
    if (rate >= 70) return { bg: 'bg-yellow-500', text: 'text-yellow-600', label: 'İyi' };
    if (rate >= 50) return { bg: 'bg-orange-500', text: 'text-orange-600', label: 'Orta' };
    return { bg: 'bg-red-500', text: 'text-red-600', label: 'Geliştirilmeli' };
  };

  // Grafik renkleri (hex kodları)
  const getChartColor = (rate: number) => {
    if (rate >= 90) return '#22C55E'; // green-500
    if (rate >= 70) return '#EAB308'; // yellow-500
    if (rate >= 50) return '#F97316'; // orange-500
    return '#EF4444'; // red-500
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Analiz Paneli</h2>
          <p className="text-gray-500">Haftalık performans ve başarı analizi</p>
        </div>

        {/* Öğrenci ve tarih aralığı */}
        <div className="flex flex-col gap-3 w-full md:max-w-none md:flex-1 md:items-end">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
          {isStudentUi ? (
            <div className="px-4 py-2 border border-gray-200 rounded-lg bg-slate-50 text-slate-800 text-sm font-medium min-w-[200px]">
              {selectedStudent?.name ?? effectiveUser?.name ?? students[0]?.name ?? 'Öğrenci'}
            </div>
          ) : (
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 min-w-[200px]"
          >
            <option value="">Tüm Öğrenciler</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
          )}

          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Başlangıç
            <input
              type="date"
              value={rangeStart}
              disabled={useAllTime}
              onChange={(e) => {
                const v = e.target.value;
                setUseAllTime(false);
                setRangeStart(v);
                if (rangeEnd && v > rangeEnd) setRangeEnd(v);
              }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Bitiş
            <input
              type="date"
              value={rangeEnd}
              disabled={useAllTime}
              onChange={(e) => {
                const v = e.target.value;
                setUseAllTime(false);
                setRangeEnd(v);
                if (rangeStart && v < rangeStart) setRangeStart(v);
              }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none pb-1">
            <input
              type="checkbox"
              checked={useAllTime}
              onChange={(e) => setUseAllTime(e.target.checked)}
              className="rounded border-gray-300"
            />
            Tüm zamanlar
          </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setUseAllTime(false);
                setRangeStart(defaultRangeStart(7));
                setRangeEnd(defaultRangeEnd());
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Son 7 gün
            </button>
            <button
              type="button"
              onClick={() => {
                setUseAllTime(false);
                setRangeStart(defaultRangeStart(15));
                setRangeEnd(defaultRangeEnd());
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Son 15 gün
            </button>
            <button
              type="button"
              onClick={() => {
                setUseAllTime(false);
                setRangeStart(defaultRangeStart(30));
                setRangeEnd(defaultRangeEnd());
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Son 30 gün
            </button>
            <button
              type="button"
              onClick={() => {
                setUseAllTime(false);
                const y = new Date().getFullYear();
                setRangeStart(`${y}-01-01`);
                setRangeEnd(defaultRangeEnd());
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Bu yıl
            </button>
          </div>
          {(effectiveUser?.role === 'coach' || isStudentUi) && (
            <button
              onClick={generateAnalyticsPdf}
              disabled={isGeneratingPdf}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {isGeneratingPdf ? 'PDF Hazirlaniyor...' : 'PDF Indir'}
            </button>
          )}
        </div>
      </div>

      {effectiveUser?.role === 'coach' && selectedStudent && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-gray-600">
              Veli ile analiz paylaşımı ({selectedStudent.name}) — seçili aralık: {rangeLabel}
            </p>
            <button
              type="button"
              onClick={() => shareWithParent()}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm inline-flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Veliye WhatsApp gönder
            </button>
          </div>
        </div>
      )}

      {isStudentUi && selectedStudentId && !selectedStudent && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <strong className="font-semibold">Profil yüklenemedi.</strong> Analiz kartları, sunucudaki öğrenci
          kaydınızla eşleşince görünür. Sayfayı yenileyin; düzelmezse çıkış yapıp tekrar giriş yapın (sunucu
          oturumu / auth-login gerekir).
        </div>
      )}

      <div ref={reportRef} className="space-y-6">
      {/* Seçili Öğrenci Özeti */}
      {selectedStudent && studentStats && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
                {selectedStudent.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-xl font-bold">{selectedStudent.name}</h3>
                <p className="text-blue-200">{formatClassLevelLabel(selectedStudent.classLevel)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold">%{studentStats.successRate}</p>
              <p className="text-blue-200">Genel Başarı</p>
            </div>
          </div>
        </div>
      )}

      <StudyInsightWidgets
        entries={scopedEntries}
        preFiltered
        windowDays={rangeDayCount}
        chartDays={Math.min(14, Math.max(1, trendDayDates.length))}
        coachInsight={
          selectedStudentId && coachRangeYmd && coachGoalsForAnalytics.length > 0
            ? {
                rangeFrom: coachRangeYmd.rangeFrom,
                rangeTo: coachRangeYmd.rangeTo,
                goals: coachGoalsForAnalytics,
              }
            : undefined
        }
        title={
          selectedStudent
            ? `${selectedStudent.name} · haftalık plan senkron analizi`
            : 'Haftalık plan senkron analizi (filtreli veri)'
        }
        subtitle={`${rangeLabel} · Ekran süresi, kitap sayfası, ders bazlı doğruluk`}
        variant="analytics"
      />

      {/* Genel İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-500">
              Toplam Hedef ({rangeLabel})
              {selectedStudentId && coachRangeYmd && coachGoalsForAnalytics.length > 0
                ? ' · koç'
                : ''}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {selectedStudentId && studentStats
              ? studentStats.totalTarget
              : scopedEntries.reduce((sum, e) => sum + e.targetQuestions, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">Toplam Çözülen ({rangeLabel})</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {scopedEntries.reduce((sum, e) => sum + e.solvedQuestions, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-500">Gerçekleşme %</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            %{selectedStudentId && studentStats
              ? studentStats.realizationRate
              : scopedEntries.reduce((sum, e) => sum + e.targetQuestions, 0) > 0
                ? Math.round(
                    (scopedEntries.reduce((sum, e) => sum + e.solvedQuestions, 0) /
                      scopedEntries.reduce((sum, e) => sum + e.targetQuestions, 0)) * 100
                  )
                : 0}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">Toplam Doğru</span>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {scopedEntries.reduce((sum, e) => sum + e.correctAnswers, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-gray-500">Toplam Yanlış</span>
          </div>
          <p className="text-2xl font-bold text-red-600">
            {scopedEntries.reduce((sum, e) => sum + e.wrongAnswers, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-gray-600" />
            <span className="text-sm text-gray-500">Toplam Boş</span>
          </div>
          <p className="text-2xl font-bold text-gray-600">
            {scopedEntries.reduce((sum, e) => sum + e.blankAnswers, 0)}
          </p>
        </div>
      </div>

      {/* ✅ Haftalik Bitirilen Konular */}
      {selectedStudent && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800">
              {rangeLabel} Bitirilen Konular
            </h3>
            <span className="text-sm text-gray-500">
              {scopedCompletedTopics.length} konu
            </span>
          </div>
          {scopedCompletedTopics.length === 0 ? (
            <p className="text-sm text-gray-500">Bu aralıkta tamamlanan konu yok.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {scopedCompletedTopics.slice(0, 20).map((item, idx) => (
                <div key={`${item.subject}-${item.topic}-${idx}`} className="bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                  <p className="text-sm font-medium text-emerald-800">{item.subject}</p>
                  <p className="text-sm text-slate-700">{item.topic}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(item.completedAt).toLocaleDateString('tr-TR')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 📚 Kitap Okuma İstatistikleri */}
      {totalReadingPages > 0 && (
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <BookMarked className="w-6 h-6" />
            <h3 className="text-lg font-bold">📚 Kitap Okuma Analizi</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="w-4 h-4 text-green-200" />
                <span className="text-sm text-green-100">Toplam Okuma</span>
              </div>
              <p className="text-2xl font-bold">{totalReadingPages} sayfa</p>
            </div>
            {selectedStudent && readingStats && (
              <>
                <div className="bg-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Flame className="w-4 h-4 text-orange-300" />
                    <span className="text-sm text-green-100">Okuma Serisi</span>
                  </div>
                  <p className="text-2xl font-bold">{readingStats.readingStreak} gün</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-4 h-4 text-blue-200" />
                    <span className="text-sm text-green-100">Günlük Ort. (30 gün)</span>
                  </div>
                  <p className="text-2xl font-bold">{readingStats.averageDailyMinutes} sayfa/gün</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BookMarked className="w-4 h-4 text-yellow-200" />
                    <span className="text-sm text-green-100">Kitaplar</span>
                  </div>
                  <p className="text-2xl font-bold">{readingStats.completedBooks} / {readingStats.totalBooks}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 📝 Yazılı Sınav Analizi */}
      {writtenExamStats && writtenExamStats.totalExams > 0 && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6" />
            <h3 className="text-lg font-bold">📝 Yazılı Sınav Analizi</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-blue-200" />
                <span className="text-sm text-blue-100">Toplam Sınav</span>
              </div>
              <p className="text-2xl font-bold">{writtenExamStats.totalExams}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-200" />
                <span className="text-sm text-blue-100">Yıl Sonu Ort.</span>
              </div>
              <p className={`text-2xl font-bold ${
                writtenExamStats.yearlyAverage >= 85 ? 'text-green-300' :
                writtenExamStats.yearlyAverage >= 70 ? 'text-yellow-200' : 'text-red-200'
              }`}>
                {writtenExamStats.yearlyAverage || '-'}
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-4 h-4 text-green-200" />
                <span className="text-sm text-blue-100">1. Dönem Ort.</span>
              </div>
              <p className={`text-2xl font-bold ${
                writtenExamStats.semester1Average >= 85 ? 'text-green-300' :
                writtenExamStats.semester1Average >= 70 ? 'text-yellow-200' : 'text-red-200'
              }`}>
                {writtenExamStats.semester1Average || '-'}
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-4 h-4 text-indigo-200" />
                <span className="text-sm text-blue-100">2. Dönem Ort.</span>
              </div>
              <p className={`text-2xl font-bold ${
                writtenExamStats.semester2Average >= 85 ? 'text-green-300' :
                writtenExamStats.semester2Average >= 70 ? 'text-yellow-200' : 'text-red-200'
              }`}>
                {writtenExamStats.semester2Average || '-'}
              </p>
            </div>
          </div>

          {/* Renk Açıklaması */}
          <div className="flex items-center gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span className="text-blue-100">85+ (Başarılı)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-500"></div>
              <span className="text-blue-100">70-84 (Orta)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500"></div>
              <span className="text-blue-100">&lt;70 (Çalışmalı)</span>
            </div>
          </div>

          {/* Ders Bazlı Tablo */}
          {writtenScoresBySubject.length > 0 && (
            <div className="mt-4 bg-white/10 rounded-xl p-4">
              <p className="text-sm text-blue-100 mb-3">📊 Ders Bazlı Yazılı Notları:</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-blue-200">
                      <th className="text-left pb-2">Ders</th>
                      <th className="text-center pb-2">1. Dönem</th>
                      <th className="text-center pb-2">2. Dönem</th>
                      <th className="text-center pb-2">Yıl Sonu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writtenScoresBySubject.map(({ subject, sem1Avg, sem2Avg, yearAvg }) => (
                      <tr key={subject} className="border-t border-white/10">
                        <td className="py-2 text-white font-medium">{subject}</td>
                        <td className={`py-2 text-center font-bold ${
                          sem1Avg >= 85 ? 'text-green-300' : sem1Avg >= 70 ? 'text-yellow-200' : sem1Avg > 0 ? 'text-red-200' : 'text-white/50'
                        }`}>
                          {sem1Avg || '-'}
                        </td>
                        <td className={`py-2 text-center font-bold ${
                          sem2Avg >= 85 ? 'text-green-300' : sem2Avg >= 70 ? 'text-yellow-200' : sem2Avg > 0 ? 'text-red-200' : 'text-white/50'
                        }`}>
                          {sem2Avg || '-'}
                        </td>
                        <td className={`py-2 text-center font-bold ${
                          yearAvg >= 85 ? 'text-green-300' : yearAvg >= 70 ? 'text-yellow-200' : yearAvg > 0 ? 'text-red-200' : 'text-white/50'
                        }`}>
                          {yearAvg || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deneme Sınav Sonuçları */}
      {selectedStudentId && recentExamResults.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-700 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-6 h-6" />
              <h3 className="text-lg font-bold">📋 Deneme Sınav Sonuçları</h3>
            </div>
            <div className="text-sm text-indigo-100">
              Trend: {examTrend >= 0 ? '+' : ''}{examTrend} net
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-indigo-100/90">
                  <th className="text-left pb-2">Tarih</th>
                  <th className="text-left pb-2">Sınav Türü</th>
                  <th className="text-right pb-2">Toplam Net</th>
                </tr>
              </thead>
              <tbody>
                {recentExamResults.map((exam) => (
                  <tr key={exam.id} className="border-t border-white/10">
                    <td className="py-2 text-sm">{new Date(exam.examDate).toLocaleDateString('tr-TR')}</td>
                    <td className="py-2 text-sm">{exam.examType}</td>
                    <td className="py-2 text-sm text-right font-semibold">
                      {exam.totalNet} net
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {latestExamWeakSubjects.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {latestExamWeakSubjects.map((s) => (
                <span key={s.name} className="px-3 py-1 bg-white/10 rounded-full text-xs text-white">
                  {s.name}: {s.net} net
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {yosAnalytics && (
        <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-2xl p-6 text-white">
          <h3 className="text-lg font-bold mb-4">YÖS Özel Analiz</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-indigo-100 text-sm">Matematik Başarı</p>
              <p className="text-3xl font-bold">%{yosAnalytics.matematik}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-indigo-100 text-sm">Geometri Başarı</p>
              <p className="text-3xl font-bold">%{yosAnalytics.geometri}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-indigo-100 text-sm">IQ Başarı</p>
              <p className="text-3xl font-bold">%{yosAnalytics.iq}</p>
            </div>
          </div>
        </div>
      )}

      {/* Yazılı Sonuçları */}
      {selectedStudentId && recentWrittenScores.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-blue-600" />
              <h3 className="text-lg font-bold text-slate-800">📝 Yazılı Sonuçları</h3>
            </div>
            <div className="text-sm text-gray-500">
              Son {recentWrittenScores.length} kayıt
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left pb-2">Tarih</th>
                  <th className="text-left pb-2">Ders</th>
                  <th className="text-left pb-2">Dönem</th>
                  <th className="text-left pb-2">Yazılı</th>
                  <th className="text-right pb-2">Puan</th>
                </tr>
              </thead>
              <tbody>
                {recentWrittenScores.map((row) => (
                  <tr key={`${row.id}-${row.subject}`} className="border-t border-gray-100">
                    <td className="py-2 text-sm text-gray-700">
                      {new Date(row.date).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="py-2 text-sm text-gray-800">{row.subject}</td>
                    <td className="py-2 text-sm text-gray-600">D{row.semester}</td>
                    <td className="py-2 text-sm text-gray-600">{row.examType}</td>
                    <td className="py-2 text-sm text-right font-semibold text-slate-800">
                      {row.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grafikler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ders Bazlı Başarı */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Ders Bazlı Başarı (%)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectAnalysis}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="başarı" radius={[4, 4, 0, 0]}>
                  {subjectAnalysis.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getChartColor(entry.başarı)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Günlük Performans Trendi */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Günlük Performans Trendi</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line
                  type="monotone"
                  dataKey="başarı"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6' }}
                  name="Başarı %"
                />
                <Line
                  type="monotone"
                  dataKey="doğru"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: '#10B981' }}
                  name="Doğru"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hedef vs Gerçekleşen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Hedef vs Gerçekleşen</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={targetVsActual}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="hedef" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Hedef" />
                <Bar dataKey="çözülen" fill="#10B981" radius={[4, 4, 0, 0]} name="Çözülen" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-sm text-gray-600">Hedef</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-600">Çözülen</span>
            </div>
          </div>
        </div>

        {/* Radar Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Ders Performans Radarı</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#E5E7EB" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis tick={{ fontSize: 10 }} />
                <Radar
                  name="Başarı %"
                  dataKey="başarı"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.5}
                />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 📚 Okuma Trendi */}
        {totalReadingPages > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-green-600" />
              Okuma trendi ({rangeLabel})
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyReadingTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [`${value} sayfa`, 'Okuma']}
                  />
                  <Bar dataKey="okuma" fill="#22C55E" radius={[4, 4, 0, 0]} name="Okuma (sayfa)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* En Zayıf Dersler */}
      {weakSubjects.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <h3 className="text-lg font-semibold text-slate-800">Geliştirilmesi Gereken Dersler</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {weakSubjects.map((subject, index) => (
              <div
                key={subject.subject}
                className="bg-orange-50 rounded-xl p-4 border border-orange-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-orange-800">{subject.subject}</span>
                  <span className="text-2xl font-bold text-orange-600">%{subject.başarı}</span>
                </div>
                <div className="space-y-1 text-sm text-orange-700">
                  <p>Doğru: {subject.doğru} | Yanlış: {subject.yanlış} | Boş: {subject.boş}</p>
                  <p>Çözülen: {subject.çözülen}/{subject.hedef} soru</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Öğrenci Sıralaması (kurum/koç görünümü) */}
      {!isStudentUi && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">Öğrenci Başarı Sıralaması</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Sıra</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Öğrenci</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Sınıf</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Başarı %</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Çözülen</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Hedef</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {studentRanking.map((student, index) => {
                const color = getSuccessColor(student.stats.successRate);
                return (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-600' : 'bg-blue-500'
                      }`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{student.name}</td>
                    <td className="px-4 py-3 text-gray-600">{formatClassLevelLabel(student.classLevel)}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-800">%{student.stats.successRate}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{student.stats.totalSolved}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{student.stats.totalTarget}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 rounded-lg text-sm font-medium ${color.text.replace('text-', 'bg-').replace('600', '100')} ${color.text}`}>
                        {color.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {studentRanking.length === 0 && (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Henüz veri bulunmuyor.</p>
            </div>
          )}
        </div>
      </div>
      )}
      </div>
    </div>
  );
}
