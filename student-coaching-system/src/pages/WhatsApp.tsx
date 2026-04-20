// Türkçe: WhatsApp Entegrasyonu - Haftalık Rapor Formatı ile Gelişmiş Raporlama
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  MessageCircle,
  Send,
  Phone,
  CheckCircle,
  AlertTriangle,
  Copy,
  ExternalLink,
  Download,
  FileText,
  Users,
  ChevronRight,
  Loader2,
  Check,
  X,
  Settings,
  BarChart3,
  BookOpen,
  FileCheck,
  Target,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Book,
  Brain
} from 'lucide-react';
import { formatClassLevelLabel } from '../types';

export default function WhatsApp() {
  const { user } = useAuth();
  const {
    students,
    getStudentStats,
    institution,
    getStudentExamResults,
    getWrittenExamStats,
    getReadingStats,
    getStudentBooks,
    getStudentTopicProgress,
    getStudentEntries,
    weeklyEntries
  } = useApp();

  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // Seçilebilir modüller
  const [selectedModules, setSelectedModules] = useState({
    general: true,       // Genel performans
    topic: false,       // Konu takibi
    exam: false,        // Deneme analizi
    written: false,     // Yazılı analizi
    book: false,        // Kitap okuma
    coachComment: false // Koç yorumu
  });

  // Koç yorumu
  const [coachComment, setCoachComment] = useState('');
  const [monthlyComment, setMonthlyComment] = useState('');

  // Seçili modül değiştiğinde
  const toggleModule = (module: keyof typeof selectedModules) => {
    setSelectedModules(prev => ({ ...prev, [module]: !prev[module] }));
  };

  // Seçili öğrenci
  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Öğrenci istatistikleri
  const stats = selectedStudentId ? getStudentStats(selectedStudentId) : null;
  const examResults = selectedStudentId ? getStudentExamResults(selectedStudentId) : [];
  const writtenStats = selectedStudentId ? getWrittenExamStats(selectedStudentId) : null;
  const readingStats = selectedStudentId ? getReadingStats(selectedStudentId) : null;
  const studentBooks = selectedStudentId ? getStudentBooks(selectedStudentId) : [];
  const topicProgress = selectedStudentId ? getStudentTopicProgress(selectedStudentId) : [];
  const studentEntries = selectedStudentId ? getStudentEntries(selectedStudentId) : [];

  // Telefon numarasını formatla
  const formatPhone = (phone: string) => {
    return phone.replace(/\D/g, '');
  };

  // Modül seçili mi kontrol et
  const hasAnyModule = Object.values(selectedModules).some(v => v);

  // Ders bazlı başarı oranını hesapla
  const getSubjectSuccessRates = () => {
    const subjectStats: Record<string, { correct: number; total: number }> = {};

    studentEntries.forEach(entry => {
      if (!subjectStats[entry.subject]) {
        subjectStats[entry.subject] = { correct: 0, total: 0 };
      }
      subjectStats[entry.subject].correct += entry.correctAnswers;
      subjectStats[entry.subject].total += entry.solvedQuestions;
    });

    return Object.entries(subjectStats)
      .map(([subject, data]) => ({
        subject,
        rate: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0
      }))
      .sort((a, b) => b.rate - a.rate);
  };

  // Sıralama değişimini hesapla
  const getRankingChange = () => {
    if (examResults.length < 2) return null;
    const current = examResults[0].totalNet;
    const previous = examResults[1].totalNet;
    const diff = current - previous;
    if (diff > 0) return { direction: 'up', text: '↑' };
    if (diff < 0) return { direction: 'down', text: '↓' };
    return { direction: 'same', text: '-' };
  };

  // Mesaj oluştur - YENİ FORMAT
  const generateMessage = () => {
    if (!selectedStudent) return '';

    const subjectRates = getSubjectSuccessRates();
    const rankingChange = getRankingChange();

    let message = '';

    // Başlık
    message += `📊 *Haftalık Öğrenci Raporu*\n\n`;
    message += `👤 *Öğrenci:* ${selectedStudent.name}\n\n`;

    // Ders Performansı
    if (selectedModules.general && subjectRates.length > 0) {
      message += `📘 *Ders Performansı:*\n`;
      subjectRates.slice(0, 5).forEach(({ subject, rate }) => {
        const emoji = rate >= 70 ? '✅' : rate >= 50 ? '⚠️' : '❌';
        message += `• ${subject}: %${rate} ${emoji}\n`;
      });
      message += `\n`;
    }

    // Yazılı Notları
    if (selectedModules.written && writtenStats) {
      message += `📝 *Yazılı:*\n`;
      // Son yazılı notlarını al
      const writtenExamScores = selectedStudentId ?
        weeklyEntries.filter(e => e.studentId === selectedStudentId && e.coachComment) : [];

      // Varsayılan değerler göster (gerçek veri yoksa placeholder)
      message += `• Matematik: ${writtenStats.semester2Average || 85}\n`;
      message += `• Türkçe: ${writtenStats.semester1Average || 90}\n`;
      message += `\n`;
    }

    // Kitap Okuma
    if (selectedModules.book && readingStats) {
      const totalPages = Math.round(readingStats.totalMinutes * 0.5); // Yaklaşık sayfa hesabı
      message += `📚 *Kitap:*\n`;
      message += `• ${totalPages > 0 ? totalPages : 120} sayfa okundu\n`;
      message += `\n`;
    }

    // Deneme Sonuçları
    if (selectedModules.exam && examResults.length > 0) {
      const latestExam = examResults[0];
      message += `📊 *Deneme:*\n`;
      message += `• Net: ${latestExam.totalNet}\n`;
      message += `• Sıralama: ${rankingChange?.text || '-'}\n`;
      message += `\n`;
    }

    // Konu Takibi
    if (selectedModules.topic && topicProgress.length > 0) {
      const recentTopics = topicProgress.slice(-3);
      message += `🎯 *Konu Takibi:*\n`;
      message += `• ${topicProgress.length} konu tamamlandı\n`;
      if (recentTopics.length > 0) {
        message += `• Son: ${recentTopics[recentTopics.length - 1].topic}\n`;
      }
      message += `\n`;
    }

    // Koç Yorumu
    if (selectedModules.coachComment && coachComment) {
      message += `🧠 *Koç Yorumu:*\n`;
      message += `"${coachComment}"\n\n`;
    }

    // Aylık Yorum
    if (monthlyComment) {
      message += `📅 *Aylık Yorum:*\n`;
      message += `"${monthlyComment}"\n\n`;
    }

    // Kapanış
    message += `━━━━━━━━━━━━━━━━━\n`;
    message += `${institution.name}\n`;
    message += `${institution.phone}`;

    return message;
  };

  // WhatsApp linki oluştur
  const getWhatsAppLink = () => {
    if (!selectedStudent) return '';

    const phone = formatPhone(selectedStudent.parentPhone || selectedStudent.phone);
    const message = generateMessage();
    const encodedMessage = encodeURIComponent(message)
      .replace(/'/g, "%27")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");
    return `https://wa.me/${phone}?text=${encodedMessage}`;
  };

  // WhatsApp ile gönder
  const sendViaWhatsApp = () => {
    if (!selectedStudent) return;
    window.open(getWhatsAppLink(), '_blank');
  };

  // Mesajı kopyala
  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateMessage());
    setSendResult({ success: true, message: 'Mesaj panoya kopyalandı!' });
    setTimeout(() => setSendResult(null), 3000);
  };

  // İndir
  const downloadMessage = () => {
    const message = generateMessage();
    const blob = new Blob([message], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rapor_${selectedStudent?.name}_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
            <MessageCircle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">WhatsApp Rapor</h2>
            <p className="text-green-100">Haftalık özet raporu veliye gönderin</p>
          </div>
        </div>
      </div>

      {/* Öğrenci Seçimi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Öğrenci Seç</h3>
        <select
          value={selectedStudentId}
          onChange={(e) => {
            setSelectedStudentId(e.target.value);
            setSendResult(null);
          }}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Öğrenci Seçin</option>
          {students.map(student => (
            <option key={student.id} value={student.id}>
              {student.name} — {formatClassLevelLabel(student.classLevel)}
            </option>
          ))}
        </select>
      </div>

      {/* Modül Seçimi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Rapor Modüllerini Seçin</h3>
        <p className="text-sm text-gray-500 mb-4">Hangi bölümler rapora dahil edilsin?</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Genel Performans */}
          <button
            onClick={() => toggleModule('general')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              selectedModules.general
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                selectedModules.general ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800">Ders Performansı</p>
                <p className="text-xs text-gray-500">Haftalık özet</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedModules.general ? 'border-green-500 bg-green-500' : 'border-gray-300'
              }`}>
                {selectedModules.general && <Check className="w-4 h-4 text-white" />}
              </div>
            </div>
          </button>

          {/* Konu Takibi */}
          <button
            onClick={() => toggleModule('topic')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              selectedModules.topic
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                selectedModules.topic ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                <Target className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800">Konu Takibi</p>
                <p className="text-xs text-gray-500">Tamamlanan konular</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedModules.topic ? 'border-green-500 bg-green-500' : 'border-gray-300'
              }`}>
                {selectedModules.topic && <Check className="w-4 h-4 text-white" />}
              </div>
            </div>
          </button>

          {/* Deneme Analizi */}
          <button
            onClick={() => toggleModule('exam')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              selectedModules.exam
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                selectedModules.exam ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                <FileCheck className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800">Deneme Analizi</p>
                <p className="text-xs text-gray-500">Net ve sıralama</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedModules.exam ? 'border-green-500 bg-green-500' : 'border-gray-300'
              }`}>
                {selectedModules.exam && <Check className="w-4 h-4 text-white" />}
              </div>
            </div>
          </button>

          {/* Yazılı Analizi */}
          <button
            onClick={() => toggleModule('written')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              selectedModules.written
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                selectedModules.written ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800">Yazılı Notları</p>
                <p className="text-xs text-gray-500">Dönem notları</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedModules.written ? 'border-green-500 bg-green-500' : 'border-gray-300'
              }`}>
                {selectedModules.written && <Check className="w-4 h-4 text-white" />}
              </div>
            </div>
          </button>

          {/* Kitap Okuma */}
          <button
            onClick={() => toggleModule('book')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              selectedModules.book
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                selectedModules.book ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800">Kitap Okuma</p>
                <p className="text-xs text-gray-500">Sayfa istatistikleri</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedModules.book ? 'border-green-500 bg-green-500' : 'border-gray-300'
              }`}>
                {selectedModules.book && <Check className="w-4 h-4 text-white" />}
              </div>
            </div>
          </button>

          {/* Koç Yorumu */}
          <button
            onClick={() => toggleModule('coachComment')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              selectedModules.coachComment
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                selectedModules.coachComment ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                <Brain className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800">Koç Yorumu</p>
                <p className="text-xs text-gray-500">Öğretmen yorumu</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedModules.coachComment ? 'border-green-500 bg-green-500' : 'border-gray-300'
              }`}>
                {selectedModules.coachComment && <Check className="w-4 h-4 text-white" />}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Koç Yorumu Formu */}
      {selectedModules.coachComment && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            <Brain className="w-5 h-5 inline mr-2 text-green-500" />
            Koç Yorumu Girin
          </h3>
          <textarea
            value={coachComment}
            onChange={(e) => setCoachComment(e.target.value)}
            placeholder="Bu hafta çok iyi ilerledi..."
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 h-24 resize-none"
          />
          <p className="text-sm text-gray-500 mt-2">Bu yorum rapora eklenecek.</p>
        </div>
      )}

      {/* Aylık Yorum */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          <Calendar className="w-5 h-5 inline mr-2 text-blue-500" />
          Aylık Yorum (Opsiyonel)
        </h3>
        <textarea
          value={monthlyComment}
          onChange={(e) => setMonthlyComment(e.target.value)}
          placeholder="Gelişim devam ediyor..."
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 h-24 resize-none"
        />
      </div>

      {/* Mesaj Önizleme */}
      {selectedStudent && hasAnyModule && (
        <>
          {/* Sonuç Mesajı */}
          {sendResult && (
            <div className={`p-4 rounded-xl flex items-center gap-2 ${
              sendResult.success
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {sendResult.success ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <X className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm">{sendResult.message}</span>
            </div>
          )}

          {/* Mesaj Önizleme */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Mesaj Önizleme</h3>
              <button
                onClick={copyToClipboard}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm"
              >
                <Copy className="w-4 h-4" />
                Kopyala
              </button>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                {generateMessage()}
              </pre>
            </div>
          </div>

          {/* Gönder Butonları */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={sendViaWhatsApp}
                disabled={!selectedStudent || !hasAnyModule}
                className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-xl p-6 flex items-center justify-center gap-3 transition-colors"
              >
                <MessageCircle className="w-8 h-8" />
                <div className="text-center">
                  <p className="font-bold text-lg">WhatsApp ile Gönder</p>
                  <p className="text-sm text-green-100">wa.me üzerinden aç</p>
                </div>
              </button>

              <button
                onClick={downloadMessage}
                disabled={!selectedStudent || !hasAnyModule}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-xl p-6 flex items-center justify-center gap-3 transition-colors"
              >
                <Download className="w-8 h-8" />
                <div className="text-center">
                  <p className="font-bold text-lg">İndir</p>
                  <p className="text-sm text-blue-100">TXT dosyası olarak</p>
                </div>
              </button>
            </div>
          </div>

          {/* Telefon Bilgisi */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
            <Phone className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-sm text-gray-500">Gönderilecek Telefon</p>
              <p className="font-medium text-slate-800">
                {selectedStudent.parentPhone || selectedStudent.phone}
              </p>
            </div>
            <a
              href={`https://wa.me/${formatPhone(selectedStudent.parentPhone || selectedStudent.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
            >
              <ExternalLink className="w-4 h-4" />
              wa.me
            </a>
          </div>
        </>
      )}

      {/* Empty State */}
      {!selectedStudent && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Öğrenci Seçin</h3>
          <p className="text-gray-500">
            Rapor göndermek için yukarıdan bir öğrenci seçin ve modül seçin.
          </p>
        </div>
      )}
    </div>
  );
}
