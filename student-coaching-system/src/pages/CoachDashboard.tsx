// Türkçe: Eğitim Koçu Dashboard Sayfası - Sadece atanan öğrencileri gösterir
import React, { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { formatClassLevelLabel } from '../types';
import {
  Users,
  TrendingUp,
  Target,
  Award,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  Calendar,
  AlertTriangle,
  UserCheck,
  UserCircle,
  BookMarked,
  Flame,
  Timer,
  FileText
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
  Line
} from 'recharts';

export default function CoachDashboard() {
  const { user } = useAuth();
  const {
    students, weeklyEntries, getStudentStats, coaches, getReadingStats,
    writtenExamScores, getWrittenExamStats
  } = useApp();

  // Koçun kayıtlı öğrencileri
  const myStudents = useMemo(() => {
    if (!user?.coachId) return [];
    const coach = coaches.find(c => c.id === user.coachId);
    if (!coach) return [];
    return students.filter(s => coach.studentIds.includes(s.id));
  }, [user, coaches, students]);

  // Koçun öğrenci ID'leri
  const myStudentIds = useMemo(() => myStudents.map(s => s.id), [myStudents]);

  // Koçun öğrencilerinin kayıtları
  const myEntries = useMemo(() => {
    return weeklyEntries.filter(e => myStudentIds.includes(e.studentId));
  }, [weeklyEntries, myStudentIds]);

  // Toplam okuma istatistikleri (öğrencilerin tamamı)
  const totalReadingMinutes = useMemo(() => {
    return myEntries.reduce((sum, e) => sum + (e.readingMinutes || 0), 0);
  }, [myEntries]);

  // Okuma yapan öğrenciler
  const studentsWithReading = useMemo(() => {
    return myStudents.filter(student => {
      const studentEntries = weeklyEntries.filter(e => e.studentId === student.id && e.readingMinutes && e.readingMinutes > 0);
      return studentEntries.length > 0;
    });
  }, [myStudents, weeklyEntries]);

  // En çok okuyan öğrenciler
  const topReaders = useMemo(() => {
    return myStudents
      .map(student => {
        const studentReading = myEntries.filter(e => e.studentId === student.id && e.readingMinutes && e.readingMinutes > 0);
        const totalMinutes = studentReading.reduce((sum, e) => sum + (e.readingMinutes || 0), 0);
        return { ...student, totalReadingMinutes: totalMinutes };
      })
      .filter(s => s.totalReadingMinutes > 0)
      .sort((a, b) => b.totalReadingMinutes - a.totalReadingMinutes)
      .slice(0, 5);
  }, [myStudents, myEntries]);

  // Yazılı takip istatistikleri
  const writtenExamStats = useMemo(() => {
    const stats = myStudents.map(student => {
      const studentScores = writtenExamScores.filter(s => s.studentId === student.id);
      const studentStats = getWrittenExamStats(student.id);
      return {
        ...student,
        totalExams: studentScores.length,
        yearlyAverage: studentStats.yearlyAverage,
        semester1Average: studentStats.semester1Average,
        semester2Average: studentStats.semester2Average,
        subjectsAbove85: studentStats.subjectsAbove85,
        subjectsBelow70: studentStats.subjectsBelow70
      };
    });
    return stats.filter(s => s.totalExams > 0);
  }, [myStudents, writtenExamScores, getWrittenExamStats]);

  // Yazılı başarı sıralaması
  const topWrittenPerformers = useMemo(() => {
    return writtenExamStats
      .filter(s => s.yearlyAverage > 0)
      .sort((a, b) => b.yearlyAverage - a.yearlyAverage)
      .slice(0, 5);
  }, [writtenExamStats]);

  // Genel istatistikler
  const generalStats = useMemo(() => {
    const totalTarget = myEntries.reduce((sum, e) => sum + e.targetQuestions, 0);
    const totalSolved = myEntries.reduce((sum, e) => sum + e.solvedQuestions, 0);
    const totalCorrect = myEntries.reduce((sum, e) => sum + e.correctAnswers, 0);
    const totalWrong = myEntries.reduce((sum, e) => sum + e.wrongAnswers, 0);
    const totalBlank = myEntries.reduce((sum, e) => sum + e.blankAnswers, 0);
    const successRate = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;
    const realizationRate = totalTarget > 0 ? Math.round((totalSolved / totalTarget) * 100) : 0;

    return { totalTarget, totalSolved, totalCorrect, totalWrong, totalBlank, successRate, realizationRate };
  }, [myEntries]);

  // Ders bazlı başarı
  const subjectStats = useMemo(() => {
    const stats: { [key: string]: { correct: number; solved: number } } = {};
    myEntries.forEach(entry => {
      if (!stats[entry.subject]) {
        stats[entry.subject] = { correct: 0, solved: 0 };
      }
      stats[entry.subject].correct += entry.correctAnswers;
      stats[entry.subject].solved += entry.solvedQuestions;
    });

    return Object.entries(stats).map(([subject, data]) => ({
      subject,
      başarı: data.solved > 0 ? Math.round((data.correct / data.solved) * 100) : 0
    }));
  }, [myEntries]);

  // Son 7 günlük trend
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const dailyTrend = last7Days.map(date => {
    const dayEntries = myEntries.filter(e => e.date === date);
    return {
      tarih: new Date(date).toLocaleDateString('tr-TR', { weekday: 'short' }),
      başarı: dayEntries.reduce((sum, e) => sum + e.solvedQuestions, 0) > 0
        ? Math.round(
            (dayEntries.reduce((sum, e) => sum + e.correctAnswers, 0) /
              dayEntries.reduce((sum, e) => sum + e.solvedQuestions, 0)) * 100
          )
        : 0
    };
  });

  // Başarı rengi
  const getSuccessColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600 bg-green-50';
    if (rate >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  // Riskli öğrenciler (başarı %70'in altında)
  const atRiskStudents = useMemo(() => {
    return myStudents.filter(student => {
      const stats = getStudentStats(student.id);
      return stats && stats.successRate < 70;
    });
  }, [myStudents, getStudentStats]);

  // Başarılı öğrenciler (başarı %90 ve üzeri)
  const topPerformers = useMemo(() => {
    return myStudents.filter(student => {
      const stats = getStudentStats(student.id);
      return stats && stats.successRate >= 90;
    });
  }, [myStudents, getStudentStats]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Hoşgeldin */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
              {user.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold">Merhaba, {user.name}!</h2>
              <p className="text-purple-200">Eğitim Koçu Paneli</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold">{myStudents.length}</p>
            <p className="text-purple-200">Öğrenci Sayınız</p>
          </div>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-500">Toplam Öğrenci</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{myStudents.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-500">Toplam Hedef</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{generalStats.totalTarget}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">Çözülen</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{generalStats.totalSolved}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-red-600" />
            <span className="text-sm text-gray-500">Başarı</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">%{generalStats.successRate}</p>
        </div>
      </div>

      {/* Detaylı İstatistikler */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-3xl font-bold text-green-600">{generalStats.totalCorrect}</p>
          <p className="text-sm text-gray-500">Doğru</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 text-center">
          <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-3xl font-bold text-red-600">{generalStats.totalWrong}</p>
          <p className="text-sm text-gray-500">Yanlış</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-3xl font-bold text-gray-600">{generalStats.totalBlank}</p>
          <p className="text-sm text-gray-500">Boş</p>
        </div>
      </div>

      {/* 📚 Kitap Okuma Analizi */}
      {totalReadingMinutes > 0 && (
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <BookMarked className="w-6 h-6" />
            <h3 className="text-lg font-bold">📚 Öğrencilerin Kitap Okuma Analizi</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="w-4 h-4 text-green-200" />
                <span className="text-sm text-green-100">Toplam Okuma</span>
              </div>
              <p className="text-2xl font-bold">{Math.round(totalReadingMinutes / 60)} saat</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-200" />
                <span className="text-sm text-green-100">Okuyan Öğrenci</span>
              </div>
              <p className="text-2xl font-bold">{studentsWithReading.length} / {myStudents.length}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <BookMarked className="w-4 h-4 text-yellow-200" />
                <span className="text-sm text-green-100">Ort. Öğrenci</span>
              </div>
              <p className="text-2xl font-bold">{Math.round(totalReadingMinutes / 60 / myStudents.length)} saat</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Flame className="w-4 h-4 text-orange-300" />
                <span className="text-sm text-green-100">En Çok Okuyan</span>
              </div>
              <p className="text-lg font-bold truncate">{topReaders[0]?.name || '-'}</p>
            </div>
          </div>
          {topReaders.length > 0 && (
            <div className="mt-4 bg-white/10 rounded-xl p-4">
              <p className="text-sm text-green-100 mb-3">📖 En Çok Okuyan Öğrenciler:</p>
              <div className="space-y-2">
                {topReaders.map((student, idx) => (
                  <div key={student.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                        idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-gray-300 text-gray-800' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-white/20 text-white'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="text-white">{student.name}</span>
                    </div>
                    <span className="text-green-200 font-medium">{Math.round(student.totalReadingMinutes / 60)} saat</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 📝 Yazılı Sınav Analizi */}
      {writtenExamStats.length > 0 && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6" />
            <h3 className="text-lg font-bold">📝 Öğrencilerin Yazılı Sınav Analizi</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-200" />
                <span className="text-sm text-blue-100">Yazılı Giren</span>
              </div>
              <p className="text-2xl font-bold">{writtenExamStats.length} / {myStudents.length}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-200" />
                <span className="text-sm text-blue-100">Ortalama</span>
              </div>
              <p className="text-2xl font-bold">
                {Math.round(writtenExamStats.reduce((sum, s) => sum + s.yearlyAverage, 0) / writtenExamStats.length) || '-'}
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-200" />
                <span className="text-sm text-blue-100">85+ Alan</span>
              </div>
              <p className="text-2xl font-bold">
                {writtenExamStats.filter(s => s.yearlyAverage >= 85).length}
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-200" />
                <span className="text-sm text-blue-100">70 Altı</span>
              </div>
              <p className="text-2xl font-bold">
                {writtenExamStats.filter(s => s.yearlyAverage > 0 && s.yearlyAverage < 70).length}
              </p>
            </div>
          </div>
          {topWrittenPerformers.length > 0 && (
            <div className="mt-4 bg-white/10 rounded-xl p-4">
              <p className="text-sm text-blue-100 mb-3">🏆 Yazılıda En Başarılı Öğrenciler:</p>
              <div className="space-y-2">
                {topWrittenPerformers.map((student, idx) => (
                  <div key={student.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                        idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-gray-300 text-gray-800' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-white/20 text-white'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="text-white">{student.name}</span>
                    </div>
                    <span className={`font-bold ${
                      student.yearlyAverage >= 85 ? 'text-green-300' :
                      student.yearlyAverage >= 70 ? 'text-yellow-200' : 'text-red-200'
                    }`}>
                      {student.yearlyAverage}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Riskli ve Başarılı Öğrenciler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Riskli Öğrenciler */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            <h3 className="text-lg font-semibold text-slate-800">Dikkat Gerekli</h3>
          </div>
          {atRiskStudents.length > 0 ? (
            <div className="space-y-3">
              {atRiskStudents.slice(0, 5).map(student => {
                const stats = getStudentStats(student.id);
                return (
                  <div key={student.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{student.name}</p>
                        <p className="text-sm text-gray-500">{formatClassLevelLabel(student.classLevel)}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-lg text-sm font-medium ${getSuccessColor(stats?.successRate || 0)}`}>
                      %{stats?.successRate || 0}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <UserCheck className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-500">Tüm öğrencileriniz iyi durumda!</p>
            </div>
          )}
        </div>

        {/* Başarılı Öğrenciler */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-6 h-6 text-green-500" />
            <h3 className="text-lg font-semibold text-slate-800">Başarılı Öğrenciler</h3>
          </div>
          {topPerformers.length > 0 ? (
            <div className="space-y-3">
              {topPerformers.slice(0, 5).map(student => {
                const stats = getStudentStats(student.id);
                return (
                  <div key={student.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{student.name}</p>
                        <p className="text-sm text-gray-500">{formatClassLevelLabel(student.classLevel)}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-lg text-sm font-medium ${getSuccessColor(stats?.successRate || 0)}`}>
                      %{stats?.successRate || 0}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Henüz başarılı öğrenci bulunamadı.</p>
            </div>
          )}
        </div>
      </div>

      {/* Grafikler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ders Bazlı Başarı */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Ders Bazlı Başarı</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="başarı" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Haftalık Trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Haftalık Performans</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="tarih" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="başarı"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: '#10B981' }}
                  name="Başarı %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Öğrenci Listesi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Öğrenci Listem</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Öğrenci</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Sınıf</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Hedef</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Çözülen</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Doğru</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Başarı %</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {myStudents.map((student) => {
                const stats = getStudentStats(student.id);
                return (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                          {student.name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-800">{student.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{formatClassLevelLabel(student.classLevel)}</td>
                    <td className="px-4 py-2 text-sm text-center text-gray-600">{stats?.totalTarget || 0}</td>
                    <td className="px-4 py-2 text-sm text-center text-gray-600">{stats?.totalSolved || 0}</td>
                    <td className="px-4 py-2 text-sm text-center text-green-600 font-medium">{stats?.totalCorrect || 0}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getSuccessColor(stats?.successRate || 0)}`}>
                        %{stats?.successRate || 0}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {(stats?.successRate || 0) < 70 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-500">
                          <AlertTriangle className="w-3 h-3" /> Dikkat
                        </span>
                      ) : (stats?.successRate || 0) >= 90 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-500">
                          <Award className="w-3 h-3" /> Başarılı
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-yellow-500">
                          İyi
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
