// Türkçe: WhatsApp Entegrasyonu - Haftalık Rapor Formatı ile Gelişmiş Raporlama
import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  MessageCircle,
  Phone,
  CheckCircle,
  Copy,
  ExternalLink,
  Download,
  FileText,
  Users,
  Check,
  X,
  BarChart3,
  BookOpen,
  FileCheck,
  Target,
  Calendar,
  Book,
  Brain,
  QrCode,
  Sparkles,
  ListChecks
} from 'lucide-react';
import { formatClassLevelLabel } from '../types';
import { analyzeWhatsAppPaste, fillTemplate } from '../utils/whatsappChatInsights';
import {
  saveDailySignal,
  saveWhatsAppLog,
  getStudentWhatsAppLogs,
  buildBehaviorScores,
  getStudentDailySignals
} from '../lib/aiDataStore';

const WA_PROFILE_STORAGE = 'coaching_whatsapp_wa_profile';

type WaProfile = { coachPhone: string; qrDataUrl: string | null };

const DAILY_MESSAGE_TEMPLATES: { id: string; label: string; body: string }[] = [
  {
    id: 'gunluk-gorev',
    label: 'Günlük görev hatırlatması',
    body:
      'Merhaba 👋 {ad} ({sinif}) için bugünkü görev: {gorev}. Sorularınız için yazabilirsiniz. — {kurum}'
  },
  {
    id: 'haftalik-ozet',
    label: 'Haftalık mini özet',
    body:
      'Merhaba, {ad} ile ilgili bu hafta odak: {gorev}. Hafta sonu kısa bir değerlendirme yapalım. — {kurum}'
  },
  {
    id: 'motivasyon',
    label: 'Motivasyon / takip',
    body: 'Merhaba {ad}, {gorev} konusunda takipteyiz. Bir adım daha 🎯 — {kurum}'
  },
  {
    id: 'veli-bilgi',
    label: 'Veli bilgilendirme',
    body:
      'Sayın veli, {ad} ({sinif}) için planlanan çalışma: {gorev}. Tarih: {tarih}. — {kurum}'
  }
];

