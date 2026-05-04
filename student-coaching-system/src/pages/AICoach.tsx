// Türkçe: AI Koç Sayfası - OpenAI destekli öğrenci analizi ve deneme sınavı takibi
import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { ExamResult, formatClassLevelLabel, AiExamAnalysisSummary } from '../types';
import { apiFetch } from '../lib/session';
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
  Legend
} from 'recharts';
import {
  Brain,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Send,
  User,
  BookOpen,
  BarChart3,
  Lightbulb,
  ClipboardList,
  TrendingDown,
  Award,
  RefreshCw,
  Download,
  Share2,
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { getStudentDailySignals, buildBehaviorScores } from '../lib/aiDataStore';

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/** AYT/YKS sınavları TYT skor modeli ile yaklaşımlanır (4 yanlış=1 net) */
function toModelExamType(examType: string): 'TYT' | 'LGS' | 'YOS' {
  const u = String(examType || '').toUpperCase();
  if (u === 'LGS' || u === '3' || u === '4' || u === '5' || u === '6' || u === '7') return 'LGS';
  if (u === 'YOS') return 'YOS';
  return 'TYT';
}

export default function AICoach() {
  const { user } = useAuth();
  const { students, weeklyEntries, getStudentStats, coaches, examResults: contextExamResults } = useApp();
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showExamData, setShowExamData] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState<string | null>(null);
  const [numericExpanded, setNumericExpanded] = useState(true);
  const [pickedExamId, setPickedExamId] = useState<string>('');
  const [numericReport, setNumericReport] = useState<AiExamAnalysisSummary | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [lastSaveNote, setLastSaveNote] = useState<string | null>(null);
  const [analysisHistoryRows, setAnalysisHistoryRows] = useState<Array<Record<string, unknown>>>([]);

  // AppContext'ten gelen examResults veya localStorage'dan yedek
  const [localExamResults, setLocalExamResults] = useState<ExamResult[]>([]);

  // Deneme sınavı sonuçlarını yükle (localStorage yedeği)
  useEffect(() => {
    const stored = localStorage.getItem('examResults');
    if (stored) {
      try {
        setLocalExamResults(JSON.parse(stored));
      } catch {
        setLocalExamResults([]);
      }
    }
  }, []);

  // AppContext veya localStorage'dan gelen verileri birleştir
  const examResults = useMemo(() => {
    return contextExamResults.length > 0 ? contextExamResults : localExamResults;
  }, [contextExamResults, localExamResults]);

  // Seçili öğrencinin verilerini al
  const student = students.find(s => s.id === selectedStudent);
  const studentEntries = weeklyEntries.filter(e => e.studentId === selectedStudent);
  const studentExamResults = useMemo(() => {
    return examResults
      .filter(e => e.studentId === selectedStudent)
      .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  }, [examResults, selectedStudent]);

  useEffect(() => {
    if (!selectedStudent) {
      setPickedExamId('');
      setNumericReport(null);
      setAnalysisHistoryRows([]);
      return;
    }
    if (studentExamResults.length === 0) {
      setPickedExamId('');
      return;
    }
    const stillThere = pickedExamId && studentExamResults.some((e) => e.id === pickedExamId);
    if (!pickedExamId || !stillThere) setPickedExamId(studentExamResults[0].id);
  }, [selectedStudent, studentExamResults, pickedExamId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedStudent) return;
      try {
        const res = await apiFetch(`/api/ai-chat?student_id=${encodeURIComponent(selectedStudent)}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        setAnalysisHistoryRows(Array.isArray(j.data) ? j.data : []);
      } catch {
        if (!cancelled) setAnalysisHistoryRows([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent, numericReport]);

  const weeklyTrendPoints = useMemo(() => {
    if (!studentEntries.length) return [];
    return [...studentEntries]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14)
      .map((e, i) => ({
        n: i + 1,
        cozum: e.solvedQuestions ?? 0,
        basari:
          e.solvedQuestions && e.solvedQuestions > 0
            ? Math.round(((e.correctAnswers ?? 0) / e.solvedQuestions) * 100)
            : 0
      }));
  }, [studentEntries, selectedStudent]);

  // Öğrencinin öğretmenini bul
  const studentTeacher = useMemo(() => {
    if (!student) return null;
    if (student.coachId) {
      const byCoach = coaches.find((c) => c.id === student.coachId);
      if (byCoach) return byCoach;
    }
    return coaches.find((t) => t.studentIds.includes(student.id)) ?? null;
  }, [student, coaches]);

  // Haftalık istatistikler
  const weeklyStats = useMemo(() => {
    if (!selectedStudent) return null;
    return getStudentStats(selectedStudent);
  }, [selectedStudent, getStudentStats]);

  // Deneme sınavı istatistikleri
  const examStats = useMemo(() => {
    if (studentExamResults.length === 0) return null;

    const tytResults = studentExamResults.filter(r => r.examType === 'TYT');
    const aytResults = studentExamResults.filter(
      (r) => r.examType === 'AYT' || r.examType === 'YKS-EA' || r.examType === 'YKS-SAY'
    );

    return {
      totalExams: studentExamResults.length,
      tytCount: tytResults.length,
      aytCount: aytResults.length,
      latestTYT: tytResults[0]?.totalNet || 0,
      latestAYT: aytResults[0]?.totalNet || 0,
      avgTYT: tytResults.length > 0
        ? Math.round(tytResults.reduce((sum, r) => sum + r.totalNet, 0) / tytResults.length * 10) / 10
        : 0,
      avgAYT: aytResults.length > 0
        ? Math.round(aytResults.reduce((sum, r) => sum + r.totalNet, 0) / aytResults.length * 10) / 10
        : 0,
      bestTYT: tytResults.length > 0 ? Math.max(...tytResults.map(r => r.totalNet)) : 0,
      bestAYT: aytResults.length > 0 ? Math.max(...aytResults.map(r => r.totalNet)) : 0,
      tytTrend: tytResults.length >= 2 ? tytResults[0].totalNet - tytResults[1].totalNet : 0,
      aytTrend: aytResults.length >= 2 ? aytResults[0].totalNet - aytResults[1].totalNet : 0
    };
  }, [studentExamResults]);

  const weeklyBehavior = useMemo(() => {
    if (!student) return null;
    const signals = getStudentDailySignals(student.institutionId || 'default', student.id).slice(0, 7);
    return buildBehaviorScores(signals);
  }, [student]);

  const runNumericExamAnalysis = async () => {
    if (!selectedStudent || !student) return;
    const exam = studentExamResults.find((e) => e.id === pickedExamId);
    if (!exam?.subjects?.length) {
      setAnalyzeError('Seçili denemede ders verisi yok.');
      return;
    }
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setLastSaveNote(null);
    try {
      const modelType = toModelExamType(exam.examType);
      const examHistory = studentExamResults
        .filter((e) => toModelExamType(e.examType) === modelType)
        .map((e) => ({ date: e.examDate, totalNet: e.totalNet }));

      const res = await apiFetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'analyze_exam',
          student_id: selectedStudent,
          exam_id: exam.id,
          exam_type: exam.examType,
          institution_id: student.institutionId || null,
          subjects: exam.subjects.map((s) => ({
            name: s.name,
            correct: s.correct,
            wrong: s.wrong,
            blank: s.blank
          })),
          exam_history: examHistory
        })
      });
      const j = (await res.json()) as {
        analysis?: AiExamAnalysisSummary;
        saveError?: string | null;
        savedRow?: { id?: string } | null;
      };
      if (!res.ok) throw new Error((j as { error?: string }).error || 'Analiz başarısız');
      if (j.analysis) setNumericReport(j.analysis);
      setLastSaveNote(
        j.savedRow
          ? `Analiz kaydedildi (id: ${String(j.savedRow?.id || '').slice(0, 8)}…).`
          : j.saveError
            ? `Veritabanı kaydı atlandı: ${j.saveError}`
            : null
      );
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Hata');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  // Kapsamlı öğrenci analizi yap
  const analyzeStudent = async (studentId: string) => {
    setIsLoading(true);

    const targetStudent = students.find(s => s.id === studentId);
    const entries = weeklyEntries.filter(e => e.studentId === studentId);
    const exams = examResults.filter(e => e.studentId === studentId);

    if (!targetStudent) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Öğrenci bulunamadı.',
        timestamp: new Date()
      }]);
      setIsLoading(false);
      return;
    }

    // Haftalık istatistikler
    const totalTarget = entries.reduce((sum, e) => sum + (e.targetQuestions || 0), 0);
    const totalSolved = entries.reduce((sum, e) => sum + (e.solvedQuestions || 0), 0);
    const totalCorrect = entries.reduce((sum, e) => sum + (e.correctAnswers || 0), 0);
    const totalWrong = entries.reduce((sum, e) => sum + (e.wrongAnswers || 0), 0);
    const totalBlank = entries.reduce((sum, e) => sum + (e.blankAnswers || 0), 0);

    const successRate = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;
    const realizationRate = totalTarget > 0 ? Math.round((totalSolved / totalTarget) * 100) : 0;

    // Ders bazlı analiz (haftalık)
    const subjectStats: Record<string, { correct: number; wrong: number; total: number }> = {};
    entries.forEach(entry => {
      if (!subjectStats[entry.subject]) {
        subjectStats[entry.subject] = { correct: 0, wrong: 0, total: 0 };
      }
      subjectStats[entry.subject].correct += entry.correctAnswers || 0;
      subjectStats[entry.subject].wrong += entry.wrongAnswers || 0;
      subjectStats[entry.subject].total += (entry.correctAnswers || 0) + (entry.wrongAnswers || 0);
    });

    // En zayıf ve güçlü dersler
    let weakestSubject = '';
    let lowestRate = 100;
    let strongestSubject = '';
    let highestRate = 0;

    Object.entries(subjectStats).forEach(([subject, stats]) => {
      if (stats.total > 0) {
        const rate = (stats.correct / stats.total) * 100;
        if (rate < lowestRate) {
          lowestRate = rate;
          weakestSubject = subject;
        }
        if (rate > highestRate) {
          highestRate = rate;
          strongestSubject = subject;
        }
      }
    });

    // Deneme sınavı analizi
    const tytExams = exams.filter(e => e.examType === 'TYT');
    const aytExams = exams.filter(e => e.examType === 'AYT');
    const latestTYT = tytExams[0];
    const latestAYT = aytExams[0];

    // PDF kaynaklı deneme sayısı
    const pdfExamCount = exams.filter(e => e.source === 'pdf').length;

    // Zayıf konular (ders bazlı)
    const weakSubjects = Object.entries(subjectStats)
      .filter(([_, stats]) => stats.total > 0 && (stats.correct / stats.total) * 100 < 70)
      .map(([subject, stats]) => ({
        subject,
        rate: Math.round((stats.correct / stats.total) * 100)
      }));

    // Deneme sınavı ders bazlı zayıflıklar
    const examWeakSubjects: { name: string; net: number }[] = [];
    if (latestTYT) {
      latestTYT.subjects.forEach(s => {
        if (s.net < 5) {
          examWeakSubjects.push({ name: s.name, net: s.net });
        }
      });
    }

    // AI yorumu oluştur
    const analysisText = `
📊 **${targetStudent.name} - Kapsamlı AI Analiz Raporu**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 **Genel Performans (Haftalık):**
• Toplam Hedef: ${totalTarget} soru
• Toplam Çözülen: ${totalSolved} soru
• Gerçekleşme: %${realizationRate}
• Toplam Doğru: ${totalCorrect}
• Toplam Yanlış: ${totalWrong}
• Toplam Boş: ${totalBlank}
• Başarı Oranı: %${successRate}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 **Deneme Sınavları (${exams.length} deneme)${pdfExamCount > 0 ? ` - ${pdfExamCount} PDF içe aktarım` : ''}:**

${tytExams.length > 0 ? `**TYT Sonuçları (${tytExams.length} deneme):**
• Son Net: ${latestTYT?.totalNet || '-'} (${latestTYT?.totalNet !== tytExams[1]?.totalNet ? (latestTYT?.totalNet - tytExams[1]?.totalNet >= 0 ? '↑' : '↓') + Math.abs(latestTYT?.totalNet - tytExams[1]?.totalNet) : '='})
• Ortalama: ${Math.round(tytExams.reduce((sum, r) => sum + r.totalNet, 0) / tytExams.length * 10) / 10} net
• En İyi: ${Math.max(...tytExams.map(r => r.totalNet))} net
${latestTYT?.source === 'pdf' ? '• Kaynak: 📄 PDF İçe Aktarım' : latestTYT?.source === 'webhook' ? '• Kaynak: 🌐 Webhook' : '• Kaynak: ✏️ Manuel'}` : '• TYT denemesi yok'}

${aytExams.length > 0 ? `**AYT Sonuçları (${aytExams.length} deneme):**
• Son Net: ${latestAYT?.totalNet || '-'}
• Ortalama: ${Math.round(aytExams.reduce((sum, r) => sum + r.totalNet, 0) / aytExams.length * 10) / 10} net
• En İyi: ${Math.max(...aytExams.map(r => r.totalNet))} net
${latestAYT?.source === 'pdf' ? '• Kaynak: 📄 PDF İçe Aktarım' : latestAYT?.source === 'webhook' ? '• Kaynak: 🌐 Webhook' : '• Kaynak: ✏️ Manuel'}` : '• AYT denemesi yok'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 **Ders Bazlı Performans:**
${Object.entries(subjectStats).length > 0
  ? Object.entries(subjectStats).map(([subject, stats]) => {
      const rate = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      const emoji = rate >= 80 ? '🟢' : rate >= 60 ? '🟡' : '🔴';
      return `${emoji} ${subject}: %${rate} (${stats.correct}/${stats.total})`;
    }).join('\n')
  : '• Henüz haftalık kayıt yok'}

${latestTYT ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 **TYT Ders Detayı:**
${latestTYT.subjects.map(s => {
  const status = s.net >= 8 ? '🟢' : s.net >= 5 ? '🟡' : '🔴';
  return `${status} ${s.name}: ${s.net} net (✓${s.correct} ✗${s.wrong} —${s.blank})`;
}).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ **Tespit Edilen Zayıf Noktalar:**

${weakSubjects.length > 0 ? weakSubjects.map(w => `• ${w.subject}: %${w.rate}`).join('\n') : '• Zayıf ders bulunamadı'}

${examWeakSubjects.length > 0 ? `**Deneme Sınavı Zayıflıkları:**
${examWeakSubjects.map(w => `• ${w.name}: ${w.net} net`).join('\n')}` : ''}

${strongestSubject ? `✨ **Güçlü Olduğu Alan:** ${strongestSubject} (%${highestRate})` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 **AI Koç Önerileri:**

1. ${weakSubjects.length > 0
  ? `${weakSubjects[0].subject} konusunda günlük en az 20 soru çözülmeli.`
  : 'Genel performans iyi, seviyeyi korumaya devam edin.'}

2. ${realizationRate < 80
  ? `${totalTarget - totalSolved} adet çözülmemiş soru var. Haftalık hedefler güncellenmeli.`
  : 'Hedef çözüm sayısına ulaşıldı. Devam!'}

3. ${exams.length > 0
  ? `${exams.length >= 2 ? 'Düzenli deneme sınavı yapmaya devam edin.' : 'Deneme sınavı sıklığı artırılmalı.'}`
  : 'Henüz deneme sınavı girilmemiş.'}

${successRate < 70 ? '4. Konu tekrarı ve bol soru çözümü önerilir. Yanlış soruların analizi yapılmalı.' : ''}
${examWeakSubjects.length > 0 ? `5. ${examWeakSubjects[0].name} dersinde ek çalışma yapılmalı.` : ''}

${studentTeacher ? `\n👨‍🏫 **Öğretmen Koç:** ${studentTeacher.name}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 *Bu analiz AI Koç tarafından ${new Date().toLocaleDateString('tr-TR')} tarihinde oluşturulmuştur.*
    `.trim();

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: analysisText,
      timestamp: new Date()
    }]);

    setShowExamData(true);
    setIsLoading(false);
  };

  // AI'ya mesaj gönder
  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    try {
      const studentContext = student
        ? [
            `Öğrenci: ${student.name}`,
            `Sınıf: ${formatClassLevelLabel(student.classLevel)}`,
            `Kayıt Sayısı: ${studentEntries.length}`,
            `Deneme Sayısı: ${studentExamResults.length}`,
            `Haftalık Başarı: %${weeklyStats?.successRate || 0}`,
            `Gerçekleşme: %${weeklyStats?.realizationRate || 0}`,
            examStats?.latestTYT ? `Son TYT: ${examStats.latestTYT} net` : '',
            examStats?.latestAYT ? `Son AYT: ${examStats.latestAYT} net` : ''
          ]
            .filter(Boolean)
            .join('\n')
        : 'Öğrenci seçilmedi';

      const apiRes = await apiFetch('/api/ai-chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: userMessage.content,
          studentContext
        })
      });

      const payload = await apiRes.json();
      if (!apiRes.ok) {
        throw new Error(payload?.error || 'AI servisine ulaşılamadı.');
      }

      const response: AIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: payload.content || 'Yanit alinamadi.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, response]);
    } catch (error) {
      const response: AIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          `AI yaniti alinirken hata olustu: ${
            error instanceof Error ? error.message : 'Bilinmeyen hata'
          }`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, response]);
    } finally {
      setIsLoading(false);
    }
  };

  // WhatsApp ile paylaş
  const shareViaWhatsApp = () => {
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    const studentName = student?.name || 'Öğrenci';
    const text = encodeURIComponent(`${studentName} - AI Koç Analizi\n\n${lastMessage.content}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <Brain className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">AI Koç</h2>
            <p className="text-purple-100">Yapay zeka destekli kapsamlı öğrenci analizi</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol Panel - Öğrenci Seçimi */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5" />
              Öğrenci Seçimi
            </h3>

            <select
              value={selectedStudent}
              onChange={(e) => {
                setSelectedStudent(e.target.value);
                setShowExamData(false);
              }}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
            >
              <option value="">Öğrenci Seçin</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {formatClassLevelLabel(s.classLevel)}</option>
              ))}
            </select>

            {selectedStudent && (
              <button
                onClick={() => analyzeStudent(selectedStudent)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
                Tam Analiz Başlat
              </button>
            )}
          </div>

          {/* Hızlı İstatistikler */}
          {selectedStudent && weeklyStats && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Hızlı İstatistikler
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Haftalık Başarı</span>
                  <span className={`font-bold ${
                    weeklyStats.successRate >= 80 ? 'text-green-600' :
                    weeklyStats.successRate >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`}>%{weeklyStats.successRate}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Gerçekleşme</span>
                  <span className="font-bold text-blue-600">%{weeklyStats.realizationRate}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Kayıt Sayısı</span>
                  <span className="font-bold">{studentEntries.length}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Deneme Sayısı</span>
                  <span className="font-bold">{studentExamResults.length}</span>
                </div>
              </div>
            </div>
          )}

          {/* Hızlı Eylemler */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Hızlı Eylemler</h3>
            <div className="space-y-3">
              <button
                onClick={() => {
                  if (!selectedStudent) return;
                  setInput('Bu öğrenci için haftalık çalışma planı oluştur');
                  sendMessage();
                }}
                disabled={!selectedStudent}
                className="w-full px-4 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <BookOpen className="w-4 h-4" />
                Çalışma Planı Oluştur
              </button>
              <button
                onClick={() => {
                  if (!selectedStudent) return;
                  const scoreInfo = weeklyBehavior
                    ? `Motivasyon ${weeklyBehavior.motivationScore}, disiplin ${weeklyBehavior.disciplineScore}, etkileşim ${weeklyBehavior.engagementScore}`
                    : 'Davranış sinyali yok';
                  setInput(`Generate AI Study Plan: ${scoreInfo}. Zayıf derslere odaklı haftalık topic ve soru hedefi yaz.`);
                  sendMessage();
                }}
                disabled={!selectedStudent}
                className="w-full px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                Generate AI Study Plan
              </button>
              <button
                onClick={() => {
                  if (!selectedStudent) return;
                  setInput('Zayıf konuları belirle ve öneriler ver');
                  sendMessage();
                }}
                disabled={!selectedStudent}
                className="w-full px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Target className="w-4 h-4" />
                Zayıf Konu Analizi
              </button>
              <button
                onClick={() => {
                  if (!selectedStudent) return;
                  setInput('Motivasyon ve öneriler');
                  sendMessage();
                }}
                disabled={!selectedStudent}
                className="w-full px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <TrendingUp className="w-4 h-4" />
                Motivasyon ve Öneriler
              </button>
            </div>
          </div>
        </div>

        {/* Sağ Panel - Chat ve Analiz */}
        <div className="lg:col-span-2 space-y-6">
          {/* Deneme Sınavı Verileri */}
          {showExamData && selectedStudent && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div
                className="p-4 bg-gradient-to-r from-orange-50 to-red-50 cursor-pointer flex items-center justify-between"
                onClick={() => setAnalysisExpanded(analysisExpanded === 'exams' ? null : 'exams')}
              >
                <div className="flex items-center gap-3">
                  <ClipboardList className="w-6 h-6 text-orange-600" />
                  <h3 className="font-semibold text-slate-800">Deneme Sınavı Verileri</h3>
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                    {studentExamResults.length} deneme
                  </span>
                </div>
                {analysisExpanded === 'exams' ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {analysisExpanded === 'exams' && (
                <div className="p-4 space-y-4">
                  {/* Deneme İstatistikleri */}
                  {examStats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-blue-600">{examStats.latestTYT}</p>
                        <p className="text-xs text-gray-500">Son TYT Net</p>
                        <p className={`text-xs ${examStats.tytTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {examStats.tytTrend >= 0 ? '↑' : '↓'}{Math.abs(examStats.tytTrend)}
                        </p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-purple-600">{examStats.latestAYT}</p>
                        <p className="text-xs text-gray-500">Son AYT Net</p>
                        <p className={`text-xs ${examStats.aytTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {examStats.aytTrend >= 0 ? '↑' : '↓'}{Math.abs(examStats.aytTrend)}
                        </p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-600">{examStats.avgTYT}</p>
                        <p className="text-xs text-gray-500">TYT Ortalama</p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-orange-600">{examStats.avgAYT}</p>
                        <p className="text-xs text-gray-500">AYT Ortalama</p>
                      </div>
                    </div>
                  )}

                  {/* Deneme Listesi */}
                  {studentExamResults.length > 0 ? (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {studentExamResults.slice(0, 5).map((exam) => (
                        <div key={exam.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                exam.examType === 'TYT' ? 'bg-blue-100 text-blue-700' :
                                exam.examType === 'AYT' ? 'bg-purple-100 text-purple-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {exam.examType}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(exam.examDate).toLocaleDateString('tr-TR')}
                              </span>
                              <span className={`px-1 py-0.5 rounded text-xs ${
                                exam.source === 'webhook' ? 'bg-green-100 text-green-700' :
                                'bg-orange-100 text-orange-700'
                              }`}>
                                {exam.source === 'webhook' ? 'Otomatik' : 'Manuel'}
                              </span>
                            </div>
                            <span className="text-xl font-bold text-orange-600">{exam.totalNet} net</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            {exam.subjects.map((s, i) => (
                              <div key={i} className={`p-1 rounded ${
                                s.net >= 8 ? 'bg-green-100 text-green-700' :
                                s.net >= 5 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {s.name}: {s.net}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <ClipboardList className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p>Henüz deneme sınavı sonucu yok</p>
                      <p className="text-xs">Deneme Sınavları sayfasından eklenebilir</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedStudent && (
            <div className="bg-white rounded-xl shadow-sm border border-indigo-100 overflow-hidden">
              <button
                type="button"
                className="w-full p-4 bg-gradient-to-r from-indigo-50 to-blue-50 flex justify-between items-center text-left"
                onClick={() => setNumericExpanded((v) => !v)}
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-6 h-6 text-indigo-600" />
                  <div>
                    <h3 className="font-semibold text-slate-800">Sayısal sınav analizi</h3>
                    <p className="text-xs text-gray-600">
                      Net = doğru − (yanlış÷4); TYT yaklaşık puan bandı ve yüzdelik dilim (model tahmini).
                    </p>
                  </div>
                </div>
                {numericExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {numericExpanded && (
                <div className="p-4 space-y-4 border-t border-indigo-100">
                  {studentExamResults.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Önce öğrenciye ait bir deneme sonucu girin (Sınav Takibi).
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                        <div className="flex-1">
                          <label className="text-xs text-gray-600 block mb-1">Deneme seç</label>
                          <select
                            value={pickedExamId}
                            onChange={(e) => setPickedExamId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          >
                            {studentExamResults.map((e) => (
                              <option key={e.id} value={e.id}>
                                {new Date(e.examDate).toLocaleDateString('tr-TR')} — {e.examType} — {e.totalNet} net
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => runNumericExamAnalysis()}
                          disabled={analyzeLoading}
                          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          {analyzeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                          Analizi hesapla
                        </button>
                      </div>
                      {analyzeError && (
                        <p className="text-sm text-red-600">{analyzeError}</p>
                      )}
                      {lastSaveNote && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                          {lastSaveNote}
                        </p>
                      )}

                      {numericReport && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-gray-100 p-3 bg-slate-50">
                              <p className="text-xs text-gray-500">Toplam net (yeniden hesap)</p>
                              <p className="text-2xl font-bold text-slate-800">{numericReport.total_net}</p>
                              <p className="text-xs text-gray-500 mt-1">Model tipi: {numericReport.exam_type_model}</p>
                            </div>
                            <div className="rounded-lg border border-gray-100 p-3 bg-emerald-50">
                              <p className="text-xs text-gray-600">
                                Tahmini yerleştirmeye yakın ölçek (ham)
                              </p>
                              <p className="text-2xl font-bold text-emerald-700">
                                {numericReport.estimated_score_model.toFixed(0)}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {numericReport.exam_type_model === 'LGS'
                                  ? 'LGS yaklaşık puan (∼500)'
                                  : 'TYT ile aynı eğriden yaklaşık puan'}
                              </p>
                            </div>
                            <div className="rounded-lg border border-gray-100 p-3 bg-violet-50">
                              <p className="text-xs text-gray-600">Yüzdelik dilim tahmini</p>
                              <p className="text-2xl font-bold text-violet-700">
                                %{numericReport.percentile_model.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">Küçük % = sıralama açısından daha iyi (model).</p>
                            </div>
                          </div>

                          <div className="rounded-lg border border-gray-100 p-3 bg-white">
                            <p className="text-sm font-medium text-gray-700 mb-1">Genel başarı</p>
                            <p className="text-sm text-gray-600">{numericReport.general_situation}</p>
                          </div>

                          <div className="grid md:grid-cols-2 gap-3">
                            <div className="rounded-lg border border-green-100 p-3 bg-green-50/50">
                              <p className="text-sm font-medium text-green-800 mb-1">Güçlü dersler</p>
                              <ul className="text-sm text-gray-700 list-disc ml-5">
                                {numericReport.strengths.length
                                  ? numericReport.strengths.map((x) => <li key={x}>{x}</li>)
                                  : <li>Kayıtlı güç yok.</li>}
                              </ul>
                            </div>
                            <div className="rounded-lg border border-red-100 p-3 bg-red-50/50">
                              <p className="text-sm font-medium text-red-800 mb-1">Zayıf dersler</p>
                              <ul className="text-sm text-gray-700 list-disc ml-5">
                                {numericReport.weaknesses.length
                                  ? numericReport.weaknesses.map((x) => <li key={x}>{x}</li>)
                                  : <li>Hedef gerektiren belirgin zayıflık yok.</li>}
                              </ul>
                            </div>
                          </div>

                          {numericReport.yos_buckets && (
                            <div className="rounded-lg border border-gray-100 p-3">
                              <p className="text-sm font-medium text-gray-700 mb-2">YÖS alan bazlı net dağılımı</p>
                              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                <div className="p-2 rounded bg-blue-50">
                                  Matematik: <strong>{numericReport.yos_buckets.matematik}</strong>
                                </div>
                                <div className="p-2 rounded bg-orange-50">
                                  Geometri: <strong>{numericReport.yos_buckets.geometri}</strong>
                                </div>
                                <div className="p-2 rounded bg-purple-50">
                                  IQ: <strong>{numericReport.yos_buckets.iq}</strong>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
                            <p className="text-sm font-medium text-gray-700 mb-2">Dikkat · işlem · zaman · görsel</p>
                            <ul className="space-y-2 text-sm">
                              {numericReport.psychology?.map((p) => (
                                <li key={p.title}>
                                  <strong className="text-indigo-800">{p.title}:</strong>{' '}
                                  <span className="text-gray-700">{p.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {numericReport.exam_type_model === 'TYT' &&
                            (numericReport.year_2025_comparison ||
                              numericReport.year_2024_comparison ||
                              numericReport.year_2023_comparison) && (
                              <div className="rounded-lg border border-gray-100 p-3 space-y-2">
                                <p className="text-sm font-medium text-gray-800">Yıllara göre kıyas (model)</p>
                                {numericReport.year_2025_comparison && (
                                  <p className="text-xs text-gray-700">{numericReport.year_2025_comparison}</p>
                                )}
                                {numericReport.year_2024_comparison && (
                                  <p className="text-xs text-gray-700">{numericReport.year_2024_comparison}</p>
                                )}
                                {numericReport.year_2023_comparison && (
                                  <p className="text-xs text-gray-700">{numericReport.year_2023_comparison}</p>
                                )}
                              </div>
                            )}

                          <div className="h-56 w-full">
                            <p className="text-sm font-medium text-gray-700 mb-2">Ders bazlı net (grafik)</p>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={numericReport.subjects.map((s) => ({
                                  ders: s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name,
                                  net: s.net
                                }))}
                                margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="ders" tick={{ fontSize: 11 }} angle={-20} height={54} interval={0} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} net`, 'Net']} />
                                <Bar dataKey="net" fill="#6366f1" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {numericReport.trajectory && (
                            <div className="rounded-lg border border-indigo-200 p-3 bg-indigo-50/60">
                              <p className="text-sm font-medium text-indigo-900 mb-1">Hız ile devam tahmini</p>
                              <p className="text-sm text-gray-700">{numericReport.trajectory.headline}</p>
                              <p className="text-sm text-indigo-800 mt-1">
                                ~{numericReport.trajectory.extrapolated_net_2more} net • ~{numericReport.trajectory.extrapolated_approx_score}{' '}
                                puan (modele göre yaklaşık)
                              </p>
                              <p className="text-xs text-gray-600 mt-1">{numericReport.trajectory.caveat}</p>
                            </div>
                          )}

                          {weeklyTrendPoints.length > 0 && (
                            <div className="h-52 w-full">
                              <p className="text-sm font-medium text-gray-700 mb-2">Haftalık kayıt trendi (son kayıtlar)</p>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={weeklyTrendPoints} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                  <XAxis dataKey="n" tick={{ fontSize: 11 }} />
                                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                                  <Tooltip />
                                  <Legend />
                                  <Line yAxisId="left" type="monotone" dataKey="cozum" stroke="#059669" name="Çözülen soru" dot={false} />
                                  <Line yAxisId="right" type="monotone" dataKey="basari" stroke="#9333ea" name="Başarı %" dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}

                          <div className="rounded-lg border border-gray-100 p-3 whitespace-pre-wrap text-sm bg-white">
                            <p className="font-medium text-gray-800 mb-2">Öneriler (mat. model çıktısı)</p>
                            {numericReport.recommendations}
                          </div>

                          {numericReport.narrative_summary && (
                            <div className="rounded-lg border border-purple-100 p-3 bg-purple-50/40 text-sm">
                              <p className="font-medium text-purple-900 mb-1">AI kısa yorum</p>
                              <p className="text-gray-800 whitespace-pre-wrap">{numericReport.narrative_summary}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {analysisHistoryRows.length > 0 && (
                        <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                          Veritabanında bu öğrenci için {analysisHistoryRows.length} sayısal analiz kaydı var.
                          {analysisHistoryRows[0]?.created_at
                            ? ` Son: ${new Date(String(analysisHistoryRows[0].created_at)).toLocaleString('tr-TR')}.`
                            : ''}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Chat */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">AI Koç Asistanı</h3>
                    <p className="text-sm text-gray-500">
                      {selectedStudent ? `${student?.name} için analiz yapılıyor` : 'Öğrenci seçin ve analiz başlatın'}
                    </p>
                  </div>
                </div>
                {messages.length > 0 && (
                  <button
                    onClick={shareViaWhatsApp}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                  >
                    <Share2 className="w-4 h-4" />
                    WhatsApp
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="h-80 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-8 h-8 text-purple-400" />
                  </div>
                  <p className="text-gray-500">
                    {selectedStudent
                      ? 'AI analizini başlatın veya bir soru sorun'
                      : 'Önce bir öğrenci seçin'}
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    AI Koç, öğrenci verilerini ve deneme sınavı sonuçlarını analiz eder
                  </p>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl p-4 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                      : 'bg-gray-100 text-slate-800'
                  }`}>
                    <div className="flex items-center gap-2 mb-2 text-sm opacity-75">
                      {msg.role === 'assistant' ? (
                        <Brain className="w-4 h-4" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                      <span>{msg.role === 'assistant' ? 'AI Koç' : 'Siz'}</span>
                      <span className="text-xs opacity-50">
                        {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                      {msg.content.split('\n').map((line, i) => {
                        if (line.startsWith('📊') || line.startsWith('📋') || line.startsWith('📝') ||
                            line.startsWith('📚') || line.startsWith('📰') || line.startsWith('⚠️') ||
                            line.startsWith('💡') || line.startsWith('✨') || line.startsWith('💪')) {
                          return <p key={i} className="font-semibold mb-1 mt-2">{line.replace(/\*\*/g, '')}</p>;
                        }
                        if (line.startsWith('🟢') || line.startsWith('🟡') || line.startsWith('🔴') ||
                            line.startsWith('•') || line.startsWith('✅') || line.startsWith('📈') ||
                            line.startsWith('📌') || line.startsWith('🎯') || line.startsWith('🔴')) {
                          return <p key={i} className="mb-1">{line}</p>;
                        }
                        if (line.includes('**') && line.match(/\*\*.+\*\*/)) {
                          return <p key={i} className="mb-1"><strong>{line.replace(/\*\*/g, '')}</strong></p>;
                        }
                        if (line.trim() === '---' || line.startsWith('━━')) {
                          return <hr key={i} className="my-2 border-gray-300" />;
                        }
                        return line ? <p key={i} className="mb-1">{line}</p> : null;
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>AI düşünüyor...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={selectedStudent ? "AI Koç'a sorun..." : "Önce öğrenci seçin"}
                  disabled={!selectedStudent || isLoading}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={!selectedStudent || !input.trim() || isLoading}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* API Bilgi Notu */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-amber-800">Önemli: sayısal modeller yaklaşıktır</h4>
          <p className="text-sm text-amber-700 mt-1">
            Puan ve yüzdelik dilimler platform içi matematiksel model ile üretilir; ÖSYM sonuçlarının yerini tutmaz. OpenAI kullanılıyorsa yalnızca kısa serbest özet yazılır — netler sunucuda hesaplanır.
          </p>
          <a
            href="/settings"
            className="inline-flex items-center gap-1 mt-2 text-sm text-amber-800 underline hover:text-amber-900"
          >
            <Settings className="w-4 h-4" />
            Ayarlar sayfasına git
          </a>
        </div>
      </div>
    </div>
  );
}
