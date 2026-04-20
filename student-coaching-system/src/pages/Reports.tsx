// Türkçe: Gelişmiş Raporlar Sayfası - Profesyonel Analiz ve PDF/WhatsApp
import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  FileText,
  Download,
  Calendar,
  GraduationCap,
  BarChart3,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  Target,
  BookOpen,
  Award,
  MessageCircle,
  Send,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  RefreshCw,
  Brain,
  AlertTriangle,
  Sparkles,
  PieChart,
  LineChart,
  Copy,
  ExternalLink,
  Users,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2';

// Chart.js kayıt
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Deneme Sınavı Arayüzü
interface ExamResult {
  id: string;
  studentId: string;
  examType: 'TYT' | 'AYT' | '9' | '10' | '11' | '12';
  examDate: string;
  source: 'webhook' | 'manual';
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

// AI Koç Yorumu
interface AICoachComment {
  type: 'success' | 'warning' | 'suggestion' | 'achievement';
  icon: React.ReactNode;
  message: string;
  priority: number;
}

export default function Reports() {
  const {
    students, weeklyEntries, getStudentStats, institution, topicProgress, getStudentTopicProgress,
    writtenExamScores, getWrittenExamSubjectsForStudent, writtenExamSubjectsByStudent, getWrittenExamStats
  } = useApp();
  const { user } = useAuth();

  // State'ler
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'custom'>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'topics' | 'exams' | 'performance' | 'written'>('overview');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showWhatsAppPreview, setShowWhatsAppPreview] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  // Seçili öğrenci
  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Yazılı takip istatistikleri
  const writtenExamStats = selectedStudentId ? getWrittenExamStats(selectedStudentId) : null;

  // Yazılı notları (ders bazlı)
  const writtenScoresBySubject = selectedStudentId
    ? getWrittenExamSubjectsForStudent(selectedStudentId).map(subject => {
        const scores = writtenExamScores.filter(s => s.studentId === selectedStudentId && s.subject === subject);
        const sem1Scores = scores.filter(s => new Date(s.date).getMonth() <= 5);
        const sem2Scores = scores.filter(s => new Date(s.date).getMonth() > 5);
        const sem1Avg = sem1Scores.length > 0
          ? Math.round(sem1Scores.reduce((sum, s) => sum + s.score, 0) / sem1Scores.length)
          : 0;
        const sem2Avg = sem2Scores.length > 0
          ? Math.round(sem2Scores.reduce((sum, s) => sum + s.score, 0) / sem2Scores.length)
          : 0;
        const yearAvg = sem1Avg > 0 && sem2Avg > 0
          ? Math.round((sem1Avg + sem2Avg) / 2)
          : sem1Avg > 0 ? sem1Avg : sem2Avg;
        return { subject, sem1Avg, sem2Avg, yearAvg, totalScores: scores.length };
      }).filter(s => s.totalScores > 0)
    : [];

  // Mock deneme sonuçları
  const [examResults] = useState<ExamResult[]>([
    {
      id: '1',
      studentId: '1',
      examType: 'TYT',
      examDate: '2024-03-15',
      source: 'webhook',
      totalNet: 32.5,
      subjects: [
        { name: 'Türkçe', net: 10.0, correct: 10, wrong: 0, blank: 0 },
        { name: 'Matematik', net: 8.75, correct: 9, wrong: 1, blank: 0 },
        { name: 'Sosyal', net: 6.75, correct: 7, wrong: 1, blank: 2 },
        { name: 'Fen', net: 7.0, correct: 7, wrong: 1, blank: 2 }
      ],
      createdAt: '2024-03-15T14:30:00Z'
    },
    {
      id: '2',
      studentId: '1',
      examType: 'TYT',
      examDate: '2024-03-08',
      source: 'manual',
      totalNet: 28.0,
      subjects: [
        { name: 'Türkçe', net: 8.5, correct: 9, wrong: 1, blank: 0 },
        { name: 'Matematik', net: 7.25, correct: 8, wrong: 2, blank: 0 },
        { name: 'Sosyal', net: 5.5, correct: 6, wrong: 3, blank: 1 },
        { name: 'Fen', net: 6.75, correct: 7, wrong: 1, blank: 2 }
      ],
      createdAt: '2024-03-08T10:00:00Z'
    },
    {
      id: '3',
      studentId: '1',
      examType: 'TYT',
      examDate: '2024-03-01',
      source: 'webhook',
      totalNet: 25.0,
      subjects: [
        { name: 'Türkçe', net: 7.0, correct: 7, wrong: 2, blank: 1 },
        { name: 'Matematik', net: 6.0, correct: 6, wrong: 2, blank: 2 },
        { name: 'Sosyal', net: 5.0, correct: 5, wrong: 2, blank: 3 },
        { name: 'Fen', net: 7.0, correct: 7, wrong: 1, blank: 2 }
      ],
      createdAt: '2024-03-01T16:00:00Z'
    },
    {
      id: '4',
      studentId: '1',
      examType: 'AYT',
      examDate: '2024-03-12',
      source: 'webhook',
      totalNet: 48.0,
      subjects: [
        { name: 'Matematik', net: 16.0, correct: 16, wrong: 2, blank: 2 },
        { name: 'Fizik', net: 11.0, correct: 11, wrong: 1, blank: 3 },
        { name: 'Kimya', net: 10.0, correct: 10, wrong: 1, blank: 4 },
        { name: 'Biyoloji', net: 11.0, correct: 11, wrong: 1, blank: 3 }
      ],
      createdAt: '2024-03-12T16:00:00Z'
    }
  ]);

