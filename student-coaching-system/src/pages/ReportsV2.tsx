import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  BarChart3,
  Brain,
  ClipboardList,
  Download,
  FileText,
  MessageCircle,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import {
  buildBehaviorScores,
  getStudentDailySignals,
  getStudentWhatsAppLogs
} from '../lib/aiDataStore';

type SectionKey = 'overview' | 'exams' | 'ai' | 'report';

export default function ReportsV2() {
  const { students, institution, getStudentStats, getStudentExamResults, getStudentEntries } = useApp();
  const { effectiveUser } = useAuth();
  const [studentId, setStudentId] = useState('');
  const [section, setSection] = useState<SectionKey>('overview');

  const selectedStudent = students.find(s => s.id === studentId);
  const stats = studentId ? getStudentStats(studentId) : null;
  const exams = studentId ? getStudentExamResults(studentId) : [];
  const entries = studentId ? getStudentEntries(studentId) : [];

  const signals = useMemo(() => {
    if (!studentId) return [];
    return getStudentDailySignals(institution.id, studentId).slice(0, 14);
  }, [institution.id, studentId]);

  const behavior = useMemo(() => buildBehaviorScores(signals), [signals]);

  const waLogs = useMemo(() => {
    if (!studentId) return [];
    return getStudentWhatsAppLogs(institution.id, studentId).slice(0, 12);
  }, [institution.id, studentId]);

  const weakSubjects = useMemo(() => {
    const map: Record<string, { correct: number; solved: number }> = {};
    entries.forEach(e => {
      if (!map[e.subject]) map[e.subject] = { correct: 0, solved: 0 };
      map[e.subject].correct += e.correctAnswers;
      map[e.subject].solved += e.solvedQuestions;
    });
    return Object.entries(map)
      .map(([subject, val]) => ({
        subject,
        score: val.solved > 0 ? Math.round((val.correct / val.solved) * 100) : 0
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }, [entries]);

  const trend = exams.length >= 2 ? exams[0].totalNet - exams[1].totalNet : 0;

  const getAIPlan = () => {
    if (!weakSubjects.length) return 'Bu hafta rutinini koru ve deneme analizi sonrası tekrar yap.';
    const top = weakSubjects[0];
    return `${top.subject} için haftada 4 oturum, oturum başına 35 soru + 20 dk konu tekrarı planla.`;
  };

  const coachReport = `COACH REPORT\n\nStudent: ${selectedStudent?.name || '-'}\nInstitution: ${institution.name}\nMotivation: ${behavior.motivationScore}\nDiscipline: ${behavior.disciplineScore}\nEngagement: ${behavior.engagementScore}\nDaily Score: ${behavior.dailyScore}\nWeekly Questions: ${stats?.totalSolved || 0}\nSuccess Rate: ${stats?.successRate || 0}%\nExam Trend: ${trend >= 0 ? '+' : ''}${trend}\nPlan: ${getAIPlan()}`;

  const parentReport = `Veli Bilgilendirme\n\n${selectedStudent?.name || 'Öğrenci'} için günlük durum:\n- Motivasyon: ${behavior.motivationScore}/100\n- Disiplin: ${behavior.disciplineScore}/100\n- Çalışma performansı: ${stats?.successRate || 0}%\n${trend < 0 ? '- Uyarı: deneme netlerinde düşüş var, destekli tekrar öneriyoruz.' : '- Genel gidişat olumlu.'}`;

  const downloadReport = (content: string, kind: 'coach' | 'parent') => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind}-report-${selectedStudent?.name || 'student'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Genel Bakış', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'exams', label: 'Sınavlar (Denemeler)', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'ai', label: 'YZ Analizi', icon: <Brain className="w-4 h-4" /> },
    { key: 'report', label: 'Oluşturulan Rapor', icon: <FileText className="w-4 h-4" /> }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 to-indigo-700 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold">Raporlar</h2>
        <p className="text-indigo-100">YZ destekli genel bakış, sınav analizi ve tek tık çıktı.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <label className="text-sm text-gray-500">Öğrenci</label>
        <select
          className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg"
          value={studentId}
          onChange={e => setStudentId(e.target.value)}
        >
          <option value="">Öğrenci seçin</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {selectedStudent && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex overflow-x-auto border-b border-gray-100">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setSection(tab.key)}
                className={`px-4 py-3 text-sm flex items-center gap-2 ${
                  section === tab.key ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {section === 'overview' && (
              <div className="grid md:grid-cols-4 gap-4">
                <Stat title="Haftalık İlerleme" value={`${stats?.realizationRate || 0}%`} />
                <Stat title="Motivasyon" value={`${behavior.motivationScore}`} />
                <Stat title="Disiplin" value={`${behavior.disciplineScore}`} />
                <Stat title="Tutarlılık" value={`${behavior.dailyScore}`} />
              </div>
            )}

            {section === 'exams' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Tüm sınavlar, net skorlar ve ders trendleri.</p>
                {exams.slice(0, 8).map(exam => (
                  <div key={exam.id} className="p-3 rounded-lg bg-gray-50 flex justify-between">
                    <span>{new Date(exam.examDate).toLocaleDateString('tr-TR')} - {exam.examType}</span>
                    <span className="font-semibold">{exam.totalNet} net</span>
                  </div>
                ))}
                {!exams.length && <p className="text-sm text-gray-400">Sınav verisi bulunamadı.</p>}
              </div>
            )}

            {section === 'ai' && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-indigo-50">
                  <p className="font-medium text-indigo-800 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Kişiselleştirilmiş gelişim planı
                  </p>
                  <p className="text-sm text-indigo-700 mt-1">{getAIPlan()}</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50">
                  <p className="font-medium text-amber-800 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    Risk uyarıları
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    {trend < 0 ? 'Sınav trendi düşüyor. Ek tekrar ve veli takibi önerilir.' : 'Önemli bir risk sinyali yok.'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-2">WhatsApp davranış içgörüleri (son kayıtlar)</p>
                  {waLogs.slice(0, 5).map(log => (
                    <div key={log.id} className="text-sm p-2 border-b border-gray-100">
                      <span className="font-medium mr-2">{log.audience === 'parent' ? 'Veli' : 'Öğrenci'}:</span>
                      {log.content}
                    </div>
                  ))}
                  {!waLogs.length && <p className="text-sm text-gray-400">Henüz WhatsApp kaydı yok.</p>}
                </div>
              </div>
            )}

            {section === 'report' && (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <button
                    onClick={() => downloadReport(coachReport, 'coach')}
                    className="p-4 rounded-lg bg-slate-900 text-white flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Koç Sürümü
                  </button>
                  <button
                    onClick={() => downloadReport(parentReport, 'parent')}
                    className="p-4 rounded-lg bg-green-600 text-white flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Veli Sürümü
                  </button>
                </div>
                <p className="text-sm text-gray-500">
                  {effectiveUser?.role === 'coach'
                    ? 'Günlük/haftalık mesajlaşma için veli sürümünü kullanın.'
                    : 'Her iki sürüm de canlı öğrenci, sınav ve davranış sinyalleri ile üretilir.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
    </div>
  );
}
