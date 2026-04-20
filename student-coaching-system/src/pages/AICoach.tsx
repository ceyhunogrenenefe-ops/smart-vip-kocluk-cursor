// Türkçe: AI Koç Sayfası - OpenAI destekli öğrenci analizi ve deneme sınavı takibi
import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { formatClassLevelLabel } from '../types';
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

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ExamResult {
  id: string;
  studentId: string;
  examType: 'TYT' | 'AYT' | '9' | '10' | '11' | '12';
  examDate: string;
  source: 'webhook' | 'manual' | 'pdf';
  totalNet: number;
  subjects: {
    name: string;
    net: number;
    correct: number;
    wrong: number;
    blank: number;
  }[];
  notes?: string;
  createdAt: string;
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

  // Öğrencinin öğretmenini bul
  const studentTeacher = useMemo(() => {
    if (!student) return null;
    return coaches.find(t => t.studentIds.includes(student.id));
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
    const aytResults = studentExamResults.filter(r => r.examType === 'AYT');

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

    // Simüle edilmiş AI yanıtı
    setTimeout(() => {
      const studentData = student ? `
Öğrenci: ${student.name}
Sınıf: ${student.classLevel}
Kayıt Sayısı: ${studentEntries.length}
Deneme Sayısı: ${studentExamResults.length}
Son Haftalık Başarı: %${weeklyStats?.successRate || 0}
${examStats?.latestTYT ? `Son TYT: ${examStats.latestTYT} net` : ''}
      ` : 'Öğrenci seçilmedi';

      let responseContent = '';

      if (input.toLowerCase().includes('plan') || input.toLowerCase().includes('çalışma')) {
        const ws = weeklyStats;
        const weakestSubject = ws && ws.successRate < 70 ? 'Matematik' : 'Genel Tekrar';
        responseContent = `📋 **Haftalık Çalışma Planı Önerisi**

${student?.name} için önerilen haftalık çalışma planı:

**Pazartesi:** ${weakestSubject} - 30 soru
**Salı:** ${studentExamResults.length > 0 ? 'TYT Deneme' : 'Türkçe - 25 soru'}
**Çarşamba:** Fizik - 20 soru
**Perşembe:** Genel tekrar - 25 soru
**Cuma:** Haftalık tekrar - 30 soru
**Cumartesi:** Deneme sınavı
**Pazar:** Dinlenme + Analiz

*Not: Bu plan öğrencinin mevcut performansına göre oluşturulmuştur.*`;
      } else if (input.toLowerCase().includes('zayıf') || input.toLowerCase().includes('eksik')) {
        const ws = weeklyStats;
        const zayifKonu = ws && ws.successRate < 70 ? 'Matematik ve Fen' : 'Henüz belirlenmedi';
        responseContent = `🔴 **Zayıf Konu Analizi**

${student?.name} için tespit edilen zayıf noktalar:

• ${zayifKonu}

**Öneri:** Bu konulara haftalık çalışma süresinin %40'ı ayrılmalı.`;
      } else if (input.toLowerCase().includes('motivasyon') || input.toLowerCase().includes('öneri')) {
        responseContent = `💪 **Motivasyon ve Öneriler**

${student?.name}, şu ana kadar harika bir ilerleme kaydediyorsun!

${weeklyStats?.successRate >= 70
  ? '✅ Başarı oranın iyi seviyede. Hedeflerini korumaya devam et!'
  : '📈 Başarı oranını artırmak için düzenli tekrar çok önemli.'}

${examStats?.latestTYT
  ? `${examStats.latestTYT >= 25 ? '🎯 TYT netlerin hedefe yakın, devam!' : '💪 Her deneme ile netlerin artıyor.'}`
  : ''}

**Günlük alışkanlıklar:**
• Her gün en az 1 saat düzenli çalışma
• Yanlış yapılan soruları not et ve tekrar et
• Haftalık 1 deneme sınavı
• Yeterli uyku (7-8 saat)

Başarılar! 🔥`;
      } else {
        responseContent = `🤖 **AI Koç Yanıtı**

"${input}" hakkında sorduğunuz soru üzerine:

${studentData}

**Kısa Değerlendirme:**
• Haftalık başarı: %${weeklyStats?.successRate || 0}
• Gerçekleşme: %${weeklyStats?.realizationRate || 0}
${examStats?.latestTYT ? `• Son TYT: ${examStats.latestTYT} net` : ''}

**Önerilerim:**
1. Düzenli tekrar yapın
2. Zayıf konulara daha fazla zaman ayırın
3. Haftalık hedeflerinizi takip edin
4. Deneme sınavlarını analiz edin

*Not: Bu yanıt simüle edilmiştir. Gerçek AI analizi için Ayarlar sayfasından OpenAI API anahtarı girin.*`;
      }

      const response: AIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, response]);
      setIsLoading(false);
    }, 1500);
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

      {/* API Uyarısı */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-amber-800">OpenAI API Entegrasyonu</h4>
          <p className="text-sm text-amber-700 mt-1">
            Bu sayfa şu anda simülasyon modunda çalışıyor. Gerçek AI analizi için Ayarlar sayfasından OpenAI API anahtarınızı girin.
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