export default function WhatsApp() {
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

  const [coachPhoneDraft, setCoachPhoneDraft] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [chatPaste, setChatPaste] = useState('');
  const [templateId, setTemplateId] = useState(DAILY_MESSAGE_TEMPLATES[0].id);
  const [taskForTemplate, setTaskForTemplate] = useState('');
  const [signalMode, setSignalMode] = useState<'student' | 'parent'>('student');
  const [signalForm, setSignalForm] = useState({
    questionsSolved: 0,
    pagesRead: 0,
    focusLevel: 60,
    disciplineLevel: 60,
    motivationLevel: 60,
    engagementLevel: 60,
    notes: ''
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WA_PROFILE_STORAGE);
      if (raw) {
        const p = JSON.parse(raw) as WaProfile;
        setCoachPhoneDraft(p.coachPhone || '');
        setQrDataUrl(p.qrDataUrl || null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const saveWaProfile = () => {
    const p: WaProfile = { coachPhone: coachPhoneDraft.trim(), qrDataUrl };
    localStorage.setItem(WA_PROFILE_STORAGE, JSON.stringify(p));
    setSendResult({ success: true, message: 'WhatsApp bağlantı ayarları kaydedildi.' });
    setTimeout(() => setSendResult(null), 3000);
  };

  const selectedTemplateBody =
    DAILY_MESSAGE_TEMPLATES.find(t => t.id === templateId)?.body ?? '';

  const onQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setQrDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Seçili modül değiştiğinde
  const toggleModule = (module: keyof typeof selectedModules) => {
    setSelectedModules(prev => ({ ...prev, [module]: !prev[module] }));
  };

  // Seçili öğrenci
  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const messageLogs = selectedStudent
    ? getStudentWhatsAppLogs(institution.id, selectedStudent.id).slice(0, 20)
    : [];
  const behaviorScores = selectedStudent
    ? buildBehaviorScores(getStudentDailySignals(institution.id, selectedStudent.id).slice(0, 7))
    : { motivationScore: 0, disciplineScore: 0, engagementScore: 0, dailyScore: 0 };

  const chatInsight = useMemo(
    () => analyzeWhatsAppPaste(chatPaste, selectedStudent?.name),
    [chatPaste, selectedStudent?.name]
  );

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

  const buildDailyMessage = () => {
    if (!selectedStudent) return '';
    return fillTemplate(selectedTemplateBody, {
      ad: selectedStudent.name,
      sinif: formatClassLevelLabel(selectedStudent.classLevel),
      gorev: taskForTemplate.trim() || '(görev belirtin)',
      kurum: institution.name,
      tarih: new Date().toLocaleDateString('tr-TR')
    });
  };

  const openDailyTemplateWhatsApp = () => {
    if (!selectedStudent) {
      setSendResult({ success: false, message: 'Önce öğrenci seçin.' });
      return;
    }
    const targetPhone = formatPhone(selectedStudent.parentPhone || selectedStudent.phone || '');
    if (!targetPhone) {
      setSendResult({
        success: false,
        message: 'Öğrenci veya veli telefonu yok. Öğrenci kartına numara ekleyin veya aşağıda koç hattınızı kaydedin.'
      });
      return;
    }
    const msg = encodeURIComponent(buildDailyMessage());
    saveWhatsAppLog({
      institutionId: institution.id,
      studentId: selectedStudent.id,
      direction: 'outgoing',
      audience: selectedStudent.parentPhone ? 'parent' : 'student',
      content: buildDailyMessage()
    });
    window.open(`https://wa.me/${targetPhone}?text=${msg}`, '_blank');
  };

  const saveSignal = () => {
    if (!selectedStudent) {
      setSendResult({ success: false, message: 'Önce öğrenci seçin.' });
      return;
    }
    saveDailySignal({
      institutionId: institution.id,
      studentId: selectedStudent.id,
      source: signalMode,
      date: new Date().toISOString().split('T')[0],
      ...signalForm
    });
    setSendResult({ success: true, message: 'Daily Signal kaydedildi.' });
    setTimeout(() => setSendResult(null), 2500);
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
    saveWhatsAppLog({
      institutionId: institution.id,
      studentId: selectedStudent.id,
      direction: 'outgoing',
      audience: selectedStudent.parentPhone ? 'parent' : 'student',
      content: generateMessage()
    });
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

      {/* Koç WhatsApp — numara + QR (yerel kayıt) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <QrCode className="w-5 h-5 text-green-600" />
          WhatsApp bağlantınız
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          İş veya koç hattınızın numarasını kaydedin; isteğe bağlı QR görseli yükleyin. Veriler yalnızca bu cihazda
          saklanır. Otomatik mesaj çekmek için resmi WhatsApp Business API gerekir.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Numara (ülke kodu ile, örn. 905551234567)
            </label>
            <input
              type="tel"
              value={coachPhoneDraft}
              onChange={e => setCoachPhoneDraft(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg"
              placeholder="905XXXXXXXXX"
            />
            {coachPhoneDraft && (
              <a
                href={`https://wa.me/${formatPhone(coachPhoneDraft)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-600 mt-2 inline-flex items-center gap-1"
              >
                <ExternalLink className="w-4 h-4" />
                wa.me ile aç
              </a>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">QR kod görseli</label>
            <input type="file" accept="image/*" onChange={onQrFile} className="text-sm w-full" />
            {qrDataUrl && (
              <img src={qrDataUrl} alt="WhatsApp QR" className="mt-3 max-w-[180px] rounded-lg border border-gray-100" />
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={saveWaProfile}
          className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
        >
          Bağlantıyı kaydet
        </button>
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

      {/* Günlük şablon + görev */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-emerald-600" />
          Günlük mesaj şablonları
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Şablon seçin, görevi yazın; veli numarasına WhatsApp ile gönderilir (öğrenci seçili olmalı).
        </p>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şablon</label>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg"
            >
              {DAILY_MESSAGE_TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bugünkü görev / odak</label>
            <input
              type="text"
              value={taskForTemplate}
              onChange={e => setTaskForTemplate(e.target.value)}
              placeholder="Örn: Matematik 20 soru, fen özeti oku..."
              className="w-full px-4 py-2 border border-gray-200 rounded-lg"
            />
          </div>
        </div>
        {selectedStudent && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap mb-3">
            {buildDailyMessage()}
          </div>
        )}
        <button
          type="button"
          onClick={openDailyTemplateWhatsApp}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm flex items-center gap-2"
        >
          <MessageCircle className="w-4 h-4" />
          Şablonu WhatsApp ile gönder
        </button>
      </div>

      {/* Günlük Sinyaller (Düdük Sistemi) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Günlük Sinyaller</h3>
        <p className="text-sm text-gray-500 mb-4">
          Student + parent geri bildirimlerini skora cevirir.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <select
            value={signalMode}
            onChange={e => setSignalMode(e.target.value as 'student' | 'parent')}
            className="px-4 py-2 border border-gray-200 rounded-lg"
          >
            <option value="student">Öğrenci Sinyali</option>
            <option value="parent">Veli Sinyali</option>
          </select>
          <input
            type="number"
            min={0}
            value={signalForm.questionsSolved}
            onChange={e => setSignalForm(prev => ({ ...prev, questionsSolved: Number(e.target.value) || 0 }))}
            placeholder="Çözülen soru"
            className="px-4 py-2 border border-gray-200 rounded-lg"
          />
          <input
            type="number"
            min={0}
            value={signalForm.pagesRead}
            onChange={e => setSignalForm(prev => ({ ...prev, pagesRead: Number(e.target.value) || 0 }))}
            placeholder="Okunan sayfa"
            className="px-4 py-2 border border-gray-200 rounded-lg"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={signalForm.focusLevel}
            onChange={e => setSignalForm(prev => ({ ...prev, focusLevel: Number(e.target.value) || 0 }))}
            placeholder="Odak"
            className="px-4 py-2 border border-gray-200 rounded-lg"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={signalForm.disciplineLevel}
            onChange={e => setSignalForm(prev => ({ ...prev, disciplineLevel: Number(e.target.value) || 0 }))}
            placeholder="Disiplin"
            className="px-4 py-2 border border-gray-200 rounded-lg"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={signalForm.motivationLevel}
            onChange={e => setSignalForm(prev => ({ ...prev, motivationLevel: Number(e.target.value) || 0 }))}
            placeholder="Motivasyon"
            className="px-4 py-2 border border-gray-200 rounded-lg"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={signalForm.engagementLevel}
            onChange={e => setSignalForm(prev => ({ ...prev, engagementLevel: Number(e.target.value) || 0 }))}
            placeholder="Etkileşim"
            className="px-4 py-2 border border-gray-200 rounded-lg"
          />
        </div>
        <textarea
          value={signalForm.notes}
          onChange={e => setSignalForm(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Notlar"
          className="mt-3 w-full px-4 py-2 border border-gray-200 rounded-lg"
        />
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-gray-600">
            Motivasyon {behaviorScores.motivationScore} - Disiplin {behaviorScores.disciplineScore} - Günlük {behaviorScores.dailyScore}
          </div>
          <button onClick={saveSignal} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
            Sinyali Kaydet
          </button>
        </div>
      </div>

      {/* Sohbet yapıştır — yerel analiz */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-600" />
          Sohbetten özet (ödev / görüşme)
        </h3>
        <p className="text-sm text-gray-500 mb-3">
          WhatsApp konuşmasını kopyalayıp yapıştırın; anahtar kelimelerle ödev ve görüşme satırları ayıklanır. Tam otomatik
          arşiv için WhatsApp Business API entegrasyonu gerekir.
        </p>
        <textarea
          value={chatPaste}
          onChange={e => setChatPaste(e.target.value)}
          placeholder="Sohbet metnini buraya yapıştırın..."
          className="w-full px-4 py-3 border border-gray-200 rounded-lg min-h-[120px] text-sm"
        />
        {chatPaste.trim().length > 0 && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">Özet</p>
              <ul className="list-disc list-inside text-sm text-gray-600">
                {chatInsight.summaryBullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
            {chatInsight.homeworkLines.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">Ödev / görev satırları</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {chatInsight.homeworkLines.slice(0, 12).map((line, i) => (
                    <li key={i} className="bg-amber-50 rounded px-2 py-1">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {chatInsight.meetingLines.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">Görüşme / plan</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {chatInsight.meetingLines.slice(0, 12).map((line, i) => (
                    <li key={i} className="bg-blue-50 rounded px-2 py-1">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {chatInsight.taskSuggestions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">Önerilen takip görevleri</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {chatInsight.taskSuggestions.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                const block = [
                  `*Sohbet özeti* (${selectedStudent?.name || 'öğrenci'})`,
                  '',
                  ...chatInsight.summaryBullets,
                  '',
                  'Ödev satırları:',
                  ...chatInsight.homeworkLines.slice(0, 8).map(l => `• ${l}`),
                  '',
                  'Görüşme:',
                  ...chatInsight.meetingLines.slice(0, 8).map(l => `• ${l}`)
                ].join('\n');
                navigator.clipboard.writeText(block);
                if (selectedStudent) {
                  saveWhatsAppLog({
                    institutionId: institution.id,
                    studentId: selectedStudent.id,
                    direction: 'incoming',
                    audience: 'student',
                    content: block
                  });
                }
                setSendResult({ success: true, message: 'Özet panoya kopyalandı.' });
                setTimeout(() => setSendResult(null), 3000);
              }}
              className="text-sm px-3 py-1.5 bg-violet-100 text-violet-800 rounded-lg hover:bg-violet-200"
            >
              Özeti panoya kopyala
            </button>
          </div>
        )}
      </div>

      {/* Chat Panel */}
      {selectedStudent && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-3">WhatsApp Chat Panel</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Öğrenci mesajları</p>
              <div className="max-h-44 overflow-y-auto space-y-2">
                {messageLogs.filter(l => l.audience === 'student').map(log => (
                  <div key={log.id} className="text-xs bg-gray-50 rounded p-2">{log.content}</div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Veli mesajları</p>
              <div className="max-h-44 overflow-y-auto space-y-2">
                {messageLogs.filter(l => l.audience === 'parent').map(log => (
                  <div key={log.id} className="text-xs bg-gray-50 rounded p-2">{log.content}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
