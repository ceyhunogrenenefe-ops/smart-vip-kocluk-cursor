// Türkçe: Analiz Paneli Sayfası
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatClassLevelLabel } from '../types';
import {
  BarChart3,
  TrendingUp,
  Target,
  Award,
  Clock,
  BookOpen,
  Users,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
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

export default function Analytics() {
  const {
    students, weeklyEntries, getStudentStats, coaches, getReadingStats,
    writtenExamScores, writtenExamSubjects, getWrittenExamStats
  } = useApp();
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>('week');

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Öğrenci istatistikleri
  const studentStats = useMemo(() => {
    if (!selectedStudentId) return null;
    return getStudentStats(selectedStudentId);
  }, [selectedStudentId, weeklyEntries]);

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
    return writtenExamSubjects.map(subject => {
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
  }, [selectedStudentId, writtenExamScores, writtenExamSubjects]);

  // Ders bazlı başarı analizi
  const subjectAnalysis = useMemo(() => {
    const entries = selectedStudentId
      ? weeklyEntries.filter(e => e.studentId === selectedStudentId)
      : weeklyEntries;

    const subjectStats = entries.reduce((acc, entry) => {
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

    return Object.entries(subjectStats).map(([subject, stats]: [string, any]) => ({
      subject,
      başarı: stats.solved > 0 ? Math.round((stats.correct / stats.solved) * 100) : 0,
      hedef: stats.target,
      çözülen: stats.solved,
      doğru: stats.correct,
      yanlış: stats.wrong,
      boş: stats.blank,
      entry: stats.entries
    })).sort((a, b) => b.başarı - a.başarı);
  }, [selectedStudentId, weeklyEntries]);

  // En zayıf dersler
  const weakSubjects = subjectAnalysis.slice(-3);

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
        stats: getStudentStats(student.id)
      }))
      .filter(s => s.stats.totalSolved > 0)
      .sort((a, b) => b.stats.successRate - a.stats.successRate);
  }, [students, weeklyEntries]);

  // Haftalık trend
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const dailyTrend = last7Days.map(date => {
    const dayEntries = selectedStudentId
      ? weeklyEntries.filter(e => e.studentId === selectedStudentId && e.date === date)
      : weeklyEntries.filter(e => e.date === date);

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
  const dailyReadingTrend = last7Days.map(date => {
    const dayEntries = selectedStudentId
      ? weeklyEntries.filter(e => e.studentId === selectedStudentId && e.date === date && e.readingMinutes && e.readingMinutes > 0)
      : weeklyEntries.filter(e => e.date === date && e.readingMinutes && e.readingMinutes > 0);

    return {
      tarih: new Date(date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }),
      okuma: dayEntries.reduce((sum, e) => sum + (e.readingMinutes || 0), 0)
    };
  });

  // Toplam okuma süresi (tüm öğrenciler)
  const totalReadingMinutes = weeklyEntries.reduce((sum, e) => sum + (e.readingMinutes || 0), 0);

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

        {/* Öğrenci ve Zaman Seçimi */}
        <div className="flex flex-col md:flex-row gap-3">
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">Tüm Öğrenciler</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>

          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as 'week' | 'month' | 'all')}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="week">Son 7 Gün</option>
            <option value="month">Son 30 Gün</option>
            <option value="all">Tüm Zamanlar</option>
          </select>
        </div>
      </div>

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

      {/* Genel İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-500">Toplam Hedef</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {weeklyEntries.reduce((sum, e) => sum + e.targetQuestions, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">Toplam Çözülen</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {weeklyEntries.reduce((sum, e) => sum + e.solvedQuestions, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-500">Gerçekleşme %</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            %{weeklyEntries.reduce((sum, e) => sum + e.targetQuestions, 0) > 0
              ? Math.round(
                  (weeklyEntries.reduce((sum, e) => sum + e.solvedQuestions, 0) /
                    weeklyEntries.reduce((sum, e) => sum + e.targetQuestions, 0)) * 100
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
            {weeklyEntries.reduce((sum, e) => sum + e.correctAnswers, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-gray-500">Toplam Yanlış</span>
          </div>
          <p className="text-2xl font-bold text-red-600">
            {weeklyEntries.reduce((sum, e) => sum + e.wrongAnswers, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-gray-600" />
            <span className="text-sm text-gray-500">Toplam Boş</span>
          </div>
          <p className="text-2xl font-bold text-gray-600">
            {weeklyEntries.reduce((sum, e) => sum + e.blankAnswers, 0)}
          </p>
        </div>
      </div>

      {/* 📚 Kitap Okuma İstatistikleri */}
      {totalReadingMinutes > 0 && (
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
              <p className="text-2xl font-bold">{Math.round(totalReadingMinutes / 60)} saat</p>
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
                    <span className="text-sm text-green-100">Günlük Ort.</span>
                  </div>
                  <p className="text-2xl font-bold">{readingStats.averageDailyMinutes} dk</p>
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
        {totalReadingMinutes > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-green-600" />
              Son 7 Gün Okuma Trendi
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyReadingTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [`${value} dk`, 'Okuma']}
                  />
                  <Bar dataKey="okuma" fill="#22C55E" radius={[4, 4, 0, 0]} name="Okuma (dk)" />
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

      {/* Öğrenci Sıralaması */}
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
    </div>
  );
}