  // Tarih aralığına göre filtrele
  const getFilteredEntries = () => {
    if (!selectedStudentId) return [];

    const now = new Date();
    let startDate: Date;
    let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (dateRange === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateRange === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      startDate = customStart ? new Date(customStart) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = customEnd ? new Date(customEnd + 'T23:59:59') : endDate;
    }

    return weeklyEntries
      .filter(e => e.studentId === selectedStudentId)
      .filter(e => {
        const entryDate = new Date(e.date);
        return entryDate >= startDate && entryDate <= endDate;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const filteredEntries = getFilteredEntries();
  const stats = selectedStudentId ? getStudentStats(selectedStudentId) : null;

  // Konu takibi
  const studentTopics = selectedStudentId ? getStudentTopicProgress(selectedStudentId) : [];

  // Ders bazlı filtreleme
  const allSubjects = [...new Set(filteredEntries.map(e => e.subject))];
  const filteredBySubject = selectedSubject === 'all'
    ? filteredEntries
    : filteredEntries.filter(e => e.subject === selectedSubject);

  // Öğrencinin deneme sonuçları
  const studentExamResults = examResults
    .filter(r => r.studentId === selectedStudentId)
    .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());

  // Haftalık tarih formatı
  const getWeekRange = () => {
    const now = new Date();
    const startOfWeek = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    return {
      start: startOfWeek.toLocaleDateString('tr-TR'),
      end: now.toLocaleDateString('tr-TR')
    };
  };

  // AI Koç Yorumları Oluştur
  const generateAICoachComments = (): AICoachComment[] => {
    const comments: AICoachComment[] = [];

    if (!stats || !selectedStudent) return comments;

    // Başarı yorumu
    if (stats.successRate >= 85) {
      comments.push({
        type: 'achievement',
        icon: <Award className="w-5 h-5" />,
        message: `${selectedStudent.name} bu hafta ${stats.successRate} başarı oranına ulaştı. Harika bir performans!`,
        priority: 1
      });
    }

    // Düşüş uyarısı
    if (stats.successRate < 70) {
      comments.push({
        type: 'warning',
        icon: <AlertTriangle className="w-5 h-5" />,
        message: `Başarı oranı ${stats.successRate} hedefin altında. Ekstra çalışma önerilir.`,
        priority: 1
      });
    }

    // Hedef gerçekleştirme
    if (stats.realizationRate < 80) {
      comments.push({
        type: 'suggestion',
        icon: <Target className="w-5 h-5" />,
        message: `Hedef soru gerçekleştirme oranı ${stats.realizationRate}. Haftalık hedefi artırmayı düşünün.`,
        priority: 2
      });
    }

    // Deneme analizi
    if (studentExamResults.length >= 2) {
      const latest = studentExamResults[0];
      const previous = studentExamResults[1];
      const netChange = latest.totalNet - previous.totalNet;

      if (netChange > 3) {
        comments.push({
          type: 'success',
          icon: <TrendingUp className="w-5 h-5" />,
          message: `Deneme netleri +${netChange.toFixed(1)} arttı. ${latest.examType} sınavında ${latest.totalNet} net!`,
          priority: 1
        });
      } else if (netChange < -3) {
        comments.push({
          type: 'warning',
          icon: <TrendingDown className="w-5 h-5" />,
          message: `Deneme netleri ${netChange.toFixed(1)} düştü. Zayıf konuların tekrarı önerilir.`,
          priority: 1
        });
      }
    }

    // En iyi/zayıf ders
    if (filteredEntries.length > 0) {
      const subjectStats = allSubjects.map(subject => {
        const entries = filteredEntries.filter(e => e.subject === subject);
        const totalCorrect = entries.reduce((sum, e) => sum + e.correctAnswers, 0);
        const totalSolved = entries.reduce((sum, e) => sum + e.solvedQuestions, 0);
        const rate = totalSolved > 0 ? (totalCorrect / totalSolved) * 100 : 0;
        return { subject, rate, totalSolved };
      }).filter(s => s.totalSolved > 0);

      if (subjectStats.length > 0) {
        const best = subjectStats.reduce((a, b) => a.rate > b.rate ? a : b);
        const worst = subjectStats.reduce((a, b) => a.rate < b.rate ? a : b);

        if (best.rate > 80) {
          comments.push({
            type: 'success',
            icon: <Sparkles className="w-5 h-5" />,
            message: `${best.subject} dersinde ${Math.round(best.rate)} başarı! En güçlü dersiniz.`,
            priority: 3
          });
        }

        if (worst.rate < 60 && worst.totalSolved > 10) {
          comments.push({
            type: 'suggestion',
            icon: <BookOpen className="w-5 h-5" />,
            message: `${worst.subject} dersinde tekrar yapılması önerilir (Başarı: ${Math.round(worst.rate)}).`,
            priority: 2
          });
        }
      }
    }

    return comments.sort((a, b) => a.priority - b.priority);
  };

  const aiComments = generateAICoachComments();

  // Grafik verileri
  const chartColors = {
    primary: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    purple: '#8b5cf6',
    pink: '#ec4899'
  };

  // Günlük performans grafiği
  const dailyPerformanceData = {
    labels: filteredBySubject.reduce((acc, entry) => {
      const date = new Date(entry.date).toLocaleDateString('tr-TR', { weekday: 'short' });
      if (!acc.includes(date)) acc.push(date);
      return acc;
    }, [] as string[]),
    datasets: [
      {
        label: 'Çözülen Soru',
        data: filteredBySubject.reduce((acc, entry) => {
          const date = new Date(entry.date).toLocaleDateString('tr-TR', { weekday: 'short' });
          const idx = acc.findIndex((_, i) => filteredBySubject.map(e =>
            new Date(e.date).toLocaleDateString('tr-TR', { weekday: 'short' })
          )[i] === date);
          const existing = acc.filter((_, i) =>
            filteredBySubject.map(e =>
              new Date(e.date).toLocaleDateString('tr-TR', { weekday: 'short' })
            )[i] === date
          ).length;
          acc.push(entry.solvedQuestions);
          return acc;
        }, [] as number[]),
        borderColor: chartColors.primary,
        backgroundColor: chartColors.primary + '20',
        fill: true,
        tension: 0.4
      }
    ]
  };

  // Doğru/Yanlış dağılımı
  const correctWrongData = {
    labels: ['Doğru', 'Yanlış', 'Boş'],
    datasets: [{
      data: stats ? [stats.totalCorrect, stats.totalWrong, stats.totalBlank] : [0, 0, 0],
      backgroundColor: [chartColors.success, chartColors.danger, chartColors.warning],
      borderWidth: 0
    }]
  };

  // Ders bazlı başarı
  const subjectPerformanceData = {
    labels: allSubjects,
    datasets: [
      {
        label: 'Başarı %',
        data: allSubjects.map(subject => {
          const entries = filteredEntries.filter(e => e.subject === subject);
          const totalCorrect = entries.reduce((sum, e) => sum + e.correctAnswers, 0);
          const totalSolved = entries.reduce((sum, e) => sum + e.solvedQuestions, 0);
          return totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;
        }),
        backgroundColor: allSubjects.map((_, i) => {
          const colors = [chartColors.primary, chartColors.success, chartColors.warning, chartColors.purple, chartColors.pink];
          return colors[i % colors.length];
        }),
        borderRadius: 8
      }
    ]
  };

  // Deneme net değişimi
  const examNetData = {
    labels: studentExamResults.slice().reverse().map(r => new Date(r.examDate).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' })),
    datasets: [{
      label: 'Toplam Net',
      data: studentExamResults.slice().reverse().map(r => r.totalNet),
      borderColor: chartColors.purple,
      backgroundColor: chartColors.purple + '20',
      fill: true,
      tension: 0.4
    }]
  };

  // Konu tamamlama grafiği
  const topicCompletionData = {
    labels: allSubjects,
    datasets: [{
      label: 'Tamamlanan Konular',
      data: allSubjects.map(subject =>
        studentTopics.filter(t => t.subject === subject).length
      ),
      backgroundColor: chartColors.success,
      borderRadius: 8
    }]
  };

  // Başarı renkleri
  const getSuccessColor = (rate: number) => {
    if (rate >= 90) return 'bg-green-100 text-green-700';
    if (rate >= 70) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const getSuccessBg = (rate: number) => {
    if (rate >= 90) return 'bg-green-500';
    if (rate >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // PDF Oluştur
  const generatePDF = async () => {
    if (!selectedStudent || !reportRef.current) return;

    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;

      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      } else {
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
      }

      pdf.save(`Rapor_${selectedStudent.name.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('PDF oluşturma hatası:', error);
      alert('PDF oluşturulurken bir hata oluştu.');
    }
  };

  // WhatsApp Mesajı Oluştur
  const generateWhatsAppMessage = () => {
    if (!selectedStudent || !stats) return '';

    const completedTopics = studentTopics.slice(0, 5).map(t => `• ${t.topic}`).join('\n');
    const latestExam = studentExamResults[0];

    const message = `📊 *HAFTALIK ÖĞRENCİ RAPORU*

👤 *Öğrenci:* ${selectedStudent.name}
📅 *Tarih:* ${getWeekRange().start} - ${getWeekRange().end}

${latestExam ? `📝 *Son Deneme Sonucu (${latestExam.examType}):*
├ Net: ${latestExam.totalNet}
├ Doğru: ${latestExam.subjects.reduce((s, sub) => s + sub.correct, 0)}
├ Yanlış: ${latestExam.subjects.reduce((s, sub) => s + sub.wrong, 0)}
└ Boş: ${latestExam.subjects.reduce((s, sub) => s + sub.blank, 0)}` : ''}

📈 *Haftalık Performans:*
├ Toplam Soru: ${stats.totalSolved}
├ Doğru: ${stats.totalCorrect}
├ Yanlış: ${stats.totalWrong}
├ Boş: ${stats.totalBlank}
├ Başarı: %${stats.successRate}
└ Hedef Tamamlama: %${stats.realizationRate}

${aiComments.length > 0 ? `💡 *AI Koç Yorumu:*
${aiComments[0].message.replace(/%/g, '')}` : ''}

📎 Detaylı rapor ekte.

_${institution.name}_`;

    return encodeURIComponent(message);
  };

  const sendToWhatsApp = () => {
    const phone = selectedStudent?.parentPhone?.replace(/\s/g, '').replace(/^0/, '90');
    const message = generateWhatsAppMessage();
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  const copyToClipboard = () => {
    const message = generateWhatsAppMessage();
    navigator.clipboard.writeText(decodeURIComponent(message));
    alert('Mesaj panoya kopyalandı!');
  };

  // İndikatör ikonu
  const getIndicatorIcon = (change: number) => {
    if (change > 0) return <ArrowUp className="w-4 h-4 text-green-500" />;
    if (change < 0) return <ArrowDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Profesyonel Raporlar</h2>
          <p className="text-gray-500">Detaylı analiz, grafikler ve PDF/WhatsApp raporlama</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowWhatsAppPreview(true)}
            disabled={!selectedStudent}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MessageCircle className="w-5 h-5" />
            WhatsApp Gönder
          </button>
          <button
            onClick={generatePDF}
            disabled={!selectedStudent}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            PDF Rapor
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Öğrenci Seçimi */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <GraduationCap className="w-4 h-4 inline mr-1" />
              Öğrenci Seçin *
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Öğrenci ara..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full mt-2 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Öğrenci Seçin</option>
              {students
                .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} - {student.classLevel}
                  </option>
                ))}
            </select>
          </div>

          {/* Tarih Aralığı */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Tarih Aralığı
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as 'week' | 'month' | 'custom')}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="week">Son 7 Gün</option>
              <option value="month">Bu Ay</option>
              <option value="custom">Özel Aralık</option>
            </select>
          </div>

          {/* Özel Tarih Aralığı */}
          {dateRange === 'custom' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Başlangıç</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Bitiş</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      {selectedStudent && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === 'overview'
                  ? 'text-red-600 border-b-2 border-red-500 bg-red-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <BarChart3 className="w-4 h-4 inline mr-2" />
              Genel Bakış
            </button>
            <button
              onClick={() => setActiveTab('topics')}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === 'topics'
                  ? 'text-red-600 border-b-2 border-red-500 bg-red-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <BookOpen className="w-4 h-4 inline mr-2" />
              Konu Takibi
            </button>
            <button
              onClick={() => setActiveTab('exams')}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === 'exams'
                  ? 'text-red-600 border-b-2 border-red-500 bg-red-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Award className="w-4 h-4 inline mr-2" />
              Deneme Analizi
            </button>
            <button
              onClick={() => setActiveTab('performance')}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === 'performance'
                  ? 'text-red-600 border-b-2 border-red-500 bg-red-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <TrendingUp className="w-4 h-4 inline mr-2" />
              Performans
            </button>
            <button
              onClick={() => setActiveTab('written')}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === 'written'
                  ? 'text-red-600 border-b-2 border-red-500 bg-red-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Yazılı Takip
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Genel Bakış */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* AI Koç Yorumları */}
                {aiComments.length > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100">
                    <div className="flex items-center gap-2 mb-4">
                      <Brain className="w-6 h-6 text-purple-600" />
                      <h3 className="font-semibold text-slate-800">AI Koç Analizi</h3>
                    </div>
                    <div className="space-y-3">
                      {aiComments.slice(0, 3).map((comment, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 p-3 rounded-lg ${
                            comment.type === 'achievement' ? 'bg-green-100' :
                            comment.type === 'success' ? 'bg-blue-100' :
                            comment.type === 'warning' ? 'bg-yellow-100' : 'bg-gray-100'
                          }`}
                        >
                          <span className={`mt-0.5 ${
                            comment.type === 'achievement' ? 'text-green-600' :
                            comment.type === 'success' ? 'text-blue-600' :
                            comment.type === 'warning' ? 'text-yellow-600' : 'text-gray-600'
                          }`}>
                            {comment.icon}
                          </span>
                          <p className="text-sm text-slate-700">{comment.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ana İstatistikler */}
                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <Target className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-slate-800">{stats.totalTarget}</p>
                      <p className="text-sm text-gray-500">Toplam Hedef</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <BarChart3 className="w-6 h-6 text-green-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-slate-800">{stats.totalSolved}</p>
                      <p className="text-sm text-gray-500">Çözülen</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4 text-center">
                      <TrendingUp className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-slate-800">%{stats.realizationRate}</p>
                      <p className="text-sm text-gray-500">Gerçekleşme</p>
                    </div>
                    <div className={`${getSuccessBg(stats.successRate)} rounded-xl p-4 text-center text-white`}>
                      <CheckCircle className="w-6 h-6 mx-auto mb-2 opacity-90" />
                      <p className="text-2xl font-bold">%{stats.successRate}</p>
                      <p className="text-sm opacity-80">Başarı</p>
                    </div>
                  </div>
                )}

                {/* Grafikler Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Doğru/Yanlış Dağılımı */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <PieChart className="w-5 h-5 text-gray-500" />
                      Doğru/Yanlış Dağılımı
                    </h4>
                    <div className="h-64 flex items-center justify-center">
                      {stats && stats.totalSolved > 0 ? (
                        <Doughnut
                          data={correctWrongData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: { position: 'bottom' }
                            }
                          }}
                        />
                      ) : (
                        <p className="text-gray-400">Veri yok</p>
                      )}
                    </div>
                  </div>

                  {/* Ders Bazlı Başarı */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-gray-500" />
                      Ders Bazlı Başarı
                    </h4>
                    <div className="h-64">
                      {allSubjects.length > 0 ? (
                        <Bar
                          data={subjectPerformanceData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                              y: {
                                beginAtZero: true,
                                max: 100,
                                ticks: { callback: (value) => `%${value}` }
                              }
                            },
                            plugins: {
                              legend: { display: false }
                            }
                          }}
                        />
                      ) : (
                        <p className="text-gray-400 text-center py-8">Veri yok</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Konu Takibi */}
            {activeTab === 'topics' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">Konu Tamamlama Durumu</h3>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="all">Tüm Dersler</option>
                    {allSubjects.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Konu Listesi */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allSubjects
                    .filter(s => selectedSubject === 'all' || s === selectedSubject)
                    .map(subject => {
                      const completed = studentTopics.filter(t => t.subject === subject).length;
                      const total = filteredEntries.filter(e => e.subject === subject)
                        .reduce((acc, e) => acc.includes(e.topic) ? acc : [...acc, e.topic], [] as string[]).length;
                      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

                      return (
                        <div key={subject} className="bg-gray-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-slate-800">{subject}</h4>
                            <span className="text-sm text-gray-500">{completed}/{total}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full transition-all ${getSuccessBg(percentage)}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-2">%{percentage} tamamlandı</p>
                        </div>
                      );
                    })}
                </div>

                {/* Tamamlanan Konular Listesi */}
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <h4 className="font-semibold text-slate-800">Tamamlanan Konular</h4>
                  </div>
                  <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                    {studentTopics.length === 0 ? (
                      <div className="p-8 text-center">
                        <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">Henüz tamamlanan konu yok</p>
                      </div>
                    ) : (
                      studentTopics.slice(0, 20).map((topic, i) => (
                        <div key={i} className="p-4 flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-slate-800">{topic.topic}</p>
                            <p className="text-xs text-gray-500">{topic.subject}</p>
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(topic.completedAt).toLocaleDateString('tr-TR')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Deneme Analizi */}
            {activeTab === 'exams' && (
              <div className="space-y-6">
                {/* Deneme Net Değişimi */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <LineChart className="w-5 h-5 text-gray-500" />
                    Deneme Net Değişimi
                  </h4>
                  <div className="h-64">
                    {studentExamResults.length > 0 ? (
                      <Line
                        data={examNetData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            y: { beginAtZero: true }
                          },
                          plugins: {
                            legend: { display: false }
                          }
                        }}
                      />
                    ) : (
                      <p className="text-gray-400 text-center py-8">Deneme sonucu yok</p>
                    )}
                  </div>
                </div>

                {/* Deneme Sonuçları */}
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <h4 className="font-semibold text-slate-800">Son Deneme Sonuçları</h4>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {studentExamResults.length === 0 ? (
                      <div className="p-8 text-center">
                        <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">Henüz deneme sonucu yok</p>
                      </div>
                    ) : (
                      studentExamResults.map((exam, i) => {
                        const prevExam = studentExamResults[i + 1];
                        const netChange = prevExam ? exam.totalNet - prevExam.totalNet : 0;

                        return (
                          <div key={exam.id} className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    exam.examType === 'TYT' ? 'bg-blue-100 text-blue-700' :
                                    'bg-purple-100 text-purple-700'
                                  }`}>
                                    {exam.examType}
                                  </span>
                                  <span className="text-sm text-gray-500">
                                    {new Date(exam.examDate).toLocaleDateString('tr-TR')}
                                  </span>
                                  {exam.source === 'webhook' && (
                                    <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                      Otomatik
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl font-bold text-slate-800">
                                    {exam.totalNet} net
                                  </span>
                                  {prevExam && (
                                    <div className="flex items-center gap-1">
                                      {getIndicatorIcon(netChange)}
                                      <span className={`text-sm font-medium ${
                                        netChange > 0 ? 'text-green-600' : netChange < 0 ? 'text-red-600' : 'text-gray-500'
                                      }`}>
                                        {netChange > 0 ? '+' : ''}{netChange.toFixed(1)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Ders Bazlı Sonuçlar */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {exam.subjects.map((sub, j) => (
                                <div key={j} className="bg-gray-50 rounded-lg p-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">{sub.name}</span>
                                    <span className={`font-medium ${
                                      sub.net >= 5 ? 'text-green-600' :
                                      sub.net >= 3 ? 'text-yellow-600' : 'text-red-600'
                                    }`}>
                                      {sub.net}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-400 mt-1">
                                    ✓{sub.correct} ✗{sub.wrong} —{sub.blank}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Performans */}
            {activeTab === 'performance' && (
              <div className="space-y-6">
                {/* Detaylı İstatistikler */}
                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-green-600">{stats.totalCorrect}</p>
                      <p className="text-sm text-gray-500">Doğru</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 text-center">
                      <XCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-red-600">{stats.totalWrong}</p>
                      <p className="text-sm text-gray-500">Yanlış</p>
                    </div>
                    <div className="bg-gray-100 rounded-xl p-4 text-center">
                      <Clock className="w-6 h-6 text-gray-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-gray-600">{stats.totalBlank}</p>
                      <p className="text-sm text-gray-500">Boş</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <Target className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-slate-800">{stats.totalTarget}</p>
                      <p className="text-sm text-gray-500">Hedef</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4 text-center">
                      <TrendingUp className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-purple-600">%{stats.realizationRate}</p>
                      <p className="text-sm text-gray-500">Gerçekleşme</p>
                    </div>
                    <div className={`${getSuccessBg(stats.successRate)} rounded-xl p-4 text-center text-white`}>
                      <Award className="w-6 h-6 mx-auto mb-2 opacity-90" />
                      <p className="text-2xl font-bold">%{stats.successRate}</p>
                      <p className="text-sm opacity-80">Başarı</p>
                    </div>
                  </div>
                )}

                {/* Günlük Performans */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-gray-500" />
                    Günlük Soru Çözümü
                  </h4>
                  <div className="h-64">
                    {filteredEntries.length > 0 ? (
                      <Bar
                        data={dailyPerformanceData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false }
                          },
                          scales: {
                            y: { beginAtZero: true }
                          }
                        }}
                      />
                    ) : (
                      <p className="text-gray-400 text-center py-8">Veri yok</p>
                    )}
                  </div>
                </div>

                {/* Kayıt Tablosu */}
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <h4 className="font-semibold text-slate-800">Günlük Detay</h4>
                    <select
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                      className="px-3 py-1 text-sm border border-gray-200 rounded-lg"
                    >
                      <option value="all">Tümü</option>
                      {allSubjects.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tarih</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Ders</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Konu</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Hedef</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Çözülen</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Doğru</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Yanlış</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Boş</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Başarı</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredBySubject.map((entry) => {
                          const successRate = entry.solvedQuestions > 0
                            ? Math.round((entry.correctAnswers / entry.solvedQuestions) * 100)
                            : 0;
                          return (
                            <tr key={entry.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {new Date(entry.date).toLocaleDateString('tr-TR')}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-800">{entry.subject}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{entry.topic}</td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{entry.targetQuestions}</td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{entry.solvedQuestions}</td>
                              <td className="px-4 py-3 text-sm text-center font-medium text-green-600">{entry.correctAnswers}</td>
                              <td className="px-4 py-3 text-sm text-center font-medium text-red-600">{entry.wrongAnswers}</td>
                              <td className="px-4 py-3 text-sm text-center font-medium text-gray-600">{entry.blankAnswers}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getSuccessColor(successRate)}`}>
                                  %{successRate}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Yazılı Takip */}
            {activeTab === 'written' && (
              <div className="space-y-6">
                {/* Yazılı İstatistikleri */}
                {writtenExamStats && writtenExamStats.totalExams > 0 ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-5 h-5" />
                          <span className="text-sm opacity-80">Toplam Sınav</span>
                        </div>
                        <p className="text-2xl font-bold">{writtenExamStats.totalExams}</p>
                      </div>
                      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Award className="w-5 h-5 text-green-600" />
                          <span className="text-sm text-gray-500">Yıl Sonu ort.</span>
                        </div>
                        <p className={`text-2xl font-bold ${
                          writtenExamStats.yearlyAverage >= 85 ? 'text-green-600' :
                          writtenExamStats.yearlyAverage >= 70 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {writtenExamStats.yearlyAverage || '-'}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-5 h-5 text-green-600" />
                          <span className="text-sm text-gray-500">1. Dönem</span>
                        </div>
                        <p className={`text-2xl font-bold ${
                          writtenExamStats.semester1Average >= 85 ? 'text-green-600' :
                          writtenExamStats.semester1Average >= 70 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {writtenExamStats.semester1Average || '-'}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-5 h-5 text-indigo-600" />
                          <span className="text-sm text-gray-500">2. Dönem</span>
                        </div>
                        <p className={`text-2xl font-bold ${
                          writtenExamStats.semester2Average >= 85 ? 'text-green-600' :
                          writtenExamStats.semester2Average >= 70 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {writtenExamStats.semester2Average || '-'}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-5 h-5 text-purple-600" />
                          <span className="text-sm text-gray-500">İyileşme</span>
                        </div>
                        <p className={`text-2xl font-bold ${
                          writtenExamStats.improvement > 0 ? 'text-green-600' :
                          writtenExamStats.improvement < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {writtenExamStats.improvement > 0 ? '+' : ''}{writtenExamStats.improvement || 0}%
                        </p>
                      </div>
                    </div>

                    {/* Renk Açıklaması */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-green-500"></div>
                        <span className="text-gray-600">85+ (Başarılı)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-yellow-500"></div>
                        <span className="text-gray-600">70-84 (Orta)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-red-500"></div>
                        <span className="text-gray-600">&lt;70 (Çalışmalı)</span>
                      </div>
                    </div>

                    {/* Ders Bazlı Tablo */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ders</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">1. Yazılı</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">2. Yazılı</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Final</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase bg-blue-50">1. Dönem Ort.</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">1. Yazılı</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">2. Yazılı</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Final</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase bg-indigo-50">2. Dönem Ort.</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase bg-gradient-to-r from-purple-100 to-pink-100">Yıl Sonu</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {writtenScoresBySubject.map(({ subject, sem1Avg, sem2Avg, yearAvg }) => (
                              <tr key={subject} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-gray-800">{subject}</td>
                                <td className="px-3 py-3 text-center text-gray-400">-</td>
                                <td className="px-3 py-3 text-center text-gray-400">-</td>
                                <td className="px-3 py-3 text-center text-gray-400">-</td>
                                <td className={`px-3 py-3 text-center font-bold bg-blue-50 ${
                                  sem1Avg >= 85 ? 'text-green-600' :
                                  sem1Avg >= 70 ? 'text-yellow-600' :
                                  sem1Avg > 0 ? 'text-red-600' : 'text-gray-400'
                                }`}>
                                  {sem1Avg || '-'}
                                </td>
                                <td className="px-3 py-3 text-center text-gray-400">-</td>
                                <td className="px-3 py-3 text-center text-gray-400">-</td>
                                <td className="px-3 py-3 text-center text-gray-400">-</td>
                                <td className={`px-3 py-3 text-center font-bold bg-indigo-50 ${
                                  sem2Avg >= 85 ? 'text-green-600' :
                                  sem2Avg >= 70 ? 'text-yellow-600' :
                                  sem2Avg > 0 ? 'text-red-600' : 'text-gray-400'
                                }`}>
                                  {sem2Avg || '-'}
                                </td>
                                <td className={`px-3 py-3 text-center font-bold bg-gradient-to-r from-purple-50 to-pink-50 ${
                                  yearAvg >= 85 ? 'text-green-600' :
                                  yearAvg >= 70 ? 'text-yellow-600' :
                                  yearAvg > 0 ? 'text-red-600' : 'text-gray-400'
                                }`}>
                                  {yearAvg || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Başarılı ve Zayıf Dersler */}
                    {writtenExamStats.subjectsAbove85.length > 0 || writtenExamStats.subjectsBelow70.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {writtenExamStats.subjectsAbove85.length > 0 && (
                          <div className="bg-green-50 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <h4 className="font-semibold text-green-800">Başarılı Dersler (85+)</h4>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {writtenExamStats.subjectsAbove85.map(subject => (
                                <span key={subject} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                                  {subject}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {writtenExamStats.subjectsBelow70.length > 0 && (
                          <div className="bg-red-50 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <AlertTriangle className="w-5 h-5 text-red-600" />
                              <h4 className="font-semibold text-red-800">Çalışmalı Dersler (&lt;70)</h4>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {writtenExamStats.subjectsBelow70.map(subject => (
                                <span key={subject} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                                  {subject}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Henüz Yazılı Notu Yok</h3>
                    <p className="text-gray-500">Seçili öğrenci için yazılı sınav notu bulunmuyor.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Öğrenci Seçilmedi */}
      {!selectedStudent && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Öğrenci Seçin</h3>
          <p className="text-gray-500">Rapor oluşturmak için bir öğrenci seçin.</p>
        </div>
      )}

      {/* WhatsApp Önizleme Modal */}
      {showWhatsAppPreview && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                <MessageCircle className="w-6 h-6 text-green-500" />
                WhatsApp Raporu
              </h3>
              <button
                onClick={() => setShowWhatsAppPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="bg-green-50 rounded-xl p-4 mb-4">
                <p className="text-sm text-green-800">
                  <strong>Not:</strong> Mesaj veli telefonuna gönderilecektir.
                </p>
                <p className="text-sm text-green-600 mt-1">
                  Telefon: {selectedStudent.parentPhone}
                </p>
              </div>

              <div className="bg-gray-100 rounded-xl p-4 max-h-96 overflow-y-auto">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                  {decodeURIComponent(generateWhatsAppMessage())}
                </pre>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={copyToClipboard}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Kopyala
              </button>
              <button
                onClick={sendToWhatsApp}
                className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                WhatsApp'ta Gönder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Rapor Şablonu (Gizli) */}
      <div ref={reportRef} className="absolute left-[-9999px] top-0 w-[210mm] bg-white">
        {selectedStudent && (
          <div className="p-8">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-6 text-white rounded-xl mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">{institution.name}</h2>
                  <p className="text-slate-300 text-sm">Öğrenci Haftalık Raporu</p>
                  <p className="text-slate-400 text-sm mt-1">{getWeekRange().start} - {getWeekRange().end}</p>
                </div>
                <div className="w-16 h-16 bg-red-500 rounded-xl flex items-center justify-center text-2xl font-bold">
                  {selectedStudent.name.charAt(0)}
                </div>
              </div>
            </div>

            {/* AI Koç */}
            {aiComments.length > 0 && (
              <div className="bg-blue-50 rounded-xl p-4 mb-6">
                <h3 className="font-semibold text-slate-800 mb-2">AI Koç Analizi</h3>
                <p className="text-sm text-slate-700">{aiComments[0].message}</p>
              </div>
            )}

            {/* İstatistikler */}
            {stats && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-slate-800">{stats.totalTarget}</p>
                  <p className="text-sm text-gray-500">Toplam Hedef</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-slate-800">{stats.totalSolved}</p>
                  <p className="text-sm text-gray-500">Çözülen</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-slate-800">%{stats.realizationRate}</p>
                  <p className="text-sm text-gray-500">Gerçekleşme</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-slate-800">%{stats.successRate}</p>
                  <p className="text-sm text-gray-500">Başarı</p>
                </div>
              </div>
            )}

            {/* Deneme Sonuçları */}
            {studentExamResults.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-slate-800 mb-3">Son Deneme Sonuçları</h3>
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Tarih</th>
                      <th className="p-2 text-left">Tür</th>
                      <th className="p-2 text-center">Net</th>
                      <th className="p-2 text-center">Doğru</th>
                      <th className="p-2 text-center">Yanlış</th>
                      <th className="p-2 text-center">Boş</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {studentExamResults.slice(0, 3).map(exam => (
                      <tr key={exam.id}>
                        <td className="p-2">{new Date(exam.examDate).toLocaleDateString('tr-TR')}</td>
                        <td className="p-2">{exam.examType}</td>
                        <td className="p-2 text-center font-bold">{exam.totalNet}</td>
                        <td className="p-2 text-center">{exam.subjects.reduce((s, sub) => s + sub.correct, 0)}</td>
                        <td className="p-2 text-center">{exam.subjects.reduce((s, sub) => s + sub.wrong, 0)}</td>
                        <td className="p-2 text-center">{exam.subjects.reduce((s, sub) => s + sub.blank, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Detay Tablo */}
            <div className="mb-6">
              <h3 className="font-semibold text-slate-800 mb-3">Günlük Detay</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Tarih</th>
                    <th className="p-2 text-left">Ders</th>
                    <th className="p-2 text-left">Konu</th>
                    <th className="p-2 text-center">Hedef</th>
                    <th className="p-2 text-center">Çözülen</th>
                    <th className="p-2 text-center">Doğru</th>
                    <th className="p-2 text-center">Yanlış</th>
                    <th className="p-2 text-center">Başarı</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEntries.slice(0, 15).map(entry => {
                    const rate = entry.solvedQuestions > 0
                      ? Math.round((entry.correctAnswers / entry.solvedQuestions) * 100)
                      : 0;
                    return (
                      <tr key={entry.id}>
                        <td className="p-2">{new Date(entry.date).toLocaleDateString('tr-TR')}</td>
                        <td className="p-2">{entry.subject}</td>
                        <td className="p-2">{entry.topic}</td>
                        <td className="p-2 text-center">{entry.targetQuestions}</td>
                        <td className="p-2 text-center">{entry.solvedQuestions}</td>
                        <td className="p-2 text-center text-green-600">{entry.correctAnswers}</td>
                        <td className="p-2 text-center text-red-600">{entry.wrongAnswers}</td>
                        <td className="p-2 text-center">%{rate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="text-center text-sm text-gray-500 pt-4 border-t">
              {institution.name} - {institution.phone} - {institution.email}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
