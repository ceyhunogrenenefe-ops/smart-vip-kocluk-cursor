// Türkçe: Öğrenci Raporları Sayfası - Öğrencinin kendi raporlarını görüntülemesi
import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  FileText,
  TrendingUp,
  Award,
  Target,
  BookOpen,
  Calendar,
  Download,
  MessageCircle,
  CheckCircle,
  AlertCircle,
  BarChart3,
  PieChart,
  Clock,
  Brain
} from 'lucide-react';
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
import { Line, Bar, Doughnut } from 'react-chartjs-2';

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

type TabType = 'overview' | 'topics' | 'performance' | 'weekly';

export default function StudentReports() {
  const { user } = useAuth();
  const { weeklyEntries, getStudentStats, students, topicProgress, getStudentTopicProgress } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Öğrencinin kendi verileri
  const myEntries = useMemo(() => {
    if (!user?.studentId) return [];
    return weeklyEntries
      .filter(e => e.studentId === user.studentId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [user, weeklyEntries]);

  const myStats = useMemo(() => {
    if (!user?.studentId) return null;
    return getStudentStats(user.studentId);
  }, [user, getStudentStats]);

  const myProgress = useMemo(() => {
    if (!user?.studentId) return [];
    return getStudentTopicProgress(user.studentId);
  }, [user, getStudentTopicProgress]);

  const myStudent = useMemo(() => {
    if (!user?.studentId) return null;
    return students.find(s => s.id === user.studentId);
  }, [user, students]);

  // AI Koç yorumu üret
  const generateAIComment = () => {
    if (!myStats) return 'Henüz yeterli veriniz yok.';

    const { successRate, realizationRate } = myStats;

    if (successRate >= 80 && realizationRate >= 80) {
      return 'Harika bir performans! Hedeflerinize büyük ölçüde ulaşıyorsunuz. Başarı grafiğinizi korumaya devam edin. Düşük başarı oranına sahip konulara yoğunlaşarak daha da gelişebilirsiniz.';
    } else if (successRate >= 60 && realizationRate >= 60) {
      return 'İyi bir başlangıç yapıyorsunuz. Hedeflerinize ulaşma oranınız iyi. Zayıf konularınızı belirleyip daha fazla pratik yapmanızı öneririm.';
    } else if (realizationRate < 50) {
      return 'Hedef gerçekleştirme oranınız düşük. Çözdüğünüz soru sayısını artırmaya odaklanın. Her gün düzenli çalışma alışkanlığı edinmelisiniz.';
    } else {
      return 'Doğru/yanlış oranınızı iyileştirmek için konu tekrarı yapın. Yanlış yaptığınız soruların çözümlerini inceleyerek eksiklerinizi tamamlayın.';
    }
  };

  // Haftalık veriler
  const weeklyData = useMemo(() => {
    const last4Weeks = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay() + 1);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekEntries = myEntries.filter(e => {
        const entryDate = new Date(e.date);
        return entryDate >= weekStart && entryDate <= weekEnd;
      });

      const solved = weekEntries.reduce((sum, e) => sum + e.solvedQuestions, 0);
      const correct = weekEntries.reduce((sum, e) => sum + e.correctAnswers, 0);

      last4Weeks.push({
        hafta: `Hafta ${4 - i}`,
        tarih: `${weekStart.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' })}`,
        hedef: weekEntries.reduce((sum, e) => sum + e.targetQuestions, 0),
        cozulen: solved,
        dogru: correct,
        basari: solved > 0 ? Math.round((correct / solved) * 100) : 0
      });
    }
    return last4Weeks;
  }, [myEntries]);

  // Ders bazlı başarı
  const subjectPerformance = useMemo(() => {
    const stats: Record<string, { correct: number; solved: number; entries: number }> = {};
    myEntries.forEach(entry => {
      if (!stats[entry.subject]) {
        stats[entry.subject] = { correct: 0, solved: 0, entries: 0 };
      }
      stats[entry.subject].correct += entry.correctAnswers;
      stats[entry.subject].solved += entry.solvedQuestions;
      stats[entry.subject].entries += 1;
    });

    return Object.entries(stats)
      .map(([subject, data]) => ({
        subject: subject.replace('TYT ', '').replace('AYT ', ''),
        dogru: data.correct,
        yanlis: data.solved - data.correct,
        basari: data.solved > 0 ? Math.round((data.correct / data.solved) * 100) : 0
      }))
      .sort((a, b) => b.basari - a.basari);
  }, [myEntries]);

  // Konu bazlı tamamlama
  const topicCompletion = useMemo(() => {
    const bySubject: Record<string, { completed: number; total: number }> = {};
    myProgress.forEach(p => {
      if (!bySubject[p.subject]) {
        bySubject[p.subject] = { completed: 0, total: 0 };
      }
      bySubject[p.subject].completed += 1;
    });

    // Öğrencinin sınıfına göre toplam konu sayısı tahmini
    Object.keys(bySubject).forEach(subject => {
      bySubject[subject].total = Math.max(bySubject[subject].completed + 3, 5);
    });

    return Object.entries(bySubject).map(([subject, data]) => ({
      subject: subject.replace('TYT ', '').replace('AYT ', ''),
      ...data,
      yuzde: Math.round((data.completed / data.total) * 100)
    }));
  }, [myProgress]);

  // Grafik verileri
  const weeklyChartData = {
    labels: weeklyData.map(w => w.hafia),
    datasets: [
      {
        label: 'Hedef',
        data: weeklyData.map(w => w.hedef),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.3
      },
      {
        label: 'Çözülen',
        data: weeklyData.map(w => w.cozulen),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3
      }
    ]
  };

  const subjectChartData = {
    labels: subjectPerformance.map(s => s.subject),
    datasets: [
      {
        label: 'Doğru',
        data: subjectPerformance.map(s => s.dogru),
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
        borderRadius: 4
      },
      {
        label: 'Yanlış',
        data: subjectPerformance.map(s => s.yanlis),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderRadius: 4
      }
    ]
  };

  const successRateChartData = {
    labels: subjectPerformance.map(s => s.subject),
    datasets: [
      {
        data: subjectPerformance.map(s => s.basari),
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(234, 179, 8, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(236, 72, 153, 0.8)'
        ],
        borderWidth: 0
      }
    ]
  };

  // WhatsApp mesajı oluştur
  const generateWhatsAppMessage = () => {
    if (!myStudent || !myStats) return '';

    const message = `📊 *${myStudent.name} - Haftalık Rapor*\n\n` +
      `🎯 *Gerçekleşme:* %${myStats.realizationRate}\n` +
      `✅ *Başarı Oranı:* %${myStats.successRate}\n\n` +
      `📈 *Toplam İstatistikler:*\n` +
      `• Hedef: ${myStats.totalTarget} soru\n` +
      `• Çözülen: ${myStats.totalSolved} soru\n` +
      `• Doğru: ${myStats.totalCorrect}\n` +
      `• Yanlış: ${myStats.totalWrong}\n` +
      `• Boş: ${myStats.totalBlank}\n\n` +
      `💬 AI Koç Yorumu:\n${generateAIComment()}`;

    return encodeURIComponent(message);
  };

  const tabs = [
    { id: 'overview' as TabType, label: 'Genel Bakış', icon: BarChart3 },
    { id: 'topics' as TabType, label: 'Konu Takibi', icon: BookOpen },
    { id: 'performance' as TabType, label: 'Performans', icon: TrendingUp },
    { id: 'weekly' as TabType, label: 'Haftalık', icon: Calendar }
  ];

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Benim Raporlarım</h1>
          <p className="text-slate-500">Kendi performansınızı takip edin</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`https://wa.me/?text=${generateWhatsAppMessage()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </a>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Yazdır
          </button>
        </div>
      </div>

      {/* AI Koç */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
            <Brain className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">AI Koç Yorumunuz</h3>
            <p className="text-purple-100 leading-relaxed">{generateAIComment()}</p>
          </div>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-500">Gerçekleşme</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">%{myStats?.realizationRate || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">Başarı</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">%{myStats?.successRate || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span className="text-sm text-gray-500">Doğru</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{myStats?.totalCorrect || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-gray-500">Yanlış</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{myStats?.totalWrong || 0}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Genel Bakış */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Son 4 Hafta Performansı</h3>
                <div className="h-72">
                  <Line
                    data={{
                      labels: weeklyData.map(w => w.tarih),
                      datasets: [
                        {
                          label: 'Hedef',
                          data: weeklyData.map(w => w.hedef),
                          borderColor: 'rgb(239, 68, 68)',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          fill: true,
                          tension: 0.3
                        },
                        {
                          label: 'Çözülen',
                          data: weeklyData.map(w => w.cozulen),
                          borderColor: 'rgb(59, 130, 246)',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          fill: true,
                          tension: 0.3
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom' }
                      },
                      scales: {
                        y: { beginAtZero: true }
                      }
                    }}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Ders Bazlı Başarı Dağılımı</h3>
                <div className="h-72">
                  <Doughnut
                    data={successRateChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'right' }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Konu Takibi */}
          {activeTab === 'topics' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">Tamamlanan Konular</h3>
                <span className="text-sm text-gray-500">{myProgress.length} konu tamamlandı</span>
              </div>

              {topicCompletion.length > 0 ? (
                <div className="space-y-4">
                  {topicCompletion.map(item => (
                    <div key={item.subject} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-slate-700">{item.subject}</span>
                        <span className="text-sm text-gray-500">{item.completed}/{item.total} konu</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-green-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${item.yuzde}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Henüz tamamlanan konu bulunmuyor.</p>
                </div>
              )}

              {/* Son Konular */}
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Son Çalışılan Konular</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {myEntries.slice(0, 6).map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <BookOpen className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">{entry.topic}</p>
                        <p className="text-xs text-gray-500">{entry.subject}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Performans */}
          {activeTab === 'performance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Ders Bazlı Performans</h3>
                <div className="h-80">
                  <Bar
                    data={subjectChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom' }
                      },
                      scales: {
                        y: { beginAtZero: true }
                      }
                    }}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Başarı Oranları</h3>
                <div className="space-y-3">
                  {subjectPerformance.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="w-32 text-sm text-slate-700 truncate">{item.subject}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 relative">
                        <div
                          className={`h-6 rounded-full ${
                            item.basari >= 80 ? 'bg-green-500' :
                            item.basari >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${item.basari}%` }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-700">
                          %{item.basari}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Haftalık */}
          {activeTab === 'weekly' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800">Son Kayıtlarınız</h3>

              {myEntries.length > 0 ? (
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
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Başarı</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {myEntries.map((entry) => {
                        const basari = entry.solvedQuestions > 0
                          ? Math.round((entry.correctAnswers / entry.solvedQuestions) * 100)
                          : 0;
                        return (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {new Date(entry.date).toLocaleDateString('tr-TR')}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-800">
                              {entry.subject.replace('TYT ', '').replace('AYT ', '')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{entry.topic}</td>
                            <td className="px-4 py-3 text-sm text-center text-gray-600">{entry.targetQuestions}</td>
                            <td className="px-4 py-3 text-sm text-center text-gray-600">{entry.solvedQuestions}</td>
                            <td className="px-4 py-3 text-sm text-center text-green-600 font-medium">{entry.correctAnswers}</td>
                            <td className="px-4 py-3 text-sm text-center text-red-600">{entry.wrongAnswers}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                basari >= 80 ? 'bg-green-100 text-green-700' :
                                basari >= 60 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                %{basari}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Henüz kayıt bulunmuyor.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Özet */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Toplam Özet</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-slate-800">{myStats?.totalTarget || 0}</p>
            <p className="text-xs text-gray-500">Toplam Hedef</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-slate-800">{myStats?.totalSolved || 0}</p>
            <p className="text-xs text-gray-500">Toplam Çözülen</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-slate-800">{myStats?.totalBlank || 0}</p>
            <p className="text-xs text-gray-500">Toplam Boş</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-slate-800">{myEntries.length}</p>
            <p className="text-xs text-gray-500">Kayıt Sayısı</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-slate-800">{myProgress.length}</p>
            <p className="text-xs text-gray-500">Tamamlanan Konu</p>
          </div>
        </div>
      </div>
    </div>
  );
}
